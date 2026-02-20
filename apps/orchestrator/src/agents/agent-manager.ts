import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";
import { AgentSession } from "./agent-session";
import { OpenAISession } from "./openai-session";
import { transitionTask, logTaskAction } from "../tasks/task-lifecycle";
import { eventBus } from "../realtime/event-bus";
import { logger } from "../lib/logger";
import { safeDecrypt } from "../lib/encryption.js";
import { GitService } from "../git/git-service";
import { slugify } from "../lib/utils";
import type { Agent, TaskStatus, AgentRole, TaskCategory } from "@agenthub/shared";
import { getModelProvider } from "@agenthub/shared";
import { agentMemory } from "./agent-memory.js";
import { workflowExecutor } from "../workflows/workflow-executor.js";

const gitService = new GitService();

interface ActiveSession {
  session: AgentSession | OpenAISession;
  agentId: string;
  taskId: string;
  projectId: string;
}

interface QueuedTask {
  taskId: string;
  projectId: string;
  priority: string;
  timestamp: Date;
}

/** Tracks the current phase of the agent workflow for a task */
type WorkflowPhase =
  | "tech_lead_triage"      // Tech Lead analyzing the request
  | "architect_planning"    // Architect creating a plan
  | "tech_lead_review"      // Tech Lead reviewing the plan and picking a dev
  | "dev_execution"         // Dev implementing the task
  | "qa_review"             // QA reviewing the implementation
  | "dev_fix"               // Dev fixing issues found by QA
  | "tech_lead_fix_plan"    // Tech Lead creating improvement plan after dev failed to fix
  | "dev_fix_with_plan"     // Dev fixing with Tech Lead's improvement plan
  | "architect_fix_plan"    // Architect creating plan after Tech Lead couldn't solve
  | "tech_lead_relay_plan"  // Tech Lead receives Architect's plan and relays to dev
  | "direct";               // Direct assignment, no workflow

interface WorkflowState {
  phase: WorkflowPhase;
  techLeadId: string;
  architectId: string | null;
  architectPlan: string | null;
  originalTaskId: string;
  selectedDevId: string | null;
  qaRetryCount: number;        // How many times QA has rejected and dev retried
}

// Task category to agent role mapping
const CATEGORY_TO_ROLE_MAP: Record<TaskCategory, AgentRole[]> = {
  feature: ["frontend_dev", "backend_dev"],
  bug: ["qa", "backend_dev", "frontend_dev"],
  refactor: ["backend_dev", "frontend_dev", "architect"],
  test: ["qa"],
  docs: ["tech_lead", "frontend_dev"],
};

class AgentManager {
  private activeSessions = new Map<string, ActiveSession>();
  /** Reverse index: agentId → taskId for O(1) busy checks */
  private agentToTask = new Map<string, string>();
  private taskQueue = new Map<string, QueuedTask[]>();
  private taskRetryCount = new Map<string, number>();
  private workflowStates = new Map<string, WorkflowState>();

  /**
   * Check if a project has a default custom workflow.
   * Returns the workflow ID if found, null otherwise.
   */
  async getProjectDefaultWorkflow(projectId: string): Promise<string | null> {
    const workflow = await db
      .select()
      .from(schema.workflows)
      .where(and(eq(schema.workflows.projectId, projectId), eq(schema.workflows.isDefault, true)))
      .get();

    return workflow?.id ?? null;
  }

  /**
   * Run the full agent workflow for a task.
   * If the project has a custom workflow, uses WorkflowExecutor.
   * Otherwise falls back to the hardcoded flow:
   * Tech Lead (triage) -> [simple: plan + pick dev | complex: Architect -> plan -> pick dev] -> Dev -> QA
   */
  async runWorkflow(taskId: string, techLeadId: string): Promise<void> {
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    if (!task) {
      logger.error(`Task ${taskId} not found for workflow`, "agent-manager");
      return;
    }

    // Check for custom workflow first
    const customWorkflowId = await this.getProjectDefaultWorkflow(task.projectId);
    if (customWorkflowId) {
      logger.info(
        `Task ${taskId}: using custom workflow ${customWorkflowId}`,
        "agent-manager",
      );
      const started = await workflowExecutor.executeWorkflow(taskId, customWorkflowId);
      if (started) return;
      // If custom workflow failed to start, fall through to hardcoded flow
      logger.warn(
        `Custom workflow ${customWorkflowId} failed to start for task ${taskId}, falling back to hardcoded flow`,
        "agent-manager",
      );
    }

    // Store workflow state — start with Tech Lead triage
    this.workflowStates.set(taskId, {
      phase: "tech_lead_triage",
      techLeadId,
      architectId: null,
      architectPlan: null,
      originalTaskId: taskId,
      selectedDevId: null,
      qaRetryCount: 0,
    });

    // Emit workflow phase event
    eventBus.emit("workflow:phase", {
      taskId,
      projectId: task.projectId,
      phase: "tech_lead_triage",
      agentId: techLeadId,
      agentName: "Tech Lead",
      detail: "Tech Lead analyzing task scope",
    });

    await logTaskAction(taskId, "workflow_phase", techLeadId, "Phase: tech_lead_triage — Tech Lead analyzing task scope");

    logger.info(
      `Workflow started for task ${taskId}: sending to Tech Lead for triage`,
      "agent-manager",
    );

    eventBus.emit("agent:notification", {
      agentId: techLeadId,
      projectId: task.projectId,
      message: `Analisando a task para decidir o melhor fluxo de execução...`,
      level: "info",
    });

    // Send to Tech Lead for triage analysis
    await this.assignTask(taskId, techLeadId);
  }

  /**
   * Handle workflow progression after a session completes
   */
  private async advanceWorkflow(taskId: string, result: string | undefined): Promise<boolean> {
    const workflow = this.workflowStates.get(taskId);
    if (!workflow) return false;

    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    if (!task) return false;

    if (workflow.phase === "tech_lead_triage") {
      // Tech Lead finished triage → decide: send to Architect or plan directly
      const triageDecision = this.parseTriageDecision(result);

      if (triageDecision.needsArchitect) {
        // Complex task → send to Architect for detailed planning
        const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true)).all();
        const architect = agents.find((a) => a.role === "architect");

        if (!architect) {
          logger.warn("No Architect agent found, Tech Lead will plan directly", "agent-manager");
          // Fall through to direct planning below
        } else {
          workflow.phase = "architect_planning";
          workflow.architectId = architect.id;
          this.workflowStates.set(taskId, workflow);

          eventBus.emit("workflow:phase", {
            taskId,
            projectId: task.projectId,
            phase: "architect_planning",
            agentId: architect.id,
            agentName: architect.name,
            detail: "Architect creating execution plan",
          });

          await logTaskAction(taskId, "workflow_phase", architect.id, "Phase: architect_planning — Architect creating execution plan");

          logger.info(
            `Workflow: Tech Lead decided task ${taskId} is COMPLEX, sending to Architect (${architect.name})`,
            "agent-manager",
          );

          eventBus.emit("agent:notification", {
            agentId: workflow.techLeadId,
            projectId: task.projectId,
            message: `Task complexa — enviando para ${architect.name} criar o plano de execução...`,
            level: "info",
          });

          // Append Tech Lead's analysis to task description
          if (triageDecision.analysis) {
            const updatedDescription = [
              task.description ?? "",
              "\n\n---\n## Análise do Tech Lead\n",
              triageDecision.analysis,
            ].join("");

            await db.update(schema.tasks).set({
              description: updatedDescription,
              updatedAt: new Date(),
            }).where(eq(schema.tasks.id, taskId));
          }

          await transitionTask(taskId, "assigned" as TaskStatus, undefined, "Tech Lead triage: complex task, sending to Architect");
          await this.assignTask(taskId, architect.id);
          return true;
        }
      }

