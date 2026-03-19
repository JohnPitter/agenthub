import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const devServerRouter: ReturnType<typeof Router> = Router();

// GET /api/projects/:id/dev-server/status
devServerRouter.get("/:id/dev-server/status", async (_req, res) => {
  res.json({ status: "stopped", port: null, logs: [] });
});

// POST /api/projects/:id/dev-server/start — no-op (preview handled client-side via WebContainer)
devServerRouter.post("/:id/dev-server/start", async (_req, res) => {
  res.json({ status: "not_supported", message: "Preview is handled client-side via WebContainer" });
});

// POST /api/projects/:id/dev-server/stop — no-op
devServerRouter.post("/:id/dev-server/stop", async (_req, res) => {
  res.json({ status: "stopped" });
});

// GET /api/projects/:id/files/tree — get file tree for WebContainer
devServerRouter.get("/:id/files/tree", async (req, res) => {
  try {
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, req.params.id))
      .then(r => r[0]);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // The file tree is already available via the files route
    // This endpoint is a convenience alias
    res.json({ path: project.path, status: "ok" });
  } catch (error) {
    logger.error(`Failed to get file tree: ${error}`, "devserver");
    res.status(500).json({ error: "Failed to get file tree" });
  }
});
