import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createTestDb,
  createTestProject,
  createTestAgent,
  createTestTask,
  createTestTaskLog,
  cleanTestDb,
} from "../test/helpers";
import * as schema from "@agenthub/database/schema";
import { eq, desc, asc, and, isNull, sql, ne, count, max } from "drizzle-orm";
import { nanoid } from "nanoid";
import express from "express";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testDb: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testSqlite: any;
let app: express.Express;

beforeAll(async () => {
  const { db, sqlite } = await createTestDb();
  testDb = db;
  testSqlite = sqlite;

  app = express();
  app.use(express.json());

  // =====================================================================
  // PROJECT ROUTES
  // =====================================================================

  app.get("/api/projects", async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const projects = await testDb
        .select()
        .from(schema.projects)
        .orderBy(desc(schema.projects.updatedAt))
        .limit(limit)
        .offset(offset);
      res.json({ projects });
    } catch {
      res.status(500).json({ error: "Failed to list projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await testDb
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      if (!project) return res.status(404).json({ error: "Project not found" });
      res.json({ project });
    } catch {
      res.status(500).json({ error: "Failed to get project" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const { name, path, stack, icon, description, ownerId } = req.body;
      const now = new Date();
      const project = {
        id: nanoid(),
        name,
        path,
        stack: JSON.stringify(stack ?? []),
        icon: icon ?? null,
        description: description ?? null,
        ownerId: ownerId ?? null,
        status: "active" as const,
        lastAccessedAt: now,
        diskSizeMb: "0",
        isShallowClone: 1,
        createdAt: now,
        updatedAt: now,
      };
      await testDb.insert(schema.projects).values(project);
      res.status(201).json({ project });
    } catch {
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const { name, description, status } = req.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (status !== undefined) updates.status = status;
      await testDb.update(schema.projects).set(updates).where(eq(schema.projects.id, req.params.id));
      const project = await testDb
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      res.json({ project });
    } catch {
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      await testDb.delete(schema.projects).where(eq(schema.projects.id, req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // =====================================================================
  // TASK ROUTES
  // =====================================================================

  app.get("/api/tasks", async (req, res) => {
    try {
      const { projectId, status, includeSubtasks } = req.query;
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const conditions = [];

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

      // Compute subtask counts
      const taskIds = tasks.map((t: { id: string }) => t.id);
      if (taskIds.length > 0) {
        const subtaskCounts = await testDb
          .select({
            parentTaskId: schema.tasks.parentTaskId,
            total: sql<number>`count(*)`.as("total"),
            completed: sql<number>`sum(case when ${schema.tasks.status} in ('done', 'cancelled') then 1 else 0 end)`.as("completed"),
          })
          .from(schema.tasks)
          .where(sql`${schema.tasks.parentTaskId} in (${sql.join(taskIds.map((id: string) => sql`${id}`), sql`, `)})`)
          .groupBy(schema.tasks.parentTaskId);

        const countMap = new Map(subtaskCounts.map((r: { parentTaskId: string; total: number; completed: number }) => [r.parentTaskId, { total: r.total, completed: r.completed }]));

        const enriched = tasks.map((t: { id: string }) => {
          const counts = countMap.get(t.id) as { total: number; completed: number } | undefined;
          return {
            ...t,
            subtaskCount: counts?.total ?? 0,
            completedSubtaskCount: counts?.completed ?? 0,
          };
        });

        return res.json({ tasks: enriched });
      }

      res.json({ tasks });
    } catch {
      res.status(500).json({ error: "Failed to list tasks" });
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const task = await testDb
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, req.params.id))
        .then((r: unknown[]) => r[0]);
      if (!task) return res.status(404).json({ error: "Task not found" });
      res.json({ task });
    } catch {
      res.status(500).json({ error: "Failed to get task" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
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
    } catch {
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      const allowedFields = ["title", "description", "status", "priority", "category", "assignedAgentId", "result"];
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }
      if (req.body.status === "done" || req.body.status === "cancelled") {
        updates.completedAt = new Date();
      }

      // Log status transitions
      if (req.body.status) {
        const existingTask = await testDb
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.id, req.params.id))
          .then((r: unknown[]) => r[0] as { status: string } | undefined);

        if (existingTask && existingTask.status !== req.body.status) {
          await testDb.insert(schema.taskLogs).values({
            id: nanoid(),
            taskId: req.params.id,
            agentId: req.body.assignedAgentId ?? null,
            action: "status_change",
            fromStatus: existingTask.status,
            toStatus: req.body.status,
            detail: req.body.detail ?? `Status changed from ${existingTask.status} to ${req.body.status}`,
            createdAt: new Date(),
          });
        }
      }

      await testDb.update(schema.tasks).set(updates).where(eq(schema.tasks.id, req.params.id));
      const task = await testDb.select().from(schema.tasks).where(eq(schema.tasks.id, req.params.id)).then((r: unknown[]) => r[0]);
      res.json({ task });
    } catch {
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      await testDb.delete(schema.tasks).where(eq(schema.tasks.id, req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  app.get("/api/tasks/:id/subtasks", async (req, res) => {
    try {
      const subtasks = await testDb
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.parentTaskId, req.params.id))
        .orderBy(schema.tasks.createdAt);
      res.json({ subtasks });
    } catch {
      res.status(500).json({ error: "Failed to list subtasks" });
    }
  });

  app.get("/api/tasks/:id/logs", async (req, res) => {
    try {
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
    } catch {
      res.status(500).json({ error: "Failed to list task logs" });
    }
  });

  // =====================================================================
  // MESSAGE ROUTES
  // =====================================================================

  app.get("/api/messages", async (req, res) => {
    try {
      const { projectId, taskId, parentId, limit: limitStr, offset: offsetStr } = req.query;
      const limit = parseInt(limitStr as string) || 50;
      const offset = parseInt(offsetStr as string) || 0;

      if (!projectId) return res.status(400).json({ error: "projectId is required" });

      const conditions = [eq(schema.messages.projectId, projectId as string)];
      if (taskId) conditions.push(eq(schema.messages.taskId, taskId as string));
      if (parentId === "null") conditions.push(isNull(schema.messages.parentMessageId));

      const messages = await testDb
        .select()
        .from(schema.messages)
        .where(and(...conditions))
        .orderBy(desc(schema.messages.createdAt))
        .limit(limit)
        .offset(offset);

      const results = messages.reverse();

      if (parentId === "null") {
        const messageIds = results.map((m: { id: string }) => m.id);
        if (messageIds.length > 0) {
          const replyCounts = await testDb
            .select({
              parentMessageId: schema.messages.parentMessageId,
              count: sql<number>`count(*)`.as("count"),
            })
            .from(schema.messages)
            .where(
              and(
                eq(schema.messages.projectId, projectId as string),
                sql`${schema.messages.parentMessageId} IN (${sql.join(
                  messageIds.map((id: string) => sql`${id}`),
                  sql`, `
                )})`
              )
            )
            .groupBy(schema.messages.parentMessageId);

          const countMap = new Map(
            replyCounts.map((r: { parentMessageId: string; count: number }) => [r.parentMessageId, r.count])
          );

          const messagesWithCounts = results.map((m: { id: string }) => ({
            ...m,
            replyCount: countMap.get(m.id) ?? 0,
          }));

          return res.json({ messages: messagesWithCounts });
        }
      }

      res.json({ messages: results });
    } catch {
      res.status(500).json({ error: "Failed to list messages" });
    }
  });

  app.get("/api/messages/:id/replies", async (req, res) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const replies = await testDb
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.parentMessageId, id))
        .orderBy(asc(schema.messages.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({ replies });
    } catch {
      res.status(500).json({ error: "Failed to list replies" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const { projectId, taskId, agentId, source, content, contentType, metadata, parentMessageId } = req.body;

      if (parentMessageId) {
        const parent = await testDb
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
        isThinking: 0,
        createdAt: new Date(),
      };
      await testDb.insert(schema.messages).values(message);
      res.status(201).json({ message });
    } catch {
      res.status(500).json({ error: "Failed to create message" });
    }
  });

  // =====================================================================
  // DASHBOARD ROUTES
  // =====================================================================

  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const page = Math.max(0, parseInt(req.query.activityPage as string) || 0);
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.activityPageSize as string) || 10));

      const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [projectRows, agentRows, taskRows, recentLogs, activityTotal, tasksByProject, weeklyRows, recentCompleted] = await Promise.all([
        testDb.select({ total: count() }).from(schema.projects),
        testDb.select({ total: count() }).from(schema.agents).where(
          and(eq(schema.agents.isActive, 1), ne(schema.agents.role, "receptionist"))
        ),
        testDb
          .select({
            total: count(),
            running: sql<number>`sum(case when ${schema.tasks.status} = 'in_progress' then 1 else 0 end)`,
            review: sql<number>`sum(case when ${schema.tasks.status} = 'review' then 1 else 0 end)`,
            done: sql<number>`sum(case when ${schema.tasks.status} = 'done' then 1 else 0 end)`,
          })
          .from(schema.tasks),
        testDb
          .select({
            id: schema.taskLogs.id,
            action: schema.taskLogs.action,
            detail: schema.taskLogs.detail,
            createdAt: schema.taskLogs.createdAt,
            agentName: schema.agents.name,
            agentColor: schema.agents.color,
            agentAvatar: schema.agents.avatar,
            taskTitle: schema.tasks.title,
            projectName: schema.projects.name,
          })
          .from(schema.taskLogs)
          .leftJoin(schema.agents, eq(schema.taskLogs.agentId, schema.agents.id))
          .leftJoin(schema.tasks, eq(schema.taskLogs.taskId, schema.tasks.id))
          .leftJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
          .orderBy(desc(schema.taskLogs.createdAt))
          .limit(pageSize)
          .offset(page * pageSize),
        testDb.select({ total: count() }).from(schema.taskLogs),
        testDb
          .select({
            projectId: schema.tasks.projectId,
            taskCount: count(),
            lastActivity: max(schema.tasks.updatedAt),
          })
          .from(schema.tasks)
          .groupBy(schema.tasks.projectId),
        testDb
          .select({
            weeklyCreated: sql<number>`count(case when ${schema.tasks.createdAt} >= ${weekAgoIso} then 1 end)`,
            weeklyCompleted: sql<number>`count(case when ${schema.tasks.status} = 'done' and ${schema.tasks.completedAt} >= ${weekAgoIso} then 1 end)`,
            weeklyFailed: sql<number>`count(case when ${schema.tasks.status} = 'failed' and ${schema.tasks.updatedAt} >= ${weekAgoIso} then 1 end)`,
          })
          .from(schema.tasks),
        testDb
          .select({
            id: schema.tasks.id,
            title: schema.tasks.title,
            priority: schema.tasks.priority,
            agentName: schema.agents.name,
            agentColor: schema.agents.color,
            agentAvatar: schema.agents.avatar,
            projectName: schema.projects.name,
            completedAt: schema.tasks.completedAt,
          })
          .from(schema.tasks)
          .leftJoin(schema.agents, eq(schema.tasks.assignedAgentId, schema.agents.id))
          .leftJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
          .where(eq(schema.tasks.status, "done"))
          .orderBy(desc(schema.tasks.completedAt))
          .limit(5),
      ]);

      const taskStats = taskRows[0] ?? { total: 0, running: 0, review: 0, done: 0 };
      const totalActiveAgents = agentRows[0]?.total ?? 0;

      const projectStats = tasksByProject.map((r: { projectId: string; taskCount: number; lastActivity: unknown }) => ({
        projectId: r.projectId,
        taskCount: r.taskCount,
        agentCount: totalActiveAgents,
        lastActivity: r.lastActivity != null ? String(r.lastActivity) : null,
      }));

      // Include projects with no tasks
      const allProjects = await testDb.select({ id: schema.projects.id }).from(schema.projects);
      const projectsInStats = new Set(projectStats.map((ps: { projectId: string }) => ps.projectId));
      for (const p of allProjects) {
        if (!projectsInStats.has(p.id)) {
          projectStats.push({
            projectId: p.id,
            taskCount: 0,
            agentCount: totalActiveAgents,
            lastActivity: null,
          });
        }
      }

      const totalActivities = activityTotal[0]?.total ?? 0;
      const weekly = weeklyRows[0] ?? { weeklyCreated: 0, weeklyCompleted: 0, weeklyFailed: 0 };

      res.json({
        totalProjects: projectRows[0]?.total ?? 0,
        activeAgents: agentRows[0]?.total ?? 0,
        totalTasks: taskStats.total,
        runningTasks: taskStats.running ?? 0,
        reviewTasks: taskStats.review ?? 0,
        doneTasks: taskStats.done ?? 0,
        projectStats,
        weeklyCreated: weekly.weeklyCreated ?? 0,
        weeklyCompleted: weekly.weeklyCompleted ?? 0,
        weeklyFailed: weekly.weeklyFailed ?? 0,
        recentCompletedTasks: recentCompleted.map((t: { id: string; title: string; priority: string; agentName: string | null; agentColor: string | null; agentAvatar: string | null; projectName: string | null; completedAt: unknown }) => {
          let completedAtStr: string | null = null;
          if (t.completedAt) {
            try {
              completedAtStr = t.completedAt instanceof Date ? t.completedAt.toISOString() : String(t.completedAt);
            } catch {
              completedAtStr = String(t.completedAt);
            }
          }
          return {
            id: t.id,
            title: t.title,
            priority: t.priority,
            agentName: t.agentName ?? "System",
            agentColor: t.agentColor ?? "#FF5C35",
            agentAvatar: t.agentAvatar ?? null,
            projectName: t.projectName ?? "",
            completedAt: completedAtStr,
          };
        }),
        activityPage: page,
        activityPageSize: pageSize,
        activityTotalCount: totalActivities,
        activityTotalPages: Math.ceil(totalActivities / pageSize),
        recentActivities: recentLogs.map((log: { id: string; action: string; detail: string | null; agentName: string | null; agentColor: string | null; agentAvatar: string | null; taskTitle: string | null; projectName: string | null; createdAt: unknown }) => ({
          id: log.id,
          action: log.action,
          detail: log.detail,
          agentName: log.agentName ?? "System",
          agentColor: log.agentColor ?? "#FF5C35",
          agentAvatar: log.agentAvatar ?? null,
          taskTitle: log.taskTitle ?? "",
          projectName: log.projectName ?? "",
          createdAt: log.createdAt,
        })),
      });
    } catch {
      res.status(500).json({ error: "Failed to get dashboard stats" });
    }
  });
});

beforeEach(async () => {
  await cleanTestDb(testSqlite);
});

// =====================================================================
// Journey 1: Full Project Lifecycle
// =====================================================================
describe("Journey 1: Full Project Lifecycle", () => {
  it("should list empty projects initially", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(0);
  });

  it("should create, read, update, list, delete projects", async () => {
    // Step 1: Create project with all fields
    const createRes = await request(app)
      .post("/api/projects")
      .send({
        name: "My App",
        path: "/tmp/my-app",
        stack: ["typescript", "react"],
        description: "A cool app",
        ownerId: "user-123",
      });
    expect(createRes.status).toBe(201);
    const project1 = createRes.body.project;
    expect(project1.name).toBe("My App");
    expect(project1.description).toBe("A cool app");
    expect(project1.ownerId).toBe("user-123");
    expect(project1.status).toBe("active");

    // Step 2: Get project by ID
    const getRes = await request(app).get(`/api/projects/${project1.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.project.id).toBe(project1.id);
    expect(getRes.body.project.name).toBe("My App");
    expect(getRes.body.project.description).toBe("A cool app");

    // Step 3: Update project
    const updateRes = await request(app)
      .patch(`/api/projects/${project1.id}`)
      .send({ name: "My Updated App", description: "Updated description" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.project.name).toBe("My Updated App");
    expect(updateRes.body.project.description).toBe("Updated description");

    // Step 4: List projects — now has 1
    const listRes1 = await request(app).get("/api/projects");
    expect(listRes1.status).toBe(200);
    expect(listRes1.body.projects).toHaveLength(1);

    // Step 5: Create 2nd project
    const createRes2 = await request(app)
      .post("/api/projects")
      .send({
        name: "Second Project",
        path: "/tmp/second-project",
        stack: ["python"],
        description: "Another project",
        ownerId: "user-456",
      });
    expect(createRes2.status).toBe(201);

    // Step 6: Verify both listed
    const listRes2 = await request(app).get("/api/projects");
    expect(listRes2.status).toBe(200);
    expect(listRes2.body.projects).toHaveLength(2);

    // Step 7: Delete first project
    const delRes = await request(app).delete(`/api/projects/${project1.id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Step 8: Get deleted project — 404
    const getDeleted = await request(app).get(`/api/projects/${project1.id}`);
    expect(getDeleted.status).toBe(404);

    // Step 9: List now shows only 1
    const listRes3 = await request(app).get("/api/projects");
    expect(listRes3.status).toBe(200);
    expect(listRes3.body.projects).toHaveLength(1);
    expect(listRes3.body.projects[0].name).toBe("Second Project");
  });
});

// =====================================================================
// Journey 2: Task CRUD + Status Transitions
// =====================================================================
describe("Journey 2: Task CRUD + Status Transitions", () => {
  let projectId: string;
  let agentId: string;

  beforeEach(async () => {
    const project = await createTestProject(testDb, { name: "Task Project" });
    projectId = project.id;
    const agent = await createTestAgent(testDb, { name: "Dev Agent", role: "developer" });
    agentId = agent.id;
  });

  it("should create, read, update, and transition task through state machine", async () => {
    // Step 1: Create task
    const createRes = await request(app)
      .post("/api/tasks")
      .send({
        projectId,
        title: "Implement login",
        description: "Add login page with email/password",
        priority: "high",
        category: "feature",
      });
    expect(createRes.status).toBe(201);
    const task = createRes.body.task;
    expect(task.status).toBe("created");
    expect(task.title).toBe("Implement login");
    expect(task.priority).toBe("high");
    expect(task.category).toBe("feature");
    expect(task.projectId).toBe(projectId);

    // Step 2: Get task by ID
    const getRes = await request(app).get(`/api/tasks/${task.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.task.id).toBe(task.id);
    expect(getRes.body.task.status).toBe("created");

    // Step 3: List tasks filtered by projectId
    const listByProject = await request(app).get(`/api/tasks?projectId=${projectId}`);
    expect(listByProject.status).toBe(200);
    expect(listByProject.body.tasks).toHaveLength(1);

    // Step 4: List tasks filtered by status
    const listByStatus = await request(app).get(`/api/tasks?status=created`);
    expect(listByStatus.status).toBe(200);
    expect(listByStatus.body.tasks.length).toBeGreaterThanOrEqual(1);

    // Step 5: Update task title/description
    const updateRes = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ title: "Implement login v2", description: "Updated desc" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.task.title).toBe("Implement login v2");

    // Step 6: Transition created → assigned
    const assignRes = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ status: "assigned", assignedAgentId: agentId });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.task.status).toBe("assigned");

    // Step 7: Transition assigned → in_progress
    const inProgressRes = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ status: "in_progress" });
    expect(inProgressRes.status).toBe(200);
    expect(inProgressRes.body.task.status).toBe("in_progress");

    // Step 8: Transition in_progress → review
    const reviewRes = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ status: "review" });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.task.status).toBe("review");

    // Step 9: Transition review → done
    const doneRes = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ status: "done", result: "Login implemented successfully" });
    expect(doneRes.status).toBe(200);
    expect(doneRes.body.task.status).toBe("done");
    expect(doneRes.body.task.result).toBe("Login implemented successfully");

    // Step 10: Verify task is done and completedAt was set
    const finalTask = await request(app).get(`/api/tasks/${task.id}`);
    expect(finalTask.body.task.status).toBe("done");
    // Verify completedAt was set in the DB (SQLite stores as integer, may serialize as string or number)
    const rawTask = testSqlite.prepare("SELECT completed_at FROM tasks WHERE id = ?").get(task.id) as { completed_at: unknown };
    expect(rawTask.completed_at).not.toBeNull();

    // Step 11: Verify audit trail — task_logs has entries for each transition
    const logsRes = await request(app).get(`/api/tasks/${task.id}/logs`);
    expect(logsRes.status).toBe(200);
    const logs = logsRes.body.logs;
    expect(logs.length).toBe(4); // assigned, in_progress, review, done

    // Verify transitions are logged (most recent first due to desc order)
    const statuses = logs.map((l: { toStatus: string }) => l.toStatus);
    expect(statuses).toContain("assigned");
    expect(statuses).toContain("in_progress");
    expect(statuses).toContain("review");
    expect(statuses).toContain("done");
  });
});

// =====================================================================
// Journey 3: Task Board View (Kanban)
// =====================================================================
describe("Journey 3: Task Board View (Kanban)", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await createTestProject(testDb, { name: "Board Project" });
    projectId = project.id;
  });

  it("should display tasks grouped by status for kanban board", async () => {
    const statuses = ["created", "assigned", "in_progress", "review", "done"] as const;
    const taskIds: string[] = [];

    // Step 1: Create 5 tasks with different statuses
    for (const status of statuses) {
      const createRes = await request(app)
        .post("/api/tasks")
        .send({
          projectId,
          title: `Task ${status}`,
          description: `Task for ${status} column`,
          priority: "medium",
        });
      const taskId = createRes.body.task.id;
      taskIds.push(taskId);

      // Move to target status if not 'created'
      if (status !== "created") {
        await request(app).patch(`/api/tasks/${taskId}`).send({ status });
      }
    }

    // Step 2: List all tasks for this project
    const allTasks = await request(app).get(`/api/tasks?projectId=${projectId}&includeSubtasks=true`);
    expect(allTasks.status).toBe(200);
    expect(allTasks.body.tasks).toHaveLength(5);

    // Step 3: Filter by status "created" — get 1
    const createdTasks = await request(app).get(`/api/tasks?projectId=${projectId}&status=created&includeSubtasks=true`);
    expect(createdTasks.status).toBe(200);
    expect(createdTasks.body.tasks).toHaveLength(1);
    expect(createdTasks.body.tasks[0].status).toBe("created");

    // Step 4: Filter by status "in_progress" — get 1
    const inProgressTasks = await request(app).get(`/api/tasks?projectId=${projectId}&status=in_progress&includeSubtasks=true`);
    expect(inProgressTasks.status).toBe(200);
    expect(inProgressTasks.body.tasks).toHaveLength(1);
    expect(inProgressTasks.body.tasks[0].status).toBe("in_progress");

    // Step 5: Verify counts per status
    for (const status of statuses) {
      const filtered = await request(app).get(`/api/tasks?projectId=${projectId}&status=${status}&includeSubtasks=true`);
      expect(filtered.body.tasks).toHaveLength(1);
    }
  });
});

// =====================================================================
// Journey 4: Subtasks
// =====================================================================
describe("Journey 4: Subtasks", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await createTestProject(testDb, { name: "Subtask Project" });
    projectId = project.id;
  });

  it("should manage subtasks lifecycle", async () => {
    // Step 1: Create parent task
    const parentRes = await request(app)
      .post("/api/tasks")
      .send({
        projectId,
        title: "Parent Task",
        description: "Has subtasks",
        priority: "high",
      });
    expect(parentRes.status).toBe(201);
    const parentId = parentRes.body.task.id;

    // Step 2: Create 3 subtasks
    const subtaskNames = ["Subtask A", "Subtask B", "Subtask C"];
    const subtaskIds: string[] = [];
    for (const name of subtaskNames) {
      const res = await request(app)
        .post("/api/tasks")
        .send({
          projectId,
          title: name,
          description: `${name} description`,
          parentTaskId: parentId,
        });
      expect(res.status).toBe(201);
      expect(res.body.task.parentTaskId).toBe(parentId);
      subtaskIds.push(res.body.task.id);
    }

    // Step 3: GET /tasks/:parentId/subtasks — returns 3
    const subtasksRes = await request(app).get(`/api/tasks/${parentId}/subtasks`);
    expect(subtasksRes.status).toBe(200);
    expect(subtasksRes.body.subtasks).toHaveLength(3);
    const subtaskTitles = subtasksRes.body.subtasks.map((s: { title: string }) => s.title);
    expect(subtaskTitles).toContain("Subtask A");
    expect(subtaskTitles).toContain("Subtask B");
    expect(subtaskTitles).toContain("Subtask C");

    // Step 4: List tasks without includeSubtasks — parent only
    const mainTasks = await request(app).get(`/api/tasks?projectId=${projectId}`);
    expect(mainTasks.status).toBe(200);
    expect(mainTasks.body.tasks).toHaveLength(1);
    expect(mainTasks.body.tasks[0].id).toBe(parentId);

    // Step 5: List with includeSubtasks=true — all 4
    const allTasks = await request(app).get(`/api/tasks?projectId=${projectId}&includeSubtasks=true`);
    expect(allTasks.status).toBe(200);
    expect(allTasks.body.tasks).toHaveLength(4);

    // Step 6: Complete all subtasks
    for (const sid of subtaskIds) {
      await request(app).patch(`/api/tasks/${sid}`).send({ status: "done" });
    }

    // Step 7: Verify parent task shows subtask completion counts
    const parentTasksRes = await request(app).get(`/api/tasks?projectId=${projectId}`);
    expect(parentTasksRes.status).toBe(200);
    const parentInList = parentTasksRes.body.tasks.find((t: { id: string }) => t.id === parentId);
    expect(parentInList).toBeDefined();
    expect(parentInList.subtaskCount).toBe(3);
    expect(parentInList.completedSubtaskCount).toBe(3);
  });
});

// =====================================================================
// Journey 5: Task Logs (Audit Trail)
// =====================================================================
describe("Journey 5: Task Logs (Audit Trail)", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await createTestProject(testDb, { name: "Logs Project" });
    projectId = project.id;
  });

  it("should log status transitions as audit trail", async () => {
    // Step 1: Create task
    const createRes = await request(app)
      .post("/api/tasks")
      .send({ projectId, title: "Audited Task", priority: "medium" });
    const taskId = createRes.body.task.id;

    // Step 2: Transition through multiple statuses
    await request(app).patch(`/api/tasks/${taskId}`).send({ status: "assigned" });
    await request(app).patch(`/api/tasks/${taskId}`).send({ status: "in_progress" });
    await request(app).patch(`/api/tasks/${taskId}`).send({ status: "review" });
    await request(app).patch(`/api/tasks/${taskId}`).send({ status: "done" });

    // Step 3: GET /tasks/:id/logs — verify each transition logged
    const logsRes = await request(app).get(`/api/tasks/${taskId}/logs`);
    expect(logsRes.status).toBe(200);
    const logs = logsRes.body.logs;
    expect(logs).toHaveLength(4);

    // Step 4: Verify log entries structure
    for (const log of logs) {
      expect(log.action).toBe("status_change");
      expect(log.fromStatus).toBeTruthy();
      expect(log.toStatus).toBeTruthy();
      expect(log.detail).toBeTruthy();
      expect(log.createdAt).toBeDefined();
      expect(log.taskId).toBe(taskId);
    }

    // Verify correct transitions (logs ordered desc by createdAt)
    const transitions = logs.map((l: { fromStatus: string; toStatus: string }) => `${l.fromStatus}->${l.toStatus}`);
    expect(transitions).toContain("created->assigned");
    expect(transitions).toContain("assigned->in_progress");
    expect(transitions).toContain("in_progress->review");
    expect(transitions).toContain("review->done");
  });
});

// =====================================================================
// Journey 6: Messages/Chat Thread
// =====================================================================
describe("Journey 6: Messages/Chat Thread", () => {
  let projectId: string;
  let taskId: string;
  let agentId: string;

  beforeEach(async () => {
    const project = await createTestProject(testDb, { name: "Chat Project" });
    projectId = project.id;
    const task = await createTestTask(testDb, projectId, { title: "Chat Task" });
    taskId = task.id;
    const agent = await createTestAgent(testDb, { name: "Chat Agent" });
    agentId = agent.id;
  });

  it("should handle full chat thread lifecycle", async () => {
    // Step 1: POST user message
    const userMsgRes = await request(app)
      .post("/api/messages")
      .send({
        projectId,
        taskId,
        source: "user",
        content: "Hello, can you help me?",
        contentType: "text",
      });
    expect(userMsgRes.status).toBe(201);
    const userMsg = userMsgRes.body.message;
    expect(userMsg.source).toBe("user");
    expect(userMsg.content).toBe("Hello, can you help me?");

    // Step 2: POST agent response
    const agentMsgRes = await request(app)
      .post("/api/messages")
      .send({
        projectId,
        taskId,
        agentId,
        source: "agent",
        content: "Sure, I can help!",
        contentType: "text",
      });
    expect(agentMsgRes.status).toBe(201);
    const agentMsg = agentMsgRes.body.message;
    expect(agentMsg.source).toBe("agent");
    expect(agentMsg.agentId).toBe(agentId);

    // Step 3: List messages — verify both returned in order
    const listRes = await request(app).get(`/api/messages?projectId=${projectId}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.messages).toHaveLength(2);
    // Messages are returned in chronological order (reversed from desc)
    expect(listRes.body.messages[0].content).toBe("Hello, can you help me?");
    expect(listRes.body.messages[1].content).toBe("Sure, I can help!");

    // Step 4: Reply to user message
    const replyRes = await request(app)
      .post("/api/messages")
      .send({
        projectId,
        taskId,
        source: "user",
        content: "Thanks! What about the login page?",
        contentType: "text",
        parentMessageId: userMsg.id,
      });
    expect(replyRes.status).toBe(201);
    expect(replyRes.body.message.parentMessageId).toBe(userMsg.id);

    // Step 5: GET /messages/:id/replies — verify reply
    const repliesRes = await request(app).get(`/api/messages/${userMsg.id}/replies`);
    expect(repliesRes.status).toBe(200);
    expect(repliesRes.body.replies).toHaveLength(1);
    expect(repliesRes.body.replies[0].content).toBe("Thanks! What about the login page?");

    // Step 6: List top-level messages with replyCount
    const topLevelRes = await request(app).get(`/api/messages?projectId=${projectId}&parentId=null`);
    expect(topLevelRes.status).toBe(200);
    // Only top-level messages (user msg and agent msg, not the reply)
    expect(topLevelRes.body.messages).toHaveLength(2);
    const parentWithReply = topLevelRes.body.messages.find((m: { id: string }) => m.id === userMsg.id);
    expect(parentWithReply.replyCount).toBe(1);
    const agentTopLevel = topLevelRes.body.messages.find((m: { id: string }) => m.id === agentMsg.id);
    expect(agentTopLevel.replyCount).toBe(0);

    // Step 7: Paginate messages — limit=1, offset=0
    const page1 = await request(app).get(`/api/messages?projectId=${projectId}&limit=1&offset=0`);
    expect(page1.status).toBe(200);
    expect(page1.body.messages).toHaveLength(1);

    // Page 2
    const page2 = await request(app).get(`/api/messages?projectId=${projectId}&limit=1&offset=1`);
    expect(page2.status).toBe(200);
    expect(page2.body.messages).toHaveLength(1);

    // Messages should be different
    expect(page1.body.messages[0].id).not.toBe(page2.body.messages[0].id);
  });

  it("should reject reply to non-existent parent message", async () => {
    const res = await request(app)
      .post("/api/messages")
      .send({
        projectId,
        source: "user",
        content: "Reply to nothing",
        parentMessageId: "non-existent-id",
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Parent message not found");
  });

  it("should require projectId when listing messages", async () => {
    const res = await request(app).get("/api/messages");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("projectId is required");
  });
});

// =====================================================================
// Journey 7: Dashboard Stats
// =====================================================================
describe("Journey 7: Dashboard Stats", () => {
  it("should return correct dashboard statistics", async () => {
    // Create projects
    const project1 = await createTestProject(testDb, { name: "Dashboard Proj 1" });
    const project2 = await createTestProject(testDb, { name: "Dashboard Proj 2" });

    // Create agents (active, non-receptionist)
    const agent1 = await createTestAgent(testDb, { name: "Agent 1", role: "developer" });
    const agent2 = await createTestAgent(testDb, { name: "Agent 2", role: "tech_lead" });

    // Create tasks with various statuses
    await createTestTask(testDb, project1.id, { title: "Running Task", status: "in_progress" as const, assignedAgentId: agent1.id });
    await createTestTask(testDb, project1.id, { title: "Review Task", status: "review" as const, assignedAgentId: agent2.id });
    const doneTask = await createTestTask(testDb, project1.id, {
      title: "Done Task",
      status: "done" as const,
      assignedAgentId: agent1.id,
      completedAt: new Date(),
    });
    await createTestTask(testDb, project2.id, { title: "Created Task", status: "created" as const });

    // Create task logs for activity feed
    await createTestTaskLog(testDb, doneTask.id, {
      agentId: agent1.id,
      action: "status_change",
      fromStatus: "review",
      toStatus: "done",
      detail: "Task completed",
    });

    // GET /api/dashboard/stats
    const res = await request(app).get("/api/dashboard/stats");
    expect(res.status).toBe(200);

    const stats = res.body;

    // Verify project count
    expect(stats.totalProjects).toBe(2);

    // Verify active agents (non-receptionist)
    expect(stats.activeAgents).toBe(2);

    // Verify task stats
    expect(stats.totalTasks).toBe(4);
    expect(stats.runningTasks).toBe(1);
    expect(stats.reviewTasks).toBe(1);
    expect(stats.doneTasks).toBe(1);

    // Verify project stats
    expect(stats.projectStats).toBeDefined();
    expect(stats.projectStats.length).toBe(2);

    const proj1Stats = stats.projectStats.find((p: { projectId: string }) => p.projectId === project1.id);
    expect(proj1Stats).toBeDefined();
    expect(proj1Stats.taskCount).toBe(3);

    const proj2Stats = stats.projectStats.find((p: { projectId: string }) => p.projectId === project2.id);
    expect(proj2Stats).toBeDefined();
    expect(proj2Stats.taskCount).toBe(1);

    // Verify activity log populated
    expect(stats.recentActivities).toBeDefined();
    expect(stats.recentActivities.length).toBeGreaterThanOrEqual(1);
    expect(stats.recentActivities[0].action).toBe("status_change");

    // Verify recent completed tasks
    expect(stats.recentCompletedTasks).toBeDefined();
    expect(stats.recentCompletedTasks.length).toBe(1);
    expect(stats.recentCompletedTasks[0].title).toBe("Done Task");

    // Verify pagination metadata
    expect(stats.activityPage).toBe(0);
    expect(stats.activityPageSize).toBe(10);
    expect(stats.activityTotalCount).toBeGreaterThanOrEqual(1);
  });

  it("should return zeros for empty database", async () => {
    const res = await request(app).get("/api/dashboard/stats");
    expect(res.status).toBe(200);
    expect(res.body.totalProjects).toBe(0);
    expect(res.body.activeAgents).toBe(0);
    expect(res.body.totalTasks).toBe(0);
    expect(res.body.runningTasks).toBe(0);
    expect(res.body.reviewTasks).toBe(0);
    expect(res.body.doneTasks).toBe(0);
    expect(res.body.projectStats).toHaveLength(0);
    expect(res.body.recentActivities).toHaveLength(0);
    expect(res.body.recentCompletedTasks).toHaveLength(0);
  });

  it("should support activity pagination", async () => {
    const project = await createTestProject(testDb, { name: "Paginated Project" });
    const task = await createTestTask(testDb, project.id, { title: "Paginated Task" });

    // Create multiple task logs
    for (let i = 0; i < 15; i++) {
      await createTestTaskLog(testDb, task.id, {
        action: `action_${i}`,
        detail: `Log entry ${i}`,
      });
    }

    // Page 1
    const page1 = await request(app).get("/api/dashboard/stats?activityPage=0&activityPageSize=5");
    expect(page1.status).toBe(200);
    expect(page1.body.recentActivities).toHaveLength(5);
    expect(page1.body.activityTotalCount).toBe(15);
    expect(page1.body.activityTotalPages).toBe(3);

    // Page 2
    const page2 = await request(app).get("/api/dashboard/stats?activityPage=1&activityPageSize=5");
    expect(page2.status).toBe(200);
    expect(page2.body.recentActivities).toHaveLength(5);

    // Pages should have different entries
    const page1Ids = page1.body.recentActivities.map((a: { id: string }) => a.id);
    const page2Ids = page2.body.recentActivities.map((a: { id: string }) => a.id);
    const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
    expect(overlap).toHaveLength(0);
  });
});
