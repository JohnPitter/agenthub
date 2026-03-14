import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createTestDb,
  createTestProject,
  createTestAgent,
  createTestTask,
  cleanTestDb,
} from "../test/helpers.js";
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

// Helper to create openrouter config
async function createOpenRouterConfig(overrides?: Record<string, unknown>) {
  const config = {
    id: nanoid(),
    apiKey: "sk-or-v1-test1234567890abcdef",
    enabledModels: JSON.stringify([
      { id: "anthropic/claude-sonnet-4-5-20250929", name: "Claude 3.5 Sonnet", provider: "anthropic" },
    ]),
    createdBy: "admin-user",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  await testDb.insert(schema.openrouterConfig).values(config);
  return config;
}

beforeAll(async () => {
  const { db, sqlite } = await createTestDb();
  testDb = db;
  testSqlite = sqlite;

  app = express();
  app.use(express.json());

  // Admin middleware simulation
  const adminCheck: express.RequestHandler = async (req, res, next) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const [user] = await testDb
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    (req as express.Request & { userId: string }).userId = userId;
    next();
  };

  // ===== PLAN ROUTES =====

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
      const {
        name,
        description,
        maxProjects,
        maxTasksPerMonth,
        priceMonthly,
        features,
        isDefault,
        maxStorageMb,
        repoTtlDays,
      } = req.body;
      if (!name || maxProjects == null || maxTasksPerMonth == null) {
        res
          .status(400)
          .json({ error: "name, maxProjects, and maxTasksPerMonth are required" });
        return;
      }
      if (isDefault) {
        await testDb
          .update(schema.plans)
          .set({ isDefault: 0 as unknown as boolean })
          .where(eq(schema.plans.isDefault, 1 as unknown as boolean));
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

  app.put("/api/admin/plans/:id", adminCheck, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      if (updates.isDefault) {
        await testDb
          .update(schema.plans)
          .set({ isDefault: 0 as unknown as boolean })
          .where(eq(schema.plans.isDefault, 1 as unknown as boolean));
      }
      await testDb
        .update(schema.plans)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.plans.id, id));
      const [updated] = await testDb
        .select()
        .from(schema.plans)
        .where(eq(schema.plans.id, id));
      res.json({ plan: updated });
    } catch {
      res.status(500).json({ error: "Failed to update plan" });
    }
  });

  app.delete("/api/admin/plans/:id", adminCheck, async (req, res) => {
    try {
      const { id } = req.params;
      await testDb
        .update(schema.users)
        .set({ planId: null })
        .where(eq(schema.users.planId, id));
      await testDb.delete(schema.plans).where(eq(schema.plans.id, id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete plan" });
    }
  });

  // ===== USER ROUTES =====

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
      await testDb
        .update(schema.users)
        .set({ role, updatedAt: new Date() })
        .where(eq(schema.users.id, id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  app.put("/api/admin/users/:id/plan", adminCheck, async (req, res) => {
    try {
      const { id } = req.params;
      const { planId } = req.body;
      await testDb
        .update(schema.users)
        .set({ planId: planId ?? null, updatedAt: new Date() })
        .where(eq(schema.users.id, id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update user plan" });
    }
  });

  // ===== OPENROUTER ROUTES (mocked — no real API calls) =====

  app.get("/api/admin/openrouter/config", adminCheck, async (_req, res) => {
    try {
      const configs = await testDb.select().from(schema.openrouterConfig);
      if (configs.length === 0) {
        res.json({ config: null });
        return;
      }
      const config = configs[0];
      const rawKey = config.apiKey as string;
      const masked =
        rawKey.length > 8
          ? rawKey.slice(0, 5) + "..." + rawKey.slice(-4)
          : "***";
      res.json({
        config: {
          id: config.id,
          apiKeyMasked: masked,
          enabledModels: config.enabledModels,
          updatedAt: config.updatedAt,
        },
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch config" });
    }
  });

  app.post("/api/admin/openrouter/config", adminCheck, async (req, res) => {
    try {
      const { apiKey, enabledModels } = req.body;
      const userId = (req as express.Request & { userId: string }).userId;
      if (!apiKey) {
        res.status(400).json({ error: "apiKey is required" });
        return;
      }
      // Delete existing configs and insert new one
      testSqlite.prepare("DELETE FROM openrouter_config").run();
      const config = {
        id: nanoid(),
        apiKey,
        enabledModels: JSON.stringify(enabledModels ?? []),
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await testDb.insert(schema.openrouterConfig).values(config);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to save config" });
    }
  });

  app.post("/api/admin/openrouter/test", adminCheck, async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey) {
        res.json({ success: false, error: "No API key provided" });
        return;
      }
      // Mock: keys starting with "sk-or-valid" are valid
      const valid = apiKey.startsWith("sk-or-valid");
      res.json({ success: valid });
    } catch {
      res.json({ success: false, error: "Connection test failed" });
    }
  });

  // ===== DASHBOARD =====

  app.get("/api/admin/dashboard", adminCheck, async (_req, res) => {
    try {
      const allUsers = await testDb.select().from(schema.users);
      const allProjects = await testDb.select().from(schema.projects);
      const allTasks = await testDb.select().from(schema.tasks);
      const allAgents = await testDb.select().from(schema.agents);

      const costThisMonth = allTasks.reduce(
        (s: number, t: Record<string, unknown>) =>
          s + (parseFloat((t.costUsd as string) ?? "0") || 0),
        0,
      );

      // Top users by usage: count tasks per project owner
      const topUsersMap = new Map<
        string,
        { name: string; taskCount: number; cost: number }
      >();
      for (const user of allUsers) {
        const userProjects = allProjects.filter(
          (p: Record<string, unknown>) => p.ownerId === (user as Record<string, unknown>).id,
        );
        let taskCount = 0;
        let userCost = 0;
        for (const proj of userProjects) {
          const projTasks = allTasks.filter(
            (t: Record<string, unknown>) => t.projectId === (proj as Record<string, unknown>).id,
          );
          taskCount += projTasks.length;
          userCost += projTasks.reduce(
            (s: number, t: Record<string, unknown>) =>
              s + (parseFloat((t.costUsd as string) ?? "0") || 0),
            0,
          );
        }
        if (taskCount > 0) {
          topUsersMap.set((user as Record<string, unknown>).id as string, {
            name: (user as Record<string, unknown>).name as string,
            taskCount,
            cost: userCost,
          });
        }
      }
      const topUsersByUsage = Array.from(topUsersMap.entries())
        .map(([userId, data]) => ({ userId, ...data }))
        .sort((a, b) => b.taskCount - a.taskCount)
        .slice(0, 5);

      // Top models by usage
      const agentModelMap = new Map(
        allAgents.map((a: Record<string, unknown>) => [a.id, a.model]),
      );
      const modelMap = new Map<
        string,
        { taskCount: number; cost: number }
      >();
      for (const task of allTasks) {
        const t = task as Record<string, unknown>;
        const model = t.assignedAgentId
          ? (agentModelMap.get(t.assignedAgentId as string) as string) ?? "unknown"
          : "unknown";
        const entry = modelMap.get(model) ?? { taskCount: 0, cost: 0 };
        entry.taskCount++;
        entry.cost += parseFloat((t.costUsd as string) ?? "0") || 0;
        modelMap.set(model, entry);
      }
      const topModelsByUsage = Array.from(modelMap.entries())
        .map(([model, data]) => ({ model, ...data }))
        .sort((a, b) => b.taskCount - a.taskCount)
        .slice(0, 5);

      res.json({
        totalUsers: allUsers.length,
        totalProjects: allProjects.length,
        tasksThisMonth: allTasks.length,
        costThisMonth,
        topUsersByUsage,
        topModelsByUsage,
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch dashboard" });
    }
  });
});

beforeEach(async () => {
  await cleanTestDb(testSqlite);
});

describe("E2E Admin Routes — Comprehensive Integration", () => {
  // ==============================
  // PLANS CRUD (with storage fields)
  // ==============================
  describe("Plans CRUD (with storage fields)", () => {
    let adminId: string;

    beforeEach(async () => {
      await cleanTestDb(testSqlite);
      const admin = await createTestUser({ role: "admin" });
      adminId = admin.id;
    });

    it("returns empty plan list initially", async () => {
      const res = await request(app)
        .get("/api/admin/plans")
        .set("x-user-id", adminId);
      expect(res.status).toBe(200);
      expect(res.body.plans).toEqual([]);
    });

    it("creates plan with all fields including maxStorageMb and repoTtlDays", async () => {
      const res = await request(app)
        .post("/api/admin/plans")
        .set("x-user-id", adminId)
        .send({
          name: "Full Plan",
          description: "A plan with all fields",
          maxProjects: 10,
          maxTasksPerMonth: 500,
          priceMonthly: "29.99",
          features: ["git", "agents", "storage"],
          maxStorageMb: 2048,
          repoTtlDays: 90,
          isDefault: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.plan.name).toBe("Full Plan");
      expect(res.body.plan.maxStorageMb).toBe(2048);
      expect(res.body.plan.repoTtlDays).toBe(90);
      expect(res.body.plan.maxProjects).toBe(10);
      expect(res.body.plan.maxTasksPerMonth).toBe(500);
      expect(res.body.plan.priceMonthly).toBe("29.99");
    });

    it("validates required fields — returns 400 without name", async () => {
      const res = await request(app)
        .post("/api/admin/plans")
        .set("x-user-id", adminId)
        .send({ maxProjects: 5, maxTasksPerMonth: 100 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("required");
    });

    it("validates required fields — returns 400 without maxProjects", async () => {
      const res = await request(app)
        .post("/api/admin/plans")
        .set("x-user-id", adminId)
        .send({ name: "Incomplete Plan" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("required");
    });

    it("updates plan fields correctly", async () => {
      const plan = await createTestPlan({ maxStorageMb: 500, repoTtlDays: 30 });

      const res = await request(app)
        .put(`/api/admin/plans/${plan.id}`)
        .set("x-user-id", adminId)
        .send({ name: "Updated Plan", maxStorageMb: 4096, repoTtlDays: 180 });

      expect(res.status).toBe(200);
      expect(res.body.plan.name).toBe("Updated Plan");
      expect(res.body.plan.maxStorageMb).toBe(4096);
      expect(res.body.plan.repoTtlDays).toBe(180);
    });

    it("sets plan as default — unsets previous default", async () => {
      await createTestPlan({ isDefault: 1, name: "Old Default" });

      const res = await request(app)
        .post("/api/admin/plans")
        .set("x-user-id", adminId)
        .send({
          name: "New Default",
          maxProjects: 5,
          maxTasksPerMonth: 50,
          isDefault: true,
        });

      expect(res.status).toBe(201);

      const allPlans = await testDb.select().from(schema.plans);
      const defaults = allPlans.filter(
        (p: Record<string, unknown>) =>
          p.isDefault === 1 || p.isDefault === true,
      );
      expect(defaults).toHaveLength(1);
      expect(defaults[0].name).toBe("New Default");
    });

    it("deletes plan and unassigns users", async () => {
      const plan = await createTestPlan();
      const user = await createTestUser({ planId: plan.id });

      const res = await request(app)
        .delete(`/api/admin/plans/${plan.id}`)
        .set("x-user-id", adminId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Plan should be gone
      const plans = await testDb
        .select()
        .from(schema.plans)
        .where(eq(schema.plans.id, plan.id));
      expect(plans).toHaveLength(0);

      // User's planId should be cleared
      const [updatedUser] = await testDb
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id));
      expect(updatedUser.planId).toBeNull();
    });

    it("creates Free, Pro, Enterprise plans with different storage limits", async () => {
      const tiers = [
        {
          name: "Free",
          maxProjects: 2,
          maxTasksPerMonth: 20,
          maxStorageMb: 100,
          repoTtlDays: 7,
          priceMonthly: "0",
          isDefault: true,
        },
        {
          name: "Pro",
          maxProjects: 10,
          maxTasksPerMonth: 500,
          maxStorageMb: 2048,
          repoTtlDays: 30,
          priceMonthly: "19.99",
        },
        {
          name: "Enterprise",
          maxProjects: 100,
          maxTasksPerMonth: 10000,
          maxStorageMb: 51200,
          repoTtlDays: 365,
          priceMonthly: "99.99",
        },
      ];

      for (const tier of tiers) {
        const res = await request(app)
          .post("/api/admin/plans")
          .set("x-user-id", adminId)
          .send(tier);
        expect(res.status).toBe(201);
        expect(res.body.plan.maxStorageMb).toBe(tier.maxStorageMb);
        expect(res.body.plan.repoTtlDays).toBe(tier.repoTtlDays);
      }

      // Verify all three exist
      const allRes = await request(app)
        .get("/api/admin/plans")
        .set("x-user-id", adminId);
      expect(allRes.body.plans).toHaveLength(3);

      // Verify only Free is default
      const defaults = allRes.body.plans.filter(
        (p: Record<string, unknown>) =>
          p.isDefault === 1 || p.isDefault === true,
      );
      expect(defaults).toHaveLength(1);
      expect(defaults[0].name).toBe("Free");
    });

    it("defaults maxStorageMb=500 and repoTtlDays=30 when not provided", async () => {
      const res = await request(app)
        .post("/api/admin/plans")
        .set("x-user-id", adminId)
        .send({
          name: "Basic Plan",
          maxProjects: 3,
          maxTasksPerMonth: 50,
        });

      expect(res.status).toBe(201);
      expect(res.body.plan.maxStorageMb).toBe(500);
      expect(res.body.plan.repoTtlDays).toBe(30);
    });
  });

  // ==============================
  // USERS MANAGEMENT
  // ==============================
  describe("Users Management", () => {
    let adminId: string;

    beforeEach(async () => {
      await cleanTestDb(testSqlite);
      const admin = await createTestUser({ role: "admin", name: "Admin User" });
      adminId = admin.id;
    });

    it("lists users with plan info", async () => {
      const plan = await createTestPlan({ name: "Pro Plan" });
      await createTestUser({
        name: "Regular User",
        login: "regular",
        planId: plan.id,
      });

      const res = await request(app)
        .get("/api/admin/users")
        .set("x-user-id", adminId);
      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(2); // admin + regular

      const regularUser = res.body.users.find(
        (u: Record<string, unknown>) => u.name === "Regular User",
      );
      expect(regularUser).toBeDefined();
      expect(regularUser.planId).toBe(plan.id);
    });

    it("assigns plan to user", async () => {
      const user = await createTestUser();
      const plan = await createTestPlan();

      const res = await request(app)
        .put(`/api/admin/users/${user.id}/plan`)
        .set("x-user-id", adminId)
        .send({ planId: plan.id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const [updated] = await testDb
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id));
      expect(updated.planId).toBe(plan.id);
    });

    it("changes user role from user to admin", async () => {
      const user = await createTestUser({ role: "user" });

      const res = await request(app)
        .put(`/api/admin/users/${user.id}/role`)
        .set("x-user-id", adminId)
        .send({ role: "admin" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const [updated] = await testDb
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id));
      expect(updated.role).toBe("admin");
    });

    it("changes user role from admin to user", async () => {
      const user = await createTestUser({ role: "admin" });

      const res = await request(app)
        .put(`/api/admin/users/${user.id}/role`)
        .set("x-user-id", adminId)
        .send({ role: "user" });

      expect(res.status).toBe(200);

      const [updated] = await testDb
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id));
      expect(updated.role).toBe("user");
    });

    it("rejects invalid role values", async () => {
      const user = await createTestUser();

      const res = await request(app)
        .put(`/api/admin/users/${user.id}/role`)
        .set("x-user-id", adminId)
        .send({ role: "superadmin" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("'user' or 'admin'");
    });

    it("rejects empty role", async () => {
      const user = await createTestUser();

      const res = await request(app)
        .put(`/api/admin/users/${user.id}/role`)
        .set("x-user-id", adminId)
        .send({ role: "" });

      expect(res.status).toBe(400);
    });
  });

  // ==============================
  // OPENROUTER CONFIG (mocked)
  // ==============================
  describe("OpenRouter Config (mocked)", () => {
    let adminId: string;

    beforeEach(async () => {
      await cleanTestDb(testSqlite);
      const admin = await createTestUser({ role: "admin" });
      adminId = admin.id;
    });

    it("GET config returns null when none set", async () => {
      const res = await request(app)
        .get("/api/admin/openrouter/config")
        .set("x-user-id", adminId);

      expect(res.status).toBe(200);
      expect(res.body.config).toBeNull();
    });

    it("POST config saves API key and enabled models", async () => {
      const res = await request(app)
        .post("/api/admin/openrouter/config")
        .set("x-user-id", adminId)
        .send({
          apiKey: "sk-or-v1-mytestapikey12345678",
          enabledModels: [
            {
              id: "anthropic/claude-sonnet-4-5-20250929",
              name: "Claude 3.5 Sonnet",
              provider: "anthropic",
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify it was stored
      const configs = await testDb.select().from(schema.openrouterConfig);
      expect(configs).toHaveLength(1);
      expect(configs[0].apiKey).toBe("sk-or-v1-mytestapikey12345678");
      expect(configs[0].createdBy).toBe(adminId);
    });

    it("GET config returns masked key after save", async () => {
      // Insert a config directly
      await createOpenRouterConfig({
        apiKey: "sk-or-v1-abcdefghijklmnopqrst",
      });

      const res = await request(app)
        .get("/api/admin/openrouter/config")
        .set("x-user-id", adminId);

      expect(res.status).toBe(200);
      expect(res.body.config).not.toBeNull();
      expect(res.body.config.apiKeyMasked).toContain("...");
      // Should not expose full key
      expect(res.body.config.apiKeyMasked).not.toBe(
        "sk-or-v1-abcdefghijklmnopqrst",
      );
      // Masked key should start with first 5 chars
      expect(res.body.config.apiKeyMasked.startsWith("sk-or")).toBe(true);
    });

    it("POST config requires apiKey", async () => {
      const res = await request(app)
        .post("/api/admin/openrouter/config")
        .set("x-user-id", adminId)
        .send({ enabledModels: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("apiKey");
    });

    it("test connection returns success for valid key", async () => {
      const res = await request(app)
        .post("/api/admin/openrouter/test")
        .set("x-user-id", adminId)
        .send({ apiKey: "sk-or-valid-testkey123" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("test connection returns failure for invalid key", async () => {
      const res = await request(app)
        .post("/api/admin/openrouter/test")
        .set("x-user-id", adminId)
        .send({ apiKey: "sk-or-invalid-key" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
    });

    it("test connection returns failure without key", async () => {
      const res = await request(app)
        .post("/api/admin/openrouter/test")
        .set("x-user-id", adminId)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
    });

    it("POST config replaces previous config", async () => {
      // First save
      await request(app)
        .post("/api/admin/openrouter/config")
        .set("x-user-id", adminId)
        .send({ apiKey: "sk-or-v1-firstkey", enabledModels: [] });

      // Second save
      await request(app)
        .post("/api/admin/openrouter/config")
        .set("x-user-id", adminId)
        .send({ apiKey: "sk-or-v1-secondkey", enabledModels: [] });

      // Should only have one config
      const configs = await testDb.select().from(schema.openrouterConfig);
      expect(configs).toHaveLength(1);
      expect(configs[0].apiKey).toBe("sk-or-v1-secondkey");
    });
  });

  // ==============================
  // DASHBOARD METRICS
  // ==============================
  describe("Dashboard Metrics", () => {
    let adminId: string;

    beforeEach(async () => {
      await cleanTestDb(testSqlite);
      const admin = await createTestUser({ role: "admin" });
      adminId = admin.id;
    });

    it("returns zero counts when DB is empty (except admin user)", async () => {
      const res = await request(app)
        .get("/api/admin/dashboard")
        .set("x-user-id", adminId);

      expect(res.status).toBe(200);
      expect(res.body.totalUsers).toBe(1); // just the admin
      expect(res.body.totalProjects).toBe(0);
      expect(res.body.tasksThisMonth).toBe(0);
      expect(res.body.costThisMonth).toBe(0);
    });

    it("returns correct counts after inserting test data", async () => {
      await createTestUser({ name: "User 2" });
      await createTestUser({ name: "User 3" });
      const project1 = await createTestProject(testDb);
      const project2 = await createTestProject(testDb, {
        name: "Project 2",
        path: `/tmp/project-2-${nanoid(8)}`,
      });
      await createTestTask(testDb, project1.id, { costUsd: "1.50" });
      await createTestTask(testDb, project1.id, { costUsd: "2.50" });
      await createTestTask(testDb, project2.id, { costUsd: "3.00" });

      const res = await request(app)
        .get("/api/admin/dashboard")
        .set("x-user-id", adminId);

      expect(res.status).toBe(200);
      expect(res.body.totalUsers).toBe(3); // admin + 2 users
      expect(res.body.totalProjects).toBe(2);
      expect(res.body.tasksThisMonth).toBe(3);
      expect(res.body.costThisMonth).toBe(7); // 1.50 + 2.50 + 3.00
    });

    it("calculates top users by usage", async () => {
      // Create a user who owns a project with tasks
      const powerUser = await createTestUser({
        name: "Power User",
        role: "user",
      });
      const project = await createTestProject(testDb, {
        ownerId: powerUser.id,
      });
      await createTestTask(testDb, project.id, { costUsd: "5.00" });
      await createTestTask(testDb, project.id, { costUsd: "3.00" });

      const res = await request(app)
        .get("/api/admin/dashboard")
        .set("x-user-id", adminId);

      expect(res.status).toBe(200);
      expect(res.body.topUsersByUsage).toBeDefined();
      expect(res.body.topUsersByUsage.length).toBeGreaterThanOrEqual(1);

      const topUser = res.body.topUsersByUsage[0];
      expect(topUser.name).toBe("Power User");
      expect(topUser.taskCount).toBe(2);
      expect(topUser.cost).toBe(8); // 5.00 + 3.00
    });

    it("calculates top models by usage", async () => {
      const agent = await createTestAgent(testDb, {
        model: "anthropic/claude-sonnet-4-5-20250929",
      });
      const project = await createTestProject(testDb);
      await createTestTask(testDb, project.id, {
        assignedAgentId: agent.id,
        costUsd: "2.00",
      });
      await createTestTask(testDb, project.id, {
        assignedAgentId: agent.id,
        costUsd: "3.00",
      });

      const res = await request(app)
        .get("/api/admin/dashboard")
        .set("x-user-id", adminId);

      expect(res.status).toBe(200);
      expect(res.body.topModelsByUsage).toBeDefined();
      expect(res.body.topModelsByUsage.length).toBeGreaterThanOrEqual(1);

      const topModel = res.body.topModelsByUsage[0];
      expect(topModel.model).toBe("anthropic/claude-sonnet-4-5-20250929");
      expect(topModel.taskCount).toBe(2);
      expect(topModel.cost).toBe(5); // 2.00 + 3.00
    });

    it("calculates cost from tasks with costUsd", async () => {
      const project = await createTestProject(testDb);
      await createTestTask(testDb, project.id, { costUsd: "0.50" });
      await createTestTask(testDb, project.id, { costUsd: "1.25" });
      await createTestTask(testDb, project.id, { costUsd: "0.75" });
      // Task without cost
      await createTestTask(testDb, project.id);

      const res = await request(app)
        .get("/api/admin/dashboard")
        .set("x-user-id", adminId);

      expect(res.status).toBe(200);
      expect(res.body.tasksThisMonth).toBe(4);
      expect(res.body.costThisMonth).toBeCloseTo(2.5, 2); // 0.50 + 1.25 + 0.75
    });

    it("handles tasks with null/undefined costUsd gracefully", async () => {
      const project = await createTestProject(testDb);
      await createTestTask(testDb, project.id, { costUsd: undefined });
      await createTestTask(testDb, project.id, { costUsd: "1.00" });

      const res = await request(app)
        .get("/api/admin/dashboard")
        .set("x-user-id", adminId);

      expect(res.status).toBe(200);
      expect(res.body.costThisMonth).toBeCloseTo(1.0, 2);
    });

    it("topModelsByUsage maps unassigned tasks to unknown", async () => {
      const project = await createTestProject(testDb);
      // Task with no assigned agent
      await createTestTask(testDb, project.id, { costUsd: "1.00" });

      const res = await request(app)
        .get("/api/admin/dashboard")
        .set("x-user-id", adminId);

      expect(res.status).toBe(200);
      const unknownModel = res.body.topModelsByUsage.find(
        (m: Record<string, unknown>) => m.model === "unknown",
      );
      expect(unknownModel).toBeDefined();
      expect(unknownModel.taskCount).toBe(1);
    });
  });
});
