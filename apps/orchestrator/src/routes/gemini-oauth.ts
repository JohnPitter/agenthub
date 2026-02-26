import { Router } from "express";
import { randomBytes } from "crypto";
import {
  generateGeminiCodeVerifier,
  buildGeminiAuthUrl,
  exchangeGeminiCode,
  getGeminiOAuthToken,
  readGeminiCredentials,
  deleteGeminiCredentials,
} from "../services/gemini-oauth.js";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";

// Protected routes (behind authMiddleware)
export const geminiOAuthRouter: ReturnType<typeof Router> = Router();

// Public callback handler (no authMiddleware)
export const geminiCallbackRouter: ReturnType<typeof Router> = Router();

// In-memory pending OAuth state (single-user desktop app)
let pendingOAuth: { codeVerifier: string; state: string; redirectUri: string } | null = null;

// GET /api/gemini/oauth/start — returns { authUrl }
geminiOAuthRouter.get("/oauth/start", (_req, res) => {
  try {
    const port = process.env.ORCHESTRATOR_PORT ?? "3001";
    const redirectUri = `http://localhost:${port}/callback/gemini`;

    const codeVerifier = generateGeminiCodeVerifier();
    const state = randomBytes(32).toString("base64url");

    pendingOAuth = { codeVerifier, state, redirectUri };

    const authUrl = buildGeminiAuthUrl(redirectUri, codeVerifier, state);
    logger.info("Gemini OAuth flow started", "gemini-oauth");
    res.json({ authUrl });
  } catch (err) {
    logger.error(`Failed to start Gemini OAuth: ${err}`, "gemini-oauth");
    res.status(500).json({ error: "Failed to start OAuth flow" });
  }
});

// GET /api/gemini/oauth/connection — check OAuth connection status
geminiOAuthRouter.get("/oauth/connection", async (_req, res) => {
  try {
    const token = await getGeminiOAuthToken();
    if (!token) {
      res.json({ connected: false });
      return;
    }

    const creds = await readGeminiCredentials();

    // Fetch user email from Google
    let email: string | null = null;
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
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
      scope: creds?.scope ?? null,
      expiresAt: creds?.expiry_date ?? null,
    });
  } catch (err) {
    logger.warn(`Failed to check Gemini OAuth: ${err}`, "gemini-oauth");
    res.json({ connected: false });
  }
});

// POST /api/gemini/oauth/disconnect — delete ~/.gemini/oauth_creds.json
geminiOAuthRouter.post("/oauth/disconnect", async (_req, res) => {
  try {
    await deleteGeminiCredentials();
    logger.info("Gemini OAuth disconnected", "gemini-oauth");
    res.json({ disconnected: true });
  } catch (err) {
    logger.error(`Failed to disconnect Gemini OAuth: ${err}`, "gemini-oauth");
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

// GET /callback/gemini — PUBLIC (no authMiddleware)
geminiCallbackRouter.get("/", async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.warn(`Gemini OAuth callback error: ${error}`, "gemini-oauth");
      res.redirect(`${env.FRONTEND_ORIGIN}/settings?gemini_oauth=error`);
      return;
    }

    if (!code || !state || !pendingOAuth) {
      logger.warn("Gemini OAuth callback missing code/state or no pending flow", "gemini-oauth");
      res.redirect(`${env.FRONTEND_ORIGIN}/settings?gemini_oauth=error`);
      return;
    }

    if (state !== pendingOAuth.state) {
      logger.warn("Gemini OAuth callback state mismatch", "gemini-oauth");
      res.redirect(`${env.FRONTEND_ORIGIN}/settings?gemini_oauth=error`);
      return;
    }

    await exchangeGeminiCode(
      code as string,
      pendingOAuth.redirectUri,
      pendingOAuth.codeVerifier,
    );

    pendingOAuth = null;
    logger.info("Gemini OAuth flow completed successfully", "gemini-oauth");
    res.redirect(`${env.FRONTEND_ORIGIN}/settings?gemini_oauth=success`);
  } catch (err) {
    logger.error(`Gemini OAuth callback failed: ${err}`, "gemini-oauth");
    pendingOAuth = null;
    res.redirect(`${env.FRONTEND_ORIGIN}/settings?gemini_oauth=error`);
  }
});
