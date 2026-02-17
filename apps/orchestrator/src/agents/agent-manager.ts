import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";
import { AgentSession } from "./agent-session";
import { transitionTask, logTaskAction } from "../tasks/task-lifecycle";
import { eventBus } from "../realtime/event-bus";
import { logger } from "../lib/logger";
import { GitService } from "../git/git-service";
import { slugify } from "../lib/utils";
import type { Agent, TaskStatus, AgentRole, TaskCategory } from "@agenthub/shared";
import { agentMemory } from "./agent-memory.js";

const gitService = new GitService();

interface ActiveSession {
  session: AgentSession;
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
  | "tech_lead_triage"    // Tech Lead analyzing the request
  | "architect_planning"  // Architect creating a plan
  | "tech_lead_review"    // Tech Lead reviewing the plan and picking a dev
  | "dev_execution"       // Dev implementing the task
  | "qa_review"           // QA reviewing the implementation
  | "dev_fix"             // Dev fixing issues found by QA
  | "tech_lead_fix_plan"  // Tech Lead creating improvement plan after dev failed to fix
  | "dev_fix_with_plan"   // Dev fixing with Tech Lead's improvement plan
  | "direct";             // Direct assignment, no workflow

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
  private taskQueue = new Map<string, QueuedTask[]>();
  private taskRetryCount = new Map<string, number>();
  private workflowStates = new Map<string, WorkflowState>();

