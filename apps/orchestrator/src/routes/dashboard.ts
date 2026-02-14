import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, desc, count, sql } from "drizzle-orm";

export const dashboardRouter = Router();

// GET /api/dashboard/stats
dashboardRouter.get("/stats", async (_req, res) => {
  const [projectRows, agentRows, taskRows, recentLogs] = await Promise.all([
    db.select({ total: count() }).from(schema.projects),
    db.select({ total: count() }).from(schema.agents).where(eq(schema.agents.isActive, true)),
    db
      .select({
        total: count(),
        running: sql<number>`sum(case when ${schema.tasks.status} = 'in_progress' then 1 else 0 end)`,
        review: sql<number>`sum(case when ${schema.tasks.status} = 'review' then 1 else 0 end)`,
        done: sql<number>`sum(case when ${schema.tasks.status} = 'done' then 1 else 0 end)`,
      })
      .from(schema.tasks),
    db
      .select({
        id: schema.taskLogs.id,
        action: schema.taskLogs.action,
        detail: schema.taskLogs.detail,
        createdAt: schema.taskLogs.createdAt,
        agentName: schema.agents.name,
        agentColor: schema.agents.color,
        taskTitle: schema.tasks.title,
      })
      .from(schema.taskLogs)
      .leftJoin(schema.agents, eq(schema.taskLogs.agentId, schema.agents.id))
      .leftJoin(schema.tasks, eq(schema.taskLogs.taskId, schema.tasks.id))
      .orderBy(desc(schema.taskLogs.createdAt))
      .limit(10),
  ]);

  const taskStats = taskRows[0] ?? { total: 0, running: 0, review: 0, done: 0 };

  res.json({
    totalProjects: projectRows[0]?.total ?? 0,
    activeAgents: agentRows[0]?.total ?? 0,
    totalTasks: taskStats.total,
    runningTasks: taskStats.running ?? 0,
    reviewTasks: taskStats.review ?? 0,
    doneTasks: taskStats.done ?? 0,
    recentActivities: recentLogs.map((log) => ({
      id: log.id,
      action: log.action,
      detail: log.detail,
      agentName: log.agentName ?? "Sistema",
      agentColor: log.agentColor ?? "#FF5C35",
      taskTitle: log.taskTitle ?? "",
      createdAt: log.createdAt,
    })),
  });
});
