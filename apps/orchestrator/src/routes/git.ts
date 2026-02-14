import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq, and } from "drizzle-orm";
import { GitService } from "../git/git-service.js";
import { logger } from "../lib/logger.js";
import { encrypt, decrypt } from "../lib/encryption.js";

const router = Router();
const gitService = new GitService();

/**
 * GET /api/projects/:id/git/status
 * Get git status for a project
 */
router.get("/projects/:id/git/status", async (req, res) => {
  try {
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
      return res.json({ isGitRepo: false, status: null, remoteStatus: null, lastCommit: null });
    }

    const status = await gitService.getGitStatus(project.path);
    const lastCommit = await gitService.getLastCommit(project.path);
    const remoteUrl = await gitService.getRemoteUrl(project.path);

    let remoteStatus = null;
    if (remoteUrl) {
      try {
        await gitService.fetch(project.path);
        const aheadBehind = await gitService.getAheadBehind(project.path, status.branch);
        const remoteBranches = await gitService.getRemoteBranches(project.path);

        remoteStatus = {
          remoteUrl,
          ahead: aheadBehind.ahead,
          behind: aheadBehind.behind,
          remoteBranches,
        };
      } catch (error) {
        logger.warn(`Failed to fetch remote status: ${error}`, "git-routes");
      }
    }

    res.json({ isGitRepo: true, status, remoteStatus, lastCommit });
  } catch (error) {
    logger.error("Failed to get git status", { error, projectId: req.params.id });
    res.status(500).json({ error: "Failed to get git status" });
  }
});

/**
 * POST /api/projects/:id/git/init
 * Initialize a git repository for a project
 */
router.post("/projects/:id/git/init", async (req, res) => {
  try {
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    await gitService.initGitRepo(project.path);

    logger.info("Git repository initialized", {
      projectId: req.params.id,
      path: project.path,
    });

    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to initialize git repository", {
      error,
      projectId: req.params.id,
    });
    res.status(500).json({ error: "Failed to initialize git repository" });
  }
});

/**
 * GET /api/projects/:id/git/config
 * Get git configuration from integrations table
 */
router.get("/projects/:id/git/config", async (req, res) => {
  try {
    const integration = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.projectId, req.params.id),
          eq(schema.integrations.type, "git")
        )
      )
      .get();

    if (!integration) {
      return res.json(null);
    }

    const config = integration.config ? JSON.parse(integration.config) : null;
    res.json(config);
  } catch (error) {
    logger.error("Failed to get git config", { error, projectId: req.params.id });
    res.status(500).json({ error: "Failed to get git config" });
  }
});

/**
 * PUT /api/projects/:id/git/config
 * Update git configuration in integrations table
 */
router.put("/projects/:id/git/config", async (req, res) => {
  try {
    const { remoteUrl, defaultBranch, autoCommit, autoCreateBranch } = req.body;

    const config = JSON.stringify({
      remoteUrl: remoteUrl || null,
      defaultBranch: defaultBranch || "main",
      autoCommit: autoCommit ?? false,
      autoCreateBranch: autoCreateBranch ?? false,
    });

    // Check if integration exists
    const existing = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.projectId, req.params.id),
          eq(schema.integrations.type, "git")
        )
      )
      .get();

    if (existing) {
      // Update existing
      await db
        .update(schema.integrations)
        .set({
          config,
          status: "connected",
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, existing.id));
    } else {
      // Create new
      await db.insert(schema.integrations).values({
        id: crypto.randomUUID(),
        projectId: req.params.id,
        type: "git",
        status: "connected",
        config,
        linkedAgentId: null,
        lastConnectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    logger.info("Git config updated", { projectId: req.params.id, config });

    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to update git config", {
      error,
      projectId: req.params.id,
    });
    res.status(500).json({ error: "Failed to update git config" });
  }
});

/**
 * PUT /api/projects/:id/git/credentials
 * Save encrypted git credentials
 */
