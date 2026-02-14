import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, desc, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { GitService } from "../git/git-service";
import { slugify } from "../lib/utils";
import { logger } from "../lib/logger";

const gitService = new GitService();

export const tasksRouter = Router();

// GET /api/tasks?projectId=...&status=...
tasksRouter.get("/", async (req, res) => {
  const { projectId, status } = req.query;
  const conditions = [];

  if (projectId) conditions.push(eq(schema.tasks.projectId, projectId as string));
  if (status) conditions.push(eq(schema.tasks.status, status as typeof schema.tasks.status._.data));

  const tasks = await db
    .select()
    .from(schema.tasks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.tasks.createdAt));

  res.json({ tasks });
});

// GET /api/tasks/:id
tasksRouter.get("/:id", async (req, res) => {
  const task = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, req.params.id))
    .get();

  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ task });
});

// POST /api/tasks
tasksRouter.post("/", async (req, res) => {
  const { projectId, title, description, priority, category, assignedAgentId } = req.body;

  const task = {
    id: nanoid(),
    projectId,
    title,
    description: description ?? null,
    priority: priority ?? "medium",
    category: category ?? null,
    assignedAgentId: assignedAgentId ?? null,
    status: "created" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(schema.tasks).values(task);
  res.status(201).json({ task });
});

// PATCH /api/tasks/:id
tasksRouter.patch("/:id", async (req, res) => {
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  const allowedFields = ["title", "description", "status", "priority", "category", "assignedAgentId", "result"];
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (req.body.status === "done") {
    updates.completedAt = new Date();
  }

  await db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, req.params.id));

  const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, req.params.id)).get();
  res.json({ task });
});

// DELETE /api/tasks/:id
tasksRouter.delete("/:id", async (req, res) => {
  await db.delete(schema.tasks).where(eq(schema.tasks.id, req.params.id));
  res.json({ success: true });
});

// GET /api/tasks/:id/logs
tasksRouter.get("/:id/logs", async (req, res) => {
  const logs = await db
    .select()
    .from(schema.taskLogs)
    .where(eq(schema.taskLogs.taskId, req.params.id))
    .orderBy(desc(schema.taskLogs.createdAt));

  res.json({ logs });
});

// POST /api/tasks/:id/git/branch - Create git branch for task
tasksRouter.post("/:id/git/branch", async (req, res) => {
  try {
    const task = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, req.params.id))
      .get();

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, task.projectId))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const isGitRepo = await gitService.detectGitRepo(project.path);
    if (!isGitRepo) {
      return res.status(400).json({ error: "Project is not a git repository" });
    }

    // Allow custom branch name or generate default
    const branchName =
      req.body.branchName || `task/${task.id}-${slugify(task.title as string)}`;

    // Check if branch already exists
    const branchExists = await gitService.branchExists(project.path, branchName);
    if (branchExists) {
      return res.status(409).json({ error: "Branch already exists" });
    }

    // Get git config for base branch
    const gitConfig = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.projectId, task.projectId),
          eq(schema.integrations.type, "git")
        )
      )
      .get();

    const baseBranch = gitConfig?.config
      ? JSON.parse(gitConfig.config).defaultBranch
      : "main";

    // Create branch
    await gitService.createBranch(project.path, branchName, baseBranch);

    // Update task with branch name
    await db
      .update(schema.tasks)
      .set({ branch: branchName, updatedAt: new Date() })
      .where(eq(schema.tasks.id, req.params.id));

    logger.info(`Created git branch: ${branchName} for task ${task.id}`, "tasks-router");

    res.json({ branchName, baseBranch });
  } catch (error) {
    logger.error(`Failed to create git branch: ${error}`, "tasks-router");
    res.status(500).json({ error: "Failed to create git branch" });
  }
});
