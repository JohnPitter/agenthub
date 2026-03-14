import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createTestDb,
  createTestProject,
  createTestAgent,
  createTestTask,
  cleanTestDb,
} from "../../test/helpers";
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

// Helper to create a test user
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

// Helper to create a test plan
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

beforeAll(async () => {
  const { db, sqlite } = await createTestDb();
  testDb = db;
  testSqlite = sqlite;

  app = express();
  app.use(express.json());

  // Simulate admin middleware: require x-user-id header and check admin role
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
    (req as express.Request & { userId: string }).userId = userId;
    next();
  };

  // ===== ADMIN PLAN ROUTES =====

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
      const { name, description, maxProjects, maxTasksPerMonth, priceMonthly, features, isDefault } = req.body;
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
        maxStorageMb: 500,
        repoTtlDays: 30,
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

  app.put("/api/admin/plans/:id", adminCheck, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      if (updates.isDefault) {
        await testDb.update(schema.plans).set({ isDefault: 0 as unknown as boolean }).where(eq(schema.plans.isDefault, 1 as unknown as boolean));
      }
      await testDb.update(schema.plans).set({
        ...updates,
        updatedAt: new Date(),
      }).where(eq(schema.plans.id, id));
      const [updated] = await testDb.select().from(schema.plans).where(eq(schema.plans.id, id));
      res.json({ plan: updated });
    } catch {
      res.status(500).json({ error: "Failed to update plan" });
    }
  });

  app.delete("/api/admin/plans/:id", adminCheck, async (req, res) => {
    try {
      const { id } = req.params;
      await testDb.update(schema.users).set({ planId: null }).where(eq(schema.users.planId, id));
      await testDb.delete(schema.plans).where(eq(schema.plans.id, id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete plan" });
    }
  });

  // ===== ADMIN USER ROUTES =====

  app.get("/api/admin/users", adminCheck, async (_req, res) => {
    try {
      const usersRaw = await testDb.select().from(schema.users);
      const users = usersRaw.map((u: Record<string, unknown>) => ({
        id: u.id,
        login: u.login,
        name: u.name,
        email: u.email,
        role: u.role,
        planId: u.planId,
      }));
      res.json({ users });
    } catch {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.put("/api/admin/users/:id/role", adminCheck, async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;
      if (role !== "user" && role !== "admin") {
        res.status(400).json({ error: "Role must be 'user' or 'admin'" });
        return;
      }
      await testDb.update(schema.users).set({ role, updatedAt: new Date() }).where(eq(schema.users.id, id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update user role" });
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

  // ===== ADMIN DASHBOARD =====

  app.get("/api/admin/dashboard", adminCheck, async (_req, res) => {
    try {
      const [userCount] = await testDb.select().from(schema.users);
      const allUsers = await testDb.select().from(schema.users);
      const [projectCount] = await testDb.select().from(schema.projects);
      const allProjects = await testDb.select().from(schema.projects);
      const allTasks = await testDb.select().from(schema.tasks);

      res.json({
        totalUsers: allUsers.length,
        totalProjects: allProjects.length,
        tasksThisMonth: allTasks.length,
        costThisMonth: allTasks.reduce((s: number, t: Record<string, unknown>) => s + (parseFloat((t.costUsd as string) ?? "0") || 0), 0),
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch dashboard" });
    }
  });
});

beforeEach(async () => {
  await cleanTestDb(testSqlite);
});

describe("Admin Routes — Integration", () => {
  // ---- AUTH CHECK ----
  describe("Authentication & Authorization", () => {
    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/admin/plans");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Authentication required");
    });

    it("returns 403 for non-admin users", async () => {
      const user = await createTestUser({ role: "user" });
      const res = await request(app)
        .get("/api/admin/plans")
        .set("x-user-id", user.id);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Admin access required");
    });

    it("allows access for admin users", async () => {
      const admin = await createTestUser({ role: "admin" });
      const res = await request(app)
        .get("/api/admin/plans")
        .set("x-user-id", admin.id);
      expect(res.status).toBe(200);
    });
  });

  // ---- PLANS CRUD ----
  describe("Plans CRUD", () => {
    let adminId: string;

    beforeEach(async () => {
      await cleanTestDb(testSqlite);
      const admin = await createTestUser({ role: "admin" });
      adminId = admin.id;
    });

    it("GET /api/admin/plans returns empty list", async () => {
      const res = await request(app).get("/api/admin/plans").set("x-user-id", adminId);
      expect(res.status).toBe(200);
      expect(res.body.plans).toEqual([]);
    });

    it("POST /api/admin/plans creates a plan", async () => {
      const res = await request(app)
        .post("/api/admin/plans")
        .set("x-user-id", adminId)
        .send({ name: "Pro Plan", maxProjects: 10, maxTasksPerMonth: 500, priceMonthly: "19.99" });

      expect(res.status).toBe(201);
      expect(res.body.plan.name).toBe("Pro Plan");
      expect(res.body.plan.maxProjects).toBe(10);
      expect(res.body.plan.maxTasksPerMonth).toBe(500);
    });

    it("POST /api/admin/plans validates required fields", async () => {
      const res = await request(app)
        .post("/api/admin/plans")
        .set("x-user-id", adminId)
        .send({ name: "Incomplete" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("required");
    });

    it("PUT /api/admin/plans/:id updates a plan", async () => {
      const plan = await createTestPlan();
      const res = await request(app)
        .put(`/api/admin/plans/${plan.id}`)
        .set("x-user-id", adminId)
        .send({ name: "Updated Plan", maxProjects: 20 });

      expect(res.status).toBe(200);
      expect(res.body.plan.name).toBe("Updated Plan");
    });

    it("DELETE /api/admin/plans/:id deletes plan and unassigns users", async () => {
      const plan = await createTestPlan();
      const user = await createTestUser({ planId: plan.id });

      const res = await request(app)
        .delete(`/api/admin/plans/${plan.id}`)
        .set("x-user-id", adminId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify plan is deleted
      const plans = await testDb.select().from(schema.plans).where(eq(schema.plans.id, plan.id));
      expect(plans).toHaveLength(0);

      // Verify user's planId is cleared
      const [updatedUser] = await testDb.select().from(schema.users).where(eq(schema.users.id, user.id));
      expect(updatedUser.planId).toBeNull();
    });

    it("POST /api/admin/plans with isDefault unsets previous default", async () => {
      await createTestPlan({ isDefault: 1, name: "Old Default" });

      const res = await request(app)
        .post("/api/admin/plans")
        .set("x-user-id", adminId)
        .send({ name: "New Default", maxProjects: 5, maxTasksPerMonth: 50, isDefault: true });

      expect(res.status).toBe(201);

      // Check old default was unset
      const allPlans = await testDb.select().from(schema.plans);
      const defaults = allPlans.filter((p: Record<string, unknown>) => p.isDefault === 1 || p.isDefault === true);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].name).toBe("New Default");
    });
  });

  // ---- USERS MANAGEMENT ----
  describe("Users Management", () => {
    let adminId: string;

    beforeEach(async () => {
      await cleanTestDb(testSqlite);
      const admin = await createTestUser({ role: "admin", name: "Admin User" });
      adminId = admin.id;
    });

    it("GET /api/admin/users lists all users", async () => {
      await createTestUser({ name: "Regular User", login: "regular" });

      const res = await request(app).get("/api/admin/users").set("x-user-id", adminId);
      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(2); // admin + regular
    });

    it("PUT /api/admin/users/:id/role changes user role", async () => {
      const user = await createTestUser({ role: "user" });

      const res = await request(app)
        .put(`/api/admin/users/${user.id}/role`)
        .set("x-user-id", adminId)
        .send({ role: "admin" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const [updated] = await testDb.select().from(schema.users).where(eq(schema.users.id, user.id));
      expect(updated.role).toBe("admin");
    });

    it("PUT /api/admin/users/:id/role rejects invalid role", async () => {
      const user = await createTestUser();

      const res = await request(app)
        .put(`/api/admin/users/${user.id}/role`)
        .set("x-user-id", adminId)
        .send({ role: "superadmin" });

      expect(res.status).toBe(400);
    });

    it("PUT /api/admin/users/:id/plan assigns plan to user", async () => {
      const user = await createTestUser();
      const plan = await createTestPlan();

      const res = await request(app)
        .put(`/api/admin/users/${user.id}/plan`)
        .set("x-user-id", adminId)
        .send({ planId: plan.id });

      expect(res.status).toBe(200);

      const [updated] = await testDb.select().from(schema.users).where(eq(schema.users.id, user.id));
      expect(updated.planId).toBe(plan.id);
    });

    it("PUT /api/admin/users/:id/plan clears plan with null", async () => {
      const plan = await createTestPlan();
      const user = await createTestUser({ planId: plan.id });

      const res = await request(app)
        .put(`/api/admin/users/${user.id}/plan`)
        .set("x-user-id", adminId)
        .send({ planId: null });

      expect(res.status).toBe(200);

      const [updated] = await testDb.select().from(schema.users).where(eq(schema.users.id, user.id));
      expect(updated.planId).toBeNull();
    });
  });

  // ---- DASHBOARD ----
  describe("Dashboard", () => {
    let adminId: string;

    beforeEach(async () => {
      await cleanTestDb(testSqlite);
      const admin = await createTestUser({ role: "admin" });
      adminId = admin.id;
    });

    it("GET /api/admin/dashboard returns metrics", async () => {
      await createTestUser({ name: "User 2" });
      const project = await createTestProject(testDb);
      await createTestTask(testDb, project.id, { costUsd: "1.50" });
      await createTestTask(testDb, project.id, { costUsd: "2.50" });

      const res = await request(app).get("/api/admin/dashboard").set("x-user-id", adminId);
      expect(res.status).toBe(200);
      expect(res.body.totalUsers).toBe(2); // admin + user
      expect(res.body.totalProjects).toBe(1);
      expect(res.body.tasksThisMonth).toBe(2);
      expect(res.body.costThisMonth).toBe(4);
    });

    it("GET /api/admin/dashboard returns zero for empty data", async () => {
      const res = await request(app).get("/api/admin/dashboard").set("x-user-id", adminId);
      expect(res.status).toBe(200);
      expect(res.body.totalUsers).toBe(1); // just admin
      expect(res.body.totalProjects).toBe(0);
      expect(res.body.tasksThisMonth).toBe(0);
      expect(res.body.costThisMonth).toBe(0);
    });
  });
});
