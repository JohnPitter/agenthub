import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, desc, count, max, sql, and, ne } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const dashboardRouter: ReturnType<typeof Router> = Router();

// GET /api/dashboard/stats
dashboardRouter.get("/stats", async (req, res) => {
  try {
  const page = Math.max(0, parseInt(req.query.activityPage as string) || 0);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.activityPageSize as string) || 10));

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekAgoTs = Math.floor(weekAgo.getTime() / 1000);

  const [projectRows, agentRows, taskRows, recentLogs, activityTotal, tasksByProject, agentsByProject, agentDetailsByProject, weeklyRows, recentCompleted] = await Promise.all([
    db.select({ total: count() }).from(schema.projects),
    db.select({ total: count() }).from(schema.agents).where(
      and(eq(schema.agents.isActive, true), ne(schema.agents.role, "receptionist"))
    ),
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
        agentAvatar: schema.agents.avatar,
        taskTitle: schema.tasks.title,
        projectName: schema.projects.name,
      })
      .from(schema.taskLogs)
      .leftJoin(schema.agents, eq(schema.taskLogs.agentId, schema.agents.id))
      .leftJoin(schema.tasks, eq(schema.taskLogs.taskId, schema.tasks.id))
      .leftJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
      .orderBy(desc(schema.taskLogs.createdAt))
      .limit(pageSize)
      .offset(page * pageSize),
    db.select({ total: count() }).from(schema.taskLogs),
    // Task count + last activity per project
    db
      .select({
        projectId: schema.tasks.projectId,
        taskCount: count(),
        lastActivity: max(schema.tasks.updatedAt),
      })
      .from(schema.tasks)
      .groupBy(schema.tasks.projectId),
    // Agent count per project (enabled agents)
    db
      .select({
        projectId: schema.agentProjectConfigs.projectId,
        agentCount: count(),
      })
      .from(schema.agentProjectConfigs)
      .where(eq(schema.agentProjectConfigs.isEnabled, true))
      .groupBy(schema.agentProjectConfigs.projectId),
    // Agents per project (for dashboard cards)
    db
      .select({
        projectId: schema.agentProjectConfigs.projectId,
        agentId: schema.agents.id,
        agentName: schema.agents.name,
        agentColor: schema.agents.color,
        agentAvatar: schema.agents.avatar,
        agentRole: schema.agents.role,
      })
      .from(schema.agentProjectConfigs)
      .innerJoin(schema.agents, eq(schema.agentProjectConfigs.agentId, schema.agents.id))
      .where(eq(schema.agentProjectConfigs.isEnabled, true)),
    // Weekly task counts
    db
      .select({
        weeklyCreated: sql<number>`count(case when ${schema.tasks.createdAt} >= ${weekAgoTs} then 1 end)`,
        weeklyCompleted: sql<number>`count(case when ${schema.tasks.status} = 'done' and ${schema.tasks.completedAt} >= ${weekAgoTs} then 1 end)`,
        weeklyFailed: sql<number>`count(case when ${schema.tasks.status} = 'failed' and ${schema.tasks.updatedAt} >= ${weekAgoTs} then 1 end)`,
      })
      .from(schema.tasks),
    // Recent completed tasks
    db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        priority: schema.tasks.priority,
        agentName: schema.agents.name,
        agentColor: schema.agents.color,
        agentAvatar: schema.agents.avatar,
        projectName: schema.projects.name,
        completedAt: schema.tasks.completedAt,
      })
      .from(schema.tasks)
      .leftJoin(schema.agents, eq(schema.tasks.assignedAgentId, schema.agents.id))
      .leftJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
      .where(eq(schema.tasks.status, "done"))
      .orderBy(desc(schema.tasks.completedAt))
      .limit(5),
  ]);

  const taskStats = taskRows[0] ?? { total: 0, running: 0, review: 0, done: 0 };

  // Build per-project stats map
  // If agent_project_configs has entries, use them; otherwise fall back to total active agents
  const totalActiveAgents = agentRows[0]?.total ?? 0;
  const hasPerProjectConfigs = agentsByProject.length > 0;
  const agentCountMap = new Map(agentsByProject.map((r) => [r.projectId, r.agentCount]));

  // Build agents-per-project map
  type AgentInfo = { id: string; name: string; color: string | null; avatar: string | null; role: string };
  const agentsMap = new Map<string, AgentInfo[]>();
  for (const row of agentDetailsByProject) {
    const pid = row.projectId;
    if (!agentsMap.has(pid)) agentsMap.set(pid, []);
    agentsMap.get(pid)!.push({
      id: row.agentId,
      name: row.agentName,
      color: row.agentColor,
      avatar: row.agentAvatar,
      role: row.agentRole,
    });
  }

  // Fallback: when no per-project configs exist, all active agents are available to every project
  let allActiveAgents: AgentInfo[] = [];
  if (!hasPerProjectConfigs) {
    const activeAgentRows = await db
      .select({
        id: schema.agents.id,
        name: schema.agents.name,
        color: schema.agents.color,
        avatar: schema.agents.avatar,
        role: schema.agents.role,
      })
      .from(schema.agents)
      .where(and(eq(schema.agents.isActive, true), ne(schema.agents.role, "receptionist")));
    allActiveAgents = activeAgentRows;
  }

  const getAgentsForProject = (projectId: string): AgentInfo[] => {
    if (hasPerProjectConfigs) return agentsMap.get(projectId) ?? [];
    return allActiveAgents;
  };

  const projectStats = tasksByProject.map((r) => ({
    projectId: r.projectId,
    taskCount: r.taskCount,
    agentCount: hasPerProjectConfigs
      ? (agentCountMap.get(r.projectId) ?? 0)
      : totalActiveAgents,
    lastActivity: r.lastActivity ? new Date(r.lastActivity).toISOString() : null,
    agents: getAgentsForProject(r.projectId),
  }));

  // Include projects that have agents but no tasks
  const projectsWithTasks = new Set(tasksByProject.map((t) => t.projectId));
  for (const r of agentsByProject) {
    if (!projectsWithTasks.has(r.projectId)) {
      projectStats.push({
        projectId: r.projectId,
        taskCount: 0,
        agentCount: r.agentCount,
        lastActivity: null,
        agents: getAgentsForProject(r.projectId),
      });
    }
  }

  // Also include projects that have neither tasks nor configs (newly created projects)
  const allProjects = await db.select({ id: schema.projects.id }).from(schema.projects);
  const projectsInStats = new Set(projectStats.map((ps) => ps.projectId));
  for (const p of allProjects) {
    if (!projectsInStats.has(p.id)) {
      projectStats.push({
        projectId: p.id,
        taskCount: 0,
        agentCount: hasPerProjectConfigs ? 0 : totalActiveAgents,
        lastActivity: null,
        agents: getAgentsForProject(p.id),
      });
    }
  }

  const totalActivities = activityTotal[0]?.total ?? 0;

  const weekly = weeklyRows[0] ?? { weeklyCreated: 0, weeklyCompleted: 0, weeklyFailed: 0 };

  res.json({
    totalProjects: projectRows[0]?.total ?? 0,
    activeAgents: agentRows[0]?.total ?? 0,
    totalTasks: taskStats.total,
    runningTasks: taskStats.running ?? 0,
    reviewTasks: taskStats.review ?? 0,
    doneTasks: taskStats.done ?? 0,
    projectStats,
    weeklyCreated: weekly.weeklyCreated ?? 0,
    weeklyCompleted: weekly.weeklyCompleted ?? 0,
    weeklyFailed: weekly.weeklyFailed ?? 0,
    recentCompletedTasks: recentCompleted.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      agentName: t.agentName ?? "Sistema",
      agentColor: t.agentColor ?? "#FF5C35",
      agentAvatar: t.agentAvatar ?? null,
      projectName: t.projectName ?? "",
      completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
    })),
    activityPage: page,
    activityPageSize: pageSize,
    activityTotalCount: totalActivities,
    activityTotalPages: Math.ceil(totalActivities / pageSize),
    recentActivities: recentLogs.map((log) => ({
      id: log.id,
      action: log.action,
      detail: log.detail,
      agentName: log.agentName ?? "Sistema",
      agentColor: log.agentColor ?? "#FF5C35",
      agentAvatar: log.agentAvatar ?? null,
      taskTitle: log.taskTitle ?? "",
      projectName: log.projectName ?? "",
      createdAt: log.createdAt,
    })),
  });
  } catch (error) {
    logger.error(`Failed to get dashboard stats: ${error}`, "dashboard-route");
    res.status(500).json({ error: "Failed to get dashboard stats" });
  }
});
