import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TASK_TRANSITIONS } from "@agenthub/shared";
import type { TaskStatus } from "@agenthub/shared";
import { eventBus } from "../realtime/event-bus";
import { logger } from "../lib/logger";
import { agentManager } from "../agents/agent-manager.js";

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  const allowed = TASK_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}

export async function transitionTask(
  taskId: string,
  newStatus: TaskStatus,
  agentId?: string,
  detail?: string,
): Promise<boolean> {
  const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) {
    logger.warn(`Task ${taskId} not found for transition`, "task-lifecycle");
    return false;
  }

  const currentStatus = task.status as TaskStatus;
  if (!canTransition(currentStatus, newStatus)) {
    logger.warn(
      `Invalid transition ${currentStatus} → ${newStatus} for task ${taskId}`,
      "task-lifecycle",
    );
    return false;
  }

  const updates: Record<string, unknown> = {
    status: newStatus,
    updatedAt: new Date(),
  };

  if (newStatus === "done") {
    updates.completedAt = new Date();
  }

  await db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, taskId));

  // Log the transition
  await db.insert(schema.taskLogs).values({
    id: nanoid(),
    taskId,
    agentId: agentId ?? null,
    action: `status_change`,
    fromStatus: currentStatus,
    toStatus: newStatus,
    detail: detail ?? null,
    filePath: null,
    createdAt: new Date(),
  });

  logger.info(
    `Task ${taskId}: ${currentStatus} → ${newStatus}`,
    "task-lifecycle",
    { agentId, detail },
  );

  // Emit events
  eventBus.emit("task:status", { taskId, status: newStatus, agentId });

  const updated = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  eventBus.emit("task:updated", { task: updated });

  // Check if parent task should advance when subtask completes
  if (newStatus === "done" && task.parentTaskId) {
    agentManager.checkSubtaskCompletion(task.parentTaskId).catch((err) => {
      logger.warn(`Failed to check subtask completion: ${err}`, "task-lifecycle");
    });
  }

  return true;
}

export async function logTaskAction(
  taskId: string,
  action: string,
  agentId?: string,
  detail?: string,
  filePath?: string,
) {
  await db.insert(schema.taskLogs).values({
    id: nanoid(),
    taskId,
    agentId: agentId ?? null,
    action,
    fromStatus: null,
    toStatus: null,
    detail: detail ?? null,
    filePath: filePath ?? null,
    createdAt: new Date(),
  });
}

/**
 * TaskTimeoutManager monitors in_progress tasks and marks them as failed after timeout
 */
class TaskTimeoutManager {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private readonly CHECK_INTERVAL_MS = 60 * 1000; // 60 seconds

  start(): void {
    if (this.intervalId) {
      logger.warn("TaskTimeoutManager already running", "task-timeout");
      return;
    }

    logger.info("Starting TaskTimeoutManager", "task-timeout");

    this.intervalId = setInterval(() => {
      this.checkTimeouts().catch((err) => {
        logger.error(`TaskTimeoutManager check failed: ${err}`, "task-timeout");
      });
    }, this.CHECK_INTERVAL_MS);

    // Run initial check immediately
    this.checkTimeouts().catch((err) => {
      logger.error(`Initial timeout check failed: ${err}`, "task-timeout");
    });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("TaskTimeoutManager stopped", "task-timeout");
    }
  }

  private async checkTimeouts(): Promise<void> {
    const now = new Date();
    const timeoutThreshold = new Date(now.getTime() - this.TIMEOUT_MS);

    // Find all in_progress tasks that have been running too long
    const timedOutTasks = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.status, "in_progress"))
      .all();

    for (const task of timedOutTasks) {
      // Check if task has been in_progress for more than TIMEOUT_MS
      const taskUpdatedAt = new Date(task.updatedAt);

      if (taskUpdatedAt < timeoutThreshold) {
        logger.warn(
          `Task ${task.id} timed out (started at ${taskUpdatedAt.toISOString()})`,
          "task-timeout"
        );

        // Transition to failed
        const success = await transitionTask(
          task.id,
          "failed",
          undefined,
          `Task timed out after ${this.TIMEOUT_MS / 1000 / 60} minutes`
        );

        if (success) {
          // Log the timeout
          await logTaskAction(
            task.id,
            "timeout",
            task.assignedAgentId ?? undefined,
            `Automatically failed due to ${this.TIMEOUT_MS / 1000 / 60} minute timeout`
          );

          logger.info(
            `Task ${task.id} marked as failed due to timeout`,
            "task-timeout"
          );
        }
      }
    }
  }
}

// Singleton instance
export const taskTimeoutManager = new TaskTimeoutManager();
