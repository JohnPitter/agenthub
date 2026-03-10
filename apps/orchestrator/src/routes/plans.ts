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

    // Count tasks this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const userProjects = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.ownerId, userId));
    let taskCount = 0;
    for (const p of userProjects) {
      const [tc] = await db.select({ count: count() }).from(schema.tasks).where(
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
  } catch (err) {
    logger.error(`Failed to fetch user usage: ${err}`, "plans");
    res.status(500).json({ error: "Failed to fetch usage" });
  }
});

// GET /api/plans/models — Public endpoint: get enabled models from OpenRouter config
router.get("/models", async (_req, res) => {
  try {
    const configs = await db.select().from(schema.openrouterConfig);
    const config = configs[0];
    if (!config) {
      res.json({ models: [] });
      return;
    }
    const enabledModels = (config.enabledModels as { id: string; name: string; provider: string }[]) ?? [];
    res.json({ models: enabledModels });
  } catch (err) {
    logger.error(`Failed to fetch enabled models: ${err}`, "plans");
    res.status(500).json({ error: "Failed to fetch models" });
  }
});

export { router as plansRouter };
