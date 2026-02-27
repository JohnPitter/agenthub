import { randomBytes, createHash } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { logger } from "../lib/logger.js";
import { discoverCredentials } from "./oauth-discovery.js";
import { getUserOAuthPath, getLegacyOAuthPath } from "./oauth-paths.js";

const TOKEN_REFRESH_MARGIN = 5 * 60 * 1000; // 5 min before expiry
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES = "openid email profile https://www.googleapis.com/auth/cloud-platform";

let isRefreshing = false;

async function getGeminiClientCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  const creds = await discoverCredentials("gemini");
  return { clientId: creds.clientId, clientSecret: creds.clientSecret ?? "" };
}

function resolveCredPath(userId?: string): string {
  return userId ? getUserOAuthPath(userId, "gemini") : getLegacyOAuthPath("gemini");
}

export interface GeminiCredentials {
  access_token: string;
  refresh_token: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  expiry_date: number; // epoch ms
}

export async function readGeminiCredentials(userId?: string): Promise<GeminiCredentials | null> {
  // Per-user: only their own path (no fallback to CLI credentials)
  // No userId (agent sessions): legacy CLI path only
  const paths = userId
    ? [getUserOAuthPath(userId, "gemini")]
    : [getLegacyOAuthPath("gemini")];

  for (const credPath of paths) {
    try {
      const raw = await readFile(credPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      continue;
    }
  }
  return null;
}

async function writeGeminiCredentials(creds: GeminiCredentials, userId?: string): Promise<void> {
  const credPath = resolveCredPath(userId);
  await mkdir(dirname(credPath), { recursive: true });
  await writeFile(credPath, JSON.stringify(creds, null, 2), "utf-8");
}

async function refreshGeminiToken(creds: GeminiCredentials, userId?: string): Promise<GeminiCredentials> {
  logger.info("Refreshing Gemini OAuth token", "gemini-oauth");

  const { clientId, clientSecret } = await getGeminiClientCredentials();

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
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

  await writeGeminiCredentials(updated, userId);
  logger.info("Gemini OAuth token refreshed successfully", "gemini-oauth");
  return updated;
}

/**
 * Get a valid Gemini OAuth access token, auto-refreshing if expired.
 * Returns null if no credentials file exists.
 */
export async function getGeminiOAuthToken(userId?: string): Promise<string | null> {
  try {
    const creds = await readGeminiCredentials(userId);
    if (!creds?.access_token) return null;

    const needsRefresh = creds.expiry_date && (creds.expiry_date - Date.now() < TOKEN_REFRESH_MARGIN);
    if (needsRefresh && creds.refresh_token) {
      if (isRefreshing) {
        await new Promise((r) => setTimeout(r, 2000));
        const fresh = await readGeminiCredentials(userId);
        return fresh?.access_token ?? null;
      }

      isRefreshing = true;
      try {
        const updated = await refreshGeminiToken(creds, userId);
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

export async function buildGeminiAuthUrl(
  redirectUri: string,
  codeVerifier: string,
  state: string,
): Promise<string> {
  const { clientId } = await getGeminiClientCredentials();
  const codeChallenge = generateGeminiCodeChallenge(codeVerifier);
  const params = new URLSearchParams({
    client_id: clientId,
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
  userId?: string,
): Promise<GeminiCredentials> {
  const { clientId, clientSecret } = await getGeminiClientCredentials();

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
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

  await writeGeminiCredentials(creds, userId);
  logger.info(`Gemini OAuth tokens saved for ${userId ? `user ${userId}` : "default"}`, "gemini-oauth");
  return creds;
}

export async function deleteGeminiCredentials(userId?: string): Promise<void> {
  const { unlink } = await import("fs/promises");
  try {
    await unlink(resolveCredPath(userId));
  } catch {
    // File may not exist
  }
}
