import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, and, gte, count, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { adminMiddleware } from "../middleware/admin.js";
import {
  fetchAvailableModels,
  validateApiKey,
  getOpenRouterConfig,
  getDecryptedApiKey,
  saveOpenRouterConfig,
  maskApiKey,
} from "../services/openrouter-service.js";
import { safeDecrypt } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";

const router: ReturnType<typeof Router> = Router();

// All admin routes require admin role
router.use(adminMiddleware);

// ===== PLANS =====

// GET /api/admin/plans — List all plans
router.get("/plans", async (_req, res) => {
  try {
    const plans = await db.select().from(schema.plans);
    res.json({ plans });
  } catch (err) {
    logger.error(`Failed to fetch plans: ${err}`, "admin");
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

// POST /api/admin/plans — Create a plan
router.post("/plans", async (req, res) => {
  try {
    const { name, description, maxProjects, maxTasksPerMonth, priceMonthly, features, isDefault, maxStorageMb, repoTtlDays, allowedModels } = req.body;

    if (!name || maxProjects == null || maxTasksPerMonth == null) {
      res.status(400).json({ error: "name, maxProjects, and maxTasksPerMonth are required" });
      return;
    }

    // If this plan is default, unset other defaults
    if (isDefault) {
      await db.update(schema.plans).set({ isDefault: false }).where(eq(schema.plans.isDefault, true));
    }

    const plan = {
      id: nanoid(),
      name,
      description: description ?? null,
      maxProjects: maxProjects,
      maxTasksPerMonth: maxTasksPerMonth,
      priceMonthly: priceMonthly ?? "0",
      features: features ?? [],
      maxStorageMb: maxStorageMb ?? 500,
      repoTtlDays: repoTtlDays ?? 30,
      allowedModels: Array.isArray(allowedModels) ? allowedModels : [],
      isDefault: isDefault ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(schema.plans).values(plan);
    logger.info(`Plan created: ${name}`, "admin");
    res.status(201).json({ plan });
  } catch (err) {
    logger.error(`Failed to create plan: ${err}`, "admin");
    res.status(500).json({ error: "Failed to create plan" });
  }
});

// PUT /api/admin/plans/:id — Update a plan
router.put("/plans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // If setting as default, unset other defaults
    if (updates.isDefault) {
      await db.update(schema.plans).set({ isDefault: false }).where(eq(schema.plans.isDefault, true));
    }

    await db.update(schema.plans).set({
      ...updates,
      updatedAt: new Date(),
    }).where(eq(schema.plans.id, id));

    const [updated] = await db.select().from(schema.plans).where(eq(schema.plans.id, id));
    res.json({ plan: updated });
  } catch (err) {
    logger.error(`Failed to update plan: ${err}`, "admin");
    res.status(500).json({ error: "Failed to update plan" });
  }
});

// DELETE /api/admin/plans/:id — Delete a plan
router.delete("/plans/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Unassign users from this plan
    await db.update(schema.users).set({ planId: null }).where(eq(schema.users.planId, id));

    await db.delete(schema.plans).where(eq(schema.plans.id, id));
    logger.info(`Plan deleted: ${id}`, "admin");
    res.json({ success: true });
  } catch (err) {
    logger.error(`Failed to delete plan: ${err}`, "admin");
    res.status(500).json({ error: "Failed to delete plan" });
  }
});

// ===== USERS =====

