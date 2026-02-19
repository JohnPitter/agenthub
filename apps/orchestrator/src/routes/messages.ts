import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, desc, asc, isNull, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { logger } from "../lib/logger.js";

export const messagesRouter: ReturnType<typeof Router> = Router();

// GET /api/messages?projectId=...&taskId=...&parentId=...&limit=50&offset=0
messagesRouter.get("/", async (req, res) => {
  try {
    const {
      projectId,
      taskId,
      parentId,
      limit: limitStr,
      offset: offsetStr,
    } = req.query;
    const limit = parseInt(limitStr as string) || 50;
    const offset = parseInt(offsetStr as string) || 0;

    if (!projectId) return res.status(400).json({ error: "projectId is required" });

    const conditions = [eq(schema.messages.projectId, projectId as string)];

    if (taskId) {
      conditions.push(eq(schema.messages.taskId, taskId as string));
    }

    if (parentId === "null") {
      conditions.push(isNull(schema.messages.parentMessageId));
    }

    const messages = await db
      .select()
      .from(schema.messages)
      .where(and(...conditions))
      .orderBy(desc(schema.messages.createdAt))
      .limit(limit)
      .offset(offset);

    const results = messages.reverse();

    if (parentId === "null") {
      const messageIds = results.map((m) => m.id);

      if (messageIds.length > 0) {
        const replyCounts = await db
          .select({
            parentMessageId: schema.messages.parentMessageId,
            count: sql<number>`count(*)`.as("count"),
          })
          .from(schema.messages)
          .where(
            and(
              eq(schema.messages.projectId, projectId as string),
              sql`${schema.messages.parentMessageId} IN (${sql.join(
                messageIds.map((id) => sql`${id}`),
                sql`, `
              )})`
            )
          )
          .groupBy(schema.messages.parentMessageId);

        const countMap = new Map(
          replyCounts.map((r) => [r.parentMessageId, r.count])
        );

        const messagesWithCounts = results.map((m) => ({
          ...m,
          replyCount: countMap.get(m.id) ?? 0,
        }));

        return res.json({ messages: messagesWithCounts });
      }
    }

    res.json({ messages: results });
  } catch (error) {
    logger.error(`Failed to list messages: ${error}`, "messages-route");
    res.status(500).json({ error: "Failed to list messages" });
  }
});

// GET /api/messages/:id/replies?limit=50&offset=0
messagesRouter.get("/:id/replies", async (req, res) => {
  try {
    const { id } = req.params;
    const { limit: limitStr, offset: offsetStr } = req.query;
    const limit = parseInt(limitStr as string) || 50;
    const offset = parseInt(offsetStr as string) || 0;

    const replies = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.parentMessageId, id))
      .orderBy(asc(schema.messages.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ replies });
  } catch (error) {
    logger.error(`Failed to list replies: ${error}`, "messages-route");
    res.status(500).json({ error: "Failed to list replies" });
  }
});

// POST /api/messages
messagesRouter.post("/", async (req, res) => {
  try {
    const { projectId, taskId, agentId, source, content, contentType, metadata, parentMessageId } = req.body;

    if (parentMessageId) {
      const parent = await db
        .select({ id: schema.messages.id })
        .from(schema.messages)
        .where(eq(schema.messages.id, parentMessageId))
        .limit(1);

      if (parent.length === 0) {
        return res.status(404).json({ error: "Parent message not found" });
      }
    }

    const message = {
      id: nanoid(),
      projectId,
      taskId: taskId ?? null,
      agentId: agentId ?? null,
      source: source ?? "user",
      content,
      contentType: contentType ?? "text",
      metadata: metadata ? JSON.stringify(metadata) : null,
      parentMessageId: parentMessageId ?? null,
      isThinking: false,
      createdAt: new Date(),
    };

    await db.insert(schema.messages).values(message);
    res.status(201).json({ message });
  } catch (error) {
    logger.error(`Failed to create message: ${error}`, "messages-route");
    res.status(500).json({ error: "Failed to create message" });
  }
});
