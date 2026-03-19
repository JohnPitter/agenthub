import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { join } from "path";
import { existsSync, statSync } from "fs";
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
devServerRouter.get("/:id/preview/{*filePath}", (req, res) => {
  const { id } = req.params;
  // Express 5 wildcard params are arrays — join them back into a path string
  const rawPath = (req.params as unknown as { id: string; filePath: string[] }).filePath;
  const filePath = Array.isArray(rawPath) ? rawPath.join("/") : (rawPath || "");
  const outputDir = devServerManager.getOutputDir(id);

  if (!outputDir) {
    return res.status(404).json({ error: "Preview not available. Build the project first." });
  }

  // Resolve the requested file within the output directory
  const resolved = join(outputDir, filePath);

  // Path traversal protection
  if (!resolved.startsWith(outputDir)) {
    return res.status(403).send("Forbidden");
  }

  // Try to serve the exact file
  if (existsSync(resolved) && !statSync(resolved).isDirectory()) {
    return res.sendFile(resolved);
  }

  // Try index.html in subdirectory
  const dirIndex = join(resolved, "index.html");
  if (existsSync(dirIndex)) {
    return res.sendFile(dirIndex);
  }

  // SPA fallback: serve root index.html
  const rootIndex = join(outputDir, "index.html");
  if (existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  }

  res.status(404).send("Not found");
});

// Also handle the root /preview/ without trailing path
devServerRouter.get("/:id/preview", (req, res) => {
  const { id } = req.params;
  const outputDir = devServerManager.getOutputDir(id);

  if (!outputDir) {
    return res.status(404).json({ error: "Preview not available. Build the project first." });
  }

  const indexPath = join(outputDir, "index.html");
  if (existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  res.status(404).send("Not found");
});
