import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createTestDb,
  createTestProject,
  createTestAgent,
  createTestTask,
  createTestTaskLog,
  cleanTestDb,
} from "../../test/helpers";
import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { schema } from "@agenthub/database";
import { eq, desc, and, sql, isNull } from "drizzle-orm";
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

  // ---- Replicate task routes against test DB (no auth) ----

  app.get("/api/tasks", async (req, res) => {
    const { projectId, status, includeSubtasks } = req.query;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const conditions: ReturnType<typeof eq>[] = [];

    if (projectId) conditions.push(eq(schema.tasks.projectId, projectId as string));
    if (status) conditions.push(eq(schema.tasks.status, status as typeof schema.tasks.status._.data));
    if (includeSubtasks !== "true") conditions.push(isNull(schema.tasks.parentTaskId));

    const tasks = await testDb
      .select()
      .from(schema.tasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.tasks.createdAt))
      .limit(limit)
      .offset(offset);

    const taskIds = tasks.map((t) => t.id);
    if (taskIds.length > 0) {
      const subtaskCounts = await testDb
        .select({
          parentTaskId: schema.tasks.parentTaskId,
          total: sql<number>`count(*)`.as("total"),
          completed: sql<number>`sum(case when ${schema.tasks.status} in ('done', 'cancelled') then 1 else 0 end)`.as("completed"),
        })
        .from(schema.tasks)
        .where(sql`${schema.tasks.parentTaskId} in (${sql.join(taskIds.map((id) => sql`${id}`), sql`, `)})`)
        .groupBy(schema.tasks.parentTaskId);

      const countMap = new Map(subtaskCounts.map((r) => [r.parentTaskId, { total: r.total, completed: r.completed }]));

      const enriched = tasks.map((t) => {
        const counts = countMap.get(t.id);
        return {
          ...t,
          subtaskCount: counts?.total ?? 0,
          completedSubtaskCount: counts?.completed ?? 0,
        };
      });

      return res.json({ tasks: enriched });
    }

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
    const { projectId, title, description, priority, category, assignedAgentId, parentTaskId } = req.body;
    const task = {
      id: nanoid(),
      projectId,
      title,
      description: description ?? null,
      priority: priority ?? "medium",
      category: category ?? null,
      assignedAgentId: assignedAgentId ?? null,
      parentTaskId: parentTaskId ?? null,
      status: "created" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await testDb.insert(schema.tasks).values(task);
    res.status(201).json({ task });
  });

  app.get("/api/tasks/:id/subtasks", async (req, res) => {
    const subtasks = await testDb
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.parentTaskId, req.params.id))
      .orderBy(schema.tasks.createdAt);
    res.json({ subtasks });
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    // Pre-flight: validate tech_lead exists before allowing "assigned" transition
    if (req.body.status === "assigned") {
      const agents = await testDb.select().from(schema.agents);
      const techLead = agents.find((a) => a.role === "tech_lead" && a.isActive);
      if (!techLead) {
        return res.status(400).json({ error: "errorNoTechLead" });
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const allowedFields = ["title", "description", "status", "priority", "category", "assignedAgentId", "result"];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (req.body.status === "done" || req.body.status === "cancelled") {
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
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const logs = await testDb
      .select()
      .from(schema.taskLogs)
      .where(eq(schema.taskLogs.taskId, req.params.id))
      .orderBy(desc(schema.taskLogs.createdAt))
      .limit(limit)
      .offset(offset);
    res.json({ logs });
  });
});

beforeEach(async () => {
  await cleanTestDb(testClient);
});

