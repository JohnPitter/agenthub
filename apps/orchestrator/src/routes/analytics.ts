import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, and, gte, count, sql } from "drizzle-orm";
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
      const completedTasks = tasks.filter((t) => t.status === "done").length;
      const failedTasks = tasks.filter((t) => t.status === "failed").length;
      const inProgressTasks = tasks.filter(
        (t) => t.status === "in_progress" || t.status === "assigned"
      ).length;

      const successRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      // Calculate average completion time for done tasks
      const doneTasks = tasks.filter((t) => t.status === "done" && t.completedAt);
      let avgCompletionTime: number | null = null;

      if (doneTasks.length > 0) {
        const totalTime = doneTasks.reduce((sum, task) => {
          if (task.completedAt && task.createdAt) {
            return (
              sum +
              (new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime())
            );
          }
          return sum;
        }, 0);
        avgCompletionTime = totalTime / doneTasks.length; // in milliseconds
      }

      // Count tasks by status
      const tasksByStatus = {
        pending: tasks.filter((t) => t.status === "pending").length,
        assigned: tasks.filter((t) => t.status === "assigned").length,
        in_progress: tasks.filter((t) => t.status === "in_progress").length,
        review: tasks.filter((t) => t.status === "review").length,
        done: completedTasks,
        failed: failedTasks,
      };

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
    logger.error("Failed to get agent metrics", { error });
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
    logger.error("Failed to get trends", { error });
    res.status(500).json({ error: "Failed to get trends" });
  }
});

export { router as analyticsRouter };
