import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";
import { AgentSession } from "./agent-session";
import { transitionTask, logTaskAction } from "../tasks/task-lifecycle";
import { eventBus } from "../realtime/event-bus";
import { logger } from "../lib/logger";
import { GitService } from "../git/git-service";
import { slugify } from "../lib/utils";
import type { Agent, TaskStatus } from "@agenthub/shared";

const gitService = new GitService();

interface ActiveSession {
  session: AgentSession;
  agentId: string;
  taskId: string;
  projectId: string;
}

class AgentManager {
  private activeSessions = new Map<string, ActiveSession>();
  private taskQueue = new Map<string, string[]>();

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

      // Move to review on success, keep in_progress on error
      if (!result.isError) {
        await transitionTask(taskId, "review" as TaskStatus, session.agentId, "Agent completed work");

        // Save result to task
        await db.update(schema.tasks).set({
          result: result.result ?? null,
          costUsd: result.cost.toString(),
          updatedAt: new Date(),
        }).where(eq(schema.tasks.id, taskId));
      } else {
        await logTaskAction(
          taskId,
          "agent_error",
          session.agentId,
          result.errors.join("; "),
        );
      }
    } finally {
      this.activeSessions.delete(taskId);
      // Process next queued task for this agent
      this.processQueue(agentId);
    }
  }

  private enqueueTask(agentId: string, taskId: string, projectId: string): void {
    const queue = this.taskQueue.get(agentId) ?? [];
    queue.push(taskId);
    this.taskQueue.set(agentId, queue);

    const position = queue.length;
    logger.info(`Task ${taskId} queued for agent ${agentId} (position ${position})`, "agent-manager");

    eventBus.emit("task:queued", { taskId, agentId, projectId, queuePosition: position });
    logTaskAction(taskId, "queued", agentId, `Queued at position ${position}`).catch(() => {});
  }

  private processQueue(agentId: string): void {
    const queue = this.taskQueue.get(agentId);
    if (!queue || queue.length === 0) return;

    const nextTaskId = queue.shift()!;
    if (queue.length === 0) {
      this.taskQueue.delete(agentId);
    }

    logger.info(`Processing queued task ${nextTaskId} for agent ${agentId}`, "agent-manager");
    this.assignTask(nextTaskId, agentId).catch((err) => {
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
