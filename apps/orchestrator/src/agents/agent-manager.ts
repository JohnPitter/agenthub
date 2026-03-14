import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";
import { userReposDir } from "../lib/storage.js";
import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";
import { OpenRouterSession } from "./openrouter-session";
import { transitionTask, logTaskAction } from "../tasks/task-lifecycle";
import { eventBus } from "../realtime/event-bus";
import { logger } from "../lib/logger";
import { safeDecrypt } from "../lib/encryption.js";
import { GitService } from "../git/git-service";
import { slugify } from "../lib/utils";
import { nanoid } from "nanoid";
import type { Agent, TaskStatus, AgentRole, TaskCategory } from "@agenthub/shared";
import { agentMemory } from "./agent-memory.js";
import { workflowExecutor } from "../workflows/workflow-executor.js";

const gitService = new GitService();

interface ActiveSession {
  session: OpenRouterSession;
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
  | "split_task_dispatch"   // Tech Lead split the task into subtasks, dispatching
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

interface SubtaskDefinition {
  title: string;
  description: string;
  category: TaskCategory;
  recommended_role: AgentRole;
}

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
      .then(r => r[0]);

    return workflow?.id ?? null;
  }

  /**
   * Run the full agent workflow for a task.
   * If the project has a custom workflow, uses WorkflowExecutor.
   * Otherwise falls back to the hardcoded flow:
   * Tech Lead (triage) -> [simple: plan + pick dev | complex: Architect -> plan -> pick dev] -> Dev -> QA
   */
  async runWorkflow(taskId: string, techLeadId: string): Promise<void> {
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).then(r => r[0]);
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
      message: `Analyzing the task to decide the best execution flow...`,
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

    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).then(r => r[0]);
    if (!task) return false;

    if (workflow.phase === "tech_lead_triage") {
      // Tech Lead finished triage → decide: send to Architect or plan directly
      const triageDecision = this.parseTriageDecision(result);

      if (triageDecision.needsArchitect) {
        // Complex task → send to Architect for detailed planning
        const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true));
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
            message: `Complex task — sending to ${architect.name} to create the execution plan...`,
            level: "info",
          });

          // Append Tech Lead's analysis to task description
          if (triageDecision.analysis) {
            const updatedDescription = [
              task.description ?? "",
              "\n\n---\n## Tech Lead Analysis\n",
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

      // SPLIT_TASK → Tech Lead wants to split into parallel subtasks
      if (triageDecision.splitTask && triageDecision.subtasks.length >= 2 && !task.parentTaskId) {
        logger.info(
          `Workflow: Tech Lead decided to SPLIT task ${taskId} into ${triageDecision.subtasks.length} subtasks`,
          "agent-manager",
        );

        eventBus.emit("agent:notification", {
          agentId: workflow.techLeadId,
          projectId: task.projectId,
          message: `Splitting task into ${triageDecision.subtasks.length} parallel subtasks...`,
          level: "info",
        });

        await this.dispatchSplitTask(taskId, task.projectId, workflow, triageDecision.subtasks, triageDecision.analysis);
        return true;
      }

      // If SPLIT_TASK was requested but conditions not met, fall through to simple task
      if (triageDecision.splitTask) {
        logger.warn(
          `SPLIT_TASK requested for task ${taskId} but conditions not met (subtasks: ${triageDecision.subtasks.length}, isSubtask: ${!!task.parentTaskId}), treating as simple task`,
          "agent-manager",
        );
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
        "\n\n---\n## Tech Lead Plan\n",
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
        message: `Architect plan ready. Selecting the best dev to execute...`,
        level: "info",
      });

      // Update the task description with the architect's plan
      const planDescription = [
        task.description ?? "",
        "\n\n---\n## Architect Plan\n",
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
      const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true));
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
          message: `Dev finished. Sending to ${qaAgent.name} to review the implementation...`,
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
          message: `QA approved the implementation. Awaiting user approval.`,
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

      const devAgent = await db.select().from(schema.agents).where(eq(schema.agents.id, devId)).then(r => r[0]);
      const devName = devAgent?.name ?? "Dev";

      logger.info(
        `Workflow: QA rejected task ${taskId} (attempt ${workflow.qaRetryCount}), sending back to ${devName} for fixes`,
        "agent-manager",
      );

      eventBus.emit("agent:notification", {
        agentId: workflow.techLeadId,
        projectId: task.projectId,
        message: `QA rejected the implementation. Sending back to ${devName} to fix the issues found.`,
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
        `\n\n---\n## QA Feedback (Attempt ${workflow.qaRetryCount})\n`,
        qaFeedback,
        "\n\nPlease fix the issues reported above by QA.",
        "\n\n## IMPORTANT — Dev Decision",
        "\nAnalyze the problems reported by QA and decide:",
        "\n- If you CAN fix it: implement the fixes normally.",
        "\n- If you CANNOT fix it (too complex, out of scope, or needs help): ",
        "end your response with DEV_NEEDS_HELP on the last line to escalate to the Tech Lead.",
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
      const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true));
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
          message: `Dev fixed the issues. Sending back to ${qaAgent.name} for re-review...`,
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

      const devAgent = await db.select().from(schema.agents).where(eq(schema.agents.id, devId)).then(r => r[0]);
      const devName = devAgent?.name ?? "Dev";

      workflow.phase = "dev_fix_with_plan";
      this.workflowStates.set(taskId, workflow);

      // Append Tech Lead's improvement plan to task description
      const improvementPlan = triageDecision.plan || result || "No plan provided";
      const updatedDescription = [
        task.description ?? "",
        "\n\n---\n## Tech Lead Improvement Plan\n",
        improvementPlan,
        "\n\nFollow the plan above to fix the issues. QA will review again after your fixes.",
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
        message: `Improvement plan created. Sending to ${devName} to implement the fixes...`,
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
      const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true));
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
          message: `Dev implemented the improvement plan. Sending to ${qaAgent.name} for validation...`,
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
      const techLead = await db.select().from(schema.agents).where(eq(schema.agents.id, workflow.techLeadId)).then(r => r[0]);
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
        "\n\n---\n## Architect Fix Plan\n",
        architectFixPlan,
        "\n\nAs Tech Lead, review the Architect's plan and create clear instructions for the dev to implement.",
      ].join("");

      await db.update(schema.tasks).set({
        description: updatedDescription,
        updatedAt: new Date(),
      }).where(eq(schema.tasks.id, taskId));

      logger.info(`Workflow: Architect fix plan ready for task ${taskId}, sending to Tech Lead to relay`, "agent-manager");

      eventBus.emit("agent:notification", {
        agentId: workflow.techLeadId,
        projectId: task.projectId,
        message: `Architect's plan ready. Sending to Tech Lead to create instructions for the dev...`,
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

      const devAgent = await db.select().from(schema.agents).where(eq(schema.agents.id, devId)).then(r => r[0]);
      const devName = devAgent?.name ?? "Dev";

      workflow.phase = "dev_fix_with_plan";
      this.workflowStates.set(taskId, workflow);

      // Append Tech Lead's relay instructions to task description
      const relayPlan = result || "No plan provided";
      const updatedDescription = [
        task.description ?? "",
        "\n\n---\n## Tech Lead Instructions (based on Architect's plan)\n",
        relayPlan,
        "\n\nFollow the instructions above to fix the issues. QA will review again after your fixes.",
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
        message: `Fix plan ready. Sending to ${devName} to implement...`,
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
    splitTask: boolean;
    subtasks: SubtaskDefinition[];
    plan: string | null;
    analysis: string | null;
  } {
    const empty = { needsArchitect: false, splitTask: false, subtasks: [], plan: null, analysis: null };
    if (!result) return { ...empty, needsArchitect: true };

    const lines = result.trim().split("\n");

    // Search from the last lines for the decision marker
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
      const line = lines[i].trim();

      if (line === "NEEDS_ARCHITECT") {
        const analysis = lines.slice(0, i).join("\n").trim() || null;
        return { ...empty, needsArchitect: true, analysis };
      }

      if (line === "SIMPLE_TASK") {
        const plan = lines.slice(0, i).join("\n").trim() || null;
        return { ...empty, plan };
      }

      if (line === "SPLIT_TASK") {
        const textBefore = lines.slice(0, i).join("\n").trim();
        const subtasks = this.parseSubtaskDefinitions(textBefore);
        return { ...empty, splitTask: true, subtasks, analysis: textBefore };
      }
    }

    // No explicit marker — default to sending to Architect (safer for complex tasks)
    logger.warn("Tech Lead triage did not contain a decision marker, defaulting to Architect", "agent-manager");
    return { ...empty, needsArchitect: true, analysis: result };
  }

  /**
   * Parse subtask definitions from a ```subtasks JSON block in the Tech Lead's response.
   */
  private parseSubtaskDefinitions(text: string): SubtaskDefinition[] {
    const match = text.match(/```subtasks\s*\n([\s\S]*?)```/);
    if (!match) {
      logger.warn("SPLIT_TASK marker found but no ```subtasks block", "agent-manager");
      return [];
    }

    try {
      const parsed = JSON.parse(match[1].trim());
      if (!Array.isArray(parsed) || parsed.length < 2) {
        logger.warn(`Invalid subtask array (length ${parsed?.length}), need at least 2`, "agent-manager");
        return [];
      }

      // Validate and cap at 5
      const valid: SubtaskDefinition[] = [];
      for (const item of parsed.slice(0, 5)) {
        if (item.title && item.description) {
          valid.push({
            title: item.title,
            description: item.description,
            category: item.category || "feature",
            recommended_role: item.recommended_role || "backend_dev",
          });
        }
      }
      return valid;
    } catch (err) {
      logger.error(`Failed to parse subtask definitions JSON: ${err}`, "agent-manager");
      return [];
    }
  }

  /**
   * Dispatch a split task: create subtask records, transition parent to in_progress,
   * and launch independent workflows for each subtask.
   */
  private async dispatchSplitTask(
    parentTaskId: string,
    projectId: string,
    workflow: WorkflowState,
    subtasks: SubtaskDefinition[],
    analysis: string | null,
  ): Promise<void> {
    workflow.phase = "split_task_dispatch";
    this.workflowStates.set(parentTaskId, workflow);

    // Update parent task description with Tech Lead's split analysis
    if (analysis) {
      const parentTask = await db.select().from(schema.tasks).where(eq(schema.tasks.id, parentTaskId)).then(r => r[0]);
      const updatedDescription = [
        parentTask?.description ?? "",
        "\n\n---\n## Tech Lead Split Analysis\n",
        analysis,
      ].join("");

      await db.update(schema.tasks).set({
        description: updatedDescription,
        updatedAt: new Date(),
      }).where(eq(schema.tasks.id, parentTaskId));
    }

    // Parent is already in_progress (from assignTask to Tech Lead) — it stays there until all subtasks complete
    await logTaskAction(parentTaskId, "status_change", workflow.techLeadId, `Split into ${subtasks.length} subtasks — waiting for all to complete`);

    eventBus.emit("workflow:phase", {
      taskId: parentTaskId,
      projectId,
      phase: "split_task_dispatch",
      agentId: workflow.techLeadId,
      agentName: "Tech Lead",
      detail: `Dispatching ${subtasks.length} parallel subtasks`,
    });

    await logTaskAction(parentTaskId, "workflow_phase", workflow.techLeadId, `Phase: split_task_dispatch — Creating ${subtasks.length} subtasks`);

    // Find Tech Lead for subtask workflows
    const techLead = await db.select().from(schema.agents).where(eq(schema.agents.id, workflow.techLeadId)).then(r => r[0]);
    if (!techLead) {
      logger.error(`Tech Lead ${workflow.techLeadId} not found for subtask dispatch`, "agent-manager");
      await transitionTask(parentTaskId, "failed" as TaskStatus, undefined, "Tech Lead not found for subtask dispatch");
      this.workflowStates.delete(parentTaskId);
      return;
    }

    // Create subtask records and launch workflows
    const parentTask = await db.select().from(schema.tasks).where(eq(schema.tasks.id, parentTaskId)).then(r => r[0]);

    for (const subtask of subtasks) {
      const subtaskId = nanoid();

      await db.insert(schema.tasks).values({
        id: subtaskId,
        projectId,
        parentTaskId,
        title: subtask.title,
        description: subtask.description,
        priority: parentTask?.priority ?? "medium",
        category: subtask.category,
        status: "assigned",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info(
        `Created subtask ${subtaskId}: "${subtask.title}" (${subtask.recommended_role}) for parent ${parentTaskId}`,
        "agent-manager",
      );

      await logTaskAction(subtaskId, "status_change", workflow.techLeadId, `Subtask created from parent ${parentTaskId}`);

      eventBus.emit("task:created", {
        task: await db.select().from(schema.tasks).where(eq(schema.tasks.id, subtaskId)).then(r => r[0]),
      });

      // Launch independent workflow for each subtask
      this.runWorkflow(subtaskId, techLead.id).catch((err) => {
        logger.error(`Failed to start workflow for subtask ${subtaskId}: ${err}`, "agent-manager");
      });
    }

    // Clean up parent workflow state — parent is now waiting for subtask completion
    this.workflowStates.delete(parentTaskId);

    logger.info(
      `Dispatched ${subtasks.length} subtasks for parent ${parentTaskId}. Parent stays in_progress until all complete.`,
      "agent-manager",
    );
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
    const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true));

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
        message: `Dev selected: ${selectedDev.name}. Starting implementation...`,
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
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).then(r => r[0]);
    if (!task) return;

    const techLead = await db.select().from(schema.agents).where(eq(schema.agents.id, workflow.techLeadId)).then(r => r[0]);
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
      message: `Dev could not fix the issues. Analyzing to create an improvement plan...`,
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
      "\n\n---\n## Dev Could Not Resolve — Context\n",
      errors,
      "\n\nAs Tech Lead, analyze the context above along with the previous QA feedback.",
      "\n\n## Tech Lead Decision",
      "\nAnalyze whether you CAN create an improvement plan for the dev:",
      "\n- If YES: create a detailed, step-by-step plan with the files that need to be changed. End with: SIMPLE_TASK",
      "\n- If NO (too complex, needs deep architectural analysis): end with: NEEDS_ARCHITECT",
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
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).then(r => r[0]);
    if (!task) return;

    const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true));
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
      message: `Tech Lead's plan was not sufficient. Escalating to ${architect.name} to create a detailed plan...`,
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
      "\n\n---\n## Escalation to Architect — Context\n",
      errors,
      "\n\nThe Tech Lead analyzed but could not create a sufficient improvement plan for the dev.",
      " As Architect, analyze the full history above and create a detailed, definitive plan.",
      " Consider alternative approaches and include code examples when necessary.",
      " Your plan will be relayed to the Tech Lead who will send it to the dev for implementation.",
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
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).then(r => r[0]);
    if (!task) {
      logger.error(`Task ${taskId} not found`, "agent-manager");
      return;
    }

    // Get all active agents for this project
    const agents = await db.select().from(schema.agents).where(eq(schema.agents.isActive, true));

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
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).then(r => r[0]);
    if (!task) {
      logger.error(`Task ${taskId} not found`, "agent-manager");
      return;
    }

    const agent = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId)).then(r => r[0]);
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
    const project = await db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId)).then(r => r[0]);
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
        const localPath = await this.autoCloneProject(project.path, project.name, project.ownerId);
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
          .then(r => r[0]);

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

    const session = new OpenRouterSession(sessionConfig);

    this.activeSessions.set(taskId, {
      session,
      agentId,
      taskId,
      projectId: task.projectId,
    });
    this.agentToTask.set(agentId, taskId);

    await logTaskAction(taskId, "agent_assigned", agentId, `Agent ${agent.name} started working (openrouter)`);

    // Execute in background (don't await)
    this.executeSession(taskId, agentId, session).catch((err) => {
      logger.error(`Session execution failed: ${err}`, "agent-manager");
    });
  }

  private async executeSession(taskId: string, agentId: string, session: OpenRouterSession) {
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
          const taskData = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).then(r => r[0]);
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
          const taskData = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).then(r => r[0]);
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
            const taskData = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).then(r => r[0]);
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
      const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).then(r => r[0]);
      if (!task?.branch) return;

      const project = await db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId)).then(r => r[0]);
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
      const agent = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId)).then(r => r[0]);
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
        .then(r => r[0]);

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
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).then(r => r[0]);
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
      ;

    if (subtasks.length === 0) return;

    const allComplete = subtasks.every(
      (st) => st.status === "done" || st.status === "review",
    );

    if (allComplete) {
      const parent = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, parentTaskId))
        .then(r => r[0]);

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
  private async autoCloneProject(repoUrl: string, projectName: string, ownerId?: string | null): Promise<string> {
    const baseDir = ownerId ? userReposDir(ownerId) : userReposDir("default");
    await mkdir(baseDir, { recursive: true });

    const dirName = projectName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    let targetPath = join(baseDir, dirName);
    if (existsSync(targetPath)) {
      // Already cloned — reuse
      logger.info(`Reusing existing clone at ${targetPath}`, "agent-manager");
      return targetPath;
    }

    // Fetch owner's or first user's GitHub token
    const userQuery = ownerId
      ? db.select({ accessToken: schema.users.accessToken }).from(schema.users).where(eq(schema.users.id, ownerId)).then(r => r[0])
      : db.select({ accessToken: schema.users.accessToken }).from(schema.users).limit(1).then(r => r[0]);
    const user = await userQuery;

    let token: string | undefined;
    if (user?.accessToken) {
      try {
        token = safeDecrypt(user.accessToken);
      } catch {
        logger.warn("Failed to decrypt user token for auto-clone", "agent-manager");
      }
    }

    const credentials = token ? { type: "https" as const, token } : undefined;
    await gitService.clone(repoUrl, targetPath, credentials, { depth: 1 });
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