  /**
   * Run the full agent workflow for a task:
   * Tech Lead (triage) → Architect (plan) → Tech Lead (review + pick dev) → Dev (execute)
   */
  async runWorkflow(taskId: string, techLeadId: string): Promise<void> {
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    if (!task) {
      logger.error(`Task ${taskId} not found for workflow`, "agent-manager");
      return;
    }

    // Find the Architect agent
    const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true)).all();
    const architect = agents.find((a) => a.role === "architect");

    if (!architect) {
      logger.warn("No Architect agent found, falling back to direct assignment", "agent-manager");
      await this.assignTask(taskId, techLeadId);
      return;
    }

    // Store workflow state
    this.workflowStates.set(taskId, {
      phase: "architect_planning",
      techLeadId,
      architectId: architect.id,
      architectPlan: null,
      originalTaskId: taskId,
      selectedDevId: null,
      qaRetryCount: 0,
    });

    // Emit workflow phase event
    eventBus.emit("workflow:phase", {
      taskId,
      projectId: task.projectId,
      phase: "architect_planning",
      agentId: architect.id,
      agentName: architect.name,
      detail: "Architect creating execution plan",
    });

    logger.info(
      `Workflow started for task ${taskId}: sending to Architect (${architect.name}) for planning`,
      "agent-manager",
    );

    // Emit workflow event
    eventBus.emit("agent:notification", {
      agentId: techLeadId,
      projectId: task.projectId,
      message: `Enviando task para ${architect.name} criar o plano de execução...`,
      level: "info",
    });

    // Send to Architect for planning
    await this.assignTask(taskId, architect.id);
  }

  /**
   * Handle workflow progression after a session completes
   */
  private async advanceWorkflow(taskId: string, result: string | undefined): Promise<boolean> {
    const workflow = this.workflowStates.get(taskId);
    if (!workflow) return false;

    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    if (!task) return false;

    if (workflow.phase === "architect_planning") {
      // Architect finished → store plan, send to Tech Lead to pick a dev
      workflow.architectPlan = result ?? "No plan provided";
      workflow.phase = "tech_lead_review";

      logger.info(`Workflow: Architect plan ready for task ${taskId}, sending to Tech Lead for dev selection`, "agent-manager");

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

      // Reset task status for re-assignment
      await transitionTask(taskId, "created" as TaskStatus, undefined, "Architect plan complete, selecting dev");

      // Now auto-assign to the best dev based on the plan
      workflow.phase = "dev_execution";
      this.workflowStates.set(taskId, workflow);

      // Pick the best dev using category mapping or recommendation from architect's plan
      const devRole = this.detectDevFromPlan(workflow.architectPlan);
      const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true)).all();

      let selectedDev = agents.find((a) => a.role === devRole && !this.isAgentBusy(a.id));
      if (!selectedDev) {
        selectedDev = agents.find((a) => a.role === devRole);
      }
      if (!selectedDev) {
        // Fallback: any dev that's not tech_lead or architect
        selectedDev = agents.find(
          (a) => !["tech_lead", "architect", "qa"].includes(a.role) && !this.isAgentBusy(a.id),
        );
      }
      if (!selectedDev) {
        selectedDev = agents.find((a) => !["tech_lead", "architect"].includes(a.role));
      }

      if (selectedDev) {
        workflow.selectedDevId = selectedDev.id;

        logger.info(
          `Workflow: Tech Lead selected ${selectedDev.name} (${selectedDev.role}) for task ${taskId}`,
          "agent-manager",
        );

        eventBus.emit("agent:notification", {
          agentId: workflow.techLeadId,
          projectId: task.projectId,
          message: `Dev selecionado: ${selectedDev.name}. Iniciando implementação...`,
          level: "info",
        });

        eventBus.emit("workflow:phase", {
          taskId,
          projectId: task.projectId,
          phase: "dev_execution",
          agentId: selectedDev.id,
          agentName: selectedDev.name,
          detail: `${selectedDev.name} implementing the task`,
        });

        await this.assignTask(taskId, selectedDev.id);
      } else {
        logger.warn(`Workflow: No dev available for task ${taskId}, falling back to auto-assign`, "agent-manager");
        await this.autoAssignTask(taskId);
      }

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

        logger.info(`Workflow: Dev finished task ${taskId}, sending to QA (${qaAgent.name}) for review`, "agent-manager");

        eventBus.emit("agent:notification", {
          agentId: workflow.techLeadId,
          projectId: task.projectId,
          message: `Dev finalizou. Enviando para ${qaAgent.name} revisar a implementação...`,
          level: "info",
        });

        // Reset task for QA assignment
        await transitionTask(taskId, "created" as TaskStatus, undefined, "Dev complete, sending to QA review");
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

      // Append QA feedback to task description
      const qaFeedback = qaVerdict.reason || result || "QA found issues";
      const updatedDescription = [
        task.description ?? "",
        `\n\n---\n## QA Feedback (Tentativa ${workflow.qaRetryCount})\n`,
        qaFeedback,
        "\n\nPor favor, corrija os problemas apontados acima pelo QA.",
      ].join("");

      await db.update(schema.tasks).set({
        description: updatedDescription,
        updatedAt: new Date(),
      }).where(eq(schema.tasks.id, taskId));

      // Reset and re-assign to dev
      await transitionTask(taskId, "created" as TaskStatus, undefined, `QA rejected, returning to dev (attempt ${workflow.qaRetryCount})`);
      await this.assignTask(taskId, devId);
      return true;
    }

    if (workflow.phase === "dev_fix") {
      // Dev finished fixing QA issues → send back to QA for re-review
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

        await transitionTask(taskId, "created" as TaskStatus, undefined, "Dev fix complete, sending back to QA");
        await this.assignTask(taskId, qaAgent.id);
        return true;
      }

      // No QA agent — go to review directly
      this.workflowStates.delete(taskId);
      return false;
    }

    if (workflow.phase === "tech_lead_fix_plan") {
      // Tech Lead created an improvement plan → send back to dev with the plan
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
      const improvementPlan = result || "No plan provided";
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

      await transitionTask(taskId, "created" as TaskStatus, undefined, "Tech Lead plan ready, sending to dev");
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

        await transitionTask(taskId, "created" as TaskStatus, undefined, "Dev implemented improvement plan, sending to QA");
        await this.assignTask(taskId, qaAgent.id);
        return true;
      }

      // No QA agent — go to review directly
      this.workflowStates.delete(taskId);
      return false;
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
      "\n\n---\n## Dev Failed to Fix — Errors\n",
      errors,
      "\n\nComo Tech Lead, analise os erros acima junto com o feedback anterior do QA.",
      " Crie um plano detalhado de melhorias para o dev implementar as correções.",
      " O plano deve ser claro, passo a passo, com os arquivos que precisam ser alterados.",
    ].join("");

    await db.update(schema.tasks).set({
      description: updatedDescription,
      updatedAt: new Date(),
    }).where(eq(schema.tasks.id, taskId));

    // Reset and assign to Tech Lead
    await transitionTask(taskId, "created" as TaskStatus, undefined, "Dev fix failed, escalating to Tech Lead");
    await this.assignTask(taskId, techLead.id);
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

    // Git branch auto-creation logic
    let branchName: string | null = null;
    try {
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

      if (gitConfig && gitConfig.config) {
        const config = JSON.parse(gitConfig.config);
        if (config.autoCreateBranch) {
          const isGitRepo = await gitService.detectGitRepo(project.path);
          if (isGitRepo) {
            branchName = `task/${task.id}-${slugify(task.title as string)}`;
            const branchExists = await gitService.branchExists(project.path, branchName);

            if (!branchExists) {
              await gitService.createBranch(project.path, branchName, config.defaultBranch);
              logger.info(`Created git branch: ${branchName}`, "agent-manager");

              await logTaskAction(taskId, "git_branch_created", agentId, branchName);

              eventBus.emit("task:git_branch", {
                taskId: task.id,
                projectId: task.projectId,
                branchName,
                baseBranch: config.defaultBranch,
              });
            }
          }
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

    // Create and start session
    const session = new AgentSession({
      agent: agent as unknown as Agent,
      projectId: task.projectId,
      projectPath: project.path,
      taskId,
      prompt,
    });

    this.activeSessions.set(taskId, {
      session,
      agentId,
      taskId,
      projectId: task.projectId,
    });

    await logTaskAction(taskId, "agent_assigned", agentId, `Agent ${agent.name} started working`);

    // Execute in background (don't await)
    this.executeSession(taskId, agentId, session).catch((err) => {
      logger.error(`Session execution failed: ${err}`, "agent-manager");
    });
  }

  private async executeSession(taskId: string, agentId: string, session: AgentSession) {
    try {
      const result = await session.execute();

      // Move to review on success
      if (!result.isError) {
        // Check if this is part of a workflow (e.g., architect just finished planning)
        const workflowHandled = await this.advanceWorkflow(taskId, result.result);

        if (!workflowHandled) {
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

          // Check if this is a dev_fix or dev_fix_with_plan phase — escalate to Tech Lead
          const workflow = this.workflowStates.get(taskId);
          const isDevFixPhase = workflow && (workflow.phase === "dev_fix" || workflow.phase === "dev_fix_with_plan");

          if (isDevFixPhase && workflow) {
            // Dev couldn't fix → escalate to Tech Lead for improvement plan
            await this.escalateToTechLead(taskId, workflow, result.errors.join("; "));
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
      this.activeSessions.delete(taskId);
      // Process next queued task for this agent (only if not retrying)
      const retryCount = this.taskRetryCount.get(taskId) ?? 0;
      if (retryCount === 0) {
        this.processQueue(agentId);
      }
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
    for (const session of this.activeSessions.values()) {
      if (session.agentId === agentId) return true;
    }
    return false;
  }

  getAgentStatus(agentId: string): "idle" | "running" {
    return this.isAgentBusy(agentId) ? "running" : "idle";
  }

  getActiveTaskForAgent(agentId: string): string | null {
    for (const session of this.activeSessions.values()) {
      if (session.agentId === agentId) return session.taskId;
    }
    return null;
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
