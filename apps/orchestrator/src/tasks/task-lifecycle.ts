import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TASK_TRANSITIONS } from "@agenthub/shared";
import type { TaskStatus } from "@agenthub/shared";
import { eventBus } from "../realtime/event-bus";
import { logger } from "../lib/logger";

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
