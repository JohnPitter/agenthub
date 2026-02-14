import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createTestDb, createTestAgent } from "../test/helpers";
import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import express from "express";
import request from "supertest";

let testDb: LibSQLDatabase<typeof schema>;
let testClient: Client;
let app: express.Express;

beforeAll(async () => {
  const { db, client } = await createTestDb();
  testDb = db;
  testClient = client;

  app = express();
  app.use(express.json());

  app.get("/api/agents", async (_req, res) => {
    const agents = await testDb.select().from(schema.agents);
    res.json({ agents });
  });

  app.get("/api/agents/:id", async (req, res) => {
    const agent = await testDb
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.id, req.params.id))
      .get();
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json({ agent });
  });

  app.post("/api/agents", async (req, res) => {
    const { name, role, model, systemPrompt, description, allowedTools, permissionMode, level, color, avatar } = req.body;
    const agent = {
      id: nanoid(),
      name,
      role: role ?? "custom",
      model: model ?? "claude-sonnet-4-5-20250929",
      systemPrompt: systemPrompt ?? "",
      description: description ?? "",
      allowedTools: JSON.stringify(allowedTools ?? ["Read", "Write"]),
      permissionMode: permissionMode ?? "acceptEdits",
      level: level ?? "senior",
      isDefault: false,
      isActive: true,
      color: color ?? "#6B7280",
      avatar: avatar ?? "bot",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await testDb.insert(schema.agents).values(agent);
    res.status(201).json({ agent });
  });

  app.patch("/api/agents/:id", async (req, res) => {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const allowedFields = ["name", "model", "systemPrompt", "description", "allowedTools", "permissionMode", "level", "isActive", "color", "avatar"];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = field === "allowedTools" ? JSON.stringify(req.body[field]) : req.body[field];
      }
    }
    await testDb.update(schema.agents).set(updates).where(eq(schema.agents.id, req.params.id));
    const agent = await testDb.select().from(schema.agents).where(eq(schema.agents.id, req.params.id)).get();
    res.json({ agent });
  });

  app.delete("/api/agents/:id", async (req, res) => {
    const agent = await testDb.select().from(schema.agents).where(eq(schema.agents.id, req.params.id)).get();
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    if (agent.isDefault) return res.status(400).json({ error: "Cannot delete default agents" });
    await testDb.delete(schema.agents).where(eq(schema.agents.id, req.params.id));
    res.json({ success: true });
  });
});

beforeEach(async () => {
  await testClient.execute("DELETE FROM agent_project_configs");
  await testClient.execute("DELETE FROM task_logs");
  await testClient.execute("DELETE FROM messages");
  await testClient.execute("DELETE FROM tasks");
  await testClient.execute("DELETE FROM agents");
});

describe("Agents API", () => {
  describe("GET /api/agents", () => {
    it("returns empty list when no agents exist", async () => {
      const res = await request(app).get("/api/agents");
      expect(res.status).toBe(200);
      expect(res.body.agents).toEqual([]);
    });

    it("returns all agents", async () => {
      await createTestAgent(testDb, { name: "Agent A" });
      await createTestAgent(testDb, { name: "Agent B" });
      const res = await request(app).get("/api/agents");
      expect(res.status).toBe(200);
      expect(res.body.agents).toHaveLength(2);
    });
  });

  describe("GET /api/agents/:id", () => {
    it("returns a specific agent", async () => {
      const agent = await createTestAgent(testDb, { name: "Code Agent" });
      const res = await request(app).get(`/api/agents/${agent.id}`);
      expect(res.status).toBe(200);
      expect(res.body.agent.name).toBe("Code Agent");
    });

    it("returns 404 for non-existent agent", async () => {
      const res = await request(app).get("/api/agents/nonexistent");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Agent not found");
    });
  });

  describe("POST /api/agents", () => {
    it("creates a new agent with defaults", async () => {
      const res = await request(app).post("/api/agents").send({ name: "New Agent" });
      expect(res.status).toBe(201);
      expect(res.body.agent.name).toBe("New Agent");
      expect(res.body.agent.role).toBe("custom");
      expect(res.body.agent.model).toBe("claude-sonnet-4-5-20250929");
      expect(res.body.agent.isDefault).toBe(false);
    });

    it("creates an agent with custom fields", async () => {
      const res = await request(app).post("/api/agents").send({
        name: "Custom Agent",
        role: "reviewer",
        model: "claude-opus-4-6",
        systemPrompt: "You are a code reviewer.",
        description: "Reviews code for quality",
        level: "mid",
        color: "#FF0000",
      });
      expect(res.status).toBe(201);
      expect(res.body.agent.role).toBe("reviewer");
      expect(res.body.agent.model).toBe("claude-opus-4-6");
      expect(res.body.agent.level).toBe("mid");
    });
  });

  describe("PATCH /api/agents/:id", () => {
    it("updates agent name", async () => {
      const agent = await createTestAgent(testDb, { name: "Old Name" });
      const res = await request(app).patch(`/api/agents/${agent.id}`).send({ name: "New Name" });
      expect(res.status).toBe(200);
      expect(res.body.agent.name).toBe("New Name");
    });

    it("updates agent model", async () => {
      const agent = await createTestAgent(testDb);
      const res = await request(app).patch(`/api/agents/${agent.id}`).send({ model: "claude-opus-4-6" });
      expect(res.status).toBe(200);
      expect(res.body.agent.model).toBe("claude-opus-4-6");
    });
  });

  describe("DELETE /api/agents/:id", () => {
    it("deletes a custom agent", async () => {
      const agent = await createTestAgent(testDb, { isDefault: false });
      const res = await request(app).delete(`/api/agents/${agent.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("cannot delete a default agent", async () => {
      const agent = await createTestAgent(testDb, { isDefault: true });
      const res = await request(app).delete(`/api/agents/${agent.id}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Cannot delete default agents");
    });

    it("returns 404 for non-existent agent", async () => {
      const res = await request(app).delete("/api/agents/nonexistent");
      expect(res.status).toBe(404);
    });
  });
});
