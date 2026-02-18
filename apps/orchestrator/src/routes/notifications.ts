import { Router } from "express";
import { notificationService } from "../services/notification-service.js";
import { logger } from "../lib/logger.js";

export const notificationsRouter = Router();

// GET /api/notifications?projectId=...&read=true|false&limit=50&offset=0
notificationsRouter.get("/", async (req, res) => {
  try {
    const { projectId, read: readStr, limit: limitStr, offset: offsetStr } = req.query;
    const limit = parseInt(limitStr as string) || 50;
    const offset = parseInt(offsetStr as string) || 0;
    const read = readStr === "true" ? true : readStr === "false" ? false : undefined;

    const notifications = await notificationService.getAll(
      projectId as string | undefined,
      { read, limit, offset },
    );

    res.json({ notifications });
  } catch (error) {
    logger.error(`Failed to list notifications: ${error}`, "notifications-route");
    res.status(500).json({ error: "Failed to list notifications" });
  }
});

// GET /api/notifications/unread-count?projectId=...
notificationsRouter.get("/unread-count", async (req, res) => {
  try {
    const { projectId } = req.query;
    const count = await notificationService.getUnreadCount(projectId as string | undefined);
    res.json({ count });
  } catch (error) {
    logger.error(`Failed to get unread count: ${error}`, "notifications-route");
    res.status(500).json({ error: "Failed to get unread count" });
  }
});

// PUT /api/notifications/:id/read
notificationsRouter.put("/:id/read", async (req, res) => {
  try {
    const { id } = req.params;
    await notificationService.markAsRead(id);
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to mark notification as read: ${error}`, "notifications-route");
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// PUT /api/notifications/read-all
notificationsRouter.put("/read-all", async (req, res) => {
  try {
    const { projectId } = req.body;
    await notificationService.markAllAsRead(projectId as string | undefined);
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to mark all notifications as read: ${error}`, "notifications-route");
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

// DELETE /api/notifications/:id
notificationsRouter.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await notificationService.deleteNotification(id);
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to delete notification: ${error}`, "notifications-route");
    res.status(500).json({ error: "Failed to delete notification" });
  }
});
