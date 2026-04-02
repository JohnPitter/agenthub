import { Router, type Request, type Response } from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router: ReturnType<typeof Router> = Router();

/**
 * GET /api/settings/language
 * Returns the current user's language preference
 */
router.get("/language", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { language: true },
    });

    res.json({ language: user?.language ?? "pt-BR" });
  } catch (error) {
    logger.error(`Failed to get language setting: ${error}`, "settings");
    res.status(500).json({ error: "Failed to get language setting" });
  }
});

/**
 * PUT /api/settings/language
 * Saves the user's language preference
 * Body: { language: string }
 */
router.put("/language", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { language } = req.body;
    if (!language || typeof language !== "string") {
      return res.status(400).json({ error: "language is required" });
    }

    const validLanguages = ["pt-BR", "en-US", "es", "zh-CN", "ja"];
    if (!validLanguages.includes(language)) {
      return res.status(400).json({ error: "Invalid language code" });
    }

    await db
      .update(schema.users)
      .set({ language, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    logger.info(`User ${userId} changed language to ${language}`, "settings");
    res.json({ language });
  } catch (error) {
    logger.error(`Failed to save language setting: ${error}`, "settings");
    res.status(500).json({ error: "Failed to save language setting" });
  }
});

export const settingsRouter: ReturnType<typeof Router> = router;
