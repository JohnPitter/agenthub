import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, desc, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { GitService } from "../git/git-service";
import { execFileNoThrow } from "../lib/exec-file";
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

  if (req.body.status === "done" || req.body.status === "cancelled") {
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

// Extension → Monaco language mapping
const LANG_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".json": "json",
  ".css": "css",
  ".scss": "scss",
  ".html": "html",
  ".md": "markdown",
  ".py": "python",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".sql": "sql",
  ".sh": "shell",
  ".bash": "shell",
  ".xml": "xml",
  ".svg": "xml",
  ".go": "go",
  ".rs": "rust",
  ".toml": "toml",
};

// GET /api/tasks/:id/changes - Get file changes made by agent for this task (commit-based)
tasksRouter.get("/:id/changes", async (req, res) => {
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

    // Detect base branch (main or master)
    let baseBranch = "main";
    const mainCheck = await execFileNoThrow("git", ["rev-parse", "--verify", "main"], { cwd: project.path, timeout: 5000 });
    if (mainCheck.error) {
      const masterCheck = await execFileNoThrow("git", ["rev-parse", "--verify", "master"], { cwd: project.path, timeout: 5000 });
      if (!masterCheck.error) baseBranch = "master";
    }

    type FileChange = { path: string; original: string; modified: string; language: string };
    type CommitInfo = { hash: string; shortHash: string; message: string; date: string; author: string; files: FileChange[] };

    const commits: CommitInfo[] = [];

    if (task.branch) {
      // Get commits on the task branch that are not on the base branch
      const logResult = await execFileNoThrow(
        "git",
        ["log", "--format=%H|%h|%s|%aI|%an", `${baseBranch}..${task.branch}`],
        { cwd: project.path, timeout: 10000 }
      );

      if (!logResult.error && logResult.stdout.trim()) {
        const commitLines = logResult.stdout.trim().split("\n").filter(Boolean);

        for (const line of commitLines) {
          const [hash, shortHash, message, date, author] = line.split("|");
          if (!hash) continue;

          // Get list of changed files for this commit
          const diffTreeResult = await execFileNoThrow(
            "git",
            ["diff-tree", "--no-commit-id", "-r", "--name-only", hash],
            { cwd: project.path, timeout: 5000 }
          );

          const changedFiles = diffTreeResult.stdout?.trim().split("\n").filter(Boolean) ?? [];
          const files: FileChange[] = [];

          for (const filePath of changedFiles) {
            // Get file content BEFORE this commit (parent)
            const beforeResult = await execFileNoThrow(
              "git",
              ["show", `${hash}^:${filePath}`],
              { cwd: project.path, timeout: 5000 }
            );
            const original = beforeResult.error ? "" : beforeResult.stdout;

            // Get file content AFTER this commit
            const afterResult = await execFileNoThrow(
              "git",
              ["show", `${hash}:${filePath}`],
              { cwd: project.path, timeout: 5000 }
            );
            const modified = afterResult.error ? "" : afterResult.stdout;

            if (original === modified) continue;

            const ext = extname(filePath).toLowerCase();
            const language = LANG_MAP[ext] ?? "plaintext";
            files.push({ path: filePath.replace(/\\/g, "/"), original, modified, language });
          }

          if (files.length > 0) {
            commits.push({ hash, shortHash, message, date, author, files });
          }
        }
      }

      // Also check for uncommitted changes on the task branch
      const currentBranchResult = await execFileNoThrow(
        "git", ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd: project.path, timeout: 5000 }
      );
      const currentBranch = currentBranchResult.stdout?.trim() ?? "";

      if (currentBranch === task.branch) {
        const uncommittedResult = await execFileNoThrow(
          "git", ["diff", "--name-only", "HEAD"],
          { cwd: project.path, timeout: 5000 }
        );
        const uncommittedFiles = uncommittedResult.stdout?.trim().split("\n").filter(Boolean) ?? [];

        if (uncommittedFiles.length > 0) {
          const files: FileChange[] = [];
          for (const filePath of uncommittedFiles) {
            const headResult = await execFileNoThrow(
              "git", ["show", `HEAD:${filePath}`],
              { cwd: project.path, timeout: 5000 }
            );
            const original = headResult.error ? "" : headResult.stdout;

            let modified = "";
            try {
              modified = await readFile(join(project.path, filePath), "utf-8");
            } catch { modified = ""; }

            if (original === modified) continue;

            const ext = extname(filePath).toLowerCase();
            const language = LANG_MAP[ext] ?? "plaintext";
            files.push({ path: filePath.replace(/\\/g, "/"), original, modified, language });
          }

          if (files.length > 0) {
            commits.unshift({
              hash: "uncommitted",
              shortHash: "uncommitted",
              message: "Alterações não commitadas",
              date: new Date().toISOString(),
              author: "",
              files,
            });
          }
        }
      }
    }

    // Flatten all files for backward compat (legacy `files` field)
    const allFiles: FileChange[] = [];
    for (const c of commits) {
      for (const f of c.files) {
        if (!allFiles.some((af) => af.path === f.path)) {
          allFiles.push(f);
        }
      }
    }

    res.json({ commits, files: allFiles });
  } catch (error) {
    logger.error(`Failed to get task changes: ${error}`, "tasks-router");
    res.status(500).json({ error: "Failed to get task changes" });
  }
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
