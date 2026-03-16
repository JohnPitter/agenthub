import { Router } from "express";
import express from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { join } from "path";
import { existsSync } from "fs";
import { devServerManager } from "../processes/dev-server-manager.js";
import { logger } from "../lib/logger.js";

export const devServerRouter: ReturnType<typeof Router> = Router();

// POST /api/projects/:id/dev-server/start
devServerRouter.post("/:id/dev-server/start", async (req, res) => {
  const { id } = req.params;

  const project = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .then(r => r[0]);

  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  if (!project.path) {
    return res.status(400).json({ error: "Project has no path configured" });
  }

  const result = await devServerManager.start(id, project.path);

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

// GET /api/projects/:id/preview/* — serve built static files
devServerRouter.use("/:id/preview", (req, res) => {
  const { id } = req.params;
  const outputDir = devServerManager.getOutputDir(id);

  if (!outputDir) {
    return res.status(404).json({ error: "Preview not available. Build the project first." });
  }

  // Serve static files from the build output directory
  express.static(outputDir)(req, res, () => {
    // SPA fallback: serve index.html for any unmatched route
    const indexPath = join(outputDir, "index.html");
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Not found");
    }
  });
});
