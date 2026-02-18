import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { encrypt, decrypt } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";

export const openaiRouter = Router();

// GET /api/openai/status — check if OpenAI is connected
openaiRouter.get("/status", async (_req, res) => {
  // Check env var first
  if (process.env.OPENAI_API_KEY) {
    res.json({
      connected: true,
      source: "env",
      masked: maskKey(process.env.OPENAI_API_KEY),
    });
    return;
  }

  // 2. Check OAuth (~/.codex/auth.json)
  const { getCodexOAuthToken, readCodexCredentials, decodeJwtPayload } = await import("../services/codex-oauth.js");
  const oauthToken = await getCodexOAuthToken();
  if (oauthToken) {
    const creds = await readCodexCredentials();
    const claims = creds?.id_token ? decodeJwtPayload(creds.id_token) : null;
    res.json({
      connected: true,
      source: "oauth",
      email: (claims?.email as string) ?? null,
    });
    return;
  }

  // 3. Check integrations table (API key)
  const row = await db.select()
    .from(schema.integrations)
    .where(eq(schema.integrations.type, "openai" as "whatsapp"))
    .get();

  if (row?.credentials) {
    try {
      const key = decrypt(row.credentials);
      res.json({
        connected: true,
        source: "db",
        masked: maskKey(key),
        status: row.status,
      });
    } catch (err) {
      logger.warn(`Failed to decrypt stored OpenAI key: ${err}`, "openai");
      res.json({ connected: false, error: "Failed to decrypt stored key" });
    }
  } else {
    res.json({ connected: false });
  }
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

  logger.info("OpenAI API key connected successfully", "openai");
  res.json({ connected: true, masked: maskKey(apiKey) });
});

// POST /api/openai/disconnect — remove API key
openaiRouter.post("/disconnect", async (_req, res) => {
  await db.delete(schema.integrations)
    .where(eq(schema.integrations.type, "openai" as "whatsapp"));

  logger.info("OpenAI API key disconnected", "openai");
  res.json({ connected: false });
});

function maskKey(key: string): string {
  if (key.length <= 8) return "sk-****";
  return key.slice(0, 5) + "..." + key.slice(-4);
}
