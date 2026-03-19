import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, and, gte, count } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/plans — List available plans (public for authenticated users)
router.get("/", async (_req, res) => {
  try {
    const plans = await db.select().from(schema.plans);
    res.json({ plans });
  } catch (err) {
    logger.error(`Failed to fetch plans: ${err}`, "plans");
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

// PUT /api/plans/select — User selects a plan for themselves
router.put("/select", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { planId } = req.body;

    if (planId) {
      const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, planId));
      if (!plan) {
        res.status(404).json({ error: "Plan not found" });
        return;
      }
    }

    await db.update(schema.users).set({ planId: planId ?? null, updatedAt: new Date() }).where(eq(schema.users.id, userId));
    res.json({ success: true });
  } catch (err) {
    logger.error(`Failed to select plan: ${err}`, "plans");
    res.status(500).json({ error: "Failed to select plan" });
  }
});

// GET /api/plans/my-usage — User's current usage vs plan limits
router.get("/my-usage", async (req, res) => {
  try {
    const userId = req.user!.userId;

    // Get user's plan
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let plan = null;
    if (user.planId) {
      const [p] = await db.select().from(schema.plans).where(eq(schema.plans.id, user.planId));
      plan = p ?? null;
    }

    // If no plan, try default
    if (!plan) {
      const [defaultPlan] = await db.select().from(schema.plans).where(eq(schema.plans.isDefault, true));
      plan = defaultPlan ?? null;
    }

    // Count projects
    const [projectCount] = await db.select({ count: count() }).from(schema.projects).where(eq(schema.projects.ownerId, userId));

    // Count tasks this month (single JOIN query)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [taskResult] = await db
      .select({ count: count() })
      .from(schema.tasks)
      .innerJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
      .where(and(eq(schema.projects.ownerId, userId), gte(schema.tasks.createdAt, monthStart)));
    const taskCount = taskResult?.count ?? 0;

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
  } catch (err) {
    logger.error(`Failed to fetch user usage: ${err}`, "plans");
    res.status(500).json({ error: "Failed to fetch usage" });
  }
});

// GET /api/plans/models — Get enabled models, filtered by user's plan allowedModels
router.get("/models", async (req, res) => {
  try {
    const userId = req.user?.userId;

    // Get all enabled models from OpenRouter config
    const configs = await db.select().from(schema.openrouterConfig);
    const config = configs[0];
    if (!config) {
      res.json({ models: [] });
      return;
    }
    const allEnabledModels = (config.enabledModels as { id: string; name: string; provider: string }[]) ?? [];

    // If user is authenticated, filter by their plan's allowed models
    if (userId) {
      const [user] = await db.select({ planId: schema.users.planId }).from(schema.users).where(eq(schema.users.id, userId));
      if (user?.planId) {
        const [plan] = await db.select({ allowedModels: schema.plans.allowedModels }).from(schema.plans).where(eq(schema.plans.id, user.planId));
        const planModels = (plan?.allowedModels as string[]) ?? [];
        if (planModels.length > 0) {
          // Filter to only allowed models
          const allowedSet = new Set(planModels);
          const filtered = allEnabledModels.filter((m) => allowedSet.has(m.id));
          res.json({ models: filtered });
          return;
        }
      }
    }

    // No restriction — return all enabled models
    res.json({ models: allEnabledModels });
  } catch (err) {
    logger.error(`Failed to fetch enabled models: ${err}`, "plans");
    res.status(500).json({ error: "Failed to fetch models" });
  }
});

export { router as plansRouter };
