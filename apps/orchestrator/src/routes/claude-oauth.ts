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

// In-memory pending OAuth state (includes userId for per-user credential storage)
let pendingOAuth: { codeVerifier: string; state: string; redirectUri: string; userId: string } | null = null;

// GET /api/claude/oauth/start — returns { authUrl }
claudeOAuthRouter.get("/oauth/start", (req, res) => {
  try {
    const userId = req.user!.userId;
    const port = process.env.ORCHESTRATOR_PORT ?? "3001";
    const redirectUri = `http://localhost:${port}/callback/claude`;

    const codeVerifier = generateCodeVerifier();
    const state = randomBytes(32).toString("base64url");

    pendingOAuth = { codeVerifier, state, redirectUri, userId };

    const authUrl = buildClaudeAuthUrl(redirectUri, codeVerifier, state);
    logger.info("Claude OAuth flow started", "claude-oauth");
    res.json({ authUrl });
  } catch (err) {
    logger.error(`Failed to start Claude OAuth: ${err}`, "claude-oauth");
    res.status(500).json({ error: "Failed to start OAuth flow" });
  }
});

// GET /api/claude/oauth/connection — check connection status
claudeOAuthRouter.get("/oauth/connection", async (req, res) => {
  try {
    const userId = req.user!.userId;
    const token = await getClaudeOAuthToken(userId);
    if (!token) {
      res.json({ connected: false });
      return;
    }

    const creds = await getClaudeOAuthCredentials(userId);
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
claudeOAuthRouter.post("/oauth/disconnect", async (req, res) => {
  const userId = req.user!.userId;
  await clearClaudeOAuth(userId);
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
      pendingOAuth.userId,
    );

    pendingOAuth = null;
    invalidateClaudeStatusCache();
    logger.info("Claude OAuth flow completed successfully", "claude-oauth");
    res.redirect(`${env.FRONTEND_ORIGIN}/settings?claude_oauth=success`);
  } catch (err) {
    logger.error(`Claude OAuth callback failed: ${err}`, "claude-oauth");
    pendingOAuth = null;
    res.redirect(`${env.FRONTEND_ORIGIN}/settings?claude_oauth=error`);
  }
});

// ========== Status cache ==========
const STATUS_TTL = 5 * 60 * 1000; // 5 min
let claudeStatusCache: { data: Record<string, unknown>; ts: number } | null = null;

function invalidateClaudeStatusCache() {
  claudeStatusCache = null;
}

async function resolveClaudeStatus(userId?: string): Promise<Record<string, unknown>> {
  // 1. Check Claude Code CLI auth (SDK reads ~/.claude/ internally)
  try {
    const conversation = query({
      prompt: "Say OK",
      options: { maxTurns: 1, permissionMode: "plan", allowedTools: [] },
    });
    const info = await conversation.accountInfo();
    conversation.close();

    if (info.email || info.tokenSource) {
      return {
        connected: true,
        source: "cli",
        email: info.email ?? null,
        plan: info.subscriptionType ?? null,
        tokenSource: info.tokenSource ?? null,
      };
    }
  } catch {
    // SDK not available — fall through
  }

  // 1b. Check Claude CLI credentials file (~/.claude/credentials.json)
  // No userId — CLI tokens are global, not per-user
  try {
    const cliToken = await getClaudeOAuthToken();
    if (cliToken) {
      return {
        connected: true,
        source: "cli",
      };
    }
  } catch {
    // CLI credentials not available — fall through
  }

  // 2. Check env var
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      connected: true,
      source: "env",
      masked: maskKey(process.env.ANTHROPIC_API_KEY),
    };
  }

  // 3. Check DB integrations (API key)
  const row = await db.select()
    .from(schema.integrations)
    .where(eq(schema.integrations.type, "claude" as "whatsapp"))
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
      logger.warn(`Failed to decrypt stored Claude key: ${err}`, "claude");
    }
  }

  // 4. Check OAuth (last resort)
  try {
    const token = await getClaudeOAuthToken(userId);
    if (token) {
      const creds = await getClaudeOAuthCredentials(userId);
      return {
        connected: true,
        source: "oauth",
        scope: creds?.scope ?? null,
      };
    }
  } catch { /* fall through */ }

  return { connected: false };
}

// GET /api/claude/status — cached, priority: CLI → ENV → DB → OAuth
// Only caches connected=true results; disconnected always re-checks
claudeOAuthRouter.get("/status", async (req, res) => {
  if (claudeStatusCache && Date.now() - claudeStatusCache.ts < STATUS_TTL) {
    res.json(claudeStatusCache.data);
    return;
  }

  const userId = req.user!.userId;
  const data = await resolveClaudeStatus(userId);
  if (data.connected) {
    claudeStatusCache = { data, ts: Date.now() };
  }
  res.json(data);
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

  invalidateClaudeStatusCache();
  logger.info("Claude API key connected successfully", "claude");
  res.json({ connected: true, masked: maskKey(apiKey.trim()) });
});

// POST /api/claude/disconnect — remove API key from DB
claudeOAuthRouter.post("/disconnect", async (req, res) => {
  const userId = req.user!.userId;
  // Clear both OAuth and DB
  await clearClaudeOAuth(userId);
  await db.delete(schema.integrations)
    .where(eq(schema.integrations.type, "claude" as "whatsapp"));

  invalidateClaudeStatusCache();
  logger.info("Claude disconnected", "claude");
  res.json({ connected: false });
});

function maskKey(key: string): string {
  if (key.length <= 8) return "sk-****";
  return key.slice(0, 5) + "..." + key.slice(-4);
}
