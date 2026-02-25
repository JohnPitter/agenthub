import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, desc, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { join } from "path";
import { homedir } from "os";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import {
  fetchUserRepos,
  getRepoDescriptionREST,
  parseGitHubRepoSlug,
  createGitHubRepo,
} from "../services/github-service.js";
import { detectStack } from "../lib/detect-stack.js";
import { GitService } from "../git/git-service.js";
import { safeDecrypt } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";

const git = new GitService();
const REPOS_DIR = join(homedir(), ".agenthub", "repos");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the authenticated user's decrypted GitHub access token. */
async function resolveAccessToken(
  userId: string | undefined,
  res: import("express").Response,
): Promise<string | null> {
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  const user = await db
    .select({ accessToken: schema.users.accessToken })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user?.accessToken) {
    res.status(424).json({ error: "github_reauth", message: "GitHub access token not found. Please re-authenticate." });
    return null;
  }

  try {
    return safeDecrypt(user.accessToken);
  } catch {
    logger.warn(`Failed to decrypt GitHub token for user ${userId}`, "projects");
    res.status(424).json({ error: "github_reauth", message: "GitHub token could not be decrypted. Please re-authenticate." });
    return null;
  }
}

/** Clone a GitHub repo into ~/.agenthub/repos/<name> and return the local path. */
async function cloneGitHubRepo(
  cloneUrl: string,
  projectName: string,
  accessToken: string,
): Promise<string> {
  await mkdir(REPOS_DIR, { recursive: true });
  const dirName = projectName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  let targetPath = join(REPOS_DIR, dirName);
  if (existsSync(targetPath)) {
    targetPath = join(REPOS_DIR, `${dirName}-${nanoid(6)}`);
  }
  await git.clone(cloneUrl, targetPath, { type: "https", token: accessToken });
  return targetPath;
}

/**
 * Fetch GitHub "About" description for a local project via REST API.
 * Returns null silently on any failure.
 */
async function fetchGitHubDescription(
  accessToken: string,
  projectPath: string,
): Promise<string | null> {
  try {
    const remoteUrl = await git.getRemoteUrl(projectPath);
    if (!remoteUrl) return null;
    const slug = parseGitHubRepoSlug(remoteUrl);
    if (!slug) return null;
    return await getRepoDescriptionREST(accessToken, slug.owner, slug.repo);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

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
    const accessToken = await resolveAccessToken(req.user?.userId, res);
    if (!accessToken) return;

    const repos = await fetchUserRepos(accessToken);

    // Mark repos already imported
    const existing = await db
      .select({ githubOwner: schema.projects.githubOwner, githubRepo: schema.projects.githubRepo })
      .from(schema.projects);
    const importedSet = new Set(existing.map((p) => `${p.githubOwner}/${p.githubRepo}`));

    const enriched = repos.map((repo) => ({
      ...repo,
      alreadyImported: importedSet.has(repo.full_name),
    }));

    res.json({ repos: enriched });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("401") || msg.includes("403")) {
      logger.warn(`GitHub token rejected for user ${req.user?.userId}: ${msg}`, "projects");
      return res.status(424).json({ error: "github_reauth", message: "GitHub token is invalid or expired. Please re-authenticate." });
    }
    logger.error(`Failed to fetch GitHub repos: ${error}`, "projects");
    res.status(502).json({ error: "Failed to fetch GitHub repositories" });
  }
});

// POST /api/projects/create — create a new GitHub repository + clone
// MUST be registered before /:id to avoid Express matching "create" as an id param
projectsRouter.post("/create", async (req, res) => {
  try {
    const { name, description, isPrivate } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "errorNameRequired" });
    }

    const accessToken = await resolveAccessToken(req.user?.userId, res);
    if (!accessToken) return;

    // Create repo on GitHub
    let repoResult;
    try {
      repoResult = await createGitHubRepo(accessToken, {
        name: name.trim(),
        description: description?.trim() || undefined,
        isPrivate: isPrivate ?? false,
      });
    } catch (ghErr: unknown) {
      const msg = ghErr instanceof Error ? ghErr.message : "";
      if (msg.includes("422")) return res.status(422).json({ error: "errorRepoExists" });
      if (msg.includes("401") || msg.includes("403")) {
        return res.status(424).json({ error: "github_reauth", message: "GitHub token is invalid or expired." });
      }
      throw ghErr;
    }

    // Parse owner/repo from full_name
    const slug = parseGitHubRepoSlug(repoResult.clone_url);

    // Check duplicate
    const existing = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.githubUrl, repoResult.html_url))
      .get();
    if (existing) return res.status(409).json({ error: "errorDuplicate" });

    // Clone to local
    let localPath: string;
    try {
      localPath = await cloneGitHubRepo(repoResult.clone_url, name.trim(), accessToken);
    } catch (cloneErr) {
      logger.error(`Failed to clone repo ${repoResult.clone_url}: ${cloneErr}`, "projects");
      return res.status(500).json({ error: "errorCloneFailed" });
    }

    // Detect stack from cloned repo
    const stack = detectStack(localPath);

    const project = {
      id: nanoid(),
      name: name.trim(),
      path: localPath,
      stack: JSON.stringify(stack),
      icon: null,
      description: repoResult.description || description?.trim() || null,
      teamId: null,
      githubUrl: repoResult.html_url,
      githubOwner: slug?.owner ?? null,
      githubRepo: slug?.repo ?? null,
      status: "active" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(schema.projects).values(project);
    logger.info(`GitHub repo created and cloned: ${repoResult.full_name} → ${localPath}`, "projects");
    return res.status(201).json({ project });
  } catch (error) {
    logger.error(`Failed to create project: ${error}`, "projects-route");
    res.status(500).json({ error: "Failed to create project" });
  }
});