router.put("/projects/:id/git/credentials", async (req, res) => {
  try {
    const { type, sshKeyPath, token, username } = req.body;

    // Validate credentials based on type
    if (type === "ssh" && !sshKeyPath) {
      return res.status(400).json({ error: "SSH key path is required for SSH authentication" });
    }

    if (type === "https" && !token) {
      return res.status(400).json({ error: "Token is required for HTTPS authentication" });
    }

    // Encrypt credentials
    const credentials = JSON.stringify({ type, sshKeyPath, token, username });
    const encrypted = encrypt(credentials);

    // Find existing git integration
    const existing = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.projectId, req.params.id),
          eq(schema.integrations.type, "git")
        )
      )
      .get();

    if (existing) {
      // Update credentials
      await db
        .update(schema.integrations)
        .set({
          credentials: encrypted,
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, existing.id));
    } else {
      // Create new git integration with credentials
      await db.insert(schema.integrations).values({
        id: crypto.randomUUID(),
        projectId: req.params.id,
        type: "git",
        status: "connected",
        config: JSON.stringify({
          remoteUrl: null,
          defaultBranch: "main",
          autoCommit: false,
          autoCreateBranch: false,
          pushOnCommit: false,
          authMethod: type,
        }),
        credentials: encrypted,
        linkedAgentId: null,
        lastConnectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    logger.info("Git credentials saved", {
      projectId: req.params.id,
      authType: type,
    });

    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to save git credentials", {
      error,
      projectId: req.params.id,
    });
    res.status(500).json({ error: "Failed to save git credentials" });
  }
});

/**
 * POST /api/projects/:id/git/remote/add
 * Add or update remote URL for a project
 */
router.post("/projects/:id/git/remote/add", async (req, res) => {
  try {
    const { remoteUrl } = req.body;

    if (!remoteUrl) {
      return res.status(400).json({ error: "Remote URL is required" });
    }

    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check if remote already exists
    const existingRemote = await gitService.getRemoteUrl(project.path);

    if (existingRemote) {
      await gitService.setRemoteUrl(project.path, remoteUrl);
      logger.info("Git remote URL updated", {
        projectId: req.params.id,
        remoteUrl,
      });
    } else {
      await gitService.addRemote(project.path, remoteUrl);
      logger.info("Git remote added", { projectId: req.params.id, remoteUrl });
    }

    // Update config with remote URL
    const integration = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.projectId, req.params.id),
          eq(schema.integrations.type, "git")
        )
      )
      .get();

    if (integration && integration.config) {
      const config = JSON.parse(integration.config);
      config.remoteUrl = remoteUrl;

      await db
        .update(schema.integrations)
        .set({
          config: JSON.stringify(config),
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, integration.id));
    }

    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to add/update git remote", {
      error,
      projectId: req.params.id,
    });
    res.status(500).json({ error: "Failed to add/update git remote" });
  }
});

/**
 * GET /api/projects/:id/git/remote/branches
 * Get list of remote branches
 */
router.get("/projects/:id/git/remote/branches", async (req, res) => {
  try {
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Fetch latest from remote
    await gitService.fetch(project.path);

    // Get remote branches
    const branches = await gitService.getRemoteBranches(project.path);

    res.json({ branches });
  } catch (error) {
    logger.error("Failed to get remote branches", {
      error,
      projectId: req.params.id,
    });
    res.status(500).json({ error: "Failed to get remote branches" });
  }
});

/**
 * POST /api/projects/:id/git/sync
 * Sync with remote (fetch + pull)
 */
router.post("/projects/:id/git/sync", async (req, res) => {
  try {
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .get();

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check for uncommitted changes
    const hasChanges = await gitService.hasUncommittedChanges(project.path);

    if (hasChanges) {
      await gitService.stash(project.path);
      logger.info("Stashed uncommitted changes before sync", {
        projectId: req.params.id,
      });
    }

    // Fetch latest from remote
    await gitService.fetch(project.path);

    // Pull with merge
    const pullResult = await gitService.pull(project.path);

    if (hasChanges && pullResult.success) {
      await gitService.stashPop(project.path);
      logger.info("Restored stashed changes after sync", {
        projectId: req.params.id,
      });
    }

    if (pullResult.conflicts) {
      const conflictedFiles = await gitService.getConflictedFiles(project.path);
      logger.warn("Merge conflicts detected after sync", {
        projectId: req.params.id,
        conflictedFiles,
      });

      return res.json({
        success: false,
        conflicts: true,
        conflictedFiles,
      });
    }

    logger.info("Synced with remote successfully", {
      projectId: req.params.id,
    });

    res.json({ success: true, conflicts: false });
  } catch (error) {
    logger.error("Failed to sync with remote", {
      error,
      projectId: req.params.id,
    });
    res.status(500).json({ error: "Failed to sync with remote" });
  }
});

export { router as gitRouter };
