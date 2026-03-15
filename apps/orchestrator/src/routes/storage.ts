import { Router } from "express";
import { storageService } from "../services/storage-service.js";
import { logger } from "../lib/logger.js";
import { eventBus } from "../realtime/event-bus.js";

export const storageRouter: ReturnType<typeof Router> = Router();

// GET /api/storage/usage
storageRouter.get("/usage", async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    const usage = await storageService.getUserStorageUsage(userId);
    res.json({ usage });
  } catch (err) {
    logger.error(`Failed to get storage usage: ${err}`, "storage");
    res.status(500).json({ error: "Failed to get storage usage" });
  }
});

// DELETE /api/storage/projects/:id/clone
storageRouter.delete("/projects/:id/clone", async (req, res) => {
  try {
    await storageService.deleteProjectClone(req.params.id);
    if (req.user?.userId) {
      eventBus.emit("storage:updated", { userId: req.user.userId });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error(`Failed to delete project clone: ${err}`, "storage");
    res.status(500).json({ error: String(err instanceof Error ? err.message : "Failed to delete clone") });
  }
});

// POST /api/storage/projects/:id/reclone
storageRouter.post("/projects/:id/reclone", async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    const newPath = await storageService.recloneProject(req.params.id, userId);
    eventBus.emit("storage:updated", { userId });
    res.json({ success: true, path: newPath });
  } catch (err) {
    logger.error(`Failed to reclone project: ${err}`, "storage");
    res.status(500).json({ error: String(err instanceof Error ? err.message : "Failed to reclone") });
  }
});
