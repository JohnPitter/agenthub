import { db, schema } from "@agenthub/database";
import { eq, and, gte, count } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export interface LimitCheckResult {
  allowed: boolean;
  current: number;
  max: number;
  message?: string;
}

export async function checkPlanLimits(userId: string, resource: "project" | "task"): Promise<LimitCheckResult> {
  try {
    // Get user
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!user) return { allowed: true, current: 0, max: Infinity };

    // Get plan (user's or default)
    let plan = null;
    if (user.planId) {
      const [p] = await db.select().from(schema.plans).where(eq(schema.plans.id, user.planId));
      plan = p;
    }
    if (!plan) {
      const [defaultPlan] = await db.select().from(schema.plans).where(eq(schema.plans.isDefault, true));
      plan = defaultPlan;
    }

    // No plan = no limits
    if (!plan) return { allowed: true, current: 0, max: Infinity };

    if (resource === "project") {
      const [result] = await db.select({ count: count() }).from(schema.projects).where(eq(schema.projects.ownerId, userId));
      const current = result?.count ?? 0;
      const max = plan.maxProjects;
      if (current >= max) {
        return { allowed: false, current, max, message: `Project limit reached (${current}/${max}). Upgrade your plan.` };
      }
      return { allowed: true, current, max };
    }

    if (resource === "task") {
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
      const max = plan.maxTasksPerMonth;
      if (taskCount >= max) {
        return { allowed: false, current: taskCount, max, message: `Monthly task limit reached (${taskCount}/${max}). Upgrade your plan.` };
      }
      return { allowed: true, current: taskCount, max };
    }

    return { allowed: true, current: 0, max: Infinity };
  } catch (err) {
    logger.error(`Plan limit check failed: ${err}`, "plan-limits");
    // Fail open — don't block if we can't check
    return { allowed: true, current: 0, max: Infinity };
  }
}
