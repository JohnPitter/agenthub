import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createTestDb, createTestProject, createTestAgent, createTestTask } from "../test/helpers";
import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { schema } from "@agenthub/database";
import { eq, desc, and } from "drizzle-orm";
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

  app.get("/api/tasks", async (req, res) => {
    const { projectId, status } = req.query;
    const conditions = [];
    if (projectId) conditions.push(eq(schema.tasks.projectId, projectId as string));
    if (status) conditions.push(eq(schema.tasks.status, status as typeof schema.tasks.status._.data));
    const tasks = await testDb
      .select()
      .from(schema.tasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.tasks.createdAt));
    res.json({ tasks });
  });

  app.get("/api/tasks/:id", async (req, res) => {
    const task = await testDb
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, req.params.id))
      .get();
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json({ task });
  });

  app.post("/api/tasks", async (req, res) => {
    const { projectId, title, description, priority, category, assignedAgentId } = req.body;
    const task = {
      id: nanoid(),
      projectId,
      title,
      description: description ?? null,
      priority: priority ?? "medium",
      category: category ?? null,
      assignedAgentId: assignedAgentId ?? null,
      status: "created" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await testDb.insert(schema.tasks).values(task);
    res.status(201).json({ task });
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const allowedFields = ["title", "description", "status", "priority", "category", "assignedAgentId", "result"];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (req.body.status === "done") {
      updates.completedAt = new Date();
    }
    await testDb.update(schema.tasks).set(updates).where(eq(schema.tasks.id, req.params.id));
    const task = await testDb.select().from(schema.tasks).where(eq(schema.tasks.id, req.params.id)).get();
    res.json({ task });
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    await testDb.delete(schema.tasks).where(eq(schema.tasks.id, req.params.id));
    res.json({ success: true });
  });

  app.get("/api/tasks/:id/logs", async (req, res) => {
    const logs = await testDb
      .select()
      .from(schema.taskLogs)
      .where(eq(schema.taskLogs.taskId, req.params.id))
      .orderBy(desc(schema.taskLogs.createdAt));
    res.json({ logs });
  });
});

beforeEach(async () => {
  await testClient.execute("DELETE FROM task_logs");
  await testClient.execute("DELETE FROM messages");
  await testClient.execute("DELETE FROM tasks");
  await testClient.execute("DELETE FROM agent_project_configs");
  await testClient.execute("DELETE FROM integrations");
  await testClient.execute("DELETE FROM agents");
  await testClient.execute("DELETE FROM projects");
});

describe("Tasks API", () => {
  let project: Awaited<ReturnType<typeof createTestProject>>;

  beforeEach(async () => {
    project = await createTestProject(testDb);
  });

  describe("GET /api/tasks", () => {
    it("returns empty list when no tasks exist", async () => {
      const res = await request(app).get("/api/tasks");
      expect(res.status).toBe(200);
      expect(res.body.tasks).toEqual([]);
    });

    it("returns all tasks", async () => {
      await createTestTask(testDb, project.id, { title: "Task A" });
      await createTestTask(testDb, project.id, { title: "Task B" });
      const res = await request(app).get("/api/tasks");
      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
    });

    it("filters tasks by projectId", async () => {
      const otherProject = await createTestProject(testDb, { name: "Other" });
      await createTestTask(testDb, project.id, { title: "Task A" });
      await createTestTask(testDb, otherProject.id, { title: "Task B" });
      const res = await request(app).get(`/api/tasks?projectId=${project.id}`);
      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].title).toBe("Task A");
    });

    it("filters tasks by status", async () => {
      await createTestTask(testDb, project.id, { title: "Created", status: "created" });
      await createTestTask(testDb, project.id, { title: "Done", status: "done" });
      const res = await request(app).get("/api/tasks?status=created");
      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].title).toBe("Created");
    });
  });

  describe("GET /api/tasks/:id", () => {
    it("returns a specific task", async () => {
      const task = await createTestTask(testDb, project.id, { title: "My Task" });
      const res = await request(app).get(`/api/tasks/${task.id}`);
      expect(res.status).toBe(200);
      expect(res.body.task.title).toBe("My Task");
    });

    it("returns 404 for non-existent task", async () => {
      const res = await request(app).get("/api/tasks/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/tasks", () => {
    it("creates a new task", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .send({ projectId: project.id, title: "New Task" });
      expect(res.status).toBe(201);
      expect(res.body.task.title).toBe("New Task");
      expect(res.body.task.status).toBe("created");
      expect(res.body.task.priority).toBe("medium");
    });

    it("creates task with custom priority", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .send({
          projectId: project.id,
          title: "Urgent Task",
          priority: "urgent",
          description: "Fix the bug now",
        });
      expect(res.status).toBe(201);
      expect(res.body.task.priority).toBe("urgent");
      expect(res.body.task.description).toBe("Fix the bug now");
    });

    it("creates task assigned to an agent", async () => {
      const agent = await createTestAgent(testDb);
      const res = await request(app)
        .post("/api/tasks")
        .send({
          projectId: project.id,
          title: "Assigned Task",
          assignedAgentId: agent.id,
        });
      expect(res.status).toBe(201);
      expect(res.body.task.assignedAgentId).toBe(agent.id);
    });
  });

  describe("PATCH /api/tasks/:id", () => {
    it("updates task status", async () => {
      const task = await createTestTask(testDb, project.id);
      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .send({ status: "in_progress" });
      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe("in_progress");
    });

    it("sets completedAt when status is done", async () => {
      const task = await createTestTask(testDb, project.id);
      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .send({ status: "done" });
      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe("done");
      expect(res.body.task.completedAt).toBeTruthy();
    });

    it("updates task title", async () => {
      const task = await createTestTask(testDb, project.id, { title: "Old Title" });
      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .send({ title: "New Title" });
      expect(res.status).toBe(200);
      expect(res.body.task.title).toBe("New Title");
    });
  });

  describe("DELETE /api/tasks/:id", () => {
    it("deletes a task", async () => {
      const task = await createTestTask(testDb, project.id);
      const res = await request(app).delete(`/api/tasks/${task.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("GET /api/tasks/:id/logs", () => {
    it("returns empty logs for task with no activity", async () => {
      const task = await createTestTask(testDb, project.id);
      const res = await request(app).get(`/api/tasks/${task.id}/logs`);
      expect(res.status).toBe(200);
      expect(res.body.logs).toEqual([]);
    });
  });
});
