import { Router } from "express";
import { randomBytes } from "crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  generateCodeVerifier,
  buildClaudeAuthUrl,
  exchangeClaudeCode,
  getClaudeOAuthToken,
  getClaudeOAuthCredentials,
  clearClaudeOAuth,
} from "../services/claude-oauth.js";
import { logger } from "../lib/logger.js";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { encrypt, safeDecrypt } from "../lib/encryption.js";
import { env } from "../lib/env.js";

// Protected routes (behind authMiddleware)
export const claudeOAuthRouter: ReturnType<typeof Router> = Router();

// Public callback handler (no authMiddleware)
export const claudeCallbackRouter: ReturnType<typeof Router> = Router();

// In-memory pending OAuth state (single-user desktop app)
let pendingOAuth: { codeVerifier: string; state: string; redirectUri: string } | null = null;

// GET /api/claude/oauth/start — returns { authUrl }
claudeOAuthRouter.get("/oauth/start", (_req, res) => {
  try {
    const port = process.env.ORCHESTRATOR_PORT ?? "3001";
    const redirectUri = `http://localhost:${port}/callback/claude`;

    const codeVerifier = generateCodeVerifier();
    const state = randomBytes(32).toString("base64url");

    pendingOAuth = { codeVerifier, state, redirectUri };

    const authUrl = buildClaudeAuthUrl(redirectUri, codeVerifier, state);
    logger.info("Claude OAuth flow started", "claude-oauth");
    res.json({ authUrl });
  } catch (err) {
    logger.error(`Failed to start Claude OAuth: ${err}`, "claude-oauth");
    res.status(500).json({ error: "Failed to start OAuth flow" });
  }
});

// GET /api/claude/oauth/connection — check connection status
claudeOAuthRouter.get("/oauth/connection", async (_req, res) => {
  try {
    const token = await getClaudeOAuthToken();
    if (!token) {
      res.json({ connected: false });
      return;
    }

    const creds = getClaudeOAuthCredentials();
    res.json({
      connected: true,
      source: "oauth",
      scope: creds?.scope ?? null,
      expiresAt: creds?.expires_at ?? null,
    });
  } catch (err) {
    logger.warn(`Failed to check Claude OAuth: ${err}`, "claude-oauth");
    res.json({ connected: false });
  }
});

// POST /api/claude/oauth/disconnect
claudeOAuthRouter.post("/oauth/disconnect", (_req, res) => {
  clearClaudeOAuth();
  res.json({ disconnected: true });
});

// GET /callback/claude — PUBLIC (no authMiddleware)
claudeCallbackRouter.get("/", async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.warn(`Claude OAuth callback error: ${error}`, "claude-oauth");
      res.redirect(`${env.FRONTEND_ORIGIN}/settings?claude_oauth=error`);
      return;
    }

    if (!code || !state || !pendingOAuth) {
      logger.warn("Claude OAuth callback missing code/state or no pending flow", "claude-oauth");
      res.redirect(`${env.FRONTEND_ORIGIN}/settings?claude_oauth=error`);
      return;
    }

    if (state !== pendingOAuth.state) {
      logger.warn("Claude OAuth callback state mismatch", "claude-oauth");
      res.redirect(`${env.FRONTEND_ORIGIN}/settings?claude_oauth=error`);
      return;
    }

    await exchangeClaudeCode(
      code as string,
      pendingOAuth.redirectUri,
      pendingOAuth.codeVerifier,
      pendingOAuth.state,
    );

    pendingOAuth = null;
    logger.info("Claude OAuth flow completed successfully", "claude-oauth");
    res.redirect(`${env.FRONTEND_ORIGIN}/settings?claude_oauth=success`);
  } catch (err) {
    logger.error(`Claude OAuth callback failed: ${err}`, "claude-oauth");
    pendingOAuth = null;
    res.redirect(`${env.FRONTEND_ORIGIN}/settings?claude_oauth=error`);
  }
});

// ========== API Key routes ==========

// GET /api/claude/status — check if Claude is connected (env → OAuth → DB)
claudeOAuthRouter.get("/status", async (_req, res) => {
  // 1. Check env var
  if (process.env.ANTHROPIC_API_KEY) {
    res.json({
      connected: true,
      source: "env",
      masked: maskKey(process.env.ANTHROPIC_API_KEY),
    });
    return;
  }

  // 2. Check OAuth
  try {
    const token = await getClaudeOAuthToken();
    if (token) {
      const creds = getClaudeOAuthCredentials();
      res.json({
        connected: true,
        source: "oauth",
        scope: creds?.scope ?? null,
      });
      return;
    }
  } catch { /* fall through */ }

  // 3. Check DB integrations
  const row = await db.select()
    .from(schema.integrations)
    .where(eq(schema.integrations.type, "claude" as "whatsapp"))
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
      return;
    } catch (err) {
      logger.warn(`Failed to decrypt stored Claude key: ${err}`, "claude");
    }
  }

  // 4. Check Claude Code CLI auth (SDK reads ~/.claude/ internally)
  try {
    const conversation = query({
      prompt: "Say OK",
      options: { maxTurns: 1, permissionMode: "plan", allowedTools: [] },
    });
    const info = await conversation.accountInfo();
    conversation.close();

    if (info.email || info.tokenSource) {
      res.json({
        connected: true,
        source: info.tokenSource === "claude_ai_oauth" ? "cli_oauth" : "cli",
        email: info.email ?? null,
        plan: info.subscriptionType ?? null,
        tokenSource: info.tokenSource ?? null,
      });
      return;
    }
  } catch {
    // CLI not available — fall through
  }

  res.json({ connected: false });
});

// POST /api/claude/connect — save API key
claudeOAuthRouter.post("/connect", async (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
    res.status(400).json({ error: "Invalid API key." });
    return;
  }

  // Validate key by making a test request
  try {
    const testRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    // 200 or 429 (rate limit) means the key is valid
    if (!testRes.ok && testRes.status !== 429) {
      const body = await testRes.json().catch(() => null);
      res.status(400).json({
        error: `Invalid API key: ${(body as Record<string, Record<string, string>>)?.error?.message ?? testRes.statusText}`,
      });
      return;
    }
  } catch (err) {
    logger.error(`Failed to validate Claude API key: ${err}`, "claude");
    res.status(500).json({ error: "Failed to validate API key with Anthropic" });
    return;
  }

  // Upsert into integrations table
  const existing = await db.select()
    .from(schema.integrations)
    .where(eq(schema.integrations.type, "claude" as "whatsapp"))
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
      type: "claude" as "whatsapp",
      status: "connected",
      credentials: encryptedKey,
      config: null,
      linkedAgentId: null,
    });
  }

  logger.info("Claude API key connected successfully", "claude");
  res.json({ connected: true, masked: maskKey(apiKey.trim()) });
});

// POST /api/claude/disconnect — remove API key from DB
claudeOAuthRouter.post("/disconnect", async (_req, res) => {
  // Clear both OAuth and DB
  clearClaudeOAuth();
  await db.delete(schema.integrations)
    .where(eq(schema.integrations.type, "claude" as "whatsapp"));

  logger.info("Claude disconnected", "claude");
  res.json({ connected: false });
});

function maskKey(key: string): string {
  if (key.length <= 8) return "sk-****";
  return key.slice(0, 5) + "..." + key.slice(-4);
}
