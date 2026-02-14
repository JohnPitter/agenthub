import { Router } from "express";
import { db } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { schema } from "@agenthub/database/schema";
import { readdir, stat, readFile, writeFile } from "fs/promises";
import { join, relative, sep } from "path";
import { logger } from "../lib/logger.js";
import { GitService } from "../git/git-service.js";

const router = Router();
const gitService = new GitService();

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileNode[];
}

/**
 * GET /api/projects/:id/files
 * Get file tree for a project
 */
router.get("/projects/:id/files", async (req, res) => {
  try {
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const fileTree = await buildFileTree(project.path);
    res.json({ files: fileTree });
  } catch (error) {
    logger.error("Failed to get file tree", { error, projectId: req.params.id });
    res.status(500).json({ error: "Failed to get file tree" });
  }
});

/**
 * GET /api/projects/:id/files/content
 * Get file contents
 * Query params: path (relative to project root)
 */
router.get("/projects/:id/files/content", async (req, res) => {
  try {
    const { path: filePath } = req.query;

    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "File path is required" });
    }

    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Security: Prevent path traversal
    const absolutePath = join(project.path, filePath);
    const normalizedProjectPath = join(project.path);

    if (!absolutePath.startsWith(normalizedProjectPath)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const content = await readFile(absolutePath, "utf-8");
    const stats = await stat(absolutePath);

    res.json({
      content,
      size: stats.size,
      modified: stats.mtime,
    });
  } catch (error) {
    logger.error("Failed to read file", { error, projectId: req.params.id });
    res.status(500).json({ error: "Failed to read file" });
  }
});

/**
 * PUT /api/projects/:id/files/content
 * Save file contents
 * Query params: path (relative to project root)
 * Body: { content: string }
 */
router.put("/projects/:id/files/content", async (req, res) => {
  try {
    const { path: filePath } = req.query;
    const { content } = req.body;

    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "File path is required" });
    }

    if (typeof content !== "string") {
      return res.status(400).json({ error: "Content must be a string" });
    }

    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Security: Prevent path traversal
    const absolutePath = join(project.path, filePath);
    const normalizedProjectPath = join(project.path);

    if (!absolutePath.startsWith(normalizedProjectPath)) {
      return res.status(403).json({ error: "Access denied" });
    }

    await writeFile(absolutePath, content, "utf-8");
    const stats = await stat(absolutePath);

    logger.info(`File saved: ${filePath}`, { projectId: req.params.id });

    res.json({
      success: true,
      size: stats.size,
      modified: stats.mtime,
    });
  } catch (error) {
    logger.error("Failed to save file", { error, projectId: req.params.id });
    res.status(500).json({ error: "Failed to save file" });
  }
});

/**
 * GET /api/projects/:id/files/history
 * Get commit history for a file
 * Query params: path (relative to project root), limit (optional, default 10)
 */
router.get("/projects/:id/files/history", async (req, res) => {
  try {
    const { path: filePath, limit } = req.query;

    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "File path is required" });
    }

    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const isGitRepo = await gitService.detectGitRepo(project.path);
    if (!isGitRepo) {
      return res.status(400).json({ error: "Project is not a git repository" });
    }

    // Security: Prevent path traversal
    const absolutePath = join(project.path, filePath);
    const normalizedProjectPath = join(project.path);

    if (!absolutePath.startsWith(normalizedProjectPath)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const history = await gitService.getFileHistory(
      project.path,
      filePath,
      limit ? parseInt(limit as string, 10) : 10
    );

    res.json({ history });
  } catch (error) {
    logger.error("Failed to get file history", { error, projectId: req.params.id });
    res.status(500).json({ error: "Failed to get file history" });
  }
});

/**
 * GET /api/projects/:id/files/at-commit
 * Get file content at a specific commit
 * Query params: path (relative to project root), commit (SHA)
 */
router.get("/projects/:id/files/at-commit", async (req, res) => {
  try {
    const { path: filePath, commit } = req.query;

    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "File path is required" });
    }

    if (!commit || typeof commit !== "string") {
      return res.status(400).json({ error: "Commit SHA is required" });
    }

    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const isGitRepo = await gitService.detectGitRepo(project.path);
    if (!isGitRepo) {
      return res.status(400).json({ error: "Project is not a git repository" });
    }

    // Security: Prevent path traversal
    const absolutePath = join(project.path, filePath);
    const normalizedProjectPath = join(project.path);

    if (!absolutePath.startsWith(normalizedProjectPath)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const content = await gitService.getFileAtCommit(project.path, filePath, commit);

    res.json({ content });
  } catch (error) {
    logger.error("Failed to get file at commit", { error, projectId: req.params.id });
    res.status(500).json({ error: "Failed to get file at commit" });
  }
});

async function buildFileTree(
  dirPath: string,
  maxDepth = 5,
  currentDepth = 0
): Promise<FileNode[]> {
  if (currentDepth >= maxDepth) {
    return [];
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    // Filter out common ignored directories
    const ignored = new Set([
      "node_modules",
      ".git",
      "dist",
      "build",
      ".next",
      ".turbo",
      "coverage",
      ".vscode",
      ".idea",
    ]);

    for (const entry of entries) {
      if (ignored.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = join(dirPath, entry.name);
      const stats = await stat(fullPath);

      if (entry.isDirectory()) {
        const children = await buildFileTree(fullPath, maxDepth, currentDepth + 1);
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: "directory",
          children: children.length > 0 ? children : undefined,
        });
      } else if (entry.isFile()) {
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: "file",
          size: stats.size,
        });
      }
    }

    // Sort: directories first, then files, alphabetically
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    logger.warn(`Failed to read directory: ${dirPath}`, { error });
    return [];
  }
}

export { router as filesRouter };
