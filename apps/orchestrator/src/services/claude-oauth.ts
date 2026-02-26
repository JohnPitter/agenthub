import { randomBytes, createHash } from "crypto";
import { logger } from "../lib/logger.js";

const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTH_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const SCOPES = "user:inference user:profile";

// In-memory token storage (desktop app — single user)
let storedCredentials: ClaudeOAuthCredentials | null = null;

export interface ClaudeOAuthCredentials {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
  scope: string;
}

// PKCE helpers
function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

export function generateCodeChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export function buildClaudeAuthUrl(
  redirectUri: string,
  codeVerifier: string,
  state: string,
): string {
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const params = new URLSearchParams({
    client_id: CLAUDE_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeClaudeCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  state: string,
): Promise<ClaudeOAuthCredentials> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CLAUDE_CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      state,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude token exchange failed (${res.status}): ${body}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const creds: ClaudeOAuthCredentials = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 28800) * 1000, // default 8h
    scope: data.scope ?? SCOPES,
  };

  storedCredentials = creds;
  logger.info("Claude OAuth tokens stored in memory", "claude-oauth");
  return creds;
}

async function refreshClaudeToken(creds: ClaudeOAuthCredentials): Promise<ClaudeOAuthCredentials> {
  if (!creds.refresh_token) {
    throw new Error("No refresh token available");
  }

  logger.info("Refreshing Claude OAuth token", "claude-oauth");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLAUDE_CLIENT_ID,
      refresh_token: creds.refresh_token,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude token refresh failed (${res.status}): ${body}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const updated: ClaudeOAuthCredentials = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? creds.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 28800) * 1000,
    scope: data.scope ?? creds.scope,
  };

  storedCredentials = updated;
  logger.info("Claude OAuth token refreshed successfully", "claude-oauth");
  return updated;
}

const TOKEN_REFRESH_MARGIN = 10 * 60 * 1000; // 10 min before expiry
let isRefreshing = false;

/**
 * Get a valid Claude OAuth access token, auto-refreshing if expired.
 * Returns null if no OAuth credentials exist.
 */
export async function getClaudeOAuthToken(): Promise<string | null> {
  if (!storedCredentials?.access_token) return null;

  const needsRefresh = storedCredentials.expires_at - Date.now() < TOKEN_REFRESH_MARGIN;
  if (needsRefresh && storedCredentials.refresh_token) {
    if (isRefreshing) {
      await new Promise((r) => setTimeout(r, 2000));
      return storedCredentials?.access_token ?? null;
    }

    isRefreshing = true;
    try {
      const updated = await refreshClaudeToken(storedCredentials);
      return updated.access_token;
    } catch (err) {
      logger.warn(`Claude token refresh failed: ${err instanceof Error ? err.message : "Unknown"}`, "claude-oauth");
      return storedCredentials.access_token;
    } finally {
      isRefreshing = false;
    }
  }

  return storedCredentials.access_token;
}

export function getClaudeOAuthCredentials(): ClaudeOAuthCredentials | null {
  return storedCredentials;
}

export function clearClaudeOAuth(): void {
  storedCredentials = null;
  logger.info("Claude OAuth credentials cleared", "claude-oauth");
}