// GET /api/admin/users — List all users with plan and usage info
router.get("/users", async (_req, res) => {
  try {
    const usersRaw = await db.select().from(schema.users);

    // Get month start for task counting
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Batch: project counts per owner
    const projectCounts = await db
      .select({ ownerId: schema.projects.ownerId, count: count() })
      .from(schema.projects)
      .groupBy(schema.projects.ownerId);
    const projectCountMap = new Map(projectCounts.map(r => [r.ownerId, Number(r.count)]));

    // Batch: task counts per owner this month (JOIN tasks + projects)
    const taskCounts = await db
      .select({
        ownerId: schema.projects.ownerId,
        count: count(),
      })
      .from(schema.tasks)
      .innerJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
      .where(gte(schema.tasks.createdAt, monthStart))
      .groupBy(schema.projects.ownerId);
    const taskCountMap = new Map(taskCounts.map(r => [r.ownerId, Number(r.count)]));

    // Batch: plan names
    const allPlans = await db.select({ id: schema.plans.id, name: schema.plans.name }).from(schema.plans);
    const planNameMap = new Map(allPlans.map(p => [p.id, p.name]));

    const users = usersRaw.map((user) => ({
      id: user.id,
      login: user.login,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      planId: user.planId,
      planName: user.planId ? planNameMap.get(user.planId) ?? null : null,
      projectCount: projectCountMap.get(user.id) ?? 0,
      taskCountThisMonth: taskCountMap.get(user.id) ?? 0,
      createdAt: user.createdAt,
    }));

    res.json({ users });
  } catch (err) {
    logger.error(`Failed to fetch users: ${err}`, "admin");
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// PUT /api/admin/users/:id/plan — Assign plan to user
router.put("/users/:id/plan", async (req, res) => {
  try {
    const { id } = req.params;
    const { planId } = req.body;

    await db.update(schema.users).set({ planId: planId ?? null, updatedAt: new Date() }).where(eq(schema.users.id, id));
    res.json({ success: true });
  } catch (err) {
    logger.error(`Failed to update user plan: ${err}`, "admin");
    res.status(500).json({ error: "Failed to update user plan" });
  }
});

// PUT /api/admin/users/:id/role — Change user role
router.put("/users/:id/role", async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (role !== "user" && role !== "admin") {
      res.status(400).json({ error: "Role must be 'user' or 'admin'" });
      return;
    }

    await db.update(schema.users).set({ role, updatedAt: new Date() }).where(eq(schema.users.id, id));
    logger.info(`User ${id} role changed to ${role}`, "admin");
    res.json({ success: true });
  } catch (err) {
    logger.error(`Failed to update user role: ${err}`, "admin");
    res.status(500).json({ error: "Failed to update user role" });
  }
});

// ===== OPENROUTER =====

// GET /api/admin/openrouter/config — Get current config (key masked)
router.get("/openrouter/config", async (_req, res) => {
  try {
    const config = await getOpenRouterConfig();
    if (!config) {
      res.json({ config: null });
      return;
    }

    const decryptedKey = safeDecrypt(config.apiKey);
    res.json({
      config: {
        id: config.id,
        apiKeyMasked: maskApiKey(decryptedKey),
        enabledModels: config.enabledModels,
        updatedAt: config.updatedAt,
      },
    });
  } catch (err) {
    logger.error(`Failed to fetch OpenRouter config: ${err}`, "admin");
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

// POST /api/admin/openrouter/config — Save API key + enabled models
router.post("/openrouter/config", async (req, res) => {
  try {
    const { apiKey, enabledModels } = req.body;
    const userId = req.user!.userId;

    if (!apiKey) {
      res.status(400).json({ error: "apiKey is required" });
      return;
    }

    await saveOpenRouterConfig(apiKey, enabledModels ?? [], userId);
    res.json({ success: true });
  } catch (err) {
    logger.error(`Failed to save OpenRouter config: ${err}`, "admin");
    res.status(500).json({ error: "Failed to save config" });
  }
});

// GET /api/admin/openrouter/models — Fetch all models from OpenRouter API
router.get("/openrouter/models", async (_req, res) => {
  try {
    const apiKey = await getDecryptedApiKey();
    if (!apiKey) {
      res.status(400).json({ error: "OpenRouter API key not configured" });
      return;
    }

    const models = await fetchAvailableModels(apiKey);
    res.json({ models });
  } catch (err) {
    logger.error(`Failed to fetch OpenRouter models: ${err}`, "admin");
    res.status(500).json({ error: "Failed to fetch models" });
  }
});

// POST /api/admin/openrouter/test — Test connection
router.post("/openrouter/test", async (req, res) => {
  try {
    const { apiKey } = req.body;
    const key = apiKey ?? await getDecryptedApiKey();

    if (!key) {
      res.json({ success: false, error: "No API key provided" });
      return;
    }

    const valid = await validateApiKey(key);
    res.json({ success: valid });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// ===== DASHBOARD =====

// GET /api/admin/dashboard — Global metrics
router.get("/dashboard", async (_req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Total users
    const [userCount] = await db.select({ count: count() }).from(schema.users);

    // Total projects
    const [projectCount] = await db.select({ count: count() }).from(schema.projects);

    // Tasks this month
    const [taskCount] = await db.select({ count: count() }).from(schema.tasks).where(gte(schema.tasks.createdAt, monthStart));

    // Cost this month
    const tasksThisMonth = await db.select({
      costUsd: schema.tasks.costUsd,
    }).from(schema.tasks).where(gte(schema.tasks.createdAt, monthStart));

    const costThisMonth = tasksThisMonth.reduce((sum, t) => sum + (parseFloat(t.costUsd ?? "0") || 0), 0);

    // Tasks trend (last 30 days, grouped by day)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentTasks = await db.select({
      createdAt: schema.tasks.createdAt,
      costUsd: schema.tasks.costUsd,
    }).from(schema.tasks).where(gte(schema.tasks.createdAt, thirtyDaysAgo));

    const trendMap = new Map<string, { count: number; cost: number }>();
    for (const task of recentTasks) {
      const date = task.createdAt.toISOString().slice(0, 10);
      const entry = trendMap.get(date) ?? { count: 0, cost: 0 };
      entry.count++;
      entry.cost += parseFloat(task.costUsd ?? "0") || 0;
      trendMap.set(date, entry);
    }

    const tasksTrend = Array.from(trendMap.entries())
      .map(([date, { count: c, cost }]) => ({ date, count: c, cost }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top users by usage (task count this month) — single JOIN query
    const userTaskStats = await db
      .select({
        userId: schema.projects.ownerId,
        taskCount: count(schema.tasks.id),
        totalCost: sql<string>`COALESCE(SUM(${schema.tasks.costUsd}::numeric), 0)`,
      })
      .from(schema.tasks)
      .innerJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
      .where(gte(schema.tasks.createdAt, monthStart))
      .groupBy(schema.projects.ownerId);

    const allUsers = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users);
    const userNameMap = new Map(allUsers.map(u => [u.id, u.name]));

    const topUsers = userTaskStats
      .filter(s => s.userId)
      .map(s => ({
        userId: s.userId!,
        name: userNameMap.get(s.userId!) ?? "Unknown",
        taskCount: Number(s.taskCount),
        cost: parseFloat(s.totalCost) || 0,
      }))
      .sort((a, b) => b.taskCount - a.taskCount);

    // Top models by usage
    const modelMap = new Map<string, { taskCount: number; cost: number }>();
    const allAgents = await db.select({ id: schema.agents.id, model: schema.agents.model }).from(schema.agents);
    const agentModelMap = new Map(allAgents.map((a) => [a.id, a.model]));

    const monthTasks = await db.select({
      assignedAgentId: schema.tasks.assignedAgentId,
      costUsd: schema.tasks.costUsd,
    }).from(schema.tasks).where(gte(schema.tasks.createdAt, monthStart));

    for (const task of monthTasks) {
      const model = task.assignedAgentId ? agentModelMap.get(task.assignedAgentId) ?? "unknown" : "unknown";
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
      totalUsers: userCount?.count ?? 0,
      totalProjects: projectCount?.count ?? 0,
      tasksThisMonth: taskCount?.count ?? 0,
      costThisMonth,
      tasksTrend,
      topUsersByUsage: topUsers.slice(0, 5),
      topModelsByUsage: topModels,
    });
  } catch (err) {
    logger.error(`Failed to fetch dashboard metrics: ${err}`, "admin");
    res.status(500).json({ error: "Failed to fetch dashboard" });
  }
});

export { router as adminRouter };