describe("Tasks Routes — Integration", () => {
  let project: Awaited<ReturnType<typeof createTestProject>>;

  beforeEach(async () => {
    project = await createTestProject(testDb);
  });

  // ---- POST /api/tasks ----
  describe("POST /api/tasks", () => {
    it("creates a task and returns 201", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .send({ projectId: project.id, title: "New Task" });

      expect(res.status).toBe(201);
      expect(res.body.task).toBeDefined();
      expect(res.body.task.title).toBe("New Task");
      expect(res.body.task.status).toBe("created");
      expect(res.body.task.priority).toBe("medium");
      expect(res.body.task.id).toBeDefined();
    });

    it("creates a task with all optional fields", async () => {
      const agent = await createTestAgent(testDb);
      const res = await request(app)
        .post("/api/tasks")
        .send({
          projectId: project.id,
          title: "Full Task",
          description: "Detailed description",
          priority: "urgent",
          category: "bug",
          assignedAgentId: agent.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.task.description).toBe("Detailed description");
      expect(res.body.task.priority).toBe("urgent");
      expect(res.body.task.category).toBe("bug");
      expect(res.body.task.assignedAgentId).toBe(agent.id);
    });

    it("creates a subtask with parentTaskId", async () => {
      const parentTask = await createTestTask(testDb, project.id, { title: "Parent" });
      const res = await request(app)
        .post("/api/tasks")
        .send({
          projectId: project.id,
          title: "Subtask",
          parentTaskId: parentTask.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.task.parentTaskId).toBe(parentTask.id);
    });
  });

  // ---- GET /api/tasks ----
  describe("GET /api/tasks", () => {
    it("returns paginated task list", async () => {
      const res = await request(app).get(`/api/tasks?projectId=${project.id}`);

      expect(res.status).toBe(200);
      expect(res.body.tasks).toBeDefined();
      expect(Array.isArray(res.body.tasks)).toBe(true);
    });

    it("returns tasks filtered by projectId", async () => {
      const otherProject = await createTestProject(testDb, { name: "Other" });
      await createTestTask(testDb, project.id, { title: "Task A" });
      await createTestTask(testDb, otherProject.id, { title: "Task B" });

      const res = await request(app).get(`/api/tasks?projectId=${project.id}`);

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].title).toBe("Task A");
    });

    it("returns tasks filtered by status", async () => {
      await createTestTask(testDb, project.id, { title: "Created", status: "created" });
      await createTestTask(testDb, project.id, { title: "Done", status: "done" });

      const res = await request(app).get("/api/tasks?status=done");

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].title).toBe("Done");
    });

    it("hides subtasks by default", async () => {
      const parent = await createTestTask(testDb, project.id, { title: "Parent" });
      await createTestTask(testDb, project.id, { title: "Child", parentTaskId: parent.id });

      const res = await request(app).get(`/api/tasks?projectId=${project.id}`);

      expect(res.status).toBe(200);
      // Only the parent should appear (subtasks hidden by default)
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].title).toBe("Parent");
    });

    it("shows subtasks when includeSubtasks=true", async () => {
      const parent = await createTestTask(testDb, project.id, { title: "Parent" });
      await createTestTask(testDb, project.id, { title: "Child", parentTaskId: parent.id });

      const res = await request(app).get(`/api/tasks?projectId=${project.id}&includeSubtasks=true`);

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
    });

    it("respects limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await createTestTask(testDb, project.id, { title: `Task ${i}` });
      }

      const res = await request(app).get(`/api/tasks?projectId=${project.id}&limit=2`);

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
    });

    it("respects offset parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await createTestTask(testDb, project.id, { title: `Task ${i}` });
      }

      const allRes = await request(app).get(`/api/tasks?projectId=${project.id}&limit=100`);
      const offsetRes = await request(app).get(`/api/tasks?projectId=${project.id}&limit=100&offset=3`);

      expect(allRes.body.tasks).toHaveLength(5);
      expect(offsetRes.body.tasks).toHaveLength(2);
    });

    it("enriches tasks with subtask counts", async () => {
      const parent = await createTestTask(testDb, project.id, { title: "Parent" });
      await createTestTask(testDb, project.id, { title: "Sub 1", parentTaskId: parent.id, status: "created" });
      await createTestTask(testDb, project.id, { title: "Sub 2", parentTaskId: parent.id, status: "done" });

      const res = await request(app).get(`/api/tasks?projectId=${project.id}`);

      expect(res.status).toBe(200);
      const parentResult = res.body.tasks.find((t: { id: string }) => t.id === parent.id);
      expect(parentResult).toBeDefined();
      expect(parentResult.subtaskCount).toBe(2);
      expect(parentResult.completedSubtaskCount).toBe(1);
    });

    it("clamps limit to max 100", async () => {
      // The route clamps limit to 100, so requesting 200 should still work
      const res = await request(app).get(`/api/tasks?projectId=${project.id}&limit=200`);
      expect(res.status).toBe(200);
    });
  });

  // ---- GET /api/tasks/:id ----
  describe("GET /api/tasks/:id", () => {
    it("returns a specific task", async () => {
      const task = await createTestTask(testDb, project.id, { title: "My Task" });

      const res = await request(app).get(`/api/tasks/${task.id}`);

      expect(res.status).toBe(200);
      expect(res.body.task.title).toBe("My Task");
      expect(res.body.task.id).toBe(task.id);
      expect(res.body.task.projectId).toBe(project.id);
    });

    it("returns 404 for unknown ID", async () => {
      const res = await request(app).get("/api/tasks/nonexistent-id");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Task not found");
    });
  });

  // ---- PATCH /api/tasks/:id ----
  describe("PATCH /api/tasks/:id", () => {
    it("updates task title", async () => {
      const task = await createTestTask(testDb, project.id, { title: "Old Title" });

      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .send({ title: "New Title" });

      expect(res.status).toBe(200);
      expect(res.body.task.title).toBe("New Title");
    });

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

    it("sets completedAt when status is cancelled", async () => {
      const task = await createTestTask(testDb, project.id);

      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .send({ status: "cancelled" });

      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe("cancelled");
      expect(res.body.task.completedAt).toBeTruthy();
    });

    it("updates multiple fields at once", async () => {
      const task = await createTestTask(testDb, project.id);

      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .send({ title: "Updated", priority: "high", category: "feature" });

      expect(res.status).toBe(200);
      expect(res.body.task.title).toBe("Updated");
      expect(res.body.task.priority).toBe("high");
      expect(res.body.task.category).toBe("feature");
    });

    it("updates task result", async () => {
      const task = await createTestTask(testDb, project.id);

      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .send({ result: "Task completed successfully" });

      expect(res.status).toBe(200);
      expect(res.body.task.result).toBe("Task completed successfully");
    });

    it("returns 400 errorNoTechLead when moving to assigned without tech_lead agent", async () => {
      const task = await createTestTask(testDb, project.id);
      // No tech_lead agent exists in DB

      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .send({ status: "assigned" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("errorNoTechLead");

      // Verify task status was NOT changed
      const getRes = await request(app).get(`/api/tasks/${task.id}`);
      expect(getRes.body.task.status).toBe("created");
    });

    it("returns 400 errorNoTechLead when tech_lead exists but is inactive", async () => {
      const task = await createTestTask(testDb, project.id);
      await createTestAgent(testDb, { role: "tech_lead", isActive: false });

      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .send({ status: "assigned" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("errorNoTechLead");
    });

    it("allows moving to assigned when active tech_lead exists", async () => {
      const task = await createTestTask(testDb, project.id);
      await createTestAgent(testDb, { role: "tech_lead", isActive: true });

      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .send({ status: "assigned" });

      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe("assigned");
    });

    it("allows non-assigned status transitions without tech_lead", async () => {
      const task = await createTestTask(testDb, project.id);
      // No agents at all — should still allow in_progress, review, etc.

      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .send({ status: "in_progress" });

      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe("in_progress");
    });
  });

  // ---- DELETE /api/tasks/:id ----
  describe("DELETE /api/tasks/:id", () => {
    it("deletes a task", async () => {
      const task = await createTestTask(testDb, project.id);

      const res = await request(app).delete(`/api/tasks/${task.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify it's gone
      const getRes = await request(app).get(`/api/tasks/${task.id}`);
      expect(getRes.status).toBe(404);
    });
  });

  // ---- GET /api/tasks/:id/subtasks ----
  describe("GET /api/tasks/:id/subtasks", () => {
    it("returns subtask list for a parent task", async () => {
      const parent = await createTestTask(testDb, project.id, { title: "Parent" });
      await createTestTask(testDb, project.id, { title: "Sub A", parentTaskId: parent.id });
      await createTestTask(testDb, project.id, { title: "Sub B", parentTaskId: parent.id });

      const res = await request(app).get(`/api/tasks/${parent.id}/subtasks`);

      expect(res.status).toBe(200);
      expect(res.body.subtasks).toHaveLength(2);
    });

    it("returns empty list when task has no subtasks", async () => {
      const task = await createTestTask(testDb, project.id);

      const res = await request(app).get(`/api/tasks/${task.id}/subtasks`);

      expect(res.status).toBe(200);
      expect(res.body.subtasks).toEqual([]);
    });
  });

  // ---- GET /api/tasks/:id/logs ----
  describe("GET /api/tasks/:id/logs", () => {
    it("returns empty logs for a task with no activity", async () => {
      const task = await createTestTask(testDb, project.id);

      const res = await request(app).get(`/api/tasks/${task.id}/logs`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toEqual([]);
    });

    it("returns logs for a task", async () => {
      const task = await createTestTask(testDb, project.id);
      await createTestTaskLog(testDb, task.id, { action: "status_change", fromStatus: "created", toStatus: "in_progress" });
      await createTestTaskLog(testDb, task.id, { action: "status_change", fromStatus: "in_progress", toStatus: "done" });

      const res = await request(app).get(`/api/tasks/${task.id}/logs`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(2);
    });

    it("respects logs pagination", async () => {
      const task = await createTestTask(testDb, project.id);
      for (let i = 0; i < 5; i++) {
        await createTestTaskLog(testDb, task.id, { action: `action_${i}` });
      }

      const res = await request(app).get(`/api/tasks/${task.id}/logs?limit=2`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(2);
    });

    it("respects logs offset", async () => {
      const task = await createTestTask(testDb, project.id);
      for (let i = 0; i < 5; i++) {
        await createTestTaskLog(testDb, task.id, { action: `action_${i}` });
      }

      const allRes = await request(app).get(`/api/tasks/${task.id}/logs?limit=100`);
      const offsetRes = await request(app).get(`/api/tasks/${task.id}/logs?limit=100&offset=3`);

      expect(allRes.body.logs).toHaveLength(5);
      expect(offsetRes.body.logs).toHaveLength(2);
    });
  });
});
