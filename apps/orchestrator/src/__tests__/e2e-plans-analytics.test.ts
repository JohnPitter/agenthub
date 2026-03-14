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
import { eq, and, gte, count, desc, ne, sql, max, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import express from "express";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testDb: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testSqlite: any;
let app: express.Express;

// ---- Helpers ----

async function createTestUser(overrides?: Record<string, unknown>) {
  const user = {
    id: nanoid(),
    githubId: Math.floor(Math.random() * 999999),
    login: `user-${nanoid(6)}`,
    name: "Test User",
    email: "test@example.com",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  await testDb.insert(schema.users).values(user);
  return user;
}

async function createTestPlan(overrides?: Record<string, unknown>) {
  const plan = {
    id: nanoid(),
    name: `Plan-${nanoid(6)}`,
    description: "Test plan",
    maxProjects: 5,
    maxTasksPerMonth: 100,
    maxStorageMb: 500,
    repoTtlDays: 30,
    priceMonthly: "9.99",
    features: JSON.stringify(["feature-a"]),
    isDefault: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  await testDb.insert(schema.plans).values(plan);
  return plan;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

// ---- Setup ----

beforeAll(async () => {
  const { db, sqlite } = await createTestDb();
  testDb = db;
  testSqlite = sqlite;

  app = express();
  app.use(express.json());

  // Inject userId from header (simulating auth middleware)
  app.use((req, _res, next) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (userId) {
      (req as express.Request & { user: { userId: string } }).user = { userId };
    }
    next();
  });

  // ---- Plan routes ----
  app.get("/api/plans", async (_req, res) => {
    try {
      const plans = await testDb.select().from(schema.plans);
      res.json({ plans });
    } catch {
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });

  app.put("/api/plans/select", async (req, res) => {
    try {
      const userId = (req as express.Request & { user?: { userId: string } }).user?.userId;
      if (!userId) { res.status(401).json({ error: "Auth required" }); return; }
      const { planId } = req.body;
      if (planId) {
        const [plan] = await testDb.select().from(schema.plans).where(eq(schema.plans.id, planId));
        if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
      }
      await testDb.update(schema.users).set({ planId: planId ?? null, updatedAt: new Date() }).where(eq(schema.users.id, userId));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to select plan" });
    }
  });

  app.get("/api/plans/my-usage", async (req, res) => {
    try {
      const userId = (req as express.Request & { user?: { userId: string } }).user?.userId;
      if (!userId) { res.status(401).json({ error: "Auth required" }); return; }
      const [user] = await testDb.select().from(schema.users).where(eq(schema.users.id, userId));
      if (!user) { res.status(404).json({ error: "User not found" }); return; }

      let plan = null;
      if (user.planId) {
        const [p] = await testDb.select().from(schema.plans).where(eq(schema.plans.id, user.planId));
        plan = p ?? null;
      }
      if (!plan) {
        const [defaultPlan] = await testDb.select().from(schema.plans).where(eq(schema.plans.isDefault, 1 as unknown as boolean));
        plan = defaultPlan ?? null;
      }

      const [projectCount] = await testDb.select({ count: count() }).from(schema.projects).where(eq(schema.projects.ownerId, userId));

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const userProjects = await testDb.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.ownerId, userId));
      let taskCount = 0;
      for (const p of userProjects) {
        const [tc] = await testDb.select({ count: count() }).from(schema.tasks).where(
          and(eq(schema.tasks.projectId, p.id), gte(schema.tasks.createdAt, monthStart)),
        );
        taskCount += tc?.count ?? 0;
      }

      res.json({
        plan: plan ? {
          id: plan.id,
          name: plan.name,
          maxProjects: plan.maxProjects,
          maxTasksPerMonth: plan.maxTasksPerMonth,
          priceMonthly: plan.priceMonthly,
          features: plan.features,
        } : null,
        usage: {
          projects: projectCount?.count ?? 0,
          tasksThisMonth: taskCount,
        },
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch usage" });
    }
  });

  // ---- Analytics routes ----

  // GET /api/analytics/summary
  app.get("/api/analytics/summary", async (req, res) => {
    try {
      const { period = "30d" } = req.query;
      let dateThreshold: Date | null = null;
      if (period === "7d") dateThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      else if (period === "30d") dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      else if (period === "24h") dateThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const allTasks = dateThreshold
        ? await testDb.select().from(schema.tasks).where(gte(schema.tasks.createdAt, dateThreshold))
        : await testDb.select().from(schema.tasks);

      let totalCostUsd = 0;
      let totalTokens = 0;
      let completedTasks = 0;
      let failedTasks = 0;
      const costBreakdown: Record<string, { agentId: string; agentName: string; model: string; cost: number; tasks: number }> = {};

      for (const task of allTasks) {
        const cost = task.costUsd ? parseFloat(task.costUsd) : 0;
        totalCostUsd += cost;
        totalTokens += task.tokensUsed ?? 0;
        if (task.status === "done") completedTasks++;
        if (task.status === "failed") failedTasks++;
        if (task.assignedAgentId) {
          if (!costBreakdown[task.assignedAgentId]) {
            costBreakdown[task.assignedAgentId] = { agentId: task.assignedAgentId, agentName: task.assignedAgentId, model: "unknown", cost: 0, tasks: 0 };
          }
          costBreakdown[task.assignedAgentId].cost += cost;
          costBreakdown[task.assignedAgentId].tasks++;
        }
      }

      res.json({
        period: period as string,
        totalCostUsd,
        totalTokens,
        totalTasks: allTasks.length,
        completedTasks,
        failedTasks,
        costBreakdown: Object.values(costBreakdown),
        modelCosts: {},
      });
    } catch {
      res.status(500).json({ error: "Failed to get summary" });
    }
  });

  // GET /api/analytics/agents
  app.get("/api/analytics/agents", async (req, res) => {
    try {
      const { period = "30d", projectId } = req.query;
      let dateThreshold: Date | null = null;
      if (period === "7d") {
        dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - 7);
      } else if (period === "30d") {
        dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - 30);
      }

      const agents = await testDb.select().from(schema.agents);
      const taskConditions = [];
      if (projectId && typeof projectId === "string") taskConditions.push(eq(schema.tasks.projectId, projectId));
      if (dateThreshold) taskConditions.push(gte(schema.tasks.createdAt, dateThreshold));

      const allTasks = await testDb.select().from(schema.tasks).where(taskConditions.length > 0 ? and(...taskConditions) : undefined);

      if (allTasks.length === 0) {
        const metrics = agents.map((agent: { id: string; name: string }) => ({
          agentId: agent.id, agentName: agent.name, totalTasks: 0, completedTasks: 0, failedTasks: 0,
          inProgressTasks: 0, successRate: 0, avgCompletionTime: null,
          tasksByStatus: { pending: 0, assigned: 0, in_progress: 0, review: 0, done: 0, failed: 0 },
        }));
        res.json({ metrics });
        return;
      }

      const taskIds = allTasks.map((t: { id: string }) => t.id);
      const taskById = new Map(allTasks.map((t: { id: string }) => [t.id, t]));

      const logs = await testDb
        .select({ taskId: schema.taskLogs.taskId, agentId: schema.taskLogs.agentId })
        .from(schema.taskLogs)
        .where(inArray(schema.taskLogs.taskId, taskIds));

      const agentTasks = new Map<string, Set<string>>();
      for (const log of logs) {
        if (!log.agentId) continue;
        if (!agentTasks.has(log.agentId)) agentTasks.set(log.agentId, new Set());
        agentTasks.get(log.agentId)!.add(log.taskId);
      }
      for (const task of allTasks) {
        if (!(task as { assignedAgentId?: string }).assignedAgentId) continue;
        const aid = (task as { assignedAgentId: string }).assignedAgentId;
        if (!agentTasks.has(aid)) agentTasks.set(aid, new Set());
        agentTasks.get(aid)!.add((task as { id: string }).id);
      }

      interface TaskRecord { id: string; status: string; completedAt?: Date | null; createdAt: Date }
      const metrics = [];
      for (const agent of agents) {
        const a = agent as { id: string; name: string };
        const participatedTaskIds = agentTasks.get(a.id);
        if (!participatedTaskIds || participatedTaskIds.size === 0) {
          metrics.push({
            agentId: a.id, agentName: a.name, totalTasks: 0, completedTasks: 0, failedTasks: 0,
            inProgressTasks: 0, successRate: 0, avgCompletionTime: null,
            tasksByStatus: { pending: 0, assigned: 0, in_progress: 0, review: 0, done: 0, failed: 0 },
          });
          continue;
        }

        const tasksByStatus: Record<string, number> = { pending: 0, assigned: 0, in_progress: 0, review: 0, done: 0, failed: 0 };
        let totalTasks = 0;
        for (const taskId of participatedTaskIds) {
          const task = taskById.get(taskId) as TaskRecord | undefined;
          if (!task) continue;
          totalTasks++;
          const status = task.status;
          if (status in tasksByStatus) tasksByStatus[status]++;
        }

        const completedTasks = tasksByStatus.done;
        const failedTasks = tasksByStatus.failed;
        const inProgressTasks = tasksByStatus.in_progress + tasksByStatus.assigned;
        const successRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

        metrics.push({
          agentId: a.id, agentName: a.name, totalTasks, completedTasks, failedTasks,
          inProgressTasks, successRate, avgCompletionTime: null, tasksByStatus,
        });
      }

      metrics.sort((a, b) => b.totalTasks - a.totalTasks);
      res.json({ metrics });
    } catch {
      res.status(500).json({ error: "Failed to get agent metrics" });
    }
  });

  // GET /api/analytics/trends
  app.get("/api/analytics/trends", async (req, res) => {
    try {
      const { period = "30d", projectId } = req.query;
      let dateThreshold: Date;
      let days: number;
      if (period === "7d") {
        dateThreshold = new Date(); dateThreshold.setDate(dateThreshold.getDate() - 7); days = 7;
      } else if (period === "30d") {
        dateThreshold = new Date(); dateThreshold.setDate(dateThreshold.getDate() - 30); days = 30;
      } else {
        dateThreshold = new Date(); dateThreshold.setDate(dateThreshold.getDate() - 90); days = 90;
      }

      const conditions = [gte(schema.tasks.createdAt, dateThreshold)];
      if (projectId && typeof projectId === "string") conditions.push(eq(schema.tasks.projectId, projectId));

      const tasks = await testDb
        .select({
          id: schema.tasks.id,
          status: schema.tasks.status,
          createdAtStr: sql<string>`substr(${schema.tasks.createdAt}, 1, 10)`,
        })
        .from(schema.tasks)
        .where(and(...conditions));

      const trendMap = new Map<string, { completed: number; failed: number; total: number }>();
      for (let i = 0; i < days; i++) {
        const date = new Date(dateThreshold);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split("T")[0];
        trendMap.set(dateKey, { completed: 0, failed: 0, total: 0 });
      }

      for (const task of tasks) {
        const dateKey = task.createdAtStr;
        const data = trendMap.get(dateKey);
        if (data) {
          data.total += 1;
          if ((task as { status: string }).status === "done") data.completed += 1;
          if ((task as { status: string }).status === "failed") data.failed += 1;
        }
      }

      const trends = Array.from(trendMap.entries())
        .map(([date, data]) => ({ date, completed: data.completed, failed: data.failed, total: data.total }))
        .sort((a, b) => a.date.localeCompare(b.date));
      res.json({ trends });
    } catch {
      res.status(500).json({ error: "Failed to get trends" });
    }
  });

  // GET /api/analytics/costs
  app.get("/api/analytics/costs", async (req, res) => {
    try {
      const { period = "30d", groupBy = "agent" } = req.query;
      let dateThreshold: Date | null = null;
      if (period === "7d") dateThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      else if (period === "30d") dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      else if (period === "24h") dateThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const allTasks = dateThreshold
        ? await testDb.select().from(schema.tasks).where(gte(schema.tasks.createdAt, dateThreshold))
        : await testDb.select().from(schema.tasks);

      const agents = await testDb.select({ id: schema.agents.id, name: schema.agents.name, color: schema.agents.color }).from(schema.agents);
      const agentMap = new Map(agents.map((a: { id: string; name: string; color: string | null }) => [a.id, a]));

      if (groupBy === "agent") {
        const grouped: Record<string, { agentId: string; agentName: string; agentColor: string | null; totalCost: number; totalTokens: number; taskCount: number }> = {};
        for (const t of allTasks) {
          const task = t as { assignedAgentId?: string; costUsd?: string; tokensUsed?: number };
          const aid = task.assignedAgentId ?? "unassigned";
          if (!grouped[aid]) {
            const agent = agentMap.get(aid) as { name: string; color: string | null } | undefined;
            grouped[aid] = { agentId: aid, agentName: agent?.name ?? "Unassigned", agentColor: agent?.color ?? null, totalCost: 0, totalTokens: 0, taskCount: 0 };
          }
          grouped[aid].totalCost += task.costUsd ? parseFloat(task.costUsd) : 0;
          grouped[aid].totalTokens += task.tokensUsed ?? 0;
          grouped[aid].taskCount++;
        }
        res.json(Object.values(grouped));
      } else if (groupBy === "model") {
        const grouped: Record<string, { model: string; totalCost: number; totalTokens: number; taskCount: number }> = {};
        for (const t of allTasks) {
          const task = t as { costUsd?: string; tokensUsed?: number };
          const model = "openrouter";
          if (!grouped[model]) grouped[model] = { model, totalCost: 0, totalTokens: 0, taskCount: 0 };
          grouped[model].totalCost += task.costUsd ? parseFloat(task.costUsd) : 0;
          grouped[model].totalTokens += task.tokensUsed ?? 0;
          grouped[model].taskCount++;
        }
        res.json(Object.values(grouped));
      } else if (groupBy === "day") {
        // Re-query with date string extraction for day grouping
        const dayTasks = dateThreshold
          ? await testDb.select({
              createdAtStr: sql<string>`substr(${schema.tasks.createdAt}, 1, 10)`,
              costUsd: schema.tasks.costUsd,
              tokensUsed: schema.tasks.tokensUsed,
            }).from(schema.tasks).where(gte(schema.tasks.createdAt, dateThreshold))
          : await testDb.select({
              createdAtStr: sql<string>`substr(${schema.tasks.createdAt}, 1, 10)`,
              costUsd: schema.tasks.costUsd,
              tokensUsed: schema.tasks.tokensUsed,
            }).from(schema.tasks);

        const grouped: Record<string, { date: string; totalCost: number; inputTokens: number; outputTokens: number; taskCount: number }> = {};
        for (const task of dayTasks) {
          const date = task.createdAtStr;
          if (!grouped[date]) grouped[date] = { date, totalCost: 0, inputTokens: 0, outputTokens: 0, taskCount: 0 };
          grouped[date].totalCost += task.costUsd ? parseFloat(task.costUsd) : 0;
          grouped[date].inputTokens += (task.tokensUsed ?? 0) / 2;
          grouped[date].outputTokens += (task.tokensUsed ?? 0) / 2;
          grouped[date].taskCount++;
        }
        res.json(Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date)));
      } else {
        res.status(400).json({ error: "Invalid groupBy. Use: agent, model, day" });
      }
    } catch {
      res.status(500).json({ error: "Failed to get cost analytics" });
    }
  });

  // ---- Dashboard route ----
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const page = Math.max(0, parseInt(req.query.activityPage as string) || 0);
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.activityPageSize as string) || 10));

      const [projectRows, agentRows, taskRows, recentLogs, activityTotal, tasksByProject, recentCompleted] = await Promise.all([
        testDb.select({ total: count() }).from(schema.projects),
        testDb.select({ total: count() }).from(schema.agents).where(
          and(eq(schema.agents.isActive, 1 as unknown as boolean), ne(schema.agents.role, "receptionist")),
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
          .select({ projectId: schema.tasks.projectId, taskCount: count(), lastActivity: max(schema.tasks.updatedAt) })
          .from(schema.tasks)
          .groupBy(schema.tasks.projectId),
        testDb
          .select({
            id: schema.tasks.id,
            title: schema.tasks.title,
            priority: schema.tasks.priority,
            agentName: schema.agents.name,
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

      const projectStats = tasksByProject.map((r: { projectId: string; taskCount: number; lastActivity: unknown }) => ({
        projectId: r.projectId,
        taskCount: r.taskCount,
        lastActivity: r.lastActivity ? (r.lastActivity instanceof Date && !isNaN(r.lastActivity.getTime()) ? r.lastActivity.toISOString() : String(r.lastActivity)) : null,
      }));

      // Also include projects that have no tasks
      const allProjects = await testDb.select({ id: schema.projects.id }).from(schema.projects);
      const projectsInStats = new Set(projectStats.map((ps: { projectId: string }) => ps.projectId));
      for (const p of allProjects) {
        if (!projectsInStats.has(p.id)) {
          projectStats.push({ projectId: p.id, taskCount: 0, lastActivity: null });
        }
      }

      const totalActivities = activityTotal[0]?.total ?? 0;

      res.json({
        totalProjects: projectRows[0]?.total ?? 0,
        activeAgents: agentRows[0]?.total ?? 0,
        totalTasks: taskStats.total,
        runningTasks: taskStats.running ?? 0,
        reviewTasks: taskStats.review ?? 0,
        doneTasks: taskStats.done ?? 0,
        projectStats,
        recentCompletedTasks: recentCompleted.map((t: { id: string; title: string; priority: string; agentName: string | null; projectName: string | null; completedAt: unknown }) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          agentName: t.agentName ?? "System",
          projectName: t.projectName ?? "",
          completedAt: t.completedAt ? String(t.completedAt) : null,
        })),
        activityPage: page,
        activityPageSize: pageSize,
        activityTotalCount: totalActivities,
        activityTotalPages: Math.ceil(totalActivities / pageSize),
        recentActivities: recentLogs.map((log: { id: string; action: string; detail: string | null; agentName: string | null; taskTitle: string | null; projectName: string | null; createdAt: unknown }) => ({
          id: log.id,
          action: log.action,
          detail: log.detail,
          agentName: log.agentName ?? "System",
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

// =============================================================================
// User Journey 1: Plan Selection + Usage Monitoring
// =============================================================================
describe("Journey 1: Plan Selection + Usage Monitoring", () => {
  it("full lifecycle: create plans → select free → track usage → upgrade to pro → expand limits", async () => {
    // Step 1: Create plans (admin side)
    const freePlan = await createTestPlan({
      name: "Free",
      maxProjects: 3,
      maxTasksPerMonth: 50,
      maxStorageMb: 500,
      repoTtlDays: 7,
      priceMonthly: "0",
      features: JSON.stringify(["basic-support", "community-access"]),
      isDefault: 1,
    });
    const proPlan = await createTestPlan({
      name: "Pro",
      maxProjects: 20,
      maxTasksPerMonth: 500,
      maxStorageMb: 5000,
      repoTtlDays: 90,
      priceMonthly: "29.99",
      features: JSON.stringify(["priority-support", "advanced-analytics", "custom-agents"]),
    });

    // Step 2: List available plans
    const listRes = await request(app).get("/api/plans");
    expect(listRes.status).toBe(200);
    expect(listRes.body.plans).toHaveLength(2);
    const planNames = listRes.body.plans.map((p: { name: string }) => p.name);
    expect(planNames).toContain("Free");
    expect(planNames).toContain("Pro");

    // Step 3: User selects Free plan
    const user = await createTestUser();
    const selectRes = await request(app)
      .put("/api/plans/select")
      .set("x-user-id", user.id)
      .send({ planId: freePlan.id });
    expect(selectRes.status).toBe(200);
    expect(selectRes.body.success).toBe(true);

    // Step 4: Check usage — plan info + usage at 0
    const usage1 = await request(app).get("/api/plans/my-usage").set("x-user-id", user.id);
    expect(usage1.status).toBe(200);
    expect(usage1.body.plan.name).toBe("Free");
    expect(usage1.body.plan.maxProjects).toBe(3);
    expect(usage1.body.plan.maxTasksPerMonth).toBe(50);
    expect(usage1.body.usage.projects).toBe(0);
    expect(usage1.body.usage.tasksThisMonth).toBe(0);

    // Step 5: Create projects up to Free limit (3)
    const p1 = await createTestProject(testDb, { ownerId: user.id, name: "Project A" });
    const p2 = await createTestProject(testDb, { ownerId: user.id, name: "Project B" });
    const p3 = await createTestProject(testDb, { ownerId: user.id, name: "Project C" });

    // Step 6: Check usage — projectCount: 3/3
    const usage2 = await request(app).get("/api/plans/my-usage").set("x-user-id", user.id);
    expect(usage2.status).toBe(200);
    expect(usage2.body.usage.projects).toBe(3);

    // Step 7: Create tasks to track monthly usage
    await createTestTask(testDb, p1.id);
    await createTestTask(testDb, p1.id);
    await createTestTask(testDb, p2.id);
    await createTestTask(testDb, p3.id);
    await createTestTask(testDb, p3.id);

    // Step 8: Check usage — taskCount shows correctly
    const usage3 = await request(app).get("/api/plans/my-usage").set("x-user-id", user.id);
    expect(usage3.status).toBe(200);
    expect(usage3.body.usage.tasksThisMonth).toBe(5);

    // Step 9: Upgrade to Pro
    const upgradeRes = await request(app)
      .put("/api/plans/select")
      .set("x-user-id", user.id)
      .send({ planId: proPlan.id });
    expect(upgradeRes.status).toBe(200);

    // Step 10: Check usage — limits now reflect Pro plan
    const usage4 = await request(app).get("/api/plans/my-usage").set("x-user-id", user.id);
    expect(usage4.status).toBe(200);
    expect(usage4.body.plan.name).toBe("Pro");
    expect(usage4.body.plan.maxProjects).toBe(20);
    expect(usage4.body.plan.maxTasksPerMonth).toBe(500);
    expect(usage4.body.usage.projects).toBe(3); // still 3 projects
    expect(usage4.body.usage.tasksThisMonth).toBe(5); // still 5 tasks

    // Step 11: Create more projects — allowed under Pro limits
    await createTestProject(testDb, { ownerId: user.id, name: "Project D" });
    await createTestProject(testDb, { ownerId: user.id, name: "Project E" });

    const usage5 = await request(app).get("/api/plans/my-usage").set("x-user-id", user.id);
    expect(usage5.body.usage.projects).toBe(5);
  });
});

// =============================================================================
// User Journey 2: Task Cost Tracking
// =============================================================================
describe("Journey 2: Task Cost Tracking", () => {
  it("tracks cost and token usage across tasks with different statuses", async () => {
    // Step 1: Create project + agent
    const project = await createTestProject(testDb);
    const agent = await createTestAgent(testDb, { name: "DevBot" });

    // Step 2: Create tasks with costUsd and tokensUsed
    await createTestTask(testDb, project.id, {
      assignedAgentId: agent.id,
      costUsd: "0.05",
      tokensUsed: 5000,
      status: "done",
      completedAt: new Date(),
    });
    await createTestTask(testDb, project.id, {
      assignedAgentId: agent.id,
      costUsd: "0.12",
      tokensUsed: 12000,
      status: "done",
      completedAt: new Date(),
    });
    await createTestTask(testDb, project.id, {
      assignedAgentId: agent.id,
      costUsd: "0.08",
      tokensUsed: 8000,
      status: "failed",
    });

    // Step 3: GET /analytics/summary — verify totals
    const summaryRes = await request(app).get("/api/analytics/summary?period=all");
    expect(summaryRes.status).toBe(200);

    const { totalCostUsd, totalTokens, completedTasks, failedTasks, totalTasks } = summaryRes.body;
    expect(totalTasks).toBe(3);
    expect(totalCostUsd).toBeCloseTo(0.25, 2); // 0.05 + 0.12 + 0.08
    expect(totalTokens).toBe(25000); // 5000 + 12000 + 8000
    expect(completedTasks).toBe(2);
    expect(failedTasks).toBe(1);

    // Step 4: GET /analytics/summary?period=7d — should include recent tasks
    const summary7d = await request(app).get("/api/analytics/summary?period=7d");
    expect(summary7d.status).toBe(200);
    expect(summary7d.body.totalTasks).toBe(3);
    expect(summary7d.body.totalCostUsd).toBeCloseTo(0.25, 2);

    // Step 5: GET /analytics/summary?period=30d — same data (all created today)
    const summary30d = await request(app).get("/api/analytics/summary?period=30d");
    expect(summary30d.status).toBe(200);
    expect(summary30d.body.totalTasks).toBe(3);
    expect(summary30d.body.totalTokens).toBe(25000);
  });
});

// =============================================================================
// User Journey 3: Agent Performance Analytics
// =============================================================================
describe("Journey 3: Agent Performance Analytics", () => {
  it("provides per-agent metrics with task counts and success rates", async () => {
    // Step 1: Create 3 agents with different roles
    const devAgent = await createTestAgent(testDb, { name: "Dev Agent", role: "developer", model: "claude-sonnet-4-5-20250929" });
    const qaAgent = await createTestAgent(testDb, { name: "QA Agent", role: "qa", model: "gpt-4" });
    const pmAgent = await createTestAgent(testDb, { name: "PM Agent", role: "project_manager", model: "claude-sonnet-4-5-20250929" });

    const project1 = await createTestProject(testDb, { name: "Project Alpha" });
    const project2 = await createTestProject(testDb, { name: "Project Beta" });

    // Step 2: Create tasks assigned to each agent, various statuses
    const t1 = await createTestTask(testDb, project1.id, { assignedAgentId: devAgent.id, status: "done", completedAt: new Date() });
    const t2 = await createTestTask(testDb, project1.id, { assignedAgentId: devAgent.id, status: "done", completedAt: new Date() });
    const t3 = await createTestTask(testDb, project1.id, { assignedAgentId: devAgent.id, status: "failed" });
    const t4 = await createTestTask(testDb, project1.id, { assignedAgentId: qaAgent.id, status: "done", completedAt: new Date() });
    const t5 = await createTestTask(testDb, project2.id, { assignedAgentId: qaAgent.id, status: "failed" });
    const t6 = await createTestTask(testDb, project2.id, { assignedAgentId: pmAgent.id, status: "in_progress" });

    // Step 3: GET /analytics/agents — verify per-agent metrics
    const agentRes = await request(app).get("/api/analytics/agents?period=all");
    expect(agentRes.status).toBe(200);

    const { metrics } = agentRes.body;
    expect(metrics.length).toBe(3);

    // Sorted by totalTasks desc — Dev Agent first (3), QA Agent (2), PM Agent (1)
    const devMetrics = metrics.find((m: { agentName: string }) => m.agentName === "Dev Agent");
    expect(devMetrics.totalTasks).toBe(3);
    expect(devMetrics.completedTasks).toBe(2);
    expect(devMetrics.failedTasks).toBe(1);
    expect(devMetrics.successRate).toBeCloseTo(66.67, 0);

    const qaMetrics = metrics.find((m: { agentName: string }) => m.agentName === "QA Agent");
    expect(qaMetrics.totalTasks).toBe(2);
    expect(qaMetrics.completedTasks).toBe(1);
    expect(qaMetrics.failedTasks).toBe(1);
    expect(qaMetrics.successRate).toBe(50);

    const pmMetrics = metrics.find((m: { agentName: string }) => m.agentName === "PM Agent");
    expect(pmMetrics.totalTasks).toBe(1);
    expect(pmMetrics.inProgressTasks).toBe(1);
    expect(pmMetrics.successRate).toBe(0);

    // Step 4: Filter by projectId
    const filteredRes = await request(app).get(`/api/analytics/agents?period=all&projectId=${project1.id}`);
    expect(filteredRes.status).toBe(200);
    const filteredMetrics = filteredRes.body.metrics;
    const devFiltered = filteredMetrics.find((m: { agentName: string }) => m.agentName === "Dev Agent");
    expect(devFiltered.totalTasks).toBe(3); // all 3 dev tasks are in project1
    const qaFiltered = filteredMetrics.find((m: { agentName: string }) => m.agentName === "QA Agent");
    expect(qaFiltered.totalTasks).toBe(1); // only 1 QA task in project1
    const pmFiltered = filteredMetrics.find((m: { agentName: string }) => m.agentName === "PM Agent");
    expect(pmFiltered.totalTasks).toBe(0); // PM has no tasks in project1

    // Step 5: Filter by period — all tasks were created today (within 7d)
    const period7dRes = await request(app).get("/api/analytics/agents?period=7d");
    expect(period7dRes.status).toBe(200);
    const total7d = period7dRes.body.metrics.reduce((sum: number, m: { totalTasks: number }) => sum + m.totalTasks, 0);
    expect(total7d).toBe(6);
  });
});

// =============================================================================
// User Journey 4: Task Trends Over Time
// =============================================================================
describe("Journey 4: Task Trends Over Time", () => {
  it("shows daily breakdown of completed and failed tasks", async () => {
    const project = await createTestProject(testDb);

    // Step 1: Create tasks with different createdAt dates (spread over 7 days)
    const day1 = daysAgo(1);
    const day2 = daysAgo(2);
    const day3 = daysAgo(3);
    const day5 = daysAgo(5);

    await createTestTask(testDb, project.id, { status: "done", createdAt: day1, completedAt: day1 });
    await createTestTask(testDb, project.id, { status: "done", createdAt: day1, completedAt: day1 });
    await createTestTask(testDb, project.id, { status: "failed", createdAt: day2 });
    await createTestTask(testDb, project.id, { status: "done", createdAt: day3, completedAt: day3 });
    await createTestTask(testDb, project.id, { status: "failed", createdAt: day3 });
    await createTestTask(testDb, project.id, { status: "done", createdAt: day5, completedAt: day5 });

    // Step 2: GET /analytics/trends?period=7d
    const trendsRes = await request(app).get("/api/analytics/trends?period=7d");
expect(trendsRes.status).toBe(200);

    const { trends } = trendsRes.body;
    expect(Array.isArray(trends)).toBe(true);
    expect(trends.length).toBe(7);

    // Step 3: Verify daily breakdown
    const day1Key = day1.toISOString().split("T")[0];
    const day2Key = day2.toISOString().split("T")[0];
    const day3Key = day3.toISOString().split("T")[0];
    const day5Key = day5.toISOString().split("T")[0];

    const day1Data = trends.find((t: { date: string }) => t.date === day1Key);
    expect(day1Data).toBeDefined();
    expect(day1Data.completed).toBe(2);
    expect(day1Data.total).toBe(2);

    const day2Data = trends.find((t: { date: string }) => t.date === day2Key);
    expect(day2Data).toBeDefined();
    expect(day2Data.failed).toBe(1);
    expect(day2Data.total).toBe(1);

    const day3Data = trends.find((t: { date: string }) => t.date === day3Key);
    expect(day3Data).toBeDefined();
    expect(day3Data.completed).toBe(1);
    expect(day3Data.failed).toBe(1);
    expect(day3Data.total).toBe(2);

    // Step 4: Total across days matches
    const totalCompleted = trends.reduce((s: number, t: { completed: number }) => s + t.completed, 0);
    const totalFailed = trends.reduce((s: number, t: { failed: number }) => s + t.failed, 0);
    const totalAll = trends.reduce((s: number, t: { total: number }) => s + t.total, 0);
    expect(totalCompleted).toBe(4);
    expect(totalFailed).toBe(2);
    expect(totalAll).toBe(6);

    // Step 5: period=30d should include the same data
    const trends30d = await request(app).get("/api/analytics/trends?period=30d");
    expect(trends30d.status).toBe(200);
    expect(trends30d.body.trends.length).toBe(30);
    const total30d = trends30d.body.trends.reduce((s: number, t: { total: number }) => s + t.total, 0);
    expect(total30d).toBe(6); // same data, wider window
  });
});

// =============================================================================
// User Journey 5: Cost Analytics by Group
// =============================================================================
describe("Journey 5: Cost Analytics by Group", () => {
  it("groups costs by agent, model, and day", async () => {
    const project = await createTestProject(testDb);
    const agent1 = await createTestAgent(testDb, { name: "Coder", model: "claude-sonnet-4-5-20250929", color: "#FF0000" });
    const agent2 = await createTestAgent(testDb, { name: "Reviewer", model: "gpt-4", color: "#00FF00" });

    // Create tasks with costs assigned to different agents
    await createTestTask(testDb, project.id, { assignedAgentId: agent1.id, costUsd: "0.10", tokensUsed: 10000 });
    await createTestTask(testDb, project.id, { assignedAgentId: agent1.id, costUsd: "0.15", tokensUsed: 15000 });
    await createTestTask(testDb, project.id, { assignedAgentId: agent2.id, costUsd: "0.20", tokensUsed: 20000 });
    await createTestTask(testDb, project.id, { assignedAgentId: agent2.id, costUsd: "0.05", tokensUsed: 5000 });

    // Step 1: groupBy=agent
    const agentCosts = await request(app).get("/api/analytics/costs?period=all&groupBy=agent");
expect(agentCosts.status).toBe(200);
    const agentData = agentCosts.body;
    expect(agentData.length).toBe(2);

    const coderCost = agentData.find((g: { agentName: string }) => g.agentName === "Coder");
    expect(coderCost).toBeDefined();
    expect(coderCost.totalCost).toBeCloseTo(0.25, 2);
    expect(coderCost.totalTokens).toBe(25000);
    expect(coderCost.taskCount).toBe(2);
    expect(coderCost.agentColor).toBe("#FF0000");

    const reviewerCost = agentData.find((g: { agentName: string }) => g.agentName === "Reviewer");
    expect(reviewerCost).toBeDefined();
    expect(reviewerCost.totalCost).toBeCloseTo(0.25, 2);
    expect(reviewerCost.totalTokens).toBe(25000);
    expect(reviewerCost.taskCount).toBe(2);

    // Step 2: groupBy=model — all map to "openrouter"
    const modelCosts = await request(app).get("/api/analytics/costs?period=all&groupBy=model");
    expect(modelCosts.status).toBe(200);
    expect(modelCosts.body.length).toBe(1);
    expect(modelCosts.body[0].model).toBe("openrouter");
    expect(modelCosts.body[0].totalCost).toBeCloseTo(0.50, 2);
    expect(modelCosts.body[0].totalTokens).toBe(50000);
    expect(modelCosts.body[0].taskCount).toBe(4);

    // Step 3: groupBy=day — all created today
    const dayCosts = await request(app).get("/api/analytics/costs?period=all&groupBy=day");
    expect(dayCosts.status).toBe(200);
    expect(dayCosts.body.length).toBe(1); // all same day
    const todayKey = new Date().toISOString().split("T")[0];
    expect(dayCosts.body[0].date).toBe(todayKey);
    expect(dayCosts.body[0].totalCost).toBeCloseTo(0.50, 2);
    expect(dayCosts.body[0].taskCount).toBe(4);
    expect(dayCosts.body[0].inputTokens).toBe(25000); // tokensUsed / 2
    expect(dayCosts.body[0].outputTokens).toBe(25000);
  });

  it("returns 400 for invalid groupBy", async () => {
    const res = await request(app).get("/api/analytics/costs?groupBy=invalid");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid groupBy");
  });
});

// =============================================================================
// User Journey 6: Plan Limits Enforcement on Tasks
// =============================================================================
describe("Journey 6: Plan Limits Enforcement on Tasks", () => {
  it("tracks task counts against plan limits and reflects upgrade", async () => {
    // Step 1: Create user with Free plan (maxTasksPerMonth: 5)
    const freePlan = await createTestPlan({
      name: "Free",
      maxProjects: 3,
      maxTasksPerMonth: 5,
      maxStorageMb: 500,
      repoTtlDays: 7,
      priceMonthly: "0",
    });
    const proPlan = await createTestPlan({
      name: "Pro",
      maxProjects: 20,
      maxTasksPerMonth: 500,
      maxStorageMb: 5000,
      repoTtlDays: 90,
      priceMonthly: "29.99",
    });
    const user = await createTestUser({ planId: freePlan.id });
    const project = await createTestProject(testDb, { ownerId: user.id });

    // Step 2: Create 5 tasks this month
    for (let i = 0; i < 5; i++) {
      await createTestTask(testDb, project.id, { title: `Task ${i + 1}` });
    }

    // Step 3: GET /plans/my-usage — taskCountThisMonth: 5/5
    const usage1 = await request(app).get("/api/plans/my-usage").set("x-user-id", user.id);
    expect(usage1.status).toBe(200);
    expect(usage1.body.plan.name).toBe("Free");
    expect(usage1.body.plan.maxTasksPerMonth).toBe(5);
    expect(usage1.body.usage.tasksThisMonth).toBe(5);

    // Step 4: Verify the system tracks task counts correctly
    expect(usage1.body.usage.tasksThisMonth).toBe(usage1.body.plan.maxTasksPerMonth);

    // Step 5: User upgrades to Pro plan
    const upgradeRes = await request(app)
      .put("/api/plans/select")
      .set("x-user-id", user.id)
      .send({ planId: proPlan.id });
    expect(upgradeRes.status).toBe(200);

    // Step 6: GET /plans/my-usage — limit now 500, still 5 tasks used
    const usage2 = await request(app).get("/api/plans/my-usage").set("x-user-id", user.id);
    expect(usage2.status).toBe(200);
    expect(usage2.body.plan.name).toBe("Pro");
    expect(usage2.body.plan.maxTasksPerMonth).toBe(500);
    expect(usage2.body.usage.tasksThisMonth).toBe(5); // same tasks, higher limit
  });
});

// =============================================================================
// User Journey 7: Dashboard Stats for Real User
// =============================================================================
describe("Journey 7: Dashboard Stats for Real User", () => {
  it("returns comprehensive dashboard stats with realistic data", async () => {
    // Step 1: Create realistic data: 3 projects, 5 agents, 15 tasks across projects
    const project1 = await createTestProject(testDb, { name: "Frontend App" });
    const project2 = await createTestProject(testDb, { name: "Backend API" });
    const project3 = await createTestProject(testDb, { name: "Mobile App" });

    const agent1 = await createTestAgent(testDb, { name: "Dev Lead", role: "developer", color: "#3B82F6" });
    const agent2 = await createTestAgent(testDb, { name: "Frontend Dev", role: "developer", color: "#10B981" });
    const agent3 = await createTestAgent(testDb, { name: "Backend Dev", role: "developer", color: "#F59E0B" });
    const agent4 = await createTestAgent(testDb, { name: "QA Engineer", role: "qa", color: "#EF4444" });
    const agent5 = await createTestAgent(testDb, { name: "DevOps", role: "devops", color: "#8B5CF6" });

    // Step 2: Set task statuses: mix of created, assigned, in_progress, review, done, failed
    const now = new Date();
    // Project 1 tasks (6 tasks)
    const t1 = await createTestTask(testDb, project1.id, { title: "Setup React project", assignedAgentId: agent2.id, status: "done", completedAt: now });
    const t2 = await createTestTask(testDb, project1.id, { title: "Create login page", assignedAgentId: agent2.id, status: "done", completedAt: now });
    const t3 = await createTestTask(testDb, project1.id, { title: "Build dashboard", assignedAgentId: agent2.id, status: "in_progress" });
    const t4 = await createTestTask(testDb, project1.id, { title: "Add unit tests", assignedAgentId: agent4.id, status: "review" });
    const t5 = await createTestTask(testDb, project1.id, { title: "Fix CSS bugs", assignedAgentId: agent2.id, status: "failed" });
    const t6 = await createTestTask(testDb, project1.id, { title: "Responsive design", status: "created" });

    // Project 2 tasks (5 tasks)
    const t7 = await createTestTask(testDb, project2.id, { title: "Setup Express", assignedAgentId: agent3.id, status: "done", completedAt: now });
    const t8 = await createTestTask(testDb, project2.id, { title: "Create REST API", assignedAgentId: agent3.id, status: "in_progress" });
    const t9 = await createTestTask(testDb, project2.id, { title: "Add auth middleware", assignedAgentId: agent3.id, status: "assigned" });
    const t10 = await createTestTask(testDb, project2.id, { title: "Database schema", assignedAgentId: agent1.id, status: "done", completedAt: now });
    const t11 = await createTestTask(testDb, project2.id, { title: "Deploy CI/CD", assignedAgentId: agent5.id, status: "review" });

    // Project 3 tasks (4 tasks)
    const t12 = await createTestTask(testDb, project3.id, { title: "Setup React Native", assignedAgentId: agent2.id, status: "done", completedAt: now });
    const t13 = await createTestTask(testDb, project3.id, { title: "Build navigation", assignedAgentId: agent2.id, status: "in_progress" });
    const t14 = await createTestTask(testDb, project3.id, { title: "Crash on Android", assignedAgentId: agent4.id, status: "failed" });
    const t15 = await createTestTask(testDb, project3.id, { title: "Push notifications", status: "created" });

    // Create task_logs for activities
    await createTestTaskLog(testDb, t1.id, { agentId: agent2.id, action: "status_change", fromStatus: "created", toStatus: "done" });
    await createTestTaskLog(testDb, t7.id, { agentId: agent3.id, action: "status_change", fromStatus: "in_progress", toStatus: "done" });
    await createTestTaskLog(testDb, t3.id, { agentId: agent2.id, action: "status_change", fromStatus: "assigned", toStatus: "in_progress" });

    // Step 3: GET /dashboard/stats — verify stats
    const dashRes = await request(app).get("/api/dashboard/stats");
expect(dashRes.status).toBe(200);

    const body = dashRes.body;
    expect(body.totalProjects).toBe(3);
    expect(body.activeAgents).toBe(5);
    expect(body.totalTasks).toBe(15);

    // Task status counts
    expect(body.runningTasks).toBe(3); // in_progress tasks
    expect(body.reviewTasks).toBe(2); // review tasks
    expect(body.doneTasks).toBe(5); // done tasks

    // Step 4: Verify projectStats has per-project breakdown
    expect(body.projectStats.length).toBe(3);
    const p1Stats = body.projectStats.find((ps: { projectId: string }) => ps.projectId === project1.id);
    expect(p1Stats).toBeDefined();
    expect(p1Stats.taskCount).toBe(6);

    const p2Stats = body.projectStats.find((ps: { projectId: string }) => ps.projectId === project2.id);
    expect(p2Stats).toBeDefined();
    expect(p2Stats.taskCount).toBe(5);

    const p3Stats = body.projectStats.find((ps: { projectId: string }) => ps.projectId === project3.id);
    expect(p3Stats).toBeDefined();
    expect(p3Stats.taskCount).toBe(4);

    // Step 5: Verify recentCompletedTasks returns latest done tasks
    expect(body.recentCompletedTasks.length).toBe(5);
    for (const task of body.recentCompletedTasks) {
      expect(task.id).toBeDefined();
      expect(task.title).toBeDefined();
    }

    // Step 6: Verify recentActivities populated from task_logs
    expect(body.recentActivities.length).toBe(3);
    expect(body.activityTotalCount).toBe(3);
    for (const activity of body.recentActivities) {
      expect(activity.id).toBeDefined();
      expect(activity.action).toBe("status_change");
    }
  });

  it("handles empty dashboard gracefully", async () => {
    const dashRes = await request(app).get("/api/dashboard/stats");
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.totalProjects).toBe(0);
    expect(dashRes.body.activeAgents).toBe(0);
    expect(dashRes.body.totalTasks).toBe(0);
    expect(dashRes.body.recentCompletedTasks).toEqual([]);
    expect(dashRes.body.recentActivities).toEqual([]);
  });

  it("supports activity pagination", async () => {
    const project = await createTestProject(testDb);
    const agent = await createTestAgent(testDb);
    const task = await createTestTask(testDb, project.id, { assignedAgentId: agent.id });

    // Create 15 task logs
    for (let i = 0; i < 15; i++) {
      await createTestTaskLog(testDb, task.id, {
        agentId: agent.id,
        action: `action_${i}`,
        detail: `Detail ${i}`,
      });
    }

    // Page 0 (first 10)
    const page0 = await request(app).get("/api/dashboard/stats?activityPage=0&activityPageSize=10");
    expect(page0.status).toBe(200);
    expect(page0.body.recentActivities.length).toBe(10);
    expect(page0.body.activityTotalCount).toBe(15);
    expect(page0.body.activityTotalPages).toBe(2);
    expect(page0.body.activityPage).toBe(0);

    // Page 1 (remaining 5)
    const page1 = await request(app).get("/api/dashboard/stats?activityPage=1&activityPageSize=10");
    expect(page1.status).toBe(200);
    expect(page1.body.recentActivities.length).toBe(5);
  });
});

// =============================================================================
// Cross-Journey: Period Filtering Consistency
// =============================================================================
describe("Cross-Journey: Period Filtering", () => {
  it("period=7d excludes tasks older than 7 days from summary", async () => {
    const project = await createTestProject(testDb);

    // Task created 10 days ago — should be excluded from 7d
    await createTestTask(testDb, project.id, {
      status: "done",
      costUsd: "1.00",
      tokensUsed: 100000,
      createdAt: daysAgo(10),
      completedAt: daysAgo(10),
    });

    // Task created 3 days ago — should be included in 7d
    await createTestTask(testDb, project.id, {
      status: "done",
      costUsd: "0.50",
      tokensUsed: 50000,
      createdAt: daysAgo(3),
      completedAt: daysAgo(3),
    });

    const summary7d = await request(app).get("/api/analytics/summary?period=7d");
    expect(summary7d.status).toBe(200);
    expect(summary7d.body.totalTasks).toBe(1);
    expect(summary7d.body.totalCostUsd).toBeCloseTo(0.50, 2);
    expect(summary7d.body.totalTokens).toBe(50000);

    const summary30d = await request(app).get("/api/analytics/summary?period=30d");
    expect(summary30d.status).toBe(200);
    expect(summary30d.body.totalTasks).toBe(2);
    expect(summary30d.body.totalCostUsd).toBeCloseTo(1.50, 2);
    expect(summary30d.body.totalTokens).toBe(150000);
  });

  it("trends only show tasks within the requested period window", async () => {
    const project = await createTestProject(testDb);

    // Task 15 days ago — outside 7d window
    await createTestTask(testDb, project.id, { status: "done", createdAt: daysAgo(15), completedAt: daysAgo(15) });
    // Task 3 days ago — inside 7d window
    await createTestTask(testDb, project.id, { status: "done", createdAt: daysAgo(3), completedAt: daysAgo(3) });

    const trends7d = await request(app).get("/api/analytics/trends?period=7d");
    expect(trends7d.status).toBe(200);
    const total7d = trends7d.body.trends.reduce((s: number, t: { total: number }) => s + t.total, 0);
    expect(total7d).toBe(1); // only the 3-day-old task

    const trends30d = await request(app).get("/api/analytics/trends?period=30d");
    expect(trends30d.status).toBe(200);
    const total30d = trends30d.body.trends.reduce((s: number, t: { total: number }) => s + t.total, 0);
    expect(total30d).toBe(2); // both tasks
  });
});

// =============================================================================
// Edge Cases
// =============================================================================
describe("Edge Cases", () => {
  it("analytics summary handles tasks with no cost or tokens", async () => {
    const project = await createTestProject(testDb);
    await createTestTask(testDb, project.id, { status: "done", completedAt: new Date() });
    await createTestTask(testDb, project.id, { status: "in_progress" });

    const res = await request(app).get("/api/analytics/summary?period=all");
    expect(res.status).toBe(200);
    expect(res.body.totalCostUsd).toBe(0);
    expect(res.body.totalTokens).toBe(0);
    expect(res.body.totalTasks).toBe(2);
    expect(res.body.completedTasks).toBe(1);
  });

  it("agent metrics handles agents with no tasks", async () => {
    await createTestAgent(testDb, { name: "Idle Agent" });

    const res = await request(app).get("/api/analytics/agents?period=all");
    expect(res.status).toBe(200);
    const idle = res.body.metrics.find((m: { agentName: string }) => m.agentName === "Idle Agent");
    expect(idle).toBeDefined();
    expect(idle.totalTasks).toBe(0);
    expect(idle.successRate).toBe(0);
    expect(idle.avgCompletionTime).toBeNull();
  });

  it("cost groupBy=day with tasks on multiple days", async () => {
    const project = await createTestProject(testDb);
    await createTestTask(testDb, project.id, { costUsd: "0.10", tokensUsed: 1000, createdAt: daysAgo(2) });
    await createTestTask(testDb, project.id, { costUsd: "0.20", tokensUsed: 2000, createdAt: daysAgo(1) });
    await createTestTask(testDb, project.id, { costUsd: "0.30", tokensUsed: 3000, createdAt: new Date() });

    const res = await request(app).get("/api/analytics/costs?period=all&groupBy=day");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
    // Sorted by date ascending
    expect(res.body[0].totalCost).toBeCloseTo(0.10, 2);
    expect(res.body[1].totalCost).toBeCloseTo(0.20, 2);
    expect(res.body[2].totalCost).toBeCloseTo(0.30, 2);
  });

  it("user with no plan falls back to default plan in my-usage", async () => {
    await createTestPlan({ name: "Default Free", isDefault: 1, maxProjects: 3, maxTasksPerMonth: 50 });
    const user = await createTestUser(); // no planId

    const res = await request(app).get("/api/plans/my-usage").set("x-user-id", user.id);
    expect(res.status).toBe(200);
    expect(res.body.plan.name).toBe("Default Free");
    expect(res.body.plan.maxProjects).toBe(3);
  });

  it("analytics agents tracks task participation via task_logs", async () => {
    const project = await createTestProject(testDb);
    const agent1 = await createTestAgent(testDb, { name: "Agent A" });
    const agent2 = await createTestAgent(testDb, { name: "Agent B" });

    // Task assigned to agent1 but agent2 also participated (via task_logs)
    const task = await createTestTask(testDb, project.id, { assignedAgentId: agent1.id, status: "done", completedAt: new Date() });
    await createTestTaskLog(testDb, task.id, { agentId: agent2.id, action: "review" });

    const res = await request(app).get("/api/analytics/agents?period=all");
    expect(res.status).toBe(200);

    const a1 = res.body.metrics.find((m: { agentName: string }) => m.agentName === "Agent A");
    const a2 = res.body.metrics.find((m: { agentName: string }) => m.agentName === "Agent B");

    // Both agents should show 1 task (agent1 via assignment, agent2 via task_logs)
    expect(a1.totalTasks).toBe(1);
    expect(a2.totalTasks).toBe(1);
    expect(a1.completedTasks).toBe(1);
    expect(a2.completedTasks).toBe(1); // same task is "done"
  });
});
