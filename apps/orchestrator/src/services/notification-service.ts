import { db, schema } from "@agenthub/database";
import { eq, desc, and, sql } from "drizzle-orm";
import { eventBus } from "../realtime/event-bus.js";
import { io } from "../index.js";
import { logger } from "../lib/logger.js";

interface CreateNotificationInput {
  projectId?: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

interface ListOptions {
  read?: boolean;
  limit?: number;
  offset?: number;
}

export const notificationService = {
  async create(input: CreateNotificationInput) {
    const notification = {
      id: crypto.randomUUID(),
      projectId: input.projectId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      read: false,
      createdAt: new Date(),
    };

    await db.insert(schema.notifications).values(notification);

    const event = {
      id: notification.id,
      projectId: notification.projectId ?? undefined,
      type: notification.type,
      title: notification.title,
      body: notification.body ?? undefined,
      link: notification.link ?? undefined,
      createdAt: notification.createdAt.toISOString(),
    };

    eventBus.emit("notification:new", event);
    io.emit("notification:new", event);

    logger.debug(`Notification created: ${notification.type} — ${notification.title}`, "notification");
    return notification;
  },

  async getAll(projectId?: string, options: ListOptions = {}) {
    const { read, limit = 50, offset = 0 } = options;
    const conditions = [];

    if (projectId) {
      conditions.push(eq(schema.notifications.projectId, projectId));
    }
    if (read !== undefined) {
      conditions.push(eq(schema.notifications.read, read));
    }

    const query = db
      .select()
      .from(schema.notifications)
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      return query.where(and(...conditions));
    }
    return query;
  },

  async getUnreadCount(projectId?: string) {
    const conditions = [eq(schema.notifications.read, false)];
    if (projectId) {
      conditions.push(eq(schema.notifications.projectId, projectId));
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.notifications)
      .where(and(...conditions));

    return result[0]?.count ?? 0;
  },

  async markAsRead(id: string) {
    await db
      .update(schema.notifications)
      .set({ read: true })
      .where(eq(schema.notifications.id, id));
  },

  async markAllAsRead(projectId?: string) {
    const conditions = [eq(schema.notifications.read, false)];
    if (projectId) {
      conditions.push(eq(schema.notifications.projectId, projectId));
    }

    await db
      .update(schema.notifications)
      .set({ read: true })
      .where(and(...conditions));
  },

  async deleteNotification(id: string) {
    await db
      .delete(schema.notifications)
      .where(eq(schema.notifications.id, id));
  },
};
