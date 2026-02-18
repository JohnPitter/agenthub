import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, desc, and, sql, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { GitService } from "../git/git-service";
import { execFileNoThrow } from "../lib/exec-file";
import { slugify } from "../lib/utils";
import { logger } from "../lib/logger";
import { docGenerator } from "../agents/doc-generator.js";

const gitService = new GitService();

export const tasksRouter = Router();

// GET /api/tasks?projectId=...&status=...&includeSubtasks=true&limit=50&offset=0
tasksRouter.get("/", async (req, res) => {
  const { projectId, status, includeSubtasks } = req.query;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
  const conditions = [];

  if (projectId) conditions.push(eq(schema.tasks.projectId, projectId as string));
  if (status) conditions.push(eq(schema.tasks.status, status as typeof schema.tasks.status._.data));
  // By default, hide subtasks from main list unless explicitly requested
  if (includeSubtasks !== "true") conditions.push(isNull(schema.tasks.parentTaskId));

  const tasks = await db
    .select()
    .from(schema.tasks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.tasks.createdAt))
    .limit(limit)
    .offset(offset);

  // Compute subtask counts for all tasks in a single query
  const taskIds = tasks.map((t) => t.id);
  if (taskIds.length > 0) {
    const subtaskCounts = await db
      .select({
        parentTaskId: schema.tasks.parentTaskId,
        total: sql<number>`count(*)`.as("total"),
        completed: sql<number>`sum(case when ${schema.tasks.status} in ('done', 'cancelled') then 1 else 0 end)`.as("completed"),
      })
      .from(schema.tasks)
      .where(sql`${schema.tasks.parentTaskId} in (${sql.join(taskIds.map((id) => sql`${id}`), sql`, `)})`)
      .groupBy(schema.tasks.parentTaskId);

    const countMap = new Map(subtaskCounts.map((r) => [r.parentTaskId, { total: r.total, completed: r.completed }]));

    const enriched = tasks.map((t) => {
      const counts = countMap.get(t.id);
      return {
        ...t,
        subtaskCount: counts?.total ?? 0,
        completedSubtaskCount: counts?.completed ?? 0,
      };
    });

    return res.json({ tasks: enriched });
  }

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
  const { projectId, title, description, priority, category, assignedAgentId, parentTaskId } = req.body;

  const task = {
    id: nanoid(),
    projectId,
    title,
    description: description ?? null,
    priority: priority ?? "medium",
    category: category ?? null,
    assignedAgentId: assignedAgentId ?? null,
    parentTaskId: parentTaskId ?? null,
    status: "created" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(schema.tasks).values(task);
  res.status(201).json({ task });
});

// GET /api/tasks/:id/subtasks
tasksRouter.get("/:id/subtasks", async (req, res) => {
  const subtasks = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.parentTaskId, req.params.id))
    .orderBy(schema.tasks.createdAt);

  res.json({ subtasks });
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

  // Fire-and-forget: generate change summary when task completes
  if (req.body.status === "done" && task) {
    docGenerator.generateChangeSummary(task.id).then((summary) => {
      logger.info(`Auto-generated change summary for task ${task.id} (${summary.length} chars)`, "tasks-router");
    }).catch((err) => {
      logger.warn(`Failed to auto-generate change summary for task ${task.id}: ${err}`, "tasks-router");
    });
  }

  res.json({ task });
});

// DELETE /api/tasks/:id
tasksRouter.delete("/:id", async (req, res) => {
  await db.delete(schema.tasks).where(eq(schema.tasks.id, req.params.id));
  res.json({ success: true });
});

// GET /api/tasks/:id/logs?limit=50&offset=0
tasksRouter.get("/:id/logs", async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

  const logs = await db
    .select()
    .from(schema.taskLogs)
    .where(eq(schema.taskLogs.taskId, req.params.id))
    .orderBy(desc(schema.taskLogs.createdAt))
    .limit(limit)
    .offset(offset);

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

    // Helper: extract file diffs for a list of commit hashes
    const extractCommitDiffs = async (commitLines: string[]) => {
      for (const line of commitLines) {
        const [hash, shortHash, message, date, author] = line.split("|");
        if (!hash) continue;

        const diffTreeResult = await execFileNoThrow(
          "git",
          ["diff-tree", "--no-commit-id", "-r", "--name-only", hash],
          { cwd: project.path, timeout: 5000 }
        );

        const changedFiles = diffTreeResult.stdout?.trim().split("\n").filter(Boolean) ?? [];
        const files: FileChange[] = [];

        for (const filePath of changedFiles) {
          const beforeResult = await execFileNoThrow(
            "git", ["show", `${hash}^:${filePath}`],
            { cwd: project.path, timeout: 5000 }
          );
          const original = beforeResult.error ? "" : beforeResult.stdout;

          const afterResult = await execFileNoThrow(
            "git", ["show", `${hash}:${filePath}`],
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
    };

    if (task.branch) {
      // Mode 1: Task has a dedicated branch — diff against base
      const logResult = await execFileNoThrow(
        "git",
        ["log", "--format=%H|%h|%s|%aI|%an", `${baseBranch}..${task.branch}`],
        { cwd: project.path, timeout: 10000 }
      );

      if (!logResult.error && logResult.stdout.trim()) {
        await extractCommitDiffs(logResult.stdout.trim().split("\n").filter(Boolean));
      }

      // Check for uncommitted changes on the task branch
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
    } else {
      // Mode 2: No branch — find commits made during the task's lifetime
      const since = task.createdAt ? new Date(task.createdAt).toISOString() : null;
      const until = task.completedAt ? new Date(task.completedAt).toISOString() : null;

      if (since) {
        const logArgs = ["log", "--format=%H|%h|%s|%aI|%an"];
        logArgs.push(`--since=${since}`);
        if (until) logArgs.push(`--until=${until}`);
        logArgs.push(baseBranch);

        const logResult = await execFileNoThrow(
          "git", logArgs,
          { cwd: project.path, timeout: 10000 }
        );

        if (!logResult.error && logResult.stdout.trim()) {
          await extractCommitDiffs(logResult.stdout.trim().split("\n").filter(Boolean));
        }
      }

      // Also show uncommitted changes (working tree)
      const uncommittedResult = await execFileNoThrow(
        "git", ["diff", "--name-only", "HEAD"],
        { cwd: project.path, timeout: 5000 }
      );
      const untrackedResult = await execFileNoThrow(
        "git", ["ls-files", "--others", "--exclude-standard"],
        { cwd: project.path, timeout: 5000 }
      );
      const uncommittedFiles = [
        ...(uncommittedResult.stdout?.trim().split("\n").filter(Boolean) ?? []),
        ...(untrackedResult.stdout?.trim().split("\n").filter(Boolean) ?? []),
      ];

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

    // Flatten all files for backward compat (legacy `files` field)
    const allFiles: FileChange[] = [];
    const seenPaths = new Set<string>();
    for (const c of commits) {
      for (const f of c.files) {
        if (!seenPaths.has(f.path)) {
          seenPaths.add(f.path);
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
