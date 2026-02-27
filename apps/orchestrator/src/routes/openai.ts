import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { encrypt, safeDecrypt } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";

export const openaiRouter: ReturnType<typeof Router> = Router();

// ========== Status cache ==========
const STATUS_TTL = 5 * 60 * 1000; // 5 min
let openaiStatusCache: { data: Record<string, unknown>; ts: number } | null = null;

function invalidateOpenaiStatusCache() {
  openaiStatusCache = null;
}

async function resolveOpenaiStatus(): Promise<Record<string, unknown>> {
  // 1. Check Codex CLI credentials (~/.codex/auth.json)
  // No userId here — CLI tokens are global, not per-user
  try {
    const { getCodexOAuthToken, readCodexCredentials, decodeJwtPayload } = await import("../services/codex-oauth.js");
    const cliToken = await getCodexOAuthToken();
    if (cliToken) {
      const creds = await readCodexCredentials();
      const claims = creds?.id_token ? decodeJwtPayload(creds.id_token) : null;
      return {
        connected: true,
        source: "cli",
        email: (claims?.email as string) ?? null,
      };
    }
  } catch {
    // CLI not available — fall through
  }

  // 2. Check env var
  if (process.env.OPENAI_API_KEY) {
    return {
      connected: true,
      source: "env",
      masked: maskKey(process.env.OPENAI_API_KEY),
    };
  }

  // 3. Check integrations table (API key)
  const row = await db.select()
    .from(schema.integrations)
    .where(eq(schema.integrations.type, "openai" as "whatsapp"))
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
      logger.warn(`Failed to decrypt stored OpenAI key: ${err}`, "openai");
    }
  }

  return { connected: false };
}

// GET /api/openai/status — cached, priority: CLI → ENV → DB → OAuth
// Only caches connected=true results; disconnected always re-checks
openaiRouter.get("/status", async (_req, res) => {
  if (openaiStatusCache && Date.now() - openaiStatusCache.ts < STATUS_TTL) {
    res.json(openaiStatusCache.data);
    return;
  }

  const data = await resolveOpenaiStatus();
  if (data.connected) {
    openaiStatusCache = { data, ts: Date.now() };
  }
  res.json(data);
});

// POST /api/openai/connect — save API key
openaiRouter.post("/connect", async (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("sk-")) {
    res.status(400).json({ error: "Invalid API key. Must start with sk-" });
    return;
  }

  // Validate key by making a test request
  try {
    const testRes = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!testRes.ok) {
      const body = await testRes.json().catch(() => null);
      res.status(400).json({
        error: `Invalid API key: ${body?.error?.message ?? testRes.statusText}`,
      });
      return;
    }
  } catch (err) {
    logger.error(`Failed to validate OpenAI API key: ${err}`, "openai");
    res.status(500).json({ error: "Failed to validate API key with OpenAI" });
    return;
  }

  // Upsert into integrations table (global, no projectId)
  const existing = await db.select()
    .from(schema.integrations)
    .where(eq(schema.integrations.type, "openai" as "whatsapp"))
    .get();

  const encryptedKey = encrypt(apiKey);

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
      type: "openai" as "whatsapp",
      status: "connected",
      credentials: encryptedKey,
      config: null,
      linkedAgentId: null,
    });
  }

  invalidateOpenaiStatusCache();
  logger.info("OpenAI API key connected successfully", "openai");
  res.json({ connected: true, masked: maskKey(apiKey) });
});

// POST /api/openai/disconnect — remove API key
openaiRouter.post("/disconnect", async (_req, res) => {
  await db.delete(schema.integrations)
    .where(eq(schema.integrations.type, "openai" as "whatsapp"));

  invalidateOpenaiStatusCache();
  logger.info("OpenAI API key disconnected", "openai");
  res.json({ connected: false });
});

function maskKey(key: string): string {
  if (key.length <= 8) return "sk-****";
  return key.slice(0, 5) + "..." + key.slice(-4);
}
