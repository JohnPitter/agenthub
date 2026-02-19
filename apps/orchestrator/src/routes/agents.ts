import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { eventBus } from "../realtime/event-bus.js";
import { logger } from "../lib/logger.js";

export const agentsRouter: ReturnType<typeof Router> = Router();

// GET /api/agents — list all agents
agentsRouter.get("/", async (_req, res) => {
  try {
    const agents = await db.select().from(schema.agents);
    res.json({ agents });
  } catch (error) {
    logger.error(`Failed to list agents: ${error}`, "agents-route");
    res.status(500).json({ error: "Failed to list agents" });
  }
});

// GET /api/agents/:id
agentsRouter.get("/:id", async (req, res) => {
  try {
    const agent = await db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.id, req.params.id))
      .get();

    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json({ agent });
  } catch (error) {
    logger.error(`Failed to get agent: ${error}`, "agents-route");
    res.status(500).json({ error: "Failed to get agent" });
  }
});

// POST /api/agents — create custom agent
agentsRouter.post("/", async (req, res) => {
  try {
    const { name, role, model, maxThinkingTokens, systemPrompt, description, allowedTools, permissionMode, level, color, avatar } = req.body;

    const agent = {
      id: nanoid(),
      name,
      role: role ?? "custom",
      model: model ?? "claude-sonnet-4-5-20250929",
      maxThinkingTokens: maxThinkingTokens ?? null,
      systemPrompt: systemPrompt ?? "",
      description: description ?? "",
      allowedTools: JSON.stringify(allowedTools ?? ["Read", "Glob", "Grep", "Bash", "Write", "Edit"]),
      permissionMode: permissionMode ?? "acceptEdits",
      level: level ?? "senior",
      isDefault: false,
      isActive: true,
      color: color ?? "#6B7280",
      avatar: avatar ?? "bot",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(schema.agents).values(agent);
    res.status(201).json({ agent });
  } catch (error) {
    logger.error(`Failed to create agent: ${error}`, "agents-route");
    res.status(500).json({ error: "Failed to create agent" });
  }
});

// PATCH /api/agents/:id
agentsRouter.patch("/:id", async (req, res) => {
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    const allowedFields = ["name", "model", "maxThinkingTokens", "systemPrompt", "description", "allowedTools", "permissionMode", "level", "isActive", "color", "avatar", "soul"];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = field === "allowedTools" ? JSON.stringify(req.body[field]) : req.body[field];
      }
    }

    await db.update(schema.agents).set(updates).where(eq(schema.agents.id, req.params.id));

    const agent = await db.select().from(schema.agents).where(eq(schema.agents.id, req.params.id)).get();

    if (agent) {
      eventBus.emit("agent:updated", { agent: agent as unknown as Record<string, unknown> });
    }

    res.json({ agent });
  } catch (error) {
    logger.error(`Failed to update agent: ${error}`, "agents-route");
    res.status(500).json({ error: "Failed to update agent" });
  }
});

// DELETE /api/agents/:id — only custom agents
agentsRouter.delete("/:id", async (req, res) => {
  try {
    const agent = await db.select().from(schema.agents).where(eq(schema.agents.id, req.params.id)).get();

    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (agent.isDefault) return res.status(400).json({ error: "Cannot delete default agents" });

    await db.delete(schema.agents).where(eq(schema.agents.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to delete agent: ${error}`, "agents-route");
    res.status(500).json({ error: "Failed to delete agent" });
  }
});
