import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, and, gte } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

interface AgentMetrics {
  agentId: string;
  agentName: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  inProgressTasks: number;
  successRate: number;
  avgCompletionTime: number | null;
  tasksByStatus: {
    pending: number;
    assigned: number;
    in_progress: number;
    review: number;
    done: number;
    failed: number;
  };
}

interface TrendDataPoint {
  date: string;
  completed: number;
  failed: number;
  total: number;
}

/**
 * GET /api/analytics/agents
 * Get performance metrics for all agents
 * Query params: period (7d, 30d, all), projectId (optional)
 */
router.get("/analytics/agents", async (req, res) => {
  try {
    const { period = "30d", projectId } = req.query;

    // Calculate date threshold based on period
    let dateThreshold: Date | null = null;
    if (period === "7d") {
      dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - 7);
    } else if (period === "30d") {
      dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - 30);
    }

    // Get all agents
    const agents = await db.select().from(schema.agents).all();

    const metrics: AgentMetrics[] = [];

    for (const agent of agents) {
      // Build where conditions
      const conditions = [eq(schema.tasks.assignedAgentId, agent.id)];
      if (projectId && typeof projectId === "string") {
        conditions.push(eq(schema.tasks.projectId, projectId));
      }
      if (dateThreshold) {
        conditions.push(gte(schema.tasks.createdAt, dateThreshold));
      }

      // Get all tasks for this agent
      const tasks = await db
        .select()
        .from(schema.tasks)
        .where(and(...conditions))
        .all();

      const totalTasks = tasks.length;

      // Single pass to count by status and accumulate completion times
      const tasksByStatus = { pending: 0, assigned: 0, in_progress: 0, review: 0, done: 0, failed: 0 };
      let totalCompletionTime = 0;
      let doneWithTimeCount = 0;

      for (const t of tasks) {
        const status = t.status as keyof typeof tasksByStatus;
        if (status in tasksByStatus) tasksByStatus[status]++;
        if (t.status === "done" && t.completedAt && t.createdAt) {
          totalCompletionTime += new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime();
          doneWithTimeCount++;
        }
      }

      const completedTasks = tasksByStatus.done;
      const failedTasks = tasksByStatus.failed;
      const inProgressTasks = tasksByStatus.in_progress + tasksByStatus.assigned;
      const successRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
      const avgCompletionTime = doneWithTimeCount > 0 ? totalCompletionTime / doneWithTimeCount : null;

      metrics.push({
        agentId: agent.id,
        agentName: agent.name,
        totalTasks,
        completedTasks,
        failedTasks,
        inProgressTasks,
        successRate,
        avgCompletionTime,
        tasksByStatus,
      });
    }

    // Sort by total tasks (most active first)
    metrics.sort((a, b) => b.totalTasks - a.totalTasks);

    res.json({ metrics });
  } catch (error) {
    logger.error(`Failed to get agent metrics: ${error}`, "analytics-route");
    res.status(500).json({ error: "Failed to get agent metrics" });
  }
});

/**
 * GET /api/analytics/trends
 * Get task completion trends over time
 * Query params: period (7d, 30d, all), projectId (optional)
 */
router.get("/analytics/trends", async (req, res) => {
  try {
    const { period = "30d", projectId } = req.query;

    // Calculate date threshold and days
    let dateThreshold: Date;
    let days: number;

    if (period === "7d") {
      dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - 7);
      days = 7;
    } else if (period === "30d") {
      dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - 30);
      days = 30;
    } else {
      // "all" - get data from last 90 days
      dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - 90);
      days = 90;
    }

    // Build where conditions
    const conditions = [gte(schema.tasks.createdAt, dateThreshold)];
    if (projectId && typeof projectId === "string") {
      conditions.push(eq(schema.tasks.projectId, projectId));
    }

    // Get all tasks in the period
    const tasks = await db
      .select()
      .from(schema.tasks)
      .where(and(...conditions))
      .all();

    // Group tasks by date
    const trendMap = new Map<string, { completed: number; failed: number; total: number }>();

    // Initialize all dates in range
    for (let i = 0; i < days; i++) {
      const date = new Date(dateThreshold);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split("T")[0];
      trendMap.set(dateKey, { completed: 0, failed: 0, total: 0 });
    }

    // Count tasks by date
    for (const task of tasks) {
      const dateKey = new Date(task.createdAt).toISOString().split("T")[0];
      const data = trendMap.get(dateKey);

      if (data) {
        data.total += 1;
        if (task.status === "done") data.completed += 1;
        if (task.status === "failed") data.failed += 1;
      }
    }

    // Convert to array
    const trends: TrendDataPoint[] = Array.from(trendMap.entries())
      .map(([date, data]) => ({
        date,
        completed: data.completed,
        failed: data.failed,
        total: data.total,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ trends });
  } catch (error) {
    logger.error(`Failed to get trends: ${error}`, "analytics-route");
    res.status(500).json({ error: "Failed to get trends" });
  }
});

export { router as analyticsRouter };
