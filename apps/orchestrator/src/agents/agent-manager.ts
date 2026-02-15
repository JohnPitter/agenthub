import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";
import { AgentSession } from "./agent-session";
import { transitionTask, logTaskAction } from "../tasks/task-lifecycle";
import { eventBus } from "../realtime/event-bus";
import { logger } from "../lib/logger";
import { GitService } from "../git/git-service";
import { slugify } from "../lib/utils";
import type { Agent, TaskStatus, AgentRole, TaskCategory } from "@agenthub/shared";

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
        await transitionTask(taskId, "review" as TaskStatus, session.agentId, "Agent completed work");

        // Save result to task
        await db.update(schema.tasks).set({
          result: result.result ?? null,
          costUsd: result.cost.toString(),
          updatedAt: new Date(),
        }).where(eq(schema.tasks.id, taskId));

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
          // Max retries reached, mark as failed
          this.taskRetryCount.delete(taskId);
          await transitionTask(taskId, "failed" as TaskStatus, session.agentId, "Max retries exceeded");
          logger.warn(`Task ${taskId} failed after ${MAX_RETRIES + 1} attempts`, "agent-manager");
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
