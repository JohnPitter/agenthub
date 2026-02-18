import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { WorkflowEngine } from "./workflow-engine.js";
import { agentManager } from "../agents/agent-manager.js";
import { transitionTask } from "../tasks/task-lifecycle.js";
import { eventBus } from "../realtime/event-bus.js";
import { logger } from "../lib/logger.js";
import type { WorkflowNode, WorkflowEdge, WorkflowExecutionState, TaskStatus, AgentRole } from "@agenthub/shared";

/**
 * WorkflowExecutor — runs a custom DAG workflow for a task.
 *
 * Creates subtasks (with parentTaskId pointing to the main task)
 * for each "agent" node, then advances through the DAG as nodes complete.
 */
class WorkflowExecutorService {
  /** Active workflow executions: mainTaskId -> execution state */
  private executions = new Map<string, WorkflowExecutionState>();
  /** Map subtaskId -> { mainTaskId, nodeId } for tracking */
  private subtaskToNode = new Map<string, { mainTaskId: string; nodeId: string }>();

  /**
   * Start executing a workflow for a given task.
   * Returns true if the workflow was started, false if validation failed.
   */
  async executeWorkflow(taskId: string, workflowId: string): Promise<boolean> {
    const workflow = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, workflowId))
      .get();

    if (!workflow) {
      logger.error(`Workflow ${workflowId} not found`, "workflow-executor");
      return false;
    }

    const nodes: WorkflowNode[] = JSON.parse(workflow.nodes);
    const edges: WorkflowEdge[] = JSON.parse(workflow.edges);

    const engine = new WorkflowEngine(nodes, edges);
    const validation = engine.validate();

    if (!validation.valid) {
      logger.error(
        `Workflow "${workflow.name}" validation failed: ${validation.errors.join("; ")}`,
        "workflow-executor",
      );
      return false;
    }

    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
    if (!task) {
      logger.error(`Task ${taskId} not found for workflow execution`, "workflow-executor");
      return false;
    }

    // Initialize execution state
    const state: WorkflowExecutionState = {
      workflowId,
      taskId,
      status: "running",
      completedNodeIds: [],
      activeNodeIds: [],
      nodeResults: {},
    };

    this.executions.set(taskId, state);

    logger.info(
      `Starting workflow "${workflow.name}" for task ${taskId}`,
      "workflow-executor",
    );

    eventBus.emit("workflow:phase", {
      taskId,
      projectId: task.projectId,
      phase: "custom_workflow",
      agentId: "",
      agentName: "",
      detail: `Running custom workflow: ${workflow.name}`,
    });

    // Transition parent task to in_progress
    await transitionTask(taskId, "in_progress" as TaskStatus, undefined, `Custom workflow "${workflow.name}" started`);

    // Start entry nodes
    const entryNodes = engine.getEntryNodes();
    for (const node of entryNodes) {
      await this.executeNode(taskId, node, task.projectId, engine);
    }

    return true;
  }

  /**
   * Execute a single node in the workflow.
   * For "agent" nodes, creates a subtask and assigns it.
   * For "parallel" and "merge" nodes, immediately completes and advances.
   * For "condition" nodes, checks condition and advances.
   */
  private async executeNode(
    mainTaskId: string,
    node: WorkflowNode,
    projectId: string,
    engine: WorkflowEngine,
  ): Promise<void> {
    const state = this.executions.get(mainTaskId);
    if (!state) return;

    state.activeNodeIds.push(node.id);

    logger.info(
      `Executing workflow node "${node.label}" (${node.type}) for task ${mainTaskId}`,
      "workflow-executor",
    );

    switch (node.type) {
      case "agent": {
        // Create a subtask for the agent node
        const subtaskId = nanoid();
        const mainTask = await db.select().from(schema.tasks).where(eq(schema.tasks.id, mainTaskId)).get();

        await db.insert(schema.tasks).values({
          id: subtaskId,
          projectId,
          parentTaskId: mainTaskId,
          title: `[${node.label}] ${mainTask?.title ?? "Workflow step"}`,
          description: mainTask?.description ?? null,
          status: "created",
          priority: mainTask?.priority ?? "medium",
          category: mainTask?.category ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        this.subtaskToNode.set(subtaskId, { mainTaskId, nodeId: node.id });

        // Find the agent to assign
        const agentId = await this.resolveAgent(node, projectId);
        if (agentId) {
          await agentManager.assignTask(subtaskId, agentId);
        } else {
          logger.warn(
            `No agent found for node "${node.label}" (role: ${node.agentRole}), auto-assigning`,
            "workflow-executor",
          );
          await agentManager.autoAssignTask(subtaskId);
        }
        break;
      }

      case "parallel":
      case "merge": {
        // These are structural nodes — complete immediately and advance
        await this.completeNode(mainTaskId, node.id, engine, projectId);
        break;
      }

      case "condition": {
        // Gather results from parent task for condition checking
        const mainTask = await db.select().from(schema.tasks).where(eq(schema.tasks.id, mainTaskId)).get();
        const taskResult: Record<string, unknown> = {
          status: mainTask?.status ?? "",
          result: mainTask?.result ?? "",
          category: mainTask?.category ?? "",
          priority: mainTask?.priority ?? "",
        };

        // Also merge node results from completed nodes
        for (const [key, val] of Object.entries(state.nodeResults)) {
          taskResult[`node_${key}`] = val;
        }

        await this.completeNode(mainTaskId, node.id, engine, projectId, taskResult);
        break;
      }
    }
  }

  /**
   * Called when a subtask (created for an agent node) completes.
   * Advances the workflow DAG to the next nodes.
   */
  async onSubtaskCompleted(subtaskId: string, result?: string): Promise<boolean> {
    const mapping = this.subtaskToNode.get(subtaskId);
    if (!mapping) return false;

    const { mainTaskId, nodeId } = mapping;
    const state = this.executions.get(mainTaskId);
    if (!state) return false;

    // Store the result for this node
    if (result) {
      state.nodeResults[nodeId] = result;
    }

    const workflow = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, state.workflowId))
      .get();

    if (!workflow) return false;

    const nodes: WorkflowNode[] = JSON.parse(workflow.nodes);
    const edges: WorkflowEdge[] = JSON.parse(workflow.edges);
    const engine = new WorkflowEngine(nodes, edges);

    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, mainTaskId)).get();
    const projectId = task?.projectId ?? "";

    await this.completeNode(mainTaskId, nodeId, engine, projectId);

    this.subtaskToNode.delete(subtaskId);
    return true;
  }

  /**
   * Mark a node as completed and advance to the next nodes.
   */
  private async completeNode(
    mainTaskId: string,
    nodeId: string,
    engine: WorkflowEngine,
    projectId: string,
    taskResult?: Record<string, unknown>,
  ): Promise<void> {
    const state = this.executions.get(mainTaskId);
    if (!state) return;

    // Mark node as completed
    state.completedNodeIds.push(nodeId);
    state.activeNodeIds = state.activeNodeIds.filter((id) => id !== nodeId);

    const completedSet = new Set(state.completedNodeIds);
    const nextNodeIds = engine.getNextNodes(completedSet, nodeId, taskResult);

    if (nextNodeIds.length === 0 && state.activeNodeIds.length === 0) {
      // Workflow complete — no more nodes to execute
      state.status = "completed";
      this.executions.delete(mainTaskId);

      logger.info(`Custom workflow completed for task ${mainTaskId}`, "workflow-executor");

      eventBus.emit("workflow:phase", {
        taskId: mainTaskId,
        projectId,
        phase: "completed",
        agentId: "",
        agentName: "",
        detail: "Custom workflow completed",
      });

      // Transition parent task to review
      await transitionTask(mainTaskId, "review" as TaskStatus, undefined, "Custom workflow completed");
      return;
    }

    // Execute next nodes
    for (const nextId of nextNodeIds) {
      const node = engine.getNode(nextId);
      if (node) {
        await this.executeNode(mainTaskId, node, projectId, engine);
      }
    }
  }

  /**
   * Resolve which agent should handle an agent node.
   * Checks explicit agentId, then falls back to role-based matching.
   */
  private async resolveAgent(node: WorkflowNode, projectId: string): Promise<string | null> {
    // If a specific agent ID is configured, use it
    if (node.agentId) {
      const agent = await db.select().from(schema.agents).where(eq(schema.agents.id, node.agentId)).get();
      if (agent?.isActive) return agent.id;
    }

    // Fall back to role-based matching
    if (node.agentRole) {
      const agents = await db
        .select()
        .from(schema.agents)
        .where(and(eq(schema.agents.isActive, true), eq(schema.agents.role, node.agentRole as AgentRole)))
        .all();

      if (agents.length > 0) {
        // Prefer an idle agent
        const idle = agents.find((a) => !agentManager.isAgentBusy(a.id));
        return idle?.id ?? agents[0].id;
      }
    }

    return null;
  }

  /**
   * Check if a task is currently running a custom workflow.
   */
  isRunningWorkflow(taskId: string): boolean {
    return this.executions.has(taskId);
  }

  /**
   * Check if a subtask belongs to a workflow execution.
   */
  isWorkflowSubtask(subtaskId: string): boolean {
    return this.subtaskToNode.has(subtaskId);
  }

  /**
   * Get execution state for a task.
   */
  getExecutionState(taskId: string): WorkflowExecutionState | null {
    return this.executions.get(taskId) ?? null;
  }
}

// Singleton
export const workflowExecutor = new WorkflowExecutorService();
