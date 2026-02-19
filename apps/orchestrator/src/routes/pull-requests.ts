import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { GitHubService } from "../git/github-service.js";
import { logger } from "../lib/logger.js";

const router: ReturnType<typeof Router> = Router();
const githubService = new GitHubService();

/**
 * GET /api/projects/:id/prs/status
 * Check if GitHub integration is available (gh CLI + auth)
 */
router.get("/projects/:id/prs/status", async (req, res) => {
  try {
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const ghAvailable = await githubService.isGhAvailable();
    if (!ghAvailable) {
      return res.json({
        available: false,
        authenticated: false,
        repoSlug: null,
        reason: "gh CLI not installed",
      });
    }

    const authenticated = await githubService.isAuthenticated();
    if (!authenticated) {
      return res.json({
        available: true,
        authenticated: false,
        repoSlug: null,
        reason: "gh not authenticated",
      });
    }

    const repoSlug = await githubService.getRepoSlug(project.path);

    res.json({
      available: true,
      authenticated: true,
      repoSlug,
      reason: repoSlug ? null : "No GitHub remote found",
    });
  } catch (error) {
    logger.error("Failed to check PR status", "pr-routes", { error: String(error), projectId: req.params.id });
    res.status(500).json({ error: "Failed to check PR status" });
  }
});

/**
 * GET /api/projects/:id/prs
 * List pull requests
 */
router.get("/projects/:id/prs", async (req, res) => {
  try {
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const state = (req.query.state as "open" | "closed" | "merged" | "all") ?? "open";
    const limit = parseInt(req.query.limit as string) || 20;

    const prs = await githubService.listPRs(project.path, { state, limit });

    res.json({ prs });
  } catch (error) {
    logger.error("Failed to list PRs", "pr-routes", { error: String(error), projectId: req.params.id });
    res.status(500).json({ error: "Failed to list PRs" });
  }
});

/**
 * GET /api/projects/:id/prs/:number
 * Get a specific PR
 */
router.get("/projects/:id/prs/:number", async (req, res) => {
  try {
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const prNumber = parseInt(req.params.number);
    if (isNaN(prNumber)) {
      return res.status(400).json({ error: "Invalid PR number" });
    }

    const pr = await githubService.getPR(project.path, prNumber);
    if (!pr) {
      return res.status(404).json({ error: "PR not found" });
    }

    // Get reviews and checks in parallel
    const [reviews, checks] = await Promise.all([
      githubService.getPRReviews(project.path, prNumber),
      githubService.getPRChecks(project.path, prNumber),
    ]);

    res.json({ pr, reviews, checks });
  } catch (error) {
    logger.error("Failed to get PR", "pr-routes", { error: String(error), projectId: req.params.id, prNumber: req.params.number });
    res.status(500).json({ error: "Failed to get PR" });
  }
});

/**
 * POST /api/projects/:id/prs
 * Create a new pull request
 */
router.post("/projects/:id/prs", async (req, res) => {
  try {
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const { title, body, headBranch, baseBranch, draft, taskId } = req.body;

    if (!title || !headBranch || !baseBranch) {
      return res.status(400).json({ error: "title, headBranch, and baseBranch are required" });
    }

    const pr = await githubService.createPR(project.path, {
      title,
      body: body ?? "",
      headBranch,
      baseBranch,
      draft: draft ?? false,
    });

    if (!pr) {
      return res.status(500).json({ error: "Failed to create PR" });
    }

    // Log PR creation in taskLogs if taskId provided
    if (taskId) {
      await db.insert(schema.taskLogs).values({
        id: crypto.randomUUID(),
        taskId,
        agentId: null,
        action: "pr_created",
        fromStatus: null,
        toStatus: null,
        detail: JSON.stringify({ prNumber: pr.number, prUrl: pr.url }),
        filePath: null,
        createdAt: new Date(),
      });
    }

    logger.info("PR created", "pr-routes", {
      projectId: req.params.id,
      prNumber: String(pr.number),
      prUrl: pr.url,
      taskId,
    });

    res.json({ pr });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create PR";
    logger.error("Failed to create PR", "pr-routes", { error: String(error), projectId: req.params.id });
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/projects/:id/prs/:number/merge
 * Merge a pull request
 */
router.post("/projects/:id/prs/:number/merge", async (req, res) => {
  try {
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const prNumber = parseInt(req.params.number);
    if (isNaN(prNumber)) {
      return res.status(400).json({ error: "Invalid PR number" });
    }

    const method = (req.body.method as "merge" | "squash" | "rebase") ?? "squash";
    const success = await githubService.mergePR(project.path, prNumber, method);

    if (!success) {
      return res.status(500).json({ error: "Failed to merge PR" });
    }

    logger.info("PR merged", "pr-routes", { projectId: req.params.id, prNumber: String(prNumber), method });

    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to merge PR", "pr-routes", { error: String(error), projectId: req.params.id, prNumber: req.params.number });
    res.status(500).json({ error: "Failed to merge PR" });
  }
});

/**
 * POST /api/projects/:id/prs/:number/close
 * Close a pull request
 */
router.post("/projects/:id/prs/:number/close", async (req, res) => {
  try {
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const prNumber = parseInt(req.params.number);
    if (isNaN(prNumber)) {
      return res.status(400).json({ error: "Invalid PR number" });
    }

    const success = await githubService.closePR(project.path, prNumber);
    if (!success) {
      return res.status(500).json({ error: "Failed to close PR" });
    }

    logger.info("PR closed", "pr-routes", { projectId: req.params.id, prNumber: String(prNumber) });

    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to close PR", "pr-routes", { error: String(error), projectId: req.params.id });
    res.status(500).json({ error: "Failed to close PR" });
  }
});

/**
 * GET /api/projects/:id/prs/branch/:branch
 * Find PR for a specific branch
 */
router.get("/projects/:id/prs/branch/:branch", async (req, res) => {
  try {
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const pr = await githubService.findPRForBranch(project.path, req.params.branch);

    res.json({ pr });
  } catch (error) {
    logger.error("Failed to find PR for branch", "pr-routes", { error: String(error), projectId: req.params.id, branch: req.params.branch });
    res.status(500).json({ error: "Failed to find PR for branch" });
  }
});

export { router as pullRequestsRouter };
