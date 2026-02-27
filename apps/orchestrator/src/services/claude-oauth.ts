import { randomBytes, createHash } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { logger } from "../lib/logger.js";
import { getUserOAuthPath, getLegacyOAuthPath } from "./oauth-paths.js";

const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTH_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const SCOPES = "user:inference user:profile";
const TOKEN_REFRESH_MARGIN = 10 * 60 * 1000; // 10 min before expiry

let isRefreshing = false;

export interface ClaudeOAuthCredentials {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
  scope: string;
}

function resolveCredPath(userId?: string): string {
  return userId ? getUserOAuthPath(userId, "claude") : getLegacyOAuthPath("claude");
}

// File-based persistence (survives server restarts)
export async function readClaudeCredentials(userId?: string): Promise<ClaudeOAuthCredentials | null> {
  // Per-user: only their own path (no fallback to CLI credentials)
  // No userId (agent sessions): legacy CLI path only
  const paths = userId
    ? [getUserOAuthPath(userId, "claude")]
    : [getLegacyOAuthPath("claude")];

  for (const credPath of paths) {
    try {
      const raw = await readFile(credPath, "utf-8");
      const data = JSON.parse(raw);

      // Claude CLI stores credentials nested under claudeAiOauth with camelCase
      if (data.claudeAiOauth) {
        return {
          access_token: data.claudeAiOauth.accessToken,
          refresh_token: data.claudeAiOauth.refreshToken,
          expires_at: data.claudeAiOauth.expiresAt ?? 0,
          scope: Array.isArray(data.claudeAiOauth.scopes)
            ? data.claudeAiOauth.scopes.join(" ")
            : "user:inference user:profile",
        };
      }

      // Flat format (our own writes via OAuth browser flow)
      return data;
    } catch {
      continue;
    }
  }
  return null;
}

async function writeClaudeCredentials(creds: ClaudeOAuthCredentials, userId?: string): Promise<void> {
  const credPath = resolveCredPath(userId);
  await mkdir(dirname(credPath), { recursive: true });
  await writeFile(credPath, JSON.stringify(creds, null, 2), "utf-8");
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
  userId?: string,
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

  await writeClaudeCredentials(creds, userId);
  logger.info(`Claude OAuth tokens saved for ${userId ? `user ${userId}` : "default"}`, "claude-oauth");
  return creds;
}

async function refreshClaudeToken(creds: ClaudeOAuthCredentials, userId?: string): Promise<ClaudeOAuthCredentials> {
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

  await writeClaudeCredentials(updated, userId);
  logger.info("Claude OAuth token refreshed successfully", "claude-oauth");
  return updated;
}

/**
 * Get a valid Claude OAuth access token, auto-refreshing if expired.
 * Returns null if no OAuth credentials exist.
 */
export async function getClaudeOAuthToken(userId?: string): Promise<string | null> {
  try {
    const creds = await readClaudeCredentials(userId);
    if (!creds?.access_token) return null;

    const needsRefresh = creds.expires_at - Date.now() < TOKEN_REFRESH_MARGIN;
    if (needsRefresh && creds.refresh_token) {
      if (isRefreshing) {
        await new Promise((r) => setTimeout(r, 2000));
        const fresh = await readClaudeCredentials(userId);
        return fresh?.access_token ?? null;
      }

      isRefreshing = true;
      try {
        const updated = await refreshClaudeToken(creds, userId);
        return updated.access_token;
      } catch (err) {
        logger.warn(`Claude token refresh failed: ${err instanceof Error ? err.message : "Unknown"}`, "claude-oauth");
        return creds.access_token;
      } finally {
        isRefreshing = false;
      }
    }

    return creds.access_token;
  } catch {
    return null;
  }
}

export async function getClaudeOAuthCredentials(userId?: string): Promise<ClaudeOAuthCredentials | null> {
  return readClaudeCredentials(userId);
}

export async function clearClaudeOAuth(userId?: string): Promise<void> {
  const { unlink } = await import("fs/promises");
  try {
    await unlink(resolveCredPath(userId));
  } catch {
    // File may not exist
  }
  logger.info("Claude OAuth credentials cleared", "claude-oauth");
}
