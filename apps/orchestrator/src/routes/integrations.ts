import { Router, type Request, type Response } from "express";
import { nanoid } from "nanoid";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { getWhatsAppService, resetWhatsAppService } from "../integrations/whatsapp-service.js";
import { getTelegramService, resetTelegramService } from "../integrations/telegram-service.js";
import { encrypt, decrypt } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * POST /api/integrations/whatsapp/connect
 * Start WhatsApp connection
 * Body: { projectId: string, linkedAgentId?: string }
 */
router.post("/integrations/whatsapp/connect", async (req: Request, res: Response) => {
  try {
    const { projectId, linkedAgentId, allowedNumber } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    const configJson = allowedNumber ? JSON.stringify({ allowedNumber }) : null;

    // Check if integration already exists
    let integration = await db.query.integrations.findFirst({
      where: (integrations, { and, eq }) =>
        and(
          eq(integrations.projectId, projectId),
          eq(integrations.type, "whatsapp")
        ),
    });

    // Create integration if it doesn't exist
    if (!integration) {
      const integrationId = nanoid();
      await db.insert(schema.integrations).values({
        id: integrationId,
        projectId,
        type: "whatsapp",
        status: "disconnected",
        linkedAgentId: linkedAgentId || null,
        config: configJson,
        credentials: null,
      });

      integration = await db.query.integrations.findFirst({
        where: (integrations, { eq }) => eq(integrations.id, integrationId),
      });
    } else if (configJson) {
      // Update config on existing integration
      await db
        .update(schema.integrations)
        .set({ config: configJson, updatedAt: new Date() })
        .where(eq(schema.integrations.id, integration.id));
    }

    if (!integration) {
      return res.status(500).json({ error: "Failed to create integration" });
    }

    // Reset singleton if previous connection failed (stale state)
    try {
      const existing = getWhatsAppService();
      if (existing.getConnectionStatus() === "error") {
        resetWhatsAppService();
      }
    } catch {
      // Service not initialized yet, that's fine
    }

    // Initialize and connect WhatsApp service
    const whatsappService = getWhatsAppService(
      { projectId, linkedAgentId, allowedNumber },
      integration.id
    );

    await whatsappService.connect();

    logger.info("WhatsApp connection initiated", "whatsapp-route");

    // connect() fires in background — respond immediately with "connecting"
    res.json({
      success: true,
      status: "connecting",
      integrationId: integration.id,
    });
  } catch (error) {
    logger.error(
      `WhatsApp connect error: ${error instanceof Error ? error.message : "Unknown error"}`,
      "whatsapp-route"
    );
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to connect WhatsApp",
    });
  }
});

/**
 * GET /api/integrations/whatsapp/status
 * Get WhatsApp connection status
 * Query: ?projectId=xxx
 */
router.get("/integrations/whatsapp/status", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({ error: "projectId is required" });
    }

    // Get integration from database
    const integration = await db.query.integrations.findFirst({
      where: (integrations, { and, eq }) =>
        and(
          eq(integrations.projectId, projectId),
          eq(integrations.type, "whatsapp")
        ),
    });

    if (!integration) {
      return res.json({ status: "disconnected", integrationId: null });
    }

    const config = integration.config ? JSON.parse(integration.config) : {};

    res.json({
      status: integration.status,
      integrationId: integration.id,
      lastConnectedAt: integration.lastConnectedAt,
      allowedNumber: config.allowedNumber || null,
    });
  } catch (error) {
    logger.error(
      `WhatsApp status error: ${error instanceof Error ? error.message : "Unknown error"}`,
      "whatsapp-route"
    );
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get WhatsApp status",
    });
  }
});

/**
 * POST /api/integrations/whatsapp/disconnect
 * Disconnect WhatsApp
 * Body: { projectId: string }
 */
router.post("/integrations/whatsapp/disconnect", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    // Get integration from database
    const integration = await db.query.integrations.findFirst({
      where: (integrations, { and, eq }) =>
        and(
          eq(integrations.projectId, projectId),
          eq(integrations.type, "whatsapp")
        ),
    });

    if (!integration) {
      return res.status(404).json({ error: "WhatsApp integration not found" });
    }

    // Disconnect service
    try {
      const whatsappService = getWhatsAppService();
      await whatsappService.disconnect();
    } catch (error) {
      // Service might not be initialized, ignore
      logger.warn("WhatsApp service not initialized, resetting", "whatsapp-route");
    }

    // Reset singleton
    resetWhatsAppService();

    // Update database
    await db
      .update(schema.integrations)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(eq(schema.integrations.id, integration.id));

    logger.info("WhatsApp disconnected", "whatsapp-route");

    res.json({ success: true, status: "disconnected" });
  } catch (error) {
    logger.error(
      `WhatsApp disconnect error: ${error instanceof Error ? error.message : "Unknown error"}`,
      "whatsapp-route"
    );
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to disconnect WhatsApp",
    });
  }
});

/**
 * PUT /api/integrations/whatsapp/config
 * Update WhatsApp config (allowedNumber) without reconnecting
 * Body: { projectId: string, allowedNumber?: string }
 */
