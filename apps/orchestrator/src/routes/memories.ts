import { Router } from "express";
import { agentMemory } from "../agents/agent-memory.js";
import type { AgentMemoryType } from "@agenthub/shared";

export const memoriesRouter = Router();

// GET /api/agents/:agentId/memories
memoriesRouter.get("/:agentId/memories", async (req, res) => {
  const { agentId } = req.params;
  const projectId = req.query.projectId as string | undefined;

  const memories = await agentMemory.list(agentId, projectId);
  res.json({ memories });
});

// POST /api/agents/:agentId/memories
memoriesRouter.post("/:agentId/memories", async (req, res) => {
  const { agentId } = req.params;
  const { type, content, context, importance, projectId } = req.body;

  if (!type || !content) {
    return res.status(400).json({ error: "type and content are required" });
  }

  const id = await agentMemory.store({
    agentId,
    projectId: projectId ?? null,
    type: type as AgentMemoryType,
    content,
    context: context ?? null,
    importance: importance ?? 3,
  });

  res.status(201).json({ id });
});

// DELETE /api/agents/:agentId/memories/:memoryId
memoriesRouter.delete("/:agentId/memories/:memoryId", async (_req, res) => {
  const { memoryId } = _req.params;

  const deleted = await agentMemory.delete(memoryId);
  if (!deleted) {
    return res.status(404).json({ error: "Memory not found" });
  }

  res.json({ success: true });
});
