import { randomBytes, createHash } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { join, dirname } from "path";
import { logger } from "../lib/logger.js";

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const ISSUER = "https://auth.openai.com";
const AUTH_URL = `${ISSUER}/authorize`;
const TOKEN_URL = "https://auth0.openai.com/oauth/token";
const CREDENTIALS_PATH = join(homedir(), ".codex", "auth.json");
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

// PKCE: 64 random bytes -> base64url
export function generateCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function readCodexCredentials(): Promise<CodexCredentials | null> {
  try {
    const raw = await readFile(CREDENTIALS_PATH, "utf-8");
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
    return null;
  }
}

export async function writeCodexCredentials(creds: CodexCredentials): Promise<void> {
  const dir = dirname(CREDENTIALS_PATH);
  await mkdir(dir, { recursive: true });
  await writeFile(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), "utf-8");
}

export async function deleteCodexCredentials(): Promise<void> {
  const { unlink } = await import("fs/promises");
  try {
    await unlink(CREDENTIALS_PATH);
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

export function buildAuthUrl(redirectUri: string, codeVerifier: string, state: string): string {
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const params = new URLSearchParams({
    client_id: CODEX_CLIENT_ID,
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
): Promise<CodexCredentials> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CODEX_CLIENT_ID,
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

  await writeCodexCredentials(creds);
  logger.info("Codex OAuth tokens saved to ~/.codex/auth.json", "codex-oauth");
  return creds;
}

async function refreshCodexToken(creds: CodexCredentials): Promise<CodexCredentials> {
  logger.info("Refreshing Codex OAuth token", "codex-oauth");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CODEX_CLIENT_ID,
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

  await writeCodexCredentials(updated);
  logger.info("Codex OAuth token refreshed successfully", "codex-oauth");
  return updated;
}

// Get valid access token, auto-refresh if expired
export async function getCodexOAuthToken(): Promise<string | null> {
  try {
    const creds = await readCodexCredentials();
    if (!creds?.access_token) return null;

    const needsRefresh = creds.expires_at && (creds.expires_at - Date.now() < TOKEN_REFRESH_MARGIN);
    if (needsRefresh && creds.refresh_token) {
      if (isRefreshing) {
        // Wait for ongoing refresh
        await new Promise((r) => setTimeout(r, 2000));
        const fresh = await readCodexCredentials();
        return fresh?.access_token ?? null;
      }

      isRefreshing = true;
      try {
        const updated = await refreshCodexToken(creds);
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
