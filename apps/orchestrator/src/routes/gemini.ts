import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { encrypt, safeDecrypt } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";
import { fetchGeminiUsage } from "../services/gemini-usage.js";

export const geminiRouter: ReturnType<typeof Router> = Router();

// ========== Status cache ==========
const STATUS_TTL = 5 * 60 * 1000; // 5 min
let geminiStatusCache: { data: Record<string, unknown>; ts: number } | null = null;

function invalidateGeminiStatusCache() {
  geminiStatusCache = null;
}

async function resolveGeminiStatus(): Promise<Record<string, unknown>> {
  // 1. Check Gemini CLI credentials (~/.gemini/oauth_creds.json)
  // No userId here — CLI tokens are global, not per-user
  try {
    const { getGeminiOAuthToken } = await import("../services/gemini-oauth.js");
    const cliToken = await getGeminiOAuthToken();
    if (cliToken) {
      let email: string | null = null;
      try {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${cliToken}` },
          signal: AbortSignal.timeout(5_000),
        });
        if (userInfoRes.ok) {
          const userInfo = await userInfoRes.json() as { email?: string };
          email = userInfo.email ?? null;
        }
      } catch { /* ignore userinfo fetch failures */ }

      return {
        connected: true,
        source: "cli",
        email,
      };
    }
  } catch {
    // CLI not available — fall through
  }

  // 2. Check env var
  if (process.env.GEMINI_API_KEY) {
    return {
      connected: true,
      source: "env",
      masked: maskKey(process.env.GEMINI_API_KEY),
    };
  }

  // 3. Check integrations table (API key)
  const row = await db.select()
    .from(schema.integrations)
    .where(eq(schema.integrations.type, "gemini" as "whatsapp"))
    .get();

  if (row?.credentials) {
    try {
      const key = safeDecrypt(row.credentials);
      return {
        connected: true,
        source: "db",
        masked: maskKey(key),
        status: row.status,
      };
    } catch (err) {
      logger.warn(`Failed to decrypt stored Gemini key: ${err}`, "gemini");
    }
  }

  return { connected: false };
}

// GET /api/gemini/status — cached, priority: CLI → ENV → DB → OAuth
// Only caches connected=true results; disconnected always re-checks
geminiRouter.get("/status", async (_req, res) => {
  if (geminiStatusCache && Date.now() - geminiStatusCache.ts < STATUS_TTL) {
    res.json(geminiStatusCache.data);
    return;
  }

  const data = await resolveGeminiStatus();
  if (data.connected) {
    geminiStatusCache = { data, ts: Date.now() };
  }
  res.json(data);
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

  invalidateGeminiStatusCache();
  logger.info("Gemini API key connected successfully", "gemini");
  res.json({ connected: true, masked: maskKey(apiKey.trim()) });
});

// POST /api/gemini/disconnect — remove API key
geminiRouter.post("/disconnect", async (_req, res) => {
  await db.delete(schema.integrations)
    .where(eq(schema.integrations.type, "gemini" as "whatsapp"));

  invalidateGeminiStatusCache();
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
