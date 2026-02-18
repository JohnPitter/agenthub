import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { scanWorkspace } from "../workspace/scanner";
import { fetchUserRepos } from "../services/github-service.js";
import { decrypt } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";

export const projectsRouter = Router();

// GET /api/projects?limit=50&offset=0 — list projects
projectsRouter.get("/", async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

    const projects = await db
      .select()
      .from(schema.projects)
      .orderBy(desc(schema.projects.updatedAt))
      .limit(limit)
      .offset(offset);
    res.json({ projects });
  } catch (error) {
    logger.error(`Failed to list projects: ${error}`, "projects-route");
    res.status(500).json({ error: "Failed to list projects" });
  }
});

// GET /api/projects/github-repos — list user's GitHub repositories
projectsRouter.get("/github-repos", async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const user = await db.select({ id: schema.users.id, accessToken: schema.users.accessToken }).from(schema.users).where(eq(schema.users.id, userId)).get();
    if (!user?.accessToken) return res.status(401).json({ error: "github_reauth", message: "GitHub access token not found. Please re-authenticate." });

    let accessToken: string;
    try {
      accessToken = decrypt(user.accessToken);
    } catch (decryptError) {
      logger.warn(`Failed to decrypt GitHub token for user ${userId} — encryption key may have changed`, "projects");
      return res.status(401).json({ error: "github_reauth", message: "GitHub token could not be decrypted. Please re-authenticate." });
    }

    const repos = await fetchUserRepos(accessToken);
    res.json({ repos });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    // GitHub returned 401/403 — token revoked or expired
    if (msg.includes("401") || msg.includes("403")) {
      logger.warn(`GitHub token rejected for user ${req.user?.userId}: ${msg}`, "projects");
      return res.status(401).json({ error: "github_reauth", message: "GitHub token is invalid or expired. Please re-authenticate." });
    }
    logger.error(`Failed to fetch GitHub repos: ${error}`, "projects");
    res.status(502).json({ error: "Failed to fetch GitHub repositories" });
  }
});

// GET /api/projects/:id — get single project
projectsRouter.get("/:id", async (req, res) => {
  try {
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ project });
  } catch (error) {
    logger.error(`Failed to get project: ${error}`, "projects-route", { projectId: req.params.id });
    res.status(500).json({ error: "Failed to get project" });
  }
});

// POST /api/projects — create project
projectsRouter.post("/", async (req, res) => {
  try {
    const { name, path, stack, icon, description } = req.body;

    const project = {
      id: nanoid(),
      name,
      path,
      stack: JSON.stringify(stack ?? []),
      icon: icon ?? null,
      description: description ?? null,
      status: "active" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(schema.projects).values(project);
    res.status(201).json({ project });
  } catch (error) {
    logger.error(`Failed to create project: ${error}`, "projects-route");
    res.status(500).json({ error: "Failed to create project" });
  }
});

// PATCH /api/projects/:id — update project
projectsRouter.patch("/:id", async (req, res) => {
  try {
    const { name, description, status } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;

    await db
      .update(schema.projects)
      .set(updates)
      .where(eq(schema.projects.id, req.params.id));

    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    res.json({ project });
  } catch (error) {
    logger.error(`Failed to update project: ${error}`, "projects-route", { projectId: req.params.id });
    res.status(500).json({ error: "Failed to update project" });
  }
});

// DELETE /api/projects/:id — delete project
projectsRouter.delete("/:id", async (req, res) => {
  try {
    await db.delete(schema.projects).where(eq(schema.projects.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to delete project: ${error}`, "projects-route", { projectId: req.params.id });
    res.status(500).json({ error: "Failed to delete project" });
  }
});

// POST /api/projects/scan — scan workspace for projects
projectsRouter.post("/scan", async (req, res) => {
  const { workspacePath } = req.body;

  if (!workspacePath) {
    return res.status(400).json({ error: "workspacePath is required" });
  }

  try {
    const scanned = scanWorkspace(workspacePath);
    res.json({ projects: scanned });
  } catch (error) {
    logger.error(`Failed to scan workspace: ${error}`, "projects-route");
    res.status(400).json({ error: "Failed to scan workspace" });
  }
});
