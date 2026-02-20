import { Router } from "express";
import { randomBytes, randomUUID } from "crypto";
import {
  generateCodeVerifier,
  buildAuthUrl,
  exchangeCode,
  readCodexCredentials,
  deleteCodexCredentials,
  getCodexOAuthToken,
  decodeJwtPayload,
  extractAccountId,
} from "../services/codex-oauth.js";
import { logger } from "../lib/logger.js";

// Protected routes (behind authMiddleware)
export const codexOAuthRouter: ReturnType<typeof Router> = Router();

// Public callback handler (no authMiddleware)
export const codexCallbackRouter: ReturnType<typeof Router> = Router();

// In-memory pending OAuth state (single-user desktop app)
let pendingOAuth: { codeVerifier: string; state: string; redirectUri: string } | null = null;

// GET /api/openai/oauth/start — returns { authUrl } for frontend to window.open()
codexOAuthRouter.get("/oauth/start", (_req, res) => {
  try {
    // Use http://localhost:3001/callback to match Codex CLI's registered redirect URIs
    const port = process.env.ORCHESTRATOR_PORT ?? "3001";
    const redirectUri = `http://localhost:${port}/callback`;

    const codeVerifier = generateCodeVerifier();
    const state = randomBytes(32).toString("base64url");

    pendingOAuth = { codeVerifier, state, redirectUri };

    const authUrl = buildAuthUrl(redirectUri, codeVerifier, state);
    logger.info("Codex OAuth flow started", "codex-oauth");
    res.json({ authUrl });
  } catch (err) {
    logger.error(`Failed to start OAuth: ${err}`, "codex-oauth");
    res.status(500).json({ error: "Failed to start OAuth flow" });
  }
});

// GET /api/openai/oauth/connection — check connection status from ~/.codex/auth.json
codexOAuthRouter.get("/oauth/connection", async (_req, res) => {
  try {
    const token = await getCodexOAuthToken();
    if (!token) {
      res.json({ connected: false });
      return;
    }

    const creds = await readCodexCredentials();
    const claims = creds?.id_token ? decodeJwtPayload(creds.id_token) : null;

    // Extract plan info from the id_token JWT "https://api.openai.com/auth" claim
    const authClaim = claims?.["https://api.openai.com/auth"] as Record<string, unknown> | undefined;
    const planType = (authClaim?.chatgpt_plan_type as string) ?? null;
    const subscriptionActiveUntil = (authClaim?.chatgpt_subscription_active_until as string) ?? null;

    res.json({
      connected: true,
      source: "oauth",
      email: claims?.email ?? null,
      planType,
      subscriptionActiveUntil,
    });
  } catch (err) {
    logger.warn(`Failed to check Codex OAuth connection: ${err}`, "codex-oauth");
    res.json({ connected: false });
  }
});

// POST /api/openai/oauth/disconnect — deletes ~/.codex/auth.json
codexOAuthRouter.post("/oauth/disconnect", async (_req, res) => {
  try {
    await deleteCodexCredentials();
    logger.info("Codex OAuth disconnected", "codex-oauth");
    res.json({ disconnected: true });
  } catch (err) {
    logger.error(`Failed to disconnect: ${err}`, "codex-oauth");
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

// Cache Codex usage for 2 minutes
let codexUsageCache: { data: Record<string, unknown>; fetchedAt: number } | null = null;
const CODEX_USAGE_CACHE_TTL = 2 * 60 * 1000;

// Persistent device ID for OpenAI API calls (per process lifetime)
let deviceId: string | null = null;
function getDeviceId(): string {
  if (!deviceId) deviceId = randomUUID();
  return deviceId;
}

// GET /api/openai/oauth/usage — proxy to chatgpt.com/backend-api/wham/usage
codexOAuthRouter.get("/oauth/usage", async (_req, res) => {
  try {
    // Return cache if fresh
    if (codexUsageCache && Date.now() - codexUsageCache.fetchedAt < CODEX_USAGE_CACHE_TTL) {
      return res.json(codexUsageCache.data);
    }

    const token = await getCodexOAuthToken();
    if (!token) {
      return res.status(424).json({ error: "openai_oauth_required" });
    }

    const creds = await readCodexCredentials();
    const accountId = creds?.account_id ?? (creds?.id_token ? extractAccountId(creds.id_token) : null);

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      "oai-product-sku": "CODEX",
      "oai-device-id": getDeviceId(),
      "oai-language": "en-US",
      "Content-Type": "application/json",
    };
    if (accountId) headers["chatgpt-account-id"] = accountId;

    const response = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers });

    if (!response.ok) {
      logger.warn(`WHAM usage API returned ${response.status}`, "codex-oauth");
      const mappedStatus = response.status === 401 || response.status === 403 ? 424 : response.status;
      return res.status(mappedStatus).json({ error: "openai_oauth_expired" });
    }

    const data = await response.json() as Record<string, unknown>;
    codexUsageCache = { data, fetchedAt: Date.now() };
    res.json(data);
  } catch (err) {
    logger.error(`Failed to fetch Codex usage: ${err}`, "codex-oauth");
    // Return stale cache as fallback
    if (codexUsageCache) {
      return res.json(codexUsageCache.data);
    }
    res.status(500).json({ error: "Failed to fetch usage" });
  }
});

// GET /api/openai/oauth/callback — PUBLIC (no authMiddleware)
// OpenAI redirects here after user authorizes
codexCallbackRouter.get("/", async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.warn(`OAuth callback error: ${error}`, "codex-oauth");
      res.redirect("/settings?openai_oauth=error");
      return;
    }

    if (!code || !state || !pendingOAuth) {
      logger.warn("OAuth callback missing code/state or no pending flow", "codex-oauth");
      res.redirect("/settings?openai_oauth=error");
      return;
    }

    if (state !== pendingOAuth.state) {
      logger.warn("OAuth callback state mismatch", "codex-oauth");
      res.redirect("/settings?openai_oauth=error");
      return;
    }

    await exchangeCode(
      code as string,
      pendingOAuth.redirectUri,
      pendingOAuth.codeVerifier,
    );

    pendingOAuth = null;
    logger.info("Codex OAuth flow completed successfully", "codex-oauth");
    res.redirect("/settings?openai_oauth=success");
  } catch (err) {
    logger.error(`OAuth callback failed: ${err}`, "codex-oauth");
    pendingOAuth = null;
    res.redirect("/settings?openai_oauth=error");
  }
});
