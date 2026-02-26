import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { encrypt, safeDecrypt } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";
import { fetchGeminiUsage } from "../services/gemini-usage.js";

export const geminiRouter: ReturnType<typeof Router> = Router();

// GET /api/gemini/status — check if Gemini is connected
geminiRouter.get("/status", async (_req, res) => {
  // 1. Check env var
  if (process.env.GEMINI_API_KEY) {
    res.json({
      connected: true,
      source: "env",
      masked: maskKey(process.env.GEMINI_API_KEY),
    });
    return;
  }

  // 2. Check OAuth (~/.gemini/oauth_creds.json)
  try {
    const { getGeminiOAuthToken } = await import("../services/gemini-oauth.js");
    const oauthToken = await getGeminiOAuthToken();
    if (oauthToken) {
      let email: string | null = null;
      try {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${oauthToken}` },
          signal: AbortSignal.timeout(5_000),
        });
        if (userInfoRes.ok) {
          const userInfo = await userInfoRes.json() as { email?: string };
          email = userInfo.email ?? null;
        }
      } catch { /* ignore userinfo fetch failures */ }

      res.json({
        connected: true,
        source: "oauth",
        email,
      });
      return;
    }
  } catch {
    // Fall through
  }

  // 3. Check integrations table (API key)
  const row = await db.select()
    .from(schema.integrations)
    .where(eq(schema.integrations.type, "gemini" as "whatsapp"))
    .get();

  if (row?.credentials) {
    try {
      const key = safeDecrypt(row.credentials);
      res.json({
        connected: true,
        source: "db",
        masked: maskKey(key),
        status: row.status,
      });
    } catch (err) {
      logger.warn(`Failed to decrypt stored Gemini key: ${err}`, "gemini");
      res.json({ connected: false, error: "Failed to decrypt stored key" });
    }
  } else {
    res.json({ connected: false });
  }
});

// POST /api/gemini/connect — save API key
geminiRouter.post("/connect", async (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
    res.status(400).json({ error: "Invalid API key." });
    return;
  }

  // Validate key by making a test request
  try {
    const testRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`,
    );

    if (!testRes.ok) {
      const body = await testRes.json().catch(() => null);
      res.status(400).json({
        error: `Invalid API key: ${(body as Record<string, Record<string, string>>)?.error?.message ?? testRes.statusText}`,
      });
      return;
    }
  } catch (err) {
    logger.error(`Failed to validate Gemini API key: ${err}`, "gemini");
    res.status(500).json({ error: "Failed to validate API key with Google" });
    return;
  }

  // Upsert into integrations table (global, no projectId)
  const existing = await db.select()
    .from(schema.integrations)
    .where(eq(schema.integrations.type, "gemini" as "whatsapp"))
    .get();

  const encryptedKey = encrypt(apiKey.trim());

  if (existing) {
    await db.update(schema.integrations).set({
      credentials: encryptedKey,
      status: "connected",
      updatedAt: new Date(),
    }).where(eq(schema.integrations.id, existing.id));
  } else {
    await db.insert(schema.integrations).values({
      id: nanoid(),
      projectId: null,
      type: "gemini" as "whatsapp",
      status: "connected",
      credentials: encryptedKey,
      config: null,
      linkedAgentId: null,
    });
  }

  logger.info("Gemini API key connected successfully", "gemini");
  res.json({ connected: true, masked: maskKey(apiKey.trim()) });
});

// POST /api/gemini/disconnect — remove API key
geminiRouter.post("/disconnect", async (_req, res) => {
  await db.delete(schema.integrations)
    .where(eq(schema.integrations.type, "gemini" as "whatsapp"));

  logger.info("Gemini API key disconnected", "gemini");
  res.json({ connected: false });
});

// GET /api/gemini/usage — fetch quota via Code Assist API (auto-discovers project)
geminiRouter.get("/usage", async (_req, res) => {
  try {
    const usage = await fetchGeminiUsage();
    res.json(usage);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch Gemini usage";
    logger.warn(`Gemini usage fetch failed: ${message}`, "gemini");
    res.status(502).json({ error: message });
  }
});

function maskKey(key: string): string {
  if (key.length <= 8) return "AI****";
  return key.slice(0, 5) + "..." + key.slice(-4);
}
