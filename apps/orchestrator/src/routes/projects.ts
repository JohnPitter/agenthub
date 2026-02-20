import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, desc, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { scanWorkspace } from "../workspace/scanner";
import {
  fetchUserRepos,
  getRepoDescriptionREST,
  parseGitHubRepoSlug,
  createGitHubRepo,
} from "../services/github-service.js";
import { GitService } from "../git/git-service.js";
import { safeDecrypt } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";

const git = new GitService();

/**
 * Fetch GitHub "About" description for a local project via REST API.
 * Returns null silently on any failure.
 */
async function fetchGitHubDescription(
  userId: string,
  projectPath: string
): Promise<string | null> {
  try {
    const user = await db
      .select({ accessToken: schema.users.accessToken })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .get();
    if (!user?.accessToken) return null;

    let accessToken: string;
    try {
      accessToken = safeDecrypt(user.accessToken);
    } catch {
      return null;
    }

    const remoteUrl = await git.getRemoteUrl(projectPath);
    if (!remoteUrl) return null;

    const slug = parseGitHubRepoSlug(remoteUrl);
    if (!slug) return null;

    return await getRepoDescriptionREST(accessToken, slug.owner, slug.repo);
  } catch {
    return null;
  }
}

export const projectsRouter: ReturnType<typeof Router> = Router();

// GET /api/projects?limit=50&offset=0&teamId=xxx — list projects
projectsRouter.get("/", async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const teamId = req.query.teamId as string | undefined;

    let query = db
      .select()
      .from(schema.projects)
      .orderBy(desc(schema.projects.updatedAt))
      .limit(limit)
      .offset(offset);

    if (teamId) {
      query = query.where(eq(schema.projects.teamId, teamId)) as typeof query;
    }

    const projects = await query;
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
    if (!user?.accessToken) return res.status(424).json({ error: "github_reauth", message: "GitHub access token not found. Please re-authenticate." });

    let accessToken: string;
    try {
      accessToken = safeDecrypt(user.accessToken);
    } catch (decryptError) {
      logger.warn(`Failed to decrypt GitHub token for user ${userId} — encryption key may have changed`, "projects");
      return res.status(424).json({ error: "github_reauth", message: "GitHub token could not be decrypted. Please re-authenticate." });
    }

    const repos = await fetchUserRepos(accessToken);
    res.json({ repos });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    // GitHub returned 401/403 — token revoked or expired
    if (msg.includes("401") || msg.includes("403")) {
      logger.warn(`GitHub token rejected for user ${req.user?.userId}: ${msg}`, "projects");
      return res.status(424).json({ error: "github_reauth", message: "GitHub token is invalid or expired. Please re-authenticate." });
    }
    logger.error(`Failed to fetch GitHub repos: ${error}`, "projects");
    res.status(502).json({ error: "Failed to fetch GitHub repositories" });
  }
});

// POST /api/projects/create — create a new project (local or GitHub)
// MUST be registered before /:id to avoid Express matching "create" as an id param
projectsRouter.post("/create", async (req, res) => {
  try {
    const { mode, name, localPath, description, isPrivate } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "errorNameRequired" });
    }

    if (mode === "github") {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const user = await db.select({ accessToken: schema.users.accessToken }).from(schema.users).where(eq(schema.users.id, userId)).get();
      if (!user?.accessToken) return res.status(424).json({ error: "github_reauth", message: "GitHub access token not found." });

      let accessToken: string;
      try {
        accessToken = safeDecrypt(user.accessToken);
      } catch {
        return res.status(424).json({ error: "github_reauth", message: "GitHub token could not be decrypted." });
      }

      let repoResult;
      try {
        repoResult = await createGitHubRepo(accessToken, {
          name: name.trim(),
          description: description?.trim() || undefined,
          isPrivate: isPrivate ?? false,
        });
      } catch (ghErr: unknown) {
        const msg = ghErr instanceof Error ? ghErr.message : "";
        if (msg.includes("422")) {
          return res.status(422).json({ error: "errorRepoExists" });
        }
        if (msg.includes("401") || msg.includes("403")) {
          return res.status(424).json({ error: "github_reauth", message: "GitHub token is invalid or expired." });
        }
        throw ghErr;
      }

      // Check duplicate path
      const existing = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.path, repoResult.clone_url)).get();
      if (existing) {
        return res.status(409).json({ error: "errorDuplicate" });
      }

      const project = {
        id: nanoid(),
        name: name.trim(),
        path: repoResult.clone_url,
        stack: JSON.stringify([]),
        icon: null,
        description: repoResult.description || description?.trim() || null,
        teamId: null,
        status: "active" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(schema.projects).values(project);
      logger.info(`GitHub repo created: ${repoResult.full_name}`, "projects");
      return res.status(201).json({ project });
    }

    // mode === "local"
    if (!localPath?.trim()) {
      return res.status(400).json({ error: "errorPathRequired" });
    }

    const trimmedPath = localPath.trim();

    // Check duplicate path
    const existing = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.path, trimmedPath)).get();
    if (existing) {
      return res.status(409).json({ error: "errorDuplicate" });
    }

    const project = {
      id: nanoid(),
      name: name.trim(),
      path: trimmedPath,
      stack: JSON.stringify([]),
      icon: null,
      description: description?.trim() || null,
      teamId: null,
      status: "active" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(schema.projects).values(project);
    logger.info(`Local project created: ${name.trim()} at ${trimmedPath}`, "projects");
    return res.status(201).json({ project });
  } catch (error) {
    logger.error(`Failed to create project: ${error}`, "projects-route");
    res.status(500).json({ error: "Failed to create project" });
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

    // Lazy backfill: fetch GitHub description for projects that don't have one
    if (!project.description && project.path && !project.path.startsWith("http")) {
      const userId = req.user?.userId;
      if (userId) {
        const ghDescription = await fetchGitHubDescription(userId, project.path);
        if (ghDescription) {
          await db.update(schema.projects).set({ description: ghDescription, updatedAt: new Date() }).where(eq(schema.projects.id, project.id));
          project.description = ghDescription;
        }
      }
    }

    res.json({ project });
  } catch (error) {
    logger.error(`Failed to get project: ${error}`, "projects-route", { projectId: req.params.id });
    res.status(500).json({ error: "Failed to get project" });
  }
});

// POST /api/projects — create project
projectsRouter.post("/", async (req, res) => {
  try {
    const { name, path, stack, icon, description, teamId } = req.body;

    // Auto-fetch GitHub "About" description when not provided and path is local
    let resolvedDescription: string | null = description ?? null;
    if (!resolvedDescription && path && !path.startsWith("http")) {
      const userId = req.user?.userId;
      if (userId) {
        resolvedDescription = await fetchGitHubDescription(userId, path);
      }
    }

    const project = {
      id: nanoid(),
      name,
      path,
      stack: JSON.stringify(stack ?? []),
      icon: icon ?? null,
      description: resolvedDescription,
      teamId: teamId ?? null,
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
