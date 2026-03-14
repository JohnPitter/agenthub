import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import {
  createTestDb,
  createTestProject,
  createTestAgent,
  createTestTask,
  cleanTestDb,
} from "../test/helpers";
import * as schema from "@agenthub/database/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import express from "express";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testDb: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testSqlite: any;
let app: express.Express;

// ─── Helpers ────────────────────────────────────────────────────────

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

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ─── Setup ──────────────────────────────────────────────────────────

beforeAll(async () => {
  const { db, sqlite } = await createTestDb();
  testDb = db;
  testSqlite = sqlite;

  app = express();
  app.use(express.json());

  // Auth middleware: inject user from x-user-id header
  app.use((req, _res, next) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (userId) {
      (req as express.Request & { user: { userId: string } }).user = { userId };
    }
    next();
  });

  // ─── Admin auth check middleware ───────────────────────────────
  const adminCheck: express.RequestHandler = async (req, res, next) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const [user] = await testDb.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, userId));
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  };

  // ─── Storage usage (DB-only version, no filesystem) ────────────
  app.get("/api/storage/usage", async (req, res) => {
    const userId = (req as express.Request & { user?: { userId: string } }).user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      // Get user plan limits
      const [userRow] = await testDb.select({ planId: schema.users.planId }).from(schema.users).where(eq(schema.users.id, userId));
      let limits = { maxStorageMb: 500, maxProjects: 3, repoTtlDays: 14 };
      if (userRow?.planId) {
        const [plan] = await testDb.select({
          maxProjects: schema.plans.maxProjects,
          maxStorageMb: schema.plans.maxStorageMb,
          repoTtlDays: schema.plans.repoTtlDays,
        }).from(schema.plans).where(eq(schema.plans.id, userRow.planId));
        if (plan) limits = plan;
      }

      // Sum diskSizeMb for user's projects
      const projects = await testDb.select({
        diskSizeMb: schema.projects.diskSizeMb,
      }).from(schema.projects).where(eq(schema.projects.ownerId, userId));

      const usedMb = projects.reduce((sum: number, p: { diskSizeMb: string | null }) =>
        sum + (parseFloat(p.diskSizeMb ?? "0") || 0), 0);
      const projectCount = projects.length;

      res.json({
        usage: {
          usedMb: Math.round(usedMb * 100) / 100,
          limitMb: limits.maxStorageMb,
          usedPercent: limits.maxStorageMb > 0 ? Math.round((usedMb / limits.maxStorageMb) * 10000) / 100 : 0,
          projectCount,
          maxProjects: limits.maxProjects,
          repoTtlDays: limits.repoTtlDays,
        },
      });
    } catch {
      res.status(500).json({ error: "Failed to get storage usage" });
    }
  });

  // ─── Quota check (can user create more projects?) ──────────────
  app.get("/api/storage/can-clone", async (req, res) => {
    const userId = (req as express.Request & { user?: { userId: string } }).user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      const [userRow] = await testDb.select({ planId: schema.users.planId }).from(schema.users).where(eq(schema.users.id, userId));
      let limits = { maxStorageMb: 500, maxProjects: 3, repoTtlDays: 14 };
      if (userRow?.planId) {
        const [plan] = await testDb.select({
          maxProjects: schema.plans.maxProjects,
          maxStorageMb: schema.plans.maxStorageMb,
          repoTtlDays: schema.plans.repoTtlDays,
        }).from(schema.plans).where(eq(schema.plans.id, userRow.planId));
        if (plan) limits = plan;
      }

      const projects = await testDb.select({
        diskSizeMb: schema.projects.diskSizeMb,
      }).from(schema.projects).where(eq(schema.projects.ownerId, userId));

      const usedMb = projects.reduce((sum: number, p: { diskSizeMb: string | null }) =>
        sum + (parseFloat(p.diskSizeMb ?? "0") || 0), 0);
      const projectCount = projects.length;

      const estimatedSizeMb = parseFloat(req.query.estimatedSizeMb as string) || 0;

      if (limits.maxProjects !== -1 && projectCount >= limits.maxProjects) {
        res.json({ allowed: false, reason: `Project limit reached (${projectCount}/${limits.maxProjects}). Upgrade your plan or delete a project.` });
        return;
      }
      if (limits.maxStorageMb > 0 && (usedMb + estimatedSizeMb) > limits.maxStorageMb) {
        res.json({ allowed: false, reason: `Storage limit reached (${usedMb.toFixed(1)}MB / ${limits.maxStorageMb}MB). Free up space or upgrade your plan.` });
        return;
      }
      res.json({ allowed: true });
    } catch {
      res.status(500).json({ error: "Failed to check quota" });
    }
  });

  // ─── Projects CRUD ─────────────────────────────────────────────
  app.get("/api/projects", async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const projects = await testDb.select().from(schema.projects).limit(limit).offset(offset);
      res.json({ projects });
    } catch {
      res.status(500).json({ error: "Failed to list projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const [project] = await testDb.select().from(schema.projects).where(eq(schema.projects.id, req.params.id));
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      // Touch lastAccessedAt
      await testDb.update(schema.projects).set({ lastAccessedAt: new Date() }).where(eq(schema.projects.id, project.id));
      res.json({ project });
    } catch {
      res.status(500).json({ error: "Failed to get project" });
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
      const [project] = await testDb.select().from(schema.projects).where(eq(schema.projects.id, req.params.id));
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

  // ─── Admin plan routes ─────────────────────────────────────────
  app.get("/api/admin/plans", adminCheck, async (_req, res) => {
    try {
      const plans = await testDb.select().from(schema.plans);
      res.json({ plans });
    } catch {
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });

  app.post("/api/admin/plans", adminCheck, async (req, res) => {
    try {
      const { name, description, maxProjects, maxTasksPerMonth, priceMonthly, features, isDefault, maxStorageMb, repoTtlDays } = req.body;
      if (!name || maxProjects == null || maxTasksPerMonth == null) {
        res.status(400).json({ error: "name, maxProjects, and maxTasksPerMonth are required" });
        return;
      }
      if (isDefault) {
        await testDb.update(schema.plans).set({ isDefault: 0 as unknown as boolean }).where(eq(schema.plans.isDefault, 1 as unknown as boolean));
      }
      const plan = {
        id: nanoid(),
        name,
        description: description ?? null,
        maxProjects,
        maxTasksPerMonth,
        maxStorageMb: maxStorageMb ?? 500,
        repoTtlDays: repoTtlDays ?? 30,
        priceMonthly: priceMonthly ?? "0",
        features: JSON.stringify(features ?? []),
        isDefault: isDefault ? 1 : 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await testDb.insert(schema.plans).values(plan);
      res.status(201).json({ plan });
    } catch {
      res.status(500).json({ error: "Failed to create plan" });
    }
  });

  app.put("/api/admin/users/:id/plan", adminCheck, async (req, res) => {
    try {
      const { id } = req.params;
      const { planId } = req.body;
      await testDb.update(schema.users).set({ planId: planId ?? null, updatedAt: new Date() }).where(eq(schema.users.id, id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update user plan" });
    }
  });

  // ─── Admin dashboard ───────────────────────────────────────────
  app.get("/api/admin/dashboard", adminCheck, async (_req, res) => {
    try {
      const allUsers = await testDb.select().from(schema.users);
      const allProjects = await testDb.select().from(schema.projects);
      const allTasks = await testDb.select().from(schema.tasks);

      const costThisMonth = allTasks.reduce(
        (s: number, t: Record<string, unknown>) => s + (parseFloat((t.costUsd as string) ?? "0") || 0), 0,
      );

      // Top users by usage
      const userProjectMap = new Map<string, string[]>();
      for (const p of allProjects) {
        if (!p.ownerId) continue;
        const list = userProjectMap.get(p.ownerId) ?? [];
        list.push(p.id);
        userProjectMap.set(p.ownerId, list);
      }

      const topUsers: { userId: string; name: string; taskCount: number; cost: number }[] = [];
      for (const user of allUsers) {
        const projectIds = userProjectMap.get(user.id) ?? [];
        let userTaskCount = 0;
        let userCost = 0;
        for (const pid of projectIds) {
          const tasks = allTasks.filter((t: Record<string, unknown>) => t.projectId === pid);
          userTaskCount += tasks.length;
          userCost += tasks.reduce((s: number, t: Record<string, unknown>) => s + (parseFloat((t.costUsd as string) ?? "0") || 0), 0);
        }
        if (userTaskCount > 0) {
          topUsers.push({ userId: user.id, name: user.name, taskCount: userTaskCount, cost: userCost });
        }
      }
      topUsers.sort((a, b) => b.taskCount - a.taskCount);

      // Top models by usage
      const allAgents = await testDb.select({ id: schema.agents.id, model: schema.agents.model }).from(schema.agents);
      const agentModelMap = new Map(allAgents.map((a: { id: string; model: string }) => [a.id, a.model]));
      const modelMap = new Map<string, { taskCount: number; cost: number }>();
      for (const task of allTasks) {
        const model = task.assignedAgentId ? (agentModelMap.get(task.assignedAgentId) ?? "unknown") : "unknown";
        const entry = modelMap.get(model) ?? { taskCount: 0, cost: 0 };
        entry.taskCount++;
        entry.cost += parseFloat(task.costUsd ?? "0") || 0;
        modelMap.set(model, entry);
      }
      const topModels = Array.from(modelMap.entries())
        .map(([model, { taskCount, cost }]) => ({ model, taskCount, cost }))
        .sort((a, b) => b.taskCount - a.taskCount)
        .slice(0, 5);

      res.json({
        totalUsers: allUsers.length,
        totalProjects: allProjects.length,
        tasksThisMonth: allTasks.length,
        costThisMonth,
        topUsersByUsage: topUsers.slice(0, 5),
        topModelsByUsage: topModels,
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch dashboard" });
    }
  });

  // ─── Storage cleanup (DB-only simulation) ──────────────────────
  app.post("/api/storage/cleanup", adminCheck, async (_req, res) => {
    try {
      let cleaned = 0;
      let freedMb = 0;

      const allUsers = await testDb.select({ id: schema.users.id, planId: schema.users.planId }).from(schema.users);

      for (const user of allUsers) {
        // Get user limits
        let limits = { maxStorageMb: 500, maxProjects: 3, repoTtlDays: 14 };
        if (user.planId) {
          const [plan] = await testDb.select({
            maxProjects: schema.plans.maxProjects,
            maxStorageMb: schema.plans.maxStorageMb,
            repoTtlDays: schema.plans.repoTtlDays,
          }).from(schema.plans).where(eq(schema.plans.id, user.planId));
          if (plan) limits = plan;
        }

        const cutoffDate = new Date(Date.now() - limits.repoTtlDays * 24 * 60 * 60 * 1000);
        const cutoffIso = cutoffDate.toISOString();

        // Drizzle stores dates as ISO strings in SQLite; compare as strings
        const expiredProjects = testSqlite.prepare(
          `SELECT * FROM projects WHERE owner_id = ? AND last_accessed_at IS NOT NULL AND last_accessed_at < ? AND path NOT LIKE 'http%'`,
        ).all(user.id, cutoffIso) as Array<{
          id: string; name: string; path: string; disk_size_mb: string | null;
          github_url: string | null; owner_id: string;
        }>;

        for (const project of expiredProjects) {
          // Check for active tasks
          const activeTaskCount = testSqlite.prepare(
            `SELECT COUNT(*) as cnt FROM tasks WHERE project_id = ? AND status IN ('assigned', 'in_progress', 'review')`,
          ).get(project.id) as { cnt: number };
          if (activeTaskCount.cnt > 0) continue;

          // Simulate cleanup: set path to githubUrl, diskSizeMb to 0
          const sizeMb = parseFloat(project.disk_size_mb ?? "0");
          testSqlite.prepare(
            `UPDATE projects SET path = ?, disk_size_mb = '0', updated_at = ? WHERE id = ?`,
          ).run(project.github_url ?? project.path, Date.now(), project.id);

          freedMb += sizeMb;
          cleaned++;
        }
      }

      res.json({ cleaned, freedMb: Math.round(freedMb * 100) / 100 });
    } catch {
      res.status(500).json({ error: "Failed to run cleanup" });
    }
  });
});

beforeEach(async () => {
  await cleanTestDb(testSqlite);
});

// ═══════════════════════════════════════════════════════════════════
// Flow 1: Complete Storage Management Flow
// ═══════════════════════════════════════════════════════════════════

describe("Flow 1: Complete Storage Management Flow", () => {
  it("tracks storage usage through full project lifecycle", async () => {
    // 1. Create a user with a plan that has storage limits
    const plan = await createTestPlan({
      name: "Storage Test Plan",
      maxProjects: 3,
      maxStorageMb: 100,
      repoTtlDays: 14,
    });
    const user = await createTestUser({ planId: plan.id });

    // 2. Check initial storage usage (should be 0)
    let res = await request(app)
      .get("/api/storage/usage")
      .set("x-user-id", user.id);

    expect(res.status).toBe(200);
    expect(res.body.usage.usedMb).toBe(0);
    expect(res.body.usage.projectCount).toBe(0);
    expect(res.body.usage.limitMb).toBe(100);
    expect(res.body.usage.maxProjects).toBe(3);

    // 3. Create a project with disk size
    await createTestProject(testDb, {
      name: "Project 1",
      ownerId: user.id,
      diskSizeMb: "30",
    });

    // 4. Check storage usage reflects the project
    res = await request(app)
      .get("/api/storage/usage")
      .set("x-user-id", user.id);

    expect(res.status).toBe(200);
    expect(res.body.usage.usedMb).toBe(30);
    expect(res.body.usage.projectCount).toBe(1);
    expect(res.body.usage.usedPercent).toBe(30);

    // 5. Create more projects until quota limit
    await createTestProject(testDb, {
      name: "Project 2",
      ownerId: user.id,
      diskSizeMb: "25",
    });
    const project3 = await createTestProject(testDb, {
      name: "Project 3",
      ownerId: user.id,
      diskSizeMb: "20",
    });

    // 6. Verify quota enforcement blocks new projects (maxProjects = 3, already have 3)
    res = await request(app)
      .get("/api/storage/can-clone")
      .set("x-user-id", user.id);

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.reason).toContain("Project limit reached");
    expect(res.body.reason).toContain("3/3");

    // 7. Delete a project
    res = await request(app).delete(`/api/projects/${project3.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 8. Verify storage freed up — can clone again
    res = await request(app)
      .get("/api/storage/can-clone")
      .set("x-user-id", user.id);

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);

    // 9. Check storage usage decreased
    res = await request(app)
      .get("/api/storage/usage")
      .set("x-user-id", user.id);

    expect(res.status).toBe(200);
    expect(res.body.usage.usedMb).toBe(55); // 30 + 25
    expect(res.body.usage.projectCount).toBe(2);
  });

  it("enforces storage MB limit independently of project count", async () => {
    const plan = await createTestPlan({
      name: "Small Storage Plan",
      maxProjects: 10,
      maxStorageMb: 50,
      repoTtlDays: 14,
    });
    const user = await createTestUser({ planId: plan.id });

    // Create projects using up most of the storage
    await createTestProject(testDb, { name: "Big Repo", ownerId: user.id, diskSizeMb: "45" });

    // Try to clone with estimated 10MB — should be blocked
    const res = await request(app)
      .get("/api/storage/can-clone?estimatedSizeMb=10")
      .set("x-user-id", user.id);

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.reason).toContain("Storage limit reached");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Flow 2: Plan Management -> User Assignment -> Quota Enforcement
// ═══════════════════════════════════════════════════════════════════

describe("Flow 2: Plan Management -> User Assignment -> Quota Enforcement", () => {
  let adminId: string;

  beforeEach(async () => {
    await cleanTestDb(testSqlite);
    const admin = await createTestUser({ role: "admin", name: "Admin" });
    adminId = admin.id;
  });

  it("full plan lifecycle: create plans, assign user, enforce limits, upgrade", async () => {
    // 1. Create a Free plan
    let res = await request(app)
      .post("/api/admin/plans")
      .set("x-user-id", adminId)
      .send({
        name: "Free",
        maxProjects: 3,
        maxTasksPerMonth: 50,
        maxStorageMb: 500,
        repoTtlDays: 14,
      });

    expect(res.status).toBe(201);
    const freePlan = res.body.plan;
    expect(freePlan.name).toBe("Free");
    expect(freePlan.maxProjects).toBe(3);

    // 2. Create a Pro plan
    res = await request(app)
      .post("/api/admin/plans")
      .set("x-user-id", adminId)
      .send({
        name: "Pro",
        maxProjects: 20,
        maxTasksPerMonth: 500,
        maxStorageMb: 5000,
        repoTtlDays: 90,
        priceMonthly: "29.99",
      });

    expect(res.status).toBe(201);
    const proPlan = res.body.plan;
    expect(proPlan.maxProjects).toBe(20);
    expect(proPlan.maxStorageMb).toBe(5000);

    // 3. Create a user with Free plan
    const user = await createTestUser({ planId: freePlan.id, name: "Free User" });

    // 4. Add projects up to limit (3)
    await createTestProject(testDb, { name: "Proj 1", ownerId: user.id, diskSizeMb: "10" });
    await createTestProject(testDb, { name: "Proj 2", ownerId: user.id, diskSizeMb: "10" });
    await createTestProject(testDb, { name: "Proj 3", ownerId: user.id, diskSizeMb: "10" });

    // 5. Verify 4th project blocked
    res = await request(app)
      .get("/api/storage/can-clone")
      .set("x-user-id", user.id);

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.reason).toContain("Project limit reached");

    // 6. Upgrade user to Pro plan
    res = await request(app)
      .put(`/api/admin/users/${user.id}/plan`)
      .set("x-user-id", adminId)
      .send({ planId: proPlan.id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 7. Verify user can now create more projects
    res = await request(app)
      .get("/api/storage/can-clone")
      .set("x-user-id", user.id);

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);

    // 8. Create projects up to new limit — spot-check at project 4
    await createTestProject(testDb, { name: "Proj 4", ownerId: user.id, diskSizeMb: "10" });

    res = await request(app)
      .get("/api/storage/usage")
      .set("x-user-id", user.id);

    expect(res.status).toBe(200);
    expect(res.body.usage.projectCount).toBe(4);
    expect(res.body.usage.maxProjects).toBe(20);
    expect(res.body.usage.limitMb).toBe(5000);
    expect(res.body.usage.repoTtlDays).toBe(90);
  });

  it("user without plan gets default limits", async () => {
    const user = await createTestUser({ name: "No Plan User" });

    const res = await request(app)
      .get("/api/storage/usage")
      .set("x-user-id", user.id);

    expect(res.status).toBe(200);
    // Default limits from service: maxStorageMb=500, maxProjects=3, repoTtlDays=14
    expect(res.body.usage.limitMb).toBe(500);
    expect(res.body.usage.maxProjects).toBe(3);
    expect(res.body.usage.repoTtlDays).toBe(14);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Flow 3: TTL Cleanup Flow
// ═══════════════════════════════════════════════════════════════════

describe("Flow 3: TTL Cleanup Flow", () => {
  let adminId: string;

  beforeEach(async () => {
    await cleanTestDb(testSqlite);
    const admin = await createTestUser({ role: "admin", name: "Admin" });
    adminId = admin.id;
  });

  it("cleans only expired repos without active tasks", async () => {
    // 1. Create user with plan (repoTtlDays: 7)
    const plan = await createTestPlan({
      name: "TTL Plan",
      maxProjects: 10,
      maxStorageMb: 5000,
      repoTtlDays: 7,
    });
    const user = await createTestUser({ planId: plan.id, name: "TTL User" });

    // 2. Create projects with varying lastAccessedAt
    // Project A: 3 days ago (should survive)
    const projectRecent = await createTestProject(testDb, {
      name: "Recent Project",
      ownerId: user.id,
      diskSizeMb: "50",
      lastAccessedAt: daysAgo(3),
      githubUrl: "https://github.com/user/recent",
    });

    // Project B: 10 days ago (should be cleaned)
    const projectExpired = await createTestProject(testDb, {
      name: "Expired Project",
      ownerId: user.id,
      diskSizeMb: "100",
      lastAccessedAt: daysAgo(10),
      githubUrl: "https://github.com/user/expired",
    });

    // Project C: 10 days ago but with active task (should survive)
    const projectWithTask = await createTestProject(testDb, {
      name: "Active Task Project",
      ownerId: user.id,
      diskSizeMb: "75",
      lastAccessedAt: daysAgo(10),
      githubUrl: "https://github.com/user/active-task",
    });

    // Create an active task for Project C
    await createTestTask(testDb, projectWithTask.id, {
      title: "In-progress Task",
      status: "in_progress",
    });

    // 3. Run cleanup
    const res = await request(app)
      .post("/api/storage/cleanup")
      .set("x-user-id", adminId);

    expect(res.status).toBe(200);
    expect(res.body.cleaned).toBe(1);
    expect(res.body.freedMb).toBe(100);

    // 4. Verify only Project B was cleaned
    const [recentProject] = await testDb.select().from(schema.projects).where(eq(schema.projects.id, projectRecent.id));
    expect(recentProject.diskSizeMb).toBe("50"); // unchanged
    expect(recentProject.path).not.toContain("http"); // local path preserved

    // 5. Verify the cleaned project's path is now the githubUrl
    const [cleanedProject] = await testDb.select().from(schema.projects).where(eq(schema.projects.id, projectExpired.id));
    expect(cleanedProject.path).toBe("https://github.com/user/expired");

    // 6. Verify diskSizeMb is 0 for cleaned project
    expect(cleanedProject.diskSizeMb).toBe("0");

    // Project C should be untouched due to active task
    const [activeProject] = await testDb.select().from(schema.projects).where(eq(schema.projects.id, projectWithTask.id));
    expect(activeProject.diskSizeMb).toBe("75");
    expect(activeProject.path).not.toContain("http");
  });

  it("does not clean projects already pointing to URLs", async () => {
    const plan = await createTestPlan({ name: "TTL2", repoTtlDays: 7 });
    const user = await createTestUser({ planId: plan.id });

    // Project with path already a URL (previously cleaned)
    await createTestProject(testDb, {
      name: "Already Cleaned",
      ownerId: user.id,
      path: "https://github.com/user/already-cleaned",
      diskSizeMb: "0",
      lastAccessedAt: daysAgo(20),
      githubUrl: "https://github.com/user/already-cleaned",
    });

    const res = await request(app)
      .post("/api/storage/cleanup")
      .set("x-user-id", adminId);

    expect(res.status).toBe(200);
    expect(res.body.cleaned).toBe(0);
  });

  it("respects different TTL per user plan", async () => {
    // User A: 7-day TTL
    const shortPlan = await createTestPlan({ name: "Short TTL", repoTtlDays: 7 });
    const userShort = await createTestUser({ planId: shortPlan.id, name: "Short TTL User" });

    // User B: 30-day TTL
    const longPlan = await createTestPlan({ name: "Long TTL", repoTtlDays: 30 });
    const userLong = await createTestUser({ planId: longPlan.id, name: "Long TTL User" });

    // Both have a project last accessed 10 days ago
    await createTestProject(testDb, {
      name: "Short User Project",
      ownerId: userShort.id,
      diskSizeMb: "50",
      lastAccessedAt: daysAgo(10),
      githubUrl: "https://github.com/short/project",
    });

    await createTestProject(testDb, {
      name: "Long User Project",
      ownerId: userLong.id,
      diskSizeMb: "50",
      lastAccessedAt: daysAgo(10),
      githubUrl: "https://github.com/long/project",
    });

    const res = await request(app)
      .post("/api/storage/cleanup")
      .set("x-user-id", adminId);

    expect(res.status).toBe(200);
    // Only Short TTL user's project should be cleaned (10 > 7)
    // Long TTL user's project survives (10 < 30)
    expect(res.body.cleaned).toBe(1);
    expect(res.body.freedMb).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Flow 4: Admin Dashboard Metrics
// ═══════════════════════════════════════════════════════════════════

describe("Flow 4: Admin Dashboard Metrics", () => {
  let adminId: string;

  beforeEach(async () => {
    await cleanTestDb(testSqlite);
    const admin = await createTestUser({ role: "admin", name: "Admin User" });
    adminId = admin.id;
  });

  it("returns correct aggregate metrics", async () => {
    // Create users
    const user1 = await createTestUser({ name: "User One" });
    const user2 = await createTestUser({ name: "User Two" });

    // Create projects
    const project1 = await createTestProject(testDb, { name: "P1", ownerId: user1.id });
    const project2 = await createTestProject(testDb, { name: "P2", ownerId: user1.id });
    const project3 = await createTestProject(testDb, { name: "P3", ownerId: user2.id });

    // Create agents
    const agent1 = await createTestAgent(testDb, { name: "Agent GPT", model: "gpt-4" });
    const agent2 = await createTestAgent(testDb, { name: "Agent Claude", model: "claude-sonnet-4-5-20250929" });

    // Create tasks with costs
    await createTestTask(testDb, project1.id, { assignedAgentId: agent1.id, costUsd: "1.50" });
    await createTestTask(testDb, project1.id, { assignedAgentId: agent1.id, costUsd: "2.00" });
    await createTestTask(testDb, project2.id, { assignedAgentId: agent2.id, costUsd: "3.50" });
    await createTestTask(testDb, project3.id, { assignedAgentId: agent2.id, costUsd: "0.75" });

    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("x-user-id", adminId);

    expect(res.status).toBe(200);

    // 3 users total: admin + user1 + user2
    expect(res.body.totalUsers).toBe(3);
    expect(res.body.totalProjects).toBe(3);
    expect(res.body.tasksThisMonth).toBe(4);
    expect(res.body.costThisMonth).toBe(7.75);

    // topUsersByUsage
    expect(res.body.topUsersByUsage).toHaveLength(2);
    // user1 has 3 tasks (P1: 2 tasks, P2: 1 task), user2 has 1 task
    expect(res.body.topUsersByUsage[0].name).toBe("User One");
    expect(res.body.topUsersByUsage[0].taskCount).toBe(3);
    expect(res.body.topUsersByUsage[0].cost).toBe(7);
    expect(res.body.topUsersByUsage[1].name).toBe("User Two");
    expect(res.body.topUsersByUsage[1].taskCount).toBe(1);

    // topModelsByUsage
    expect(res.body.topModelsByUsage).toHaveLength(2);
    // claude-sonnet: 2 tasks, gpt-4: 2 tasks — sorted by taskCount desc
    const models = res.body.topModelsByUsage.map((m: { model: string }) => m.model);
    expect(models).toContain("gpt-4");
    expect(models).toContain("claude-sonnet-4-5-20250929");
  });

  it("returns empty metrics when no data exists", async () => {
    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("x-user-id", adminId);

    expect(res.status).toBe(200);
    expect(res.body.totalUsers).toBe(1); // just admin
    expect(res.body.totalProjects).toBe(0);
    expect(res.body.tasksThisMonth).toBe(0);
    expect(res.body.costThisMonth).toBe(0);
    expect(res.body.topUsersByUsage).toEqual([]);
    expect(res.body.topModelsByUsage).toEqual([]);
  });

  it("counts tasks without agents as 'unknown' model", async () => {
    const user = await createTestUser({ name: "Solo User" });
    const project = await createTestProject(testDb, { name: "Solo Project", ownerId: user.id });
    await createTestTask(testDb, project.id, { costUsd: "1.00" }); // no assignedAgentId

    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("x-user-id", adminId);

    expect(res.status).toBe(200);
    expect(res.body.topModelsByUsage).toHaveLength(1);
    expect(res.body.topModelsByUsage[0].model).toBe("unknown");
    expect(res.body.topModelsByUsage[0].taskCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Flow 5: Project Lifecycle with Storage Tracking
// ═══════════════════════════════════════════════════════════════════

describe("Flow 5: Project Lifecycle with Storage Tracking", () => {
  it("complete project CRUD lifecycle with storage tracking", async () => {
    // 1. Create user + plan
    const plan = await createTestPlan({
      name: "Lifecycle Plan",
      maxProjects: 5,
      maxStorageMb: 1000,
      repoTtlDays: 30,
    });
    const user = await createTestUser({ planId: plan.id, name: "Lifecycle User" });

    // 2. Create project with ownerId set
    const project = await createTestProject(testDb, {
      name: "Lifecycle Project",
      ownerId: user.id,
      diskSizeMb: "42",
      description: "Original description",
    });

    // Verify initial storage
    let res = await request(app)
      .get("/api/storage/usage")
      .set("x-user-id", user.id);

    expect(res.status).toBe(200);
    expect(res.body.usage.usedMb).toBe(42);
    expect(res.body.usage.projectCount).toBe(1);

    // 3. GET project by ID — verify lastAccessedAt is touched
    res = await request(app).get(`/api/projects/${project.id}`);

    expect(res.status).toBe(200);
    expect(res.body.project.name).toBe("Lifecycle Project");

    // Verify lastAccessedAt was updated (SQLite may store as various formats)
    const [updatedProject] = await testDb.select().from(schema.projects).where(eq(schema.projects.id, project.id));
    // Just verify the field is not null/undefined — the GET endpoint updates it
    expect(updatedProject.lastAccessedAt).toBeDefined();
    expect(updatedProject.lastAccessedAt).not.toBeNull();

    // 4. PATCH project — verify update works
    res = await request(app)
      .patch(`/api/projects/${project.id}`)
      .send({ name: "Updated Project", description: "New description" });

    expect(res.status).toBe(200);
    expect(res.body.project.name).toBe("Updated Project");
    expect(res.body.project.description).toBe("New description");

    // 5. DELETE project
    res = await request(app).delete(`/api/projects/${project.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 6. Verify storage freed
    res = await request(app)
      .get("/api/storage/usage")
      .set("x-user-id", user.id);

    expect(res.status).toBe(200);
    expect(res.body.usage.usedMb).toBe(0);
    expect(res.body.usage.projectCount).toBe(0);
  });

  it("GET non-existent project returns 404", async () => {
    const res = await request(app).get("/api/projects/non-existent-id");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Project not found");
  });

  it("PATCH project preserves unmodified fields", async () => {
    const project = await createTestProject(testDb, {
      name: "Original Name",
      description: "Original Description",
      status: "active",
    });

    // Only update name
    const res = await request(app)
      .patch(`/api/projects/${project.id}`)
      .send({ name: "New Name" });

    expect(res.status).toBe(200);
    expect(res.body.project.name).toBe("New Name");
    expect(res.body.project.description).toBe("Original Description");
  });

  it("multiple users have isolated storage tracking", async () => {
    const plan = await createTestPlan({ name: "Shared Plan", maxProjects: 5, maxStorageMb: 1000 });
    const user1 = await createTestUser({ planId: plan.id, name: "User 1" });
    const user2 = await createTestUser({ planId: plan.id, name: "User 2" });

    // User 1 creates 2 projects
    await createTestProject(testDb, { name: "U1-P1", ownerId: user1.id, diskSizeMb: "100" });
    await createTestProject(testDb, { name: "U1-P2", ownerId: user1.id, diskSizeMb: "200" });

    // User 2 creates 1 project
    await createTestProject(testDb, { name: "U2-P1", ownerId: user2.id, diskSizeMb: "50" });

    // Verify isolated usage
    let res = await request(app)
      .get("/api/storage/usage")
      .set("x-user-id", user1.id);
    expect(res.body.usage.usedMb).toBe(300);
    expect(res.body.usage.projectCount).toBe(2);

    res = await request(app)
      .get("/api/storage/usage")
      .set("x-user-id", user2.id);
    expect(res.body.usage.usedMb).toBe(50);
    expect(res.body.usage.projectCount).toBe(1);
  });
});
