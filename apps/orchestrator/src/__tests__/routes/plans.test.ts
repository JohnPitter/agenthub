import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createTestDb,
  createTestProject,
  createTestTask,
  cleanTestDb,
} from "../../test/helpers";
import * as schema from "@agenthub/database/schema";
import { eq, and, gte, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import express from "express";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testDb: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testSqlite: any;
let app: express.Express;

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

  // Inject userId from header (simulating auth middleware)
  app.use((req, _res, next) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (userId) {
      (req as express.Request & { user: { userId: string } }).user = { userId };
    }
    next();
  });

  // ---- Plan routes ----

  // GET /api/plans — list all plans (public)
  app.get("/api/plans", async (_req, res) => {
    try {
      const plans = await testDb.select().from(schema.plans);
      res.json({ plans });
    } catch {
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });

  // PUT /api/plans/select — user selects a plan
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

  // GET /api/plans/my-usage — user's usage vs plan limits
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

  // GET /api/plans/models — public models endpoint
  app.get("/api/plans/models", async (_req, res) => {
    try {
      const configs = await testDb.select().from(schema.openrouterConfig);
      const config = configs[0];
      if (!config) { res.json({ models: [] }); return; }
      const enabledModels = config.enabledModels ? JSON.parse(config.enabledModels) : [];
      res.json({ models: enabledModels });
    } catch {
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });
});

beforeEach(async () => {
  await cleanTestDb(testSqlite);
});

describe("Plans Routes — Integration", () => {
  // ---- GET /api/plans ----
  describe("GET /api/plans", () => {
    it("returns empty list when no plans exist", async () => {
      const res = await request(app).get("/api/plans");
      expect(res.status).toBe(200);
      expect(res.body.plans).toEqual([]);
    });

    it("returns all plans", async () => {
      await createTestPlan({ name: "Free" });
      await createTestPlan({ name: "Pro" });
      await createTestPlan({ name: "Team" });

      const res = await request(app).get("/api/plans");
      expect(res.status).toBe(200);
      expect(res.body.plans).toHaveLength(3);
    });
  });

  // ---- PUT /api/plans/select ----
  describe("PUT /api/plans/select", () => {
    it("allows user to select a plan", async () => {
      const user = await createTestUser();
      const plan = await createTestPlan();

      const res = await request(app)
        .put("/api/plans/select")
        .set("x-user-id", user.id)
        .send({ planId: plan.id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const [updatedUser] = await testDb.select().from(schema.users).where(eq(schema.users.id, user.id));
      expect(updatedUser.planId).toBe(plan.id);
    });

    it("returns 404 for nonexistent plan", async () => {
      const user = await createTestUser();

      const res = await request(app)
        .put("/api/plans/select")
        .set("x-user-id", user.id)
        .send({ planId: "nonexistent" });

      expect(res.status).toBe(404);
    });

    it("clears plan when planId is null", async () => {
      const plan = await createTestPlan();
      const user = await createTestUser({ planId: plan.id });

      const res = await request(app)
        .put("/api/plans/select")
        .set("x-user-id", user.id)
        .send({ planId: null });

      expect(res.status).toBe(200);

      const [updatedUser] = await testDb.select().from(schema.users).where(eq(schema.users.id, user.id));
      expect(updatedUser.planId).toBeNull();
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app)
        .put("/api/plans/select")
        .send({ planId: "some-id" });

      expect(res.status).toBe(401);
    });
  });

  // ---- GET /api/plans/my-usage ----
  describe("GET /api/plans/my-usage", () => {
    it("returns plan and usage for user", async () => {
      const plan = await createTestPlan({ name: "Pro", maxProjects: 10, maxTasksPerMonth: 200 });
      const user = await createTestUser({ planId: plan.id });

      // Create project owned by user
      const project = await createTestProject(testDb, { ownerId: user.id });
      await createTestTask(testDb, project.id);
      await createTestTask(testDb, project.id);

      const res = await request(app)
        .get("/api/plans/my-usage")
        .set("x-user-id", user.id);

      expect(res.status).toBe(200);
      expect(res.body.plan.name).toBe("Pro");
      expect(res.body.plan.maxProjects).toBe(10);
      expect(res.body.usage.projects).toBe(1);
      expect(res.body.usage.tasksThisMonth).toBe(2);
    });

    it("returns default plan if user has none", async () => {
      await createTestPlan({ name: "Default Free", isDefault: 1, maxProjects: 3 });
      const user = await createTestUser(); // no planId

      const res = await request(app)
        .get("/api/plans/my-usage")
        .set("x-user-id", user.id);

      expect(res.status).toBe(200);
      expect(res.body.plan.name).toBe("Default Free");
      expect(res.body.plan.maxProjects).toBe(3);
    });

    it("returns null plan if no plan and no default", async () => {
      const user = await createTestUser();

      const res = await request(app)
        .get("/api/plans/my-usage")
        .set("x-user-id", user.id);

      expect(res.status).toBe(200);
      expect(res.body.plan).toBeNull();
      expect(res.body.usage.projects).toBe(0);
      expect(res.body.usage.tasksThisMonth).toBe(0);
    });

    it("returns 401 without auth", async () => {
      const res = await request(app).get("/api/plans/my-usage");
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /api/plans/models ----
  describe("GET /api/plans/models", () => {
    it("returns empty array when no config exists", async () => {
      const res = await request(app).get("/api/plans/models");
      expect(res.status).toBe(200);
      expect(res.body.models).toEqual([]);
    });

    it("returns enabled models from openrouter config", async () => {
      const models = [
        { id: "openai/gpt-4", name: "GPT-4", provider: "openai" },
        { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "anthropic" },
      ];

      await testDb.insert(schema.openrouterConfig).values({
        id: nanoid(),
        apiKey: "encrypted-key",
        enabledModels: JSON.stringify(models),
        createdBy: "admin-id",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app).get("/api/plans/models");
      expect(res.status).toBe(200);
      expect(res.body.models).toHaveLength(2);
      expect(res.body.models[0].id).toBe("openai/gpt-4");
      expect(res.body.models[1].id).toBe("anthropic/claude-3.5-sonnet");
    });
  });
});
