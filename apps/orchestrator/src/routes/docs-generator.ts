import { Router } from "express";
import { docGenerator } from "../agents/doc-generator.js";
import { logger } from "../lib/logger.js";
import type { ApiEndpoint } from "@agenthub/shared";

export const docsGeneratorRouter = Router();

// In-memory cache for generated API docs
let cachedApiDocs: ApiEndpoint[] | null = null;

// POST /api/docs-gen/generate-api — trigger API docs generation
docsGeneratorRouter.post("/generate-api", async (_req, res) => {
  try {
    const routeFiles = await docGenerator.getRouteFiles();
    const endpoints = await docGenerator.generateApiDocs(routeFiles);
    cachedApiDocs = endpoints;

    logger.info(`Generated API docs: ${endpoints.length} endpoints from ${routeFiles.length} files`, "docs-generator");
    res.json({ endpoints, fileCount: routeFiles.length });
  } catch (error) {
    logger.error(`Failed to generate API docs: ${error}`, "docs-generator");
    res.status(500).json({ error: "Failed to generate API docs" });
  }
});

// GET /api/docs-gen/api — return cached API docs (auto-generate if empty)
docsGeneratorRouter.get("/api", async (_req, res) => {
  try {
    if (!cachedApiDocs) {
      const routeFiles = await docGenerator.getRouteFiles();
      cachedApiDocs = await docGenerator.generateApiDocs(routeFiles);
      logger.info(`Auto-generated API docs: ${cachedApiDocs.length} endpoints`, "docs-generator");
    }

    res.json({ endpoints: cachedApiDocs });
  } catch (error) {
    logger.error(`Failed to get API docs: ${error}`, "docs-generator");
    res.status(500).json({ error: "Failed to get API docs" });
  }
});

// POST /api/docs-gen/generate-summary/:taskId — generate change summary for a task
docsGeneratorRouter.post("/generate-summary/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const summary = await docGenerator.generateChangeSummary(taskId);

    logger.info(`Generated change summary for task ${taskId}`, "docs-generator");
    res.json({ taskId, summary });
  } catch (error) {
    logger.error(`Failed to generate change summary: ${error}`, "docs-generator");
    res.status(500).json({ error: "Failed to generate change summary" });
  }
});
