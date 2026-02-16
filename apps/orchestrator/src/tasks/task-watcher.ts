import { db, schema } from "@agenthub/database";
import { eq, and, isNull } from "drizzle-orm";
import { agentManager } from "../agents/agent-manager.js";
import { eventBus } from "../realtime/event-bus.js";
import { logger } from "../lib/logger.js";

class TaskWatcher {
  private intervalId: NodeJS.Timeout | null = null;
  private processingTasks = new Set<string>();
  private readonly POLL_INTERVAL_MS = 3000;

  start(): void {
    if (this.intervalId) {
      logger.warn("TaskWatcher already running", "task-watcher");
      return;
    }

    logger.info("Starting TaskWatcher — polling for new tasks", "task-watcher");

    this.intervalId = setInterval(() => {
      this.pollForTasks().catch((err) => {
        logger.error(`TaskWatcher poll failed: ${err}`, "task-watcher");
      });
    }, this.POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("TaskWatcher stopped", "task-watcher");
    }
  }

  private async pollForTasks(): Promise<void> {
    // Find tasks that are "created" with no assigned agent
    const unassignedTasks = await db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.status, "created"),
          isNull(schema.tasks.assignedAgentId),
        ),
      )
      .all();

    for (const task of unassignedTasks) {
      // Skip if already being processed
      if (this.processingTasks.has(task.id)) continue;

      this.processingTasks.add(task.id);

      logger.info(
        `TaskWatcher: detected new task "${task.title}" (${task.id})`,
        "task-watcher",
      );

      // Find Tech Lead
      const agents = await db
        .select()
        .from(schema.agents)
        .where(eq(schema.agents.isActive, true))
        .all();

      const techLead = agents.find((a) => a.role === "tech_lead");

      if (!techLead) {
        logger.warn("TaskWatcher: No Tech Lead available to handle task", "task-watcher");
        this.processingTasks.delete(task.id);
        continue;
      }

      eventBus.emit("agent:notification", {
        agentId: techLead.id,
        projectId: task.projectId,
        message: `Nova task detectada automaticamente: "${task.title}". Iniciando workflow...`,
        level: "info",
      });

      // Run workflow
      try {
        await agentManager.runWorkflow(task.id, techLead.id);
      } catch (err) {
        logger.error(`TaskWatcher: Failed to start workflow for task ${task.id}: ${err}`, "task-watcher");
      } finally {
        // Remove from processing after a delay to prevent re-processing
        // The task status should change from "created" during the workflow
        setTimeout(() => {
          this.processingTasks.delete(task.id);
        }, 10000);
      }
    }
  }
}

export const taskWatcher = new TaskWatcher();
