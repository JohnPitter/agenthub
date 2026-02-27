import { randomBytes, createHash } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { logger } from "../lib/logger.js";
import { discoverCredentials } from "./oauth-discovery.js";
import { getUserOAuthPath, getLegacyOAuthPath } from "./oauth-paths.js";

const ISSUER = "https://auth.openai.com";
const AUTH_URL = `${ISSUER}/oauth/authorize`;
const TOKEN_URL = `${ISSUER}/oauth/token`;
const TOKEN_REFRESH_MARGIN = 10 * 60 * 1000; // 10 min before expiry

let isRefreshing = false;

export interface CodexCredentials {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  account_id?: string;
  expires_at: number; // epoch ms
  scope: string;
}

function resolveCredPath(userId?: string): string {
  return userId ? getUserOAuthPath(userId, "openai") : getLegacyOAuthPath("openai");
}

// PKCE: 64 random bytes -> base64url
export function generateCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function readCodexCredentials(userId?: string): Promise<CodexCredentials | null> {
  // Per-user: only their own path (no fallback to CLI credentials)
  // No userId (agent sessions): legacy CLI path only
  const paths = userId
    ? [getUserOAuthPath(userId, "openai")]
    : [getLegacyOAuthPath("openai")];

  for (const credPath of paths) {
    try {
      const raw = await readFile(credPath, "utf-8");
      const data = JSON.parse(raw);

      // Codex CLI stores tokens in a nested "tokens" object
      if (data.tokens && typeof data.tokens === "object") {
        return {
          access_token: data.tokens.access_token,
          refresh_token: data.tokens.refresh_token,
          id_token: data.tokens.id_token,
          account_id: data.tokens.account_id,
          expires_at: data.tokens.expires_at ?? 0,
          scope: data.tokens.scope ?? "openid profile email",
        };
      }

      // Flat format (our own writes)
      return data;
    } catch {
      continue;
    }
  }
  return null;
}

export async function writeCodexCredentials(creds: CodexCredentials, userId?: string): Promise<void> {
  const credPath = resolveCredPath(userId);
  await mkdir(dirname(credPath), { recursive: true });
  await writeFile(credPath, JSON.stringify(creds, null, 2), "utf-8");
}

export async function deleteCodexCredentials(userId?: string): Promise<void> {
  const { unlink } = await import("fs/promises");
  try {
    await unlink(resolveCredPath(userId));
  } catch {
    // File may not exist
  }
}

// Decode JWT payload without verification (we trust the issuer)
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// Extract chatgpt_account_id from id_token JWT
export function extractAccountId(idToken: string): string | null {
  const payload = decodeJwtPayload(idToken);
  if (!payload) return null;
  const authClaim = payload["https://api.openai.com/auth"] as Record<string, unknown> | undefined;
  return (authClaim?.chatgpt_account_id as string) ?? null;
}

export async function buildAuthUrl(redirectUri: string, codeVerifier: string, state: string): Promise<string> {
  const { clientId } = await discoverCredentials("openai");
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    audience: "https://api.openai.com/v1",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  userId?: string,
): Promise<CodexCredentials> {
  const { clientId } = await discoverCredentials("openai");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${body}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    id_token?: string;
    expires_in: number;
    scope?: string;
  };

  const creds: CodexCredentials = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: data.id_token,
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope ?? "openid profile email",
  };

  await writeCodexCredentials(creds, userId);
  logger.info(`Codex OAuth tokens saved for ${userId ? `user ${userId}` : "default"}`, "codex-oauth");
  return creds;
}

async function refreshCodexToken(creds: CodexCredentials, userId?: string): Promise<CodexCredentials> {
  logger.info("Refreshing Codex OAuth token", "codex-oauth");

  const { clientId } = await discoverCredentials("openai");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: creds.refresh_token,
      scope: "openid profile email offline_access",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
    scope?: string;
  };

  const updated: CodexCredentials = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? creds.refresh_token,
    id_token: data.id_token ?? creds.id_token,
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope ?? creds.scope,
  };

  await writeCodexCredentials(updated, userId);
  logger.info("Codex OAuth token refreshed successfully", "codex-oauth");
  return updated;
}

// Get valid access token, auto-refresh if expired
export async function getCodexOAuthToken(userId?: string): Promise<string | null> {
  try {
    const creds = await readCodexCredentials(userId);
    if (!creds?.access_token) return null;

    const needsRefresh = creds.expires_at && (creds.expires_at - Date.now() < TOKEN_REFRESH_MARGIN);
    if (needsRefresh && creds.refresh_token) {
      if (isRefreshing) {
        await new Promise((r) => setTimeout(r, 2000));
        const fresh = await readCodexCredentials(userId);
        return fresh?.access_token ?? null;
      }

      isRefreshing = true;
      try {
        const updated = await refreshCodexToken(creds, userId);
        return updated.access_token;
      } catch (err) {
        logger.warn(`Codex token refresh failed: ${err instanceof Error ? err.message : "Unknown"}`, "codex-oauth");
        return creds.access_token; // fallback to existing
      } finally {
        isRefreshing = false;
      }
    }

    return creds.access_token;
  } catch {
    return null;
  }
}
