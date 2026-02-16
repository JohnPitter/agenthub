import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { devServerManager } from "../processes/dev-server-manager.js";
import { logger } from "../lib/logger.js";

export const devServerRouter = Router();

// POST /api/projects/:id/dev-server/start
devServerRouter.post("/:id/dev-server/start", async (req, res) => {
  const { id } = req.params;

  const project = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();

  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  if (!project.path) {
    return res.status(400).json({ error: "Project has no path configured" });
  }

  const result = devServerManager.start(id, project.path);

  if (!result.ok) {
    logger.warn(`Dev server start failed for ${id}: ${result.error}`, "devserver");
    return res.status(400).json({ error: result.error });
  }

  const status = devServerManager.getStatus(id);
  res.json({ status: status.status, port: status.port });
});

// POST /api/projects/:id/dev-server/stop
devServerRouter.post("/:id/dev-server/stop", async (req, res) => {
  const { id } = req.params;
  devServerManager.stop(id);
  res.json({ status: "stopped" });
});

// GET /api/projects/:id/dev-server/status
devServerRouter.get("/:id/dev-server/status", async (req, res) => {
  const { id } = req.params;
  const status = devServerManager.getStatus(id);
  res.json(status);
});
