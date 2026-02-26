import { randomBytes, createHash } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { join, dirname } from "path";
import { logger } from "../lib/logger.js";

const CREDENTIALS_PATH = join(homedir(), ".gemini", "oauth_creds.json");
const TOKEN_REFRESH_MARGIN = 5 * 60 * 1000; // 5 min before expiry

// Gemini CLI OAuth client credentials — set via env vars (GEMINI_OAUTH_CLIENT_ID / GEMINI_OAUTH_CLIENT_SECRET)
const GEMINI_OAUTH_CLIENT_ID = process.env.GEMINI_OAUTH_CLIENT_ID ?? "";
const GEMINI_OAUTH_CLIENT_SECRET = process.env.GEMINI_OAUTH_CLIENT_SECRET ?? "";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES = "openid email profile https://www.googleapis.com/auth/cloud-platform";

let isRefreshing = false;

export interface GeminiCredentials {
  access_token: string;
  refresh_token: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  expiry_date: number; // epoch ms
}

export async function readGeminiCredentials(): Promise<GeminiCredentials | null> {
  try {
    const raw = await readFile(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeGeminiCredentials(creds: GeminiCredentials): Promise<void> {
  const dir = dirname(CREDENTIALS_PATH);
  await mkdir(dir, { recursive: true });
  await writeFile(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), "utf-8");
}

async function refreshGeminiToken(creds: GeminiCredentials): Promise<GeminiCredentials> {
  logger.info("Refreshing Gemini OAuth token", "gemini-oauth");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: GEMINI_OAUTH_CLIENT_ID,
      client_secret: GEMINI_OAUTH_CLIENT_SECRET,
      refresh_token: creds.refresh_token,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini token refresh failed (${res.status}): ${body}`);
  }

  const data = await res.json() as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
    id_token?: string;
  };

  const updated: GeminiCredentials = {
    ...creds,
    access_token: data.access_token,
    expiry_date: Date.now() + data.expires_in * 1000,
    scope: data.scope ?? creds.scope,
    id_token: data.id_token ?? creds.id_token,
  };

  await writeGeminiCredentials(updated);
  logger.info("Gemini OAuth token refreshed successfully", "gemini-oauth");
  return updated;
}

/**
 * Get a valid Gemini OAuth access token, auto-refreshing if expired.
 * Returns null if no credentials file exists.
 */
export async function getGeminiOAuthToken(): Promise<string | null> {
  try {
    const creds = await readGeminiCredentials();
    if (!creds?.access_token) return null;

    const needsRefresh = creds.expiry_date && (creds.expiry_date - Date.now() < TOKEN_REFRESH_MARGIN);
    if (needsRefresh && creds.refresh_token) {
      if (isRefreshing) {
        // Wait for ongoing refresh
        await new Promise((r) => setTimeout(r, 2000));
        const fresh = await readGeminiCredentials();
        return fresh?.access_token ?? null;
      }

      isRefreshing = true;
      try {
        const updated = await refreshGeminiToken(creds);
        return updated.access_token;
      } catch (err) {
        logger.warn(`Gemini token refresh failed: ${err instanceof Error ? err.message : "Unknown"}`, "gemini-oauth");
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

// ========== Browser OAuth flow (PKCE) ==========

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function generateGeminiCodeVerifier(): string {
  return base64url(randomBytes(32));
}

export function generateGeminiCodeChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export function buildGeminiAuthUrl(
  redirectUri: string,
  codeVerifier: string,
  state: string,
): string {
  const codeChallenge = generateGeminiCodeChallenge(codeVerifier);
  const params = new URLSearchParams({
    client_id: GEMINI_OAUTH_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: GOOGLE_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGeminiCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<GeminiCredentials> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: GEMINI_OAUTH_CLIENT_ID,
      client_secret: GEMINI_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini token exchange failed (${res.status}): ${body}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
    id_token?: string;
  };

  const creds: GeminiCredentials = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? "",
    expiry_date: Date.now() + data.expires_in * 1000,
    scope: data.scope,
    token_type: data.token_type,
    id_token: data.id_token,
  };

  await writeGeminiCredentials(creds);
  logger.info("Gemini OAuth tokens saved to ~/.gemini/oauth_creds.json", "gemini-oauth");
  return creds;
}

export async function deleteGeminiCredentials(): Promise<void> {
  const { unlink } = await import("fs/promises");
  try {
    await unlink(CREDENTIALS_PATH);
  } catch {
    // File may not exist
  }
}
