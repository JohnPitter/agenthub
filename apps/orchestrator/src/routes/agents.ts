import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export const agentsRouter = Router();

// GET /api/agents — list all agents
agentsRouter.get("/", async (_req, res) => {
  const agents = await db.select().from(schema.agents);
  res.json({ agents });
});

// GET /api/agents/:id
agentsRouter.get("/:id", async (req, res) => {
  const agent = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.id, req.params.id))
    .get();

  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json({ agent });
});

// POST /api/agents — create custom agent
agentsRouter.post("/", async (req, res) => {
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
});

// PATCH /api/agents/:id
agentsRouter.patch("/:id", async (req, res) => {
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  const allowedFields = ["name", "model", "maxThinkingTokens", "systemPrompt", "description", "allowedTools", "permissionMode", "level", "isActive", "color", "avatar"];
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = field === "allowedTools" ? JSON.stringify(req.body[field]) : req.body[field];
    }
  }

  await db.update(schema.agents).set(updates).where(eq(schema.agents.id, req.params.id));

  const agent = await db.select().from(schema.agents).where(eq(schema.agents.id, req.params.id)).get();
  res.json({ agent });
});

// DELETE /api/agents/:id — only custom agents
agentsRouter.delete("/:id", async (req, res) => {
  const agent = await db.select().from(schema.agents).where(eq(schema.agents.id, req.params.id)).get();

  if (!agent) return res.status(404).json({ error: "Agent not found" });
  if (agent.isDefault) return res.status(400).json({ error: "Cannot delete default agents" });

  await db.delete(schema.agents).where(eq(schema.agents.id, req.params.id));
  res.json({ success: true });
});