      // Simple task → Tech Lead planned directly, pick dev and execute
      const plan = triageDecision.plan || result || "No plan provided";
      workflow.architectPlan = plan;
      workflow.phase = "dev_execution";
      this.workflowStates.set(taskId, workflow);

      logger.info(
        `Workflow: Tech Lead decided task ${taskId} is SIMPLE, planning directly and picking dev`,
        "agent-manager",
      );

      // Update the task description with the Tech Lead's plan
      const planDescription = [
        task.description ?? "",
        "\n\n---\n## Plano do Tech Lead\n",
        plan,
      ].join("");

      await db.update(schema.tasks).set({
        description: planDescription,
        parsedSpec: plan,
        updatedAt: new Date(),
      }).where(eq(schema.tasks.id, taskId));

      await transitionTask(taskId, "assigned" as TaskStatus, undefined, "Tech Lead triage: simple task, planned directly");

      // Pick the best dev
      await this.selectAndAssignDev(taskId, task.projectId, workflow, plan);
      return true;
    }

    if (workflow.phase === "architect_planning") {
      // Architect finished → store plan, pick dev and assign
      workflow.architectPlan = result ?? "No plan provided";
      workflow.phase = "dev_execution";
      this.workflowStates.set(taskId, workflow);

      logger.info(`Workflow: Architect plan ready for task ${taskId}, selecting dev`, "agent-manager");

      eventBus.emit("agent:notification", {
        agentId: workflow.techLeadId,
        projectId: task.projectId,
        message: `Plano do Arquiteto pronto. Escolhendo o melhor dev para executar...`,
        level: "info",
      });

      // Update the task description with the architect's plan
      const planDescription = [
        task.description ?? "",
        "\n\n---\n## Plano do Arquiteto\n",
        workflow.architectPlan,
      ].join("");

      await db.update(schema.tasks).set({
        description: planDescription,
        parsedSpec: workflow.architectPlan,
        updatedAt: new Date(),
      }).where(eq(schema.tasks.id, taskId));

      await transitionTask(taskId, "assigned" as TaskStatus, undefined, "Architect plan complete, selecting dev");

      // Pick the best dev
      await this.selectAndAssignDev(taskId, task.projectId, workflow, workflow.architectPlan);
      return true;
    }

    if (workflow.phase === "dev_execution") {
      // Dev finished → check if QA agent exists for review
      const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true)).all();
      const qaAgent = agents.find((a) => a.role === "qa");

      if (qaAgent) {
        // QA review step
        workflow.phase = "qa_review";
        this.workflowStates.set(taskId, workflow);

        eventBus.emit("workflow:phase", {
          taskId,
          projectId: task.projectId,
          phase: "qa_review",
          agentId: qaAgent.id,
          agentName: qaAgent.name,
          detail: `${qaAgent.name} reviewing the implementation`,
        });

        await logTaskAction(taskId, "workflow_phase", qaAgent.id, `Phase: qa_review — ${qaAgent.name} reviewing the implementation`);

        logger.info(`Workflow: Dev finished task ${taskId}, sending to QA (${qaAgent.name}) for review`, "agent-manager");

        eventBus.emit("agent:notification", {
          agentId: workflow.techLeadId,
          projectId: task.projectId,
          message: `Dev finalizou. Enviando para ${qaAgent.name} revisar a implementação...`,
          level: "info",
        });

        // Reset task for QA assignment
        await transitionTask(taskId, "assigned" as TaskStatus, undefined, "Dev complete, sending to QA review");
        await this.assignTask(taskId, qaAgent.id);
        return true;
      }

      // No QA agent — workflow complete
      eventBus.emit("workflow:phase", {
        taskId,
        projectId: task.projectId,
        phase: "completed",
        agentId: "",
        agentName: "",
        detail: "Workflow completed",
      });
      this.workflowStates.delete(taskId);
      logger.info(`Workflow completed for task ${taskId} (no QA agent)`, "agent-manager");
      return false;
    }

    if (workflow.phase === "qa_review") {
      // Parse QA verdict from result
      const qaVerdict = this.parseQaVerdict(result);

      if (qaVerdict.approved) {
        // QA approved → workflow complete, task goes to review (user approval)
        eventBus.emit("workflow:phase", {
          taskId,
          projectId: task.projectId,
          phase: "completed",
          agentId: "",
          agentName: "",
          detail: "QA approved — awaiting user review",
        });

        eventBus.emit("agent:notification", {
          agentId: workflow.techLeadId,
          projectId: task.projectId,
          message: `QA aprovou a implementação. Aguardando aprovação do usuário.`,
          level: "info",
        });

        this.workflowStates.delete(taskId);
        logger.info(`Workflow completed for task ${taskId} (QA approved)`, "agent-manager");
        return false; // Let normal result handling proceed (transition to review)
      }

      // QA rejected → send back to dev with feedback
      workflow.qaRetryCount++;
      workflow.phase = "dev_fix";
      this.workflowStates.set(taskId, workflow);

      const devId = workflow.selectedDevId;
      if (!devId) {
        logger.error(`No dev recorded in workflow for task ${taskId}, cannot route QA rejection`, "agent-manager");
        this.workflowStates.delete(taskId);
        return false;
      }

      const devAgent = await db.select().from(schema.agents).where(eq(schema.agents.id, devId)).get();
      const devName = devAgent?.name ?? "Dev";

      logger.info(
        `Workflow: QA rejected task ${taskId} (attempt ${workflow.qaRetryCount}), sending back to ${devName} for fixes`,
        "agent-manager",
      );

      eventBus.emit("agent:notification", {
        agentId: workflow.techLeadId,
        projectId: task.projectId,
        message: `QA rejeitou a implementação. Reenviando para ${devName} corrigir os problemas encontrados.`,
        level: "warn",
      });

      eventBus.emit("workflow:phase", {
        taskId,
        projectId: task.projectId,
        phase: "dev_fix",
        agentId: devId,
        agentName: devName,
        detail: `${devName} fixing QA issues (attempt ${workflow.qaRetryCount})`,
      });

      // Append QA feedback to task description with DEV_NEEDS_HELP instructions
      const qaFeedback = qaVerdict.reason || result || "QA found issues";
      const updatedDescription = [
        task.description ?? "",
        `\n\n---\n## QA Feedback (Tentativa ${workflow.qaRetryCount})\n`,
        qaFeedback,
        "\n\nPor favor, corrija os problemas apontados acima pelo QA.",
        "\n\n## IMPORTANTE — Decisão do Dev",
        "\nAnalise os problemas reportados pelo QA e decida:",
        "\n- Se você CONSEGUE corrigir: implemente as correções normalmente.",
        "\n- Se você NÃO CONSEGUE corrigir (problema muito complexo, fora do seu escopo, ou precisa de ajuda): ",
        "termine sua resposta com DEV_NEEDS_HELP na última linha para escalar ao Tech Lead.",
      ].join("");

      await db.update(schema.tasks).set({
        description: updatedDescription,
        updatedAt: new Date(),
      }).where(eq(schema.tasks.id, taskId));

      // Reset and re-assign to dev
      await transitionTask(taskId, "assigned" as TaskStatus, undefined, `QA rejected, returning to dev (attempt ${workflow.qaRetryCount})`);
      await this.assignTask(taskId, devId);
      return true;
    }

    if (workflow.phase === "dev_fix") {
      // Dev finished — check if dev asked for help or fixed it
      const needsHelp = this.parseDevNeedsHelp(result);

      if (needsHelp) {
        // Dev couldn't fix → escalate to Tech Lead for improvement plan
        const devResult = result ?? "Dev could not fix the issues";
        logger.info(`Workflow: Dev requested help for task ${taskId}, escalating to Tech Lead`, "agent-manager");
        await this.escalateToTechLead(taskId, workflow, devResult);
        return true;
      }

      // Dev fixed it → send back to QA for re-review
      const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true)).all();
      const qaAgent = agents.find((a) => a.role === "qa");

      if (qaAgent) {
        workflow.phase = "qa_review";
        this.workflowStates.set(taskId, workflow);

        eventBus.emit("workflow:phase", {
          taskId,
          projectId: task.projectId,
          phase: "qa_review",
          agentId: qaAgent.id,
          agentName: qaAgent.name,
          detail: `${qaAgent.name} re-reviewing after dev fix (attempt ${workflow.qaRetryCount})`,
        });

        logger.info(`Workflow: Dev fix complete for task ${taskId}, sending back to QA for re-review`, "agent-manager");

        eventBus.emit("agent:notification", {
          agentId: workflow.techLeadId,
          projectId: task.projectId,
          message: `Dev corrigiu os problemas. Reenviando para ${qaAgent.name} re-validar...`,
          level: "info",
        });

        await transitionTask(taskId, "assigned" as TaskStatus, undefined, "Dev fix complete, sending back to QA");
        await this.assignTask(taskId, qaAgent.id);
        return true;
      }

      // No QA agent — go to review directly
      this.workflowStates.delete(taskId);
      return false;
    }

    if (workflow.phase === "tech_lead_fix_plan") {
      // Tech Lead finished analyzing — check if they need the Architect or created a plan
      const triageDecision = this.parseTriageDecision(result);

      if (triageDecision.needsArchitect) {
        // Tech Lead couldn't solve it → escalate to Architect
        const techLeadAnalysis = result ?? "Tech Lead could not create improvement plan";
        logger.info(`Workflow: Tech Lead needs Architect help for task ${taskId}, escalating`, "agent-manager");
        await this.escalateToArchitect(taskId, workflow, techLeadAnalysis);
        return true;
      }

      // Tech Lead created an improvement plan → send back to dev
      const devId = workflow.selectedDevId;
      if (!devId) {
        logger.error(`No dev recorded in workflow for task ${taskId}`, "agent-manager");
        this.workflowStates.delete(taskId);
        return false;
      }

      const devAgent = await db.select().from(schema.agents).where(eq(schema.agents.id, devId)).get();
      const devName = devAgent?.name ?? "Dev";

      workflow.phase = "dev_fix_with_plan";
      this.workflowStates.set(taskId, workflow);

      // Append Tech Lead's improvement plan to task description
      const improvementPlan = triageDecision.plan || result || "No plan provided";
      const updatedDescription = [
        task.description ?? "",
        "\n\n---\n## Plano de Melhorias do Tech Lead\n",
        improvementPlan,
        "\n\nSiga o plano acima para corrigir os problemas. O QA irá revisar novamente após suas correções.",
      ].join("");

      await db.update(schema.tasks).set({
        description: updatedDescription,
        parsedSpec: improvementPlan,
        updatedAt: new Date(),
      }).where(eq(schema.tasks.id, taskId));

      logger.info(`Workflow: Tech Lead plan ready for task ${taskId}, sending back to ${devName}`, "agent-manager");

      eventBus.emit("agent:notification", {
        agentId: workflow.techLeadId,
        projectId: task.projectId,
        message: `Plano de melhorias criado. Enviando para ${devName} implementar as correções...`,
        level: "info",
      });

      eventBus.emit("workflow:phase", {
        taskId,
        projectId: task.projectId,
        phase: "dev_fix_with_plan",
        agentId: devId,
        agentName: devName,
        detail: `${devName} implementing Tech Lead's improvement plan`,
      });

      await transitionTask(taskId, "assigned" as TaskStatus, undefined, "Tech Lead plan ready, sending to dev");
      await this.assignTask(taskId, devId);
      return true;
    }

    if (workflow.phase === "dev_fix_with_plan") {
      // Dev finished implementing Tech Lead's plan → send back to QA
      const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true)).all();
      const qaAgent = agents.find((a) => a.role === "qa");

      if (qaAgent) {
        workflow.phase = "qa_review";
        workflow.qaRetryCount++;
        this.workflowStates.set(taskId, workflow);

        eventBus.emit("workflow:phase", {
          taskId,
          projectId: task.projectId,
          phase: "qa_review",
          agentId: qaAgent.id,
          agentName: qaAgent.name,
          detail: `${qaAgent.name} reviewing after Tech Lead improvement plan`,
        });

        logger.info(`Workflow: Dev finished Tech Lead plan for task ${taskId}, sending to QA`, "agent-manager");

        eventBus.emit("agent:notification", {
          agentId: workflow.techLeadId,
          projectId: task.projectId,
          message: `Dev implementou o plano de melhorias. Enviando para ${qaAgent.name} validar...`,
          level: "info",
        });

        await transitionTask(taskId, "assigned" as TaskStatus, undefined, "Dev implemented improvement plan, sending to QA");
        await this.assignTask(taskId, qaAgent.id);
        return true;
      }

      // No QA agent — go to review directly
      this.workflowStates.delete(taskId);
      return false;
    }

    if (workflow.phase === "architect_fix_plan") {
      // Architect created a fix plan → send to Tech Lead who will relay it to dev
      const techLead = await db.select().from(schema.agents).where(eq(schema.agents.id, workflow.techLeadId)).get();
      if (!techLead) {
        logger.error(`Tech Lead not found for relay, marking task as failed`, "agent-manager");
        await transitionTask(taskId, "failed" as TaskStatus, undefined, "Tech Lead not found for architect plan relay");
        this.workflowStates.delete(taskId);
        return false;
      }

      workflow.phase = "tech_lead_relay_plan";
      this.workflowStates.set(taskId, workflow);

      // Append Architect's fix plan to task description
      const architectFixPlan = result || "No plan provided";
      const updatedDescription = [
        task.description ?? "",
        "\n\n---\n## Plano de Correção do Arquiteto\n",
        architectFixPlan,
        "\n\nComo Tech Lead, revise o plano do Arquiteto e crie instruções claras para o dev implementar.",
      ].join("");

      await db.update(schema.tasks).set({
        description: updatedDescription,
        updatedAt: new Date(),
      }).where(eq(schema.tasks.id, taskId));

      logger.info(`Workflow: Architect fix plan ready for task ${taskId}, sending to Tech Lead to relay`, "agent-manager");

      eventBus.emit("agent:notification", {
        agentId: workflow.techLeadId,
        projectId: task.projectId,
        message: `Plano do Arquiteto pronto. Repassando para o Tech Lead criar instruções para o dev...`,
        level: "info",
      });

      eventBus.emit("workflow:phase", {
        taskId,
        projectId: task.projectId,
        phase: "tech_lead_relay_plan",
        agentId: techLead.id,
        agentName: techLead.name,
        detail: `${techLead.name} reviewing Architect's fix plan`,
      });

      await transitionTask(taskId, "assigned" as TaskStatus, undefined, "Architect fix plan ready, sending to Tech Lead");
      await this.assignTask(taskId, techLead.id);
      return true;
    }

    if (workflow.phase === "tech_lead_relay_plan") {
      // Tech Lead reviewed Architect's plan → send to dev with combined instructions
      const devId = workflow.selectedDevId;
      if (!devId) {
        logger.error(`No dev recorded in workflow for task ${taskId}`, "agent-manager");
        this.workflowStates.delete(taskId);
        return false;
      }

      const devAgent = await db.select().from(schema.agents).where(eq(schema.agents.id, devId)).get();
      const devName = devAgent?.name ?? "Dev";

      workflow.phase = "dev_fix_with_plan";
      this.workflowStates.set(taskId, workflow);

      // Append Tech Lead's relay instructions to task description
      const relayPlan = result || "No plan provided";
      const updatedDescription = [
        task.description ?? "",
        "\n\n---\n## Instruções do Tech Lead (baseado no plano do Arquiteto)\n",
        relayPlan,
        "\n\nSiga as instruções acima para corrigir os problemas. O QA irá revisar novamente após suas correções.",
      ].join("");

      await db.update(schema.tasks).set({
        description: updatedDescription,
        parsedSpec: relayPlan,
        updatedAt: new Date(),
      }).where(eq(schema.tasks.id, taskId));

      logger.info(`Workflow: Tech Lead relayed Architect plan for task ${taskId}, sending to ${devName}`, "agent-manager");

      eventBus.emit("agent:notification", {
        agentId: workflow.techLeadId,
        projectId: task.projectId,
        message: `Plano de correção pronto. Enviando para ${devName} implementar...`,
        level: "info",
      });

      eventBus.emit("workflow:phase", {
        taskId,
        projectId: task.projectId,
        phase: "dev_fix_with_plan",
        agentId: devId,
        agentName: devName,
        detail: `${devName} implementing Architect's fix plan via Tech Lead`,
      });

      await transitionTask(taskId, "assigned" as TaskStatus, undefined, "Tech Lead relayed Architect plan, sending to dev");
      await this.assignTask(taskId, devId);
      return true;
    }

    return false;
  }

  /**
   * Detect which dev role should handle the task based on the architect's plan
   */
  private detectDevFromPlan(plan: string): AgentRole {
    const lower = plan.toLowerCase();

    // Count frontend vs backend signals
    const frontendSignals = [
      "react", "component", "ui", "ux", "tailwind", "css", "frontend",
      "page", "layout", "form", "button", "modal", "dialog", "sidebar",
      "tsx", "jsx", "zustand", "hook", "animation", "responsive",
    ];
    const backendSignals = [
      "api", "route", "endpoint", "database", "drizzle", "sql", "query",
      "backend", "server", "express", "socket", "middleware", "migration",
      "auth", "encryption", "integration", "webhook",
    ];

    let frontendScore = 0;
    let backendScore = 0;

    for (const signal of frontendSignals) {
      if (lower.includes(signal)) frontendScore++;
    }
    for (const signal of backendSignals) {
      if (lower.includes(signal)) backendScore++;
    }

    // Check for explicit recommendation
    if (lower.includes("frontend_dev") || lower.includes("frontend dev")) {
      return "frontend_dev";
    }
    if (lower.includes("backend_dev") || lower.includes("backend dev")) {
      return "backend_dev";
    }

    return frontendScore >= backendScore ? "frontend_dev" : "backend_dev";
  }

  /**
   * Parse the Dev's response to check if they need help fixing QA issues.
   * Looks for DEV_NEEDS_HELP marker in the last lines of the result.
   */
  private parseDevNeedsHelp(result: string | undefined): boolean {
    if (!result) return false;

    const lines = result.trim().split("\n");
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
      const line = lines[i].trim();
      if (line === "DEV_NEEDS_HELP") return true;
    }
    return false;
  }

  /**
   * Parse the Tech Lead's triage decision.
   * Looks for NEEDS_ARCHITECT or SIMPLE_TASK markers in the result.
   */
  private parseTriageDecision(result: string | undefined): {
    needsArchitect: boolean;
    plan: string | null;
    analysis: string | null;
  } {
    if (!result) return { needsArchitect: true, plan: null, analysis: null };

    const lines = result.trim().split("\n");

    // Search from the last lines for the decision marker
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
      const line = lines[i].trim();

      if (line === "NEEDS_ARCHITECT") {
        // Complex task — extract the analysis (everything before the marker)
        const analysis = lines.slice(0, i).join("\n").trim() || null;
        return { needsArchitect: true, plan: null, analysis };
      }

      if (line === "SIMPLE_TASK") {
        // Simple task — the text before the marker IS the plan
        const plan = lines.slice(0, i).join("\n").trim() || null;
        return { needsArchitect: false, plan, analysis: null };
      }
    }

    // No explicit marker — default to sending to Architect (safer for complex tasks)
    logger.warn("Tech Lead triage did not contain a decision marker, defaulting to Architect", "agent-manager");
    return { needsArchitect: true, plan: null, analysis: result };
  }

  /**
   * Select the best dev for a task based on the plan and assign them.
   */
  private async selectAndAssignDev(
    taskId: string,
    projectId: string,
    workflow: WorkflowState,
    plan: string,
  ): Promise<void> {
    const devRole = this.detectDevFromPlan(plan);
    const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true)).all();

    let selectedDev = agents.find((a) => a.role === devRole && !this.isAgentBusy(a.id));
    if (!selectedDev) {
      selectedDev = agents.find((a) => a.role === devRole);
    }
    if (!selectedDev) {
      // Fallback: any dev that's not tech_lead, architect, or qa
      selectedDev = agents.find(
        (a) => !["tech_lead", "architect", "qa", "receptionist"].includes(a.role) && !this.isAgentBusy(a.id),
      );
    }
    if (!selectedDev) {
      selectedDev = agents.find((a) => !["tech_lead", "architect", "receptionist"].includes(a.role));
    }

    if (selectedDev) {
      workflow.selectedDevId = selectedDev.id;
      this.workflowStates.set(taskId, workflow);

      logger.info(
        `Workflow: Selected ${selectedDev.name} (${selectedDev.role}) for task ${taskId}`,
        "agent-manager",
      );

      eventBus.emit("agent:notification", {
        agentId: workflow.techLeadId,
        projectId,
        message: `Dev selecionado: ${selectedDev.name}. Iniciando implementação...`,
        level: "info",
      });

      eventBus.emit("workflow:phase", {
        taskId,
        projectId,
        phase: "dev_execution",
        agentId: selectedDev.id,
        agentName: selectedDev.name,
        detail: `${selectedDev.name} implementing the task`,
      });

      await logTaskAction(taskId, "workflow_phase", selectedDev.id, `Phase: dev_execution — ${selectedDev.name} implementing the task`);

      await this.assignTask(taskId, selectedDev.id);
    } else {
      logger.warn(`Workflow: No dev available for task ${taskId}, falling back to auto-assign`, "agent-manager");
      await this.autoAssignTask(taskId);
    }
  }

  /**
   * Parse the QA agent's verdict from its result text.
   * Looks for QA_APPROVED or QA_REJECTED: <reason> at the end of the result.
   */
  private parseQaVerdict(result: string | undefined): { approved: boolean; reason: string | null } {
    if (!result) return { approved: true, reason: null }; // No result = assume approved

    const lines = result.trim().split("\n");
    // Search from the last lines for the verdict
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
      const line = lines[i].trim();
      if (line === "QA_APPROVED") {
        return { approved: true, reason: null };
      }
      if (line.startsWith("QA_REJECTED:")) {
        return { approved: false, reason: line.slice("QA_REJECTED:".length).trim() };
      }
      if (line === "QA_REJECTED") {
        // Rejected without reason — use the full result as context
        return { approved: false, reason: result };
      }
    }

    // No explicit verdict found — treat as approved (backward compat)
    logger.warn("QA result did not contain an explicit verdict, assuming approved", "agent-manager");
    return { approved: true, reason: null };
  }

  /**
   * Escalate a failed dev fix to the Tech Lead for an improvement plan.
   * Tech Lead analyzes the errors + QA feedback and creates a structured plan for the dev.
   */
  private async escalateToTechLead(taskId: string, workflow: WorkflowState, errors: string): Promise<void> {
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    if (!task) return;

    const techLead = await db.select().from(schema.agents).where(eq(schema.agents.id, workflow.techLeadId)).get();
    if (!techLead) {
      logger.error(`Tech Lead ${workflow.techLeadId} not found, marking task as failed`, "agent-manager");
      await transitionTask(taskId, "failed" as TaskStatus, undefined, "Tech Lead not found for escalation");
      this.workflowStates.delete(taskId);
      return;
    }

    workflow.phase = "tech_lead_fix_plan";
    this.workflowStates.set(taskId, workflow);

    logger.info(
      `Workflow: Dev failed to fix task ${taskId}, escalating to Tech Lead (${techLead.name}) for improvement plan`,
      "agent-manager",
    );

    eventBus.emit("agent:notification", {
      agentId: workflow.techLeadId,
      projectId: task.projectId,
      message: `Dev não conseguiu corrigir os problemas. Analisando para criar um plano de melhorias...`,
      level: "warn",
    });

    eventBus.emit("workflow:phase", {
      taskId,
      projectId: task.projectId,
      phase: "tech_lead_fix_plan",
      agentId: techLead.id,
      agentName: techLead.name,
      detail: `${techLead.name} creating improvement plan after dev failure`,
    });

    // Append error context to task description for Tech Lead
    const updatedDescription = [
      task.description ?? "",
      "\n\n---\n## Dev não conseguiu resolver — Contexto\n",
      errors,
      "\n\nComo Tech Lead, analise o contexto acima junto com o feedback anterior do QA.",
      "\n\n## Decisão do Tech Lead",
      "\nAnalise se você CONSEGUE criar um plano de melhorias para o dev:",
      "\n- Se SIM: crie um plano detalhado, passo a passo, com os arquivos que precisam ser alterados. Termine com: SIMPLE_TASK",
      "\n- Se NÃO (problema muito complexo, precisa de análise arquitetural profunda): termine com: NEEDS_ARCHITECT",
    ].join("");

    await db.update(schema.tasks).set({
      description: updatedDescription,
      updatedAt: new Date(),
    }).where(eq(schema.tasks.id, taskId));

    // Reset and assign to Tech Lead
    await transitionTask(taskId, "assigned" as TaskStatus, undefined, "Dev fix failed, escalating to Tech Lead");
    await this.assignTask(taskId, techLead.id);
  }

  /**
   * Escalate to Architect when Tech Lead's improvement plan also failed.
   * Architect creates a detailed fix plan → goes back to Tech Lead → then to Dev.
   */
  private async escalateToArchitect(taskId: string, workflow: WorkflowState, errors: string): Promise<void> {
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    if (!task) return;

    const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true)).all();
    const architect = agents.find((a) => a.role === "architect");

    if (!architect) {
      logger.error("No Architect agent found, marking task as failed", "agent-manager");
      await transitionTask(taskId, "failed" as TaskStatus, undefined, "No Architect available for escalation");
      this.workflowStates.delete(taskId);
      return;
    }

    workflow.phase = "architect_fix_plan";
    workflow.architectId = architect.id;
    this.workflowStates.set(taskId, workflow);

    logger.info(
      `Workflow: Tech Lead's plan failed for task ${taskId}, escalating to Architect (${architect.name})`,
      "agent-manager",
    );

    eventBus.emit("agent:notification", {
      agentId: workflow.techLeadId,
      projectId: task.projectId,
      message: `Plano do Tech Lead não foi suficiente. Escalando para ${architect.name} criar um plano detalhado...`,
      level: "warn",
    });

    eventBus.emit("workflow:phase", {
      taskId,
      projectId: task.projectId,
      phase: "architect_fix_plan",
      agentId: architect.id,
      agentName: architect.name,
      detail: `${architect.name} creating fix plan after Tech Lead plan failed`,
    });

    // Append context for Architect
    const updatedDescription = [
      task.description ?? "",
      "\n\n---\n## Escalação para Arquiteto — Contexto\n",
      errors,
      "\n\nO Tech Lead analisou mas não conseguiu criar um plano de melhorias suficiente para o dev.",
      " Como Arquiteto, analise todo o histórico acima e crie um plano detalhado e definitivo.",
      " Considere abordagens alternativas e inclua exemplos de código quando necessário.",
      " Seu plano será repassado ao Tech Lead que o enviará ao dev para implementação.",
    ].join("");

    await db.update(schema.tasks).set({
      description: updatedDescription,
      updatedAt: new Date(),
    }).where(eq(schema.tasks.id, taskId));

    await transitionTask(taskId, "assigned" as TaskStatus, undefined, "Tech Lead plan failed, escalating to Architect");
    await this.assignTask(taskId, architect.id);
  }

  /**
   * Auto-assign a task to the most appropriate available agent based on task category
   */
  async autoAssignTask(taskId: string): Promise<void> {
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    if (!task) {
      logger.error(`Task ${taskId} not found`, "agent-manager");
      return;
    }

    // Get all active agents for this project
    const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true)).all();

    if (agents.length === 0) {
      logger.warn(`No active agents available for task ${taskId}`, "agent-manager");
      return;
    }

    // Get preferred roles based on task category
    const category = task.category as TaskCategory | null;
    const preferredRoles = category ? CATEGORY_TO_ROLE_MAP[category] : null;

    // Find best available agent
    let selectedAgent = null;

    // First, try to find an idle agent with preferred role
    if (preferredRoles) {
      for (const role of preferredRoles) {
        const agent = agents.find(
          (a) => a.role === role && !this.isAgentBusy(a.id)
        );
        if (agent) {
          selectedAgent = agent;
          break;
        }
      }
    }

    // If no preferred agent is idle, find any idle agent
    if (!selectedAgent) {
      selectedAgent = agents.find((a) => !this.isAgentBusy(a.id));
    }

    // If all agents are busy, find agent with preferred role and queue
    if (!selectedAgent && preferredRoles) {
      selectedAgent = agents.find((a) => preferredRoles.includes(a.role as AgentRole));
    }

    // Fallback: use first active agent
    if (!selectedAgent) {
      selectedAgent = agents[0];
    }

    logger.info(
      `Auto-assigned task ${taskId} (category: ${category || "none"}) to agent ${selectedAgent.name} (${selectedAgent.role})`,
      "agent-manager"
    );

    await this.assignTask(taskId, selectedAgent.id);
  }

  async assignTask(taskId: string, agentId: string): Promise<void> {
    // Load task and agent from DB
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    if (!task) {
      logger.error(`Task ${taskId} not found`, "agent-manager");
      return;
    }

    const agent = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId)).get();
    if (!agent) {
      logger.error(`Agent ${agentId} not found`, "agent-manager");
      return;
    }

    if (!agent.isActive) {
      logger.warn(`Agent ${agent.name} is inactive, cannot assign task`, "agent-manager");
      return;
    }

    // Check if agent is already busy — enqueue instead of dropping
    if (this.isAgentBusy(agentId)) {
      this.enqueueTask(agentId, taskId, task.projectId);
      return;
    }

    // Load project for workspace path
    const project = await db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId)).get();
    if (!project) {
      logger.error(`Project ${task.projectId} not found`, "agent-manager");
      return;
    }

    // Validate project path is a local directory (not a URL)
    // If the path is a URL, auto-clone the repo before proceeding
    const isUrl = /^https?:\/\//.test(project.path);
    if (isUrl) {
      logger.info(`Project path is a URL, auto-cloning: ${project.path}`, "agent-manager");
      try {
        const localPath = await this.autoCloneProject(project.path, project.name);
        // Update project path in DB so future tasks don't need to re-clone
        await db.update(schema.projects).set({ path: localPath, updatedAt: new Date() }).where(eq(schema.projects.id, project.id));
        project.path = localPath;
        logger.info(`Auto-cloned to ${localPath}`, "agent-manager");
      } catch (cloneError) {
        const reason = `Failed to auto-clone repository (${project.path}): ${cloneError}`;
        logger.error(`Cannot execute task ${taskId}: ${reason}`, "agent-manager");
        await logTaskAction(taskId, "agent_error", agentId, reason);
        await transitionTask(taskId, "failed" as TaskStatus, agentId, reason);
        return;
      }
    }

    if (!existsSync(project.path)) {
      const reason = `Project path does not exist on disk: ${project.path}`;
      logger.error(`Cannot execute task ${taskId}: ${reason}`, "agent-manager");
      await logTaskAction(taskId, "agent_error", agentId, reason);
      await transitionTask(taskId, "failed" as TaskStatus, agentId, reason);
      return;
    }

    // Git branch auto-creation logic
    // Auto-creates a branch for every task when the project is a git repo.
    // If an explicit git integration config exists, uses its defaultBranch setting;
    // otherwise defaults to the repo's current branch.
    let branchName: string | null = null;
    try {
      const isGitRepo = await gitService.detectGitRepo(project.path);
      if (isGitRepo) {
        // Read explicit config if available (for defaultBranch override)
        let baseBranch: string | null = null;
        const gitConfig = await db
          .select()
          .from(schema.integrations)
          .where(
            and(
              eq(schema.integrations.projectId, task.projectId),
              eq(schema.integrations.type, "git")
            )
          )
          .get();

        if (gitConfig?.config) {
          const config = JSON.parse(gitConfig.config);
          baseBranch = config.defaultBranch || null;
        }

        // Fallback: use the repo's current branch as base
        if (!baseBranch) {
          baseBranch = await gitService.getCurrentBranch(project.path);
        }

        branchName = `task/agenthub-${slugify(task.title as string)}`;
        const branchExists = await gitService.branchExists(project.path, branchName);

        if (!branchExists) {
          await gitService.createBranch(project.path, branchName, baseBranch);
          logger.info(`Created git branch: ${branchName} from ${baseBranch}`, "agent-manager");

          await logTaskAction(taskId, "git_branch_created", agentId, branchName);

          eventBus.emit("task:git_branch", {
            taskId: task.id,
            projectId: task.projectId,
            branchName,
            baseBranch,
          });
        }
      }
    } catch (error) {
      logger.warn(`Failed to create git branch for task ${taskId}: ${error}`, "agent-manager");
      // Continue without git branch
    }

    // Update task with assigned agent
    await db.update(schema.tasks).set({
      assignedAgentId: agentId,
      branch: branchName,
      updatedAt: new Date(),
    }).where(eq(schema.tasks.id, taskId));

    // Transition task to in_progress
    await transitionTask(taskId, "in_progress", agentId, `Assigned to ${agent.name}`);

    // Build prompt
    const prompt = buildTaskPrompt(task as Record<string, unknown>, agent as unknown as Agent);

    // Create and start session — pick runtime based on model provider
    const sessionConfig = {
      agent: agent as unknown as Agent,
      projectId: task.projectId,
      projectPath: project.path,
      taskId,
      prompt,
    };

    const provider = getModelProvider(agent.model);
    const session = provider === "openai"
      ? new OpenAISession(sessionConfig)
      : new AgentSession(sessionConfig);

    this.activeSessions.set(taskId, {
      session,
      agentId,
      taskId,
      projectId: task.projectId,
    });
    this.agentToTask.set(agentId, taskId);

    await logTaskAction(taskId, "agent_assigned", agentId, `Agent ${agent.name} started working (${provider})`);

    // Execute in background (don't await)
    this.executeSession(taskId, agentId, session).catch((err) => {
      logger.error(`Session execution failed: ${err}`, "agent-manager");
    });
  }

  private async executeSession(taskId: string, agentId: string, session: AgentSession | OpenAISession) {
    try {
      const result = await session.execute();

      // Move to review on success
      if (!result.isError) {
        // Auto-commit agent changes if task has a branch
        await this.autoCommitChanges(taskId, agentId);

        // Check if this subtask is part of a custom workflow execution
        if (workflowExecutor.isWorkflowSubtask(taskId)) {
          await workflowExecutor.onSubtaskCompleted(taskId, result.result ?? undefined);
          // Also check parent task subtask completion
          const taskData = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
          if (taskData?.parentTaskId) {
            await this.checkSubtaskCompletion(taskData.parentTaskId);
          }
        }

        // Check if this is part of the hardcoded workflow (e.g., architect just finished planning)
        const workflowHandled = await this.advanceWorkflow(taskId, result.result);

        if (!workflowHandled && !workflowExecutor.isWorkflowSubtask(taskId)) {
          // Normal flow: move to review
          await transitionTask(taskId, "review" as TaskStatus, session.agentId, "Agent completed work");
        }

        // Save result to task
        await db.update(schema.tasks).set({
          result: result.result ?? null,
          costUsd: result.cost.toString(),
          updatedAt: new Date(),
        }).where(eq(schema.tasks.id, taskId));

        // Extract and store memory from result
        try {
          const taskData = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
          if (taskData && result.result) {
            await agentMemory.extractFromResult(agentId, taskData.projectId, taskData.title as string, result.result);
          }
        } catch (err) {
          logger.warn(`Failed to extract memory from result: ${err}`, "agent-manager");
        }

        // Clear retry count on success
        this.taskRetryCount.delete(taskId);
      } else {
        // Handle error with retry logic
        const retryCount = this.taskRetryCount.get(taskId) ?? 0;
        const MAX_RETRIES = 1;

        await logTaskAction(
          taskId,
          "agent_error",
          session.agentId,
          `${result.errors.join("; ")} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`,
        );

        if (retryCount < MAX_RETRIES) {
          // Retry once
          this.taskRetryCount.set(taskId, retryCount + 1);
          logger.info(`Retrying task ${taskId} (attempt ${retryCount + 2}/${MAX_RETRIES + 1})`, "agent-manager");

          // Re-assign to same agent after a brief delay
          setTimeout(() => {
            this.assignTask(taskId, agentId).catch((err) => {
              logger.error(`Failed to retry task ${taskId}: ${err}`, "agent-manager");
            });
          }, 2000);
        } else {
          // Max retries reached
          this.taskRetryCount.delete(taskId);

          // Check if this is a dev fix phase — escalate appropriately
          const workflow = this.workflowStates.get(taskId);

          if (workflow && workflow.phase === "dev_fix") {
            // Dev couldn't fix QA issues → escalate to Tech Lead for improvement plan
            await this.escalateToTechLead(taskId, workflow, result.errors.join("; "));
          } else if (workflow && workflow.phase === "dev_fix_with_plan") {
            // Dev couldn't fix even with Tech Lead's plan → escalate to Architect
            await this.escalateToArchitect(taskId, workflow, result.errors.join("; "));
          } else {
            // Normal failure — mark as failed
            await transitionTask(taskId, "failed" as TaskStatus, session.agentId, "Max retries exceeded");
            logger.warn(`Task ${taskId} failed after ${MAX_RETRIES + 1} attempts`, "agent-manager");
          }

          // Store error as memory for future avoidance
          try {
            const taskData = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
            if (taskData) {
              await agentMemory.storeError(agentId, taskData.projectId, taskData.title as string, result.errors.join("; "));
            }
          } catch (err) {
            logger.warn(`Failed to store error memory: ${err}`, "agent-manager");
          }
        }
      }
    } finally {
      const completed = this.activeSessions.get(taskId);
      this.activeSessions.delete(taskId);
      if (completed) this.agentToTask.delete(completed.agentId);
      // Process next queued task for this agent (only if not retrying)
      const retryCount = this.taskRetryCount.get(taskId) ?? 0;
      if (retryCount === 0) {
        this.processQueue(agentId);
      }
    }
  }

  private async autoCommitChanges(taskId: string, agentId: string): Promise<void> {
    try {
      const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
      if (!task?.branch) return;

      const project = await db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId)).get();
      if (!project?.path) return;

      const isGitRepo = await gitService.detectGitRepo(project.path);
      if (!isGitRepo) return;

      // Ensure we're on the task branch
      const currentBranch = await gitService.getCurrentBranch(project.path);
      if (currentBranch !== task.branch) {
        await gitService.checkoutBranch(project.path, task.branch);
      }

      // Ensure git user config exists for commits
      await gitService.ensureUserConfig(project.path);

      // Stage all changes
      await gitService.stageAll(project.path);

      // Commit (will fail if nothing to commit — that's fine)
      const agent = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId)).get();
      const agentName = agent?.name ?? "Agent";
      const message = `feat(${agentName}): ${task.title}`;

      const sha = await gitService.commit(project.path, message, `${agentName} <agent@agenthub.dev>`);
      logger.info(`Auto-committed changes for task ${taskId}: ${sha.slice(0, 8)}`, "agent-manager");

      await logTaskAction(taskId, "git_commit", agentId, `Committed ${sha.slice(0, 8)}: ${message}`);

      // Auto-push to remote
      await this.autoPushBranch(taskId, agentId, task.branch, project.path, task.projectId);
    } catch (err) {
      // "nothing to commit" is expected when agent made no file changes
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("nothing to commit") || msg.includes("nothing added")) {
        logger.debug(`No changes to commit for task ${taskId}`, "agent-manager");
      } else {
        logger.warn(`Auto-commit failed for task ${taskId}: ${msg}`, "agent-manager");
      }
    }
  }

  /**
   * Push the task branch to remote after commit.
   * Uses -u to set upstream tracking on first push.
   */
  private async autoPushBranch(
    taskId: string,
    agentId: string,
    branch: string,
    projectPath: string,
    projectId: string,
  ): Promise<void> {
    try {
      // Check if remote exists
      const remoteUrl = await gitService.getRemoteUrl(projectPath);
      if (!remoteUrl) {
        logger.debug(`No remote configured for project, skipping push`, "agent-manager");
        return;
      }

      // Load credentials from git integration config
      let credentials: { type: "ssh" | "https"; token?: string } | undefined;
      const gitConfig = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.projectId, projectId),
            eq(schema.integrations.type, "git")
          )
        )
        .get();

      if (gitConfig?.credentials) {
        try {
          const { safeDecrypt } = await import("../lib/encryption.js");
          const creds = JSON.parse(safeDecrypt(gitConfig.credentials));
          if (creds.token) {
            credentials = { type: "https", token: creds.token };
          }
        } catch {
          // No credentials or decryption failed — try push without auth
        }
      }

      await gitService.push(projectPath, branch, "origin", credentials);
      logger.info(`Auto-pushed branch ${branch} for task ${taskId}`, "agent-manager");

      await logTaskAction(taskId, "git_push", agentId, `Pushed branch ${branch} to origin`);

      eventBus.emit("task:git_push", {
        taskId,
        projectId,
        branchName: branch,
        commitSha: "",
        remote: "origin",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`Auto-push failed for task ${taskId}: ${msg}`, "agent-manager");
    }
  }

  private async enqueueTask(agentId: string, taskId: string, projectId: string): Promise<void> {
    // Get task details for priority
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    if (!task) {
      logger.error(`Task ${taskId} not found for enqueue`, "agent-manager");
      return;
    }

    const queue = this.taskQueue.get(agentId) ?? [];

    // Add task to queue
    queue.push({
      taskId,
      projectId,
      priority: task.priority as string,
      timestamp: new Date(),
    });

    // Sort queue by priority (high > medium > low) then by timestamp
    queue.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 1;
      const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 1;

      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }

      // Same priority: older tasks first
      return a.timestamp.getTime() - b.timestamp.getTime();
    });

    this.taskQueue.set(agentId, queue);

    const position = queue.findIndex((t) => t.taskId === taskId) + 1;
    logger.info(`Task ${taskId} queued for agent ${agentId} (position ${position}, priority: ${task.priority})`, "agent-manager");

    eventBus.emit("task:queued", { taskId, agentId, projectId, queuePosition: position });
    await logTaskAction(taskId, "queued", agentId, `Queued at position ${position} (priority: ${task.priority})`);
  }

  private processQueue(agentId: string): void {
    const queue = this.taskQueue.get(agentId);
    if (!queue || queue.length === 0) return;

    const nextTask = queue.shift()!;
    if (queue.length === 0) {
      this.taskQueue.delete(agentId);
    }

    logger.info(
      `Processing queued task ${nextTask.taskId} for agent ${agentId} (priority: ${nextTask.priority})`,
      "agent-manager"
    );
    this.assignTask(nextTask.taskId, agentId).catch((err) => {
      logger.error(`Failed to assign queued task: ${err}`, "agent-manager");
    });
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const active = this.activeSessions.get(taskId);
    if (!active) {
      logger.warn(`No active session for task ${taskId}`, "agent-manager");
      return false;
    }

    active.session.cancel();
    this.activeSessions.delete(taskId);
    this.agentToTask.delete(active.agentId);

    await transitionTask(taskId, "created" as TaskStatus, undefined, "Task cancelled by user");

    eventBus.emit("agent:status", {
      agentId: active.agentId,
      projectId: active.projectId,
      status: "idle",
    });

    logger.info(`Task ${taskId} cancelled`, "agent-manager");
    return true;
  }

  isAgentBusy(agentId: string): boolean {
    return this.agentToTask.has(agentId);
  }

  getAgentStatus(agentId: string): "idle" | "running" {
    return this.agentToTask.has(agentId) ? "running" : "idle";
  }

  getActiveTaskForAgent(agentId: string): string | null {
    return this.agentToTask.get(agentId) ?? null;
  }

  getActiveSessions(): { taskId: string; agentId: string; projectId: string }[] {
    return Array.from(this.activeSessions.values()).map(({ taskId, agentId, projectId }) => ({
      taskId,
      agentId,
      projectId,
    }));
  }

  getQueueLength(agentId: string): number {
    return this.taskQueue.get(agentId)?.length ?? 0;
  }

  /**
   * Check if all subtasks of a parent task are done/review.
   * If so, transition the parent to review.
   */
  async checkSubtaskCompletion(parentTaskId: string): Promise<void> {
    const subtasks = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.parentTaskId, parentTaskId))
      .all();

    if (subtasks.length === 0) return;

    const allComplete = subtasks.every(
      (st) => st.status === "done" || st.status === "review",
    );

    if (allComplete) {
      const parent = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, parentTaskId))
        .get();

      if (parent && parent.status === "in_progress") {
        logger.info(
          `All ${subtasks.length} subtasks completed for parent ${parentTaskId}, transitioning to review`,
          "agent-manager",
        );

        await transitionTask(parentTaskId, "review" as TaskStatus, undefined, "All subtasks completed");
      }
    }
  }

  /**
   * Auto-clone a GitHub repo URL to a local directory.
   * Fetches the first user's GitHub token for authentication.
   */
  private async autoCloneProject(repoUrl: string, projectName: string): Promise<string> {
    const REPOS_DIR = join(homedir(), ".agenthub", "repos");
    await mkdir(REPOS_DIR, { recursive: true });

    const dirName = projectName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    let targetPath = join(REPOS_DIR, dirName);
    if (existsSync(targetPath)) {
      // Already cloned — reuse
      logger.info(`Reusing existing clone at ${targetPath}`, "agent-manager");
      return targetPath;
    }

    // Fetch first user's GitHub token
    const user = await db
      .select({ accessToken: schema.users.accessToken })
      .from(schema.users)
      .limit(1)
      .get();

    let token: string | undefined;
    if (user?.accessToken) {
      try {
        token = safeDecrypt(user.accessToken);
      } catch {
        logger.warn("Failed to decrypt user token for auto-clone", "agent-manager");
      }
    }

    const credentials = token ? { type: "https" as const, token } : undefined;
    await gitService.clone(repoUrl, targetPath, credentials);
    return targetPath;
  }
}

function buildTaskPrompt(task: Record<string, unknown>, agent: Agent): string {
  const parts = [`# Task: ${task.title}`];

  if (task.description) {
    parts.push(`\n## Description\n${task.description}`);
  }

  if (task.parsedSpec) {
    parts.push(`\n## Specification\n${task.parsedSpec}`);
  }

  parts.push(`\n## Context`);
  parts.push(`- Priority: ${task.priority}`);
  if (task.category) parts.push(`- Category: ${task.category}`);
  parts.push(`- Your role: ${agent.role}`);

  parts.push(`\n## Instructions`);
  parts.push(`Complete this task thoroughly. When done, provide a summary of what was accomplished.`);
  parts.push(`If you encounter blockers, explain what's blocking you clearly.`);

  return parts.join("\n");
}

// Singleton
export const agentManager = new AgentManager();