// POST /api/projects/import — import an existing GitHub repository
// MUST be registered before /:id
projectsRouter.post("/import", async (req, res) => {
  try {
    const { owner, repo, cloneUrl, htmlUrl, description } = req.body;

    if (!owner || !repo) {
      return res.status(400).json({ error: "owner and repo are required" });
    }

    const accessToken = await resolveAccessToken(req.user?.userId, res);
    if (!accessToken) return;

    // Check duplicate
    const existing = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.githubUrl, htmlUrl || `https://github.com/${owner}/${repo}`))
      .get();
    if (existing) return res.status(409).json({ error: "errorDuplicate" });

    // Resolve clone URL
    const resolvedCloneUrl = cloneUrl || `https://github.com/${owner}/${repo}.git`;

    // Clone to local
    let localPath: string;
    try {
      localPath = await cloneGitHubRepo(resolvedCloneUrl, repo, accessToken);
    } catch (cloneErr) {
      logger.error(`Failed to clone imported repo ${resolvedCloneUrl}: ${cloneErr}`, "projects");
      return res.status(500).json({ error: "errorCloneFailed" });
    }

    // Detect stack
    const stack = detectStack(localPath);

    // Fetch description if not provided
    let resolvedDescription: string | null = description ?? null;
    if (!resolvedDescription) {
      resolvedDescription = await getRepoDescriptionREST(accessToken, owner, repo);
    }

    const project = {
      id: nanoid(),
      name: repo,
      path: localPath,
      stack: JSON.stringify(stack),
      icon: null,
      description: resolvedDescription,
      teamId: null,
      githubUrl: htmlUrl || `https://github.com/${owner}/${repo}`,
      githubOwner: owner,
      githubRepo: repo,
      status: "active" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(schema.projects).values(project);
    logger.info(`GitHub repo imported: ${owner}/${repo} → ${localPath}`, "projects");
    return res.status(201).json({ project });
  } catch (error) {
    logger.error(`Failed to import project: ${error}`, "projects-route");
    res.status(500).json({ error: "Failed to import project" });
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

    // Lazy backfill: enrich GitHub fields if missing
    if (!project.githubUrl && project.path && !project.path.startsWith("http")) {
      try {
        const remoteUrl = await git.getRemoteUrl(project.path);
        if (remoteUrl) {
          const slug = parseGitHubRepoSlug(remoteUrl);
          if (slug) {
            const githubUrl = `https://github.com/${slug.owner}/${slug.repo}`;
            await db.update(schema.projects).set({
              githubUrl,
              githubOwner: slug.owner,
              githubRepo: slug.repo,
              updatedAt: new Date(),
            }).where(eq(schema.projects.id, project.id));
            project.githubUrl = githubUrl;
            project.githubOwner = slug.owner;
            project.githubRepo = slug.repo;
          }
        }
      } catch {
        // Ignore backfill errors
      }
    }

    // Lazy backfill: fetch GitHub description if missing
    if (!project.description && project.githubOwner && project.githubRepo) {
      const userId = req.user?.userId;
      if (userId) {
        const accessToken = await resolveAccessToken(userId, { status: () => ({ json: () => {} }) } as unknown as import("express").Response);
        if (accessToken) {
          const ghDescription = await getRepoDescriptionREST(accessToken, project.githubOwner, project.githubRepo);
          if (ghDescription) {
            await db.update(schema.projects).set({ description: ghDescription, updatedAt: new Date() }).where(eq(schema.projects.id, project.id));
            project.description = ghDescription;
          }
        }
      }
    }

    res.json({ project });
  } catch (error) {
    logger.error(`Failed to get project: ${error}`, "projects-route", { projectId: req.params.id });
    res.status(500).json({ error: "Failed to get project" });
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
