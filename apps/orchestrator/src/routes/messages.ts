import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { logger } from "../lib/logger.js";

export const messagesRouter = Router();

// GET /api/messages?projectId=...&limit=50&offset=0
messagesRouter.get("/", async (req, res) => {
  try {
    const { projectId, limit: limitStr, offset: offsetStr } = req.query;
    const limit = parseInt(limitStr as string) || 50;
    const offset = parseInt(offsetStr as string) || 0;

    if (!projectId) return res.status(400).json({ error: "projectId is required" });

    const messages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.projectId, projectId as string))
      .orderBy(desc(schema.messages.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ messages: messages.reverse() });
  } catch (error) {
    logger.error(`Failed to list messages: ${error}`, "messages-route");
    res.status(500).json({ error: "Failed to list messages" });
  }
});

// POST /api/messages
messagesRouter.post("/", async (req, res) => {
  try {
    const { projectId, taskId, agentId, source, content, contentType, metadata } = req.body;

    const message = {
      id: nanoid(),
      projectId,
      taskId: taskId ?? null,
      agentId: agentId ?? null,
      source: source ?? "user",
      content,
      contentType: contentType ?? "text",
      metadata: metadata ? JSON.stringify(metadata) : null,
      parentMessageId: null,
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