router.put("/integrations/whatsapp/config", async (req: Request, res: Response) => {
  try {
    const { projectId, allowedNumber } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    const integration = await db.query.integrations.findFirst({
      where: (integrations, { and, eq }) =>
        and(
          eq(integrations.projectId, projectId),
          eq(integrations.type, "whatsapp"),
        ),
    });

    if (!integration) {
      return res.status(404).json({ error: "WhatsApp integration not found" });
    }

    // Merge with existing config
    const existingConfig = integration.config ? JSON.parse(integration.config) : {};
    const newConfig = { ...existingConfig, allowedNumber: allowedNumber || undefined };

    await db
      .update(schema.integrations)
      .set({ config: JSON.stringify(newConfig), updatedAt: new Date() })
      .where(eq(schema.integrations.id, integration.id));

    // Update in-memory service config if running
    try {
      const service = getWhatsAppService();
      service.updateAllowedNumber(allowedNumber || undefined);
    } catch {
      // Service not running, config saved to DB for next connect
    }

    logger.info(`WhatsApp config updated for project ${projectId}`, "whatsapp-route");

    res.json({ success: true, allowedNumber: allowedNumber || null });
  } catch (error) {
    logger.error(
      `WhatsApp config update error: ${error instanceof Error ? error.message : "Unknown error"}`,
      "whatsapp-route",
    );
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to update WhatsApp config",
    });
  }
});

/**
 * POST /api/integrations/telegram/connect
 * Start Telegram bot
 * Body: { projectId: string, linkedAgentId?: string, botToken: string }
 */
router.post("/integrations/telegram/connect", async (req: Request, res: Response) => {
  try {
    const { projectId, linkedAgentId, botToken } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    if (!botToken) {
      return res.status(400).json({ error: "botToken is required" });
    }

    // Check if integration already exists
    let integration = await db.query.integrations.findFirst({
      where: (integrations, { and, eq }) =>
        and(
          eq(integrations.projectId, projectId),
          eq(integrations.type, "telegram")
        ),
    });

    // Create or update integration
    if (!integration) {
      const integrationId = nanoid();
      await db.insert(schema.integrations).values({
        id: integrationId,
        projectId,
        type: "telegram",
        status: "disconnected",
        linkedAgentId: linkedAgentId || null,
        config: null,
        credentials: encrypt(JSON.stringify({ botToken })),
      });

      integration = await db.query.integrations.findFirst({
        where: (integrations, { eq }) => eq(integrations.id, integrationId),
      });
    } else {
      // Update existing integration with new bot token
      await db
        .update(schema.integrations)
        .set({
          credentials: encrypt(JSON.stringify({ botToken })),
          linkedAgentId: linkedAgentId || null,
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, integration.id));

      integration = await db.query.integrations.findFirst({
        where: (integrations, { eq }) => eq(integrations.id, integration!.id),
      });
    }

    if (!integration) {
      return res.status(500).json({ error: "Failed to create integration" });
    }

    // Initialize and start Telegram service
    const telegramService = getTelegramService(
      { projectId, linkedAgentId, botToken },
      integration.id
    );

    await telegramService.start();

    logger.info("Telegram bot started", "telegram-route");

    res.json({
      success: true,
      status: telegramService.getConnectionStatus(),
      integrationId: integration.id,
    });
  } catch (error) {
    logger.error(
      `Telegram connect error: ${error instanceof Error ? error.message : "Unknown error"}`,
      "telegram-route"
    );
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to start Telegram bot",
    });
  }
});

/**
 * GET /api/integrations/telegram/status
 * Get Telegram bot status
 * Query: ?projectId=xxx
 */
router.get("/integrations/telegram/status", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({ error: "projectId is required" });
    }

    // Get integration from database
    const integration = await db.query.integrations.findFirst({
      where: (integrations, { and, eq }) =>
        and(
          eq(integrations.projectId, projectId),
          eq(integrations.type, "telegram")
        ),
    });

    if (!integration) {
      return res.json({ status: "disconnected", integrationId: null });
    }

    res.json({
      status: integration.status,
      integrationId: integration.id,
      lastConnectedAt: integration.lastConnectedAt,
    });
  } catch (error) {
    logger.error(
      `Telegram status error: ${error instanceof Error ? error.message : "Unknown error"}`,
      "telegram-route"
    );
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get Telegram status",
    });
  }
});

/**
 * POST /api/integrations/telegram/disconnect
 * Stop Telegram bot
 * Body: { projectId: string }
 */
router.post("/integrations/telegram/disconnect", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    // Get integration from database
    const integration = await db.query.integrations.findFirst({
      where: (integrations, { and, eq }) =>
        and(
          eq(integrations.projectId, projectId),
          eq(integrations.type, "telegram")
        ),
    });

    if (!integration) {
      return res.status(404).json({ error: "Telegram integration not found" });
    }

    // Stop service
    try {
      const telegramService = getTelegramService();
      await telegramService.stop();
    } catch (error) {
      // Service might not be initialized, ignore
      logger.warn("Telegram service not initialized, resetting", "telegram-route");
    }

    // Reset singleton
    resetTelegramService();

    // Update database
    await db
      .update(schema.integrations)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(eq(schema.integrations.id, integration.id));

    logger.info("Telegram bot stopped", "telegram-route");

    res.json({ success: true, status: "disconnected" });
  } catch (error) {
    logger.error(
      `Telegram disconnect error: ${error instanceof Error ? error.message : "Unknown error"}`,
      "telegram-route"
    );
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to stop Telegram bot",
    });
  }
});

export { router as integrationsRouter };
