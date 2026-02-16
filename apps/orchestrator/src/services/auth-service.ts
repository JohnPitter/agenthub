import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "@agenthub/database";
import { schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { encrypt } from "../lib/encryption.js";
import { logger } from "../lib/logger.js";

const JWT_SECRET = process.env.JWT_SECRET ?? crypto.randomBytes(32).toString("hex");
const JWT_EXPIRES_IN = "7d";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL ?? "http://localhost:5173/api/auth/github/callback";

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export interface JWTPayload {
  userId: string;
  githubId: number;
  login: string;
}

export function getGitHubAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: "read:user user:email",
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: GITHUB_CALLBACK_URL,
    }),
  });
  const data = await res.json() as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(data.error ?? "Failed to exchange code for token");
  }
  return data.access_token;
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch GitHub user");
  return res.json() as Promise<GitHubUser>;
}

export async function upsertUser(ghUser: GitHubUser, accessToken: string) {
  const existing = await db.select().from(schema.users).where(eq(schema.users.githubId, ghUser.id)).get();

  const encryptedToken = encrypt(accessToken);
  const now = new Date();

  if (existing) {
    await db.update(schema.users).set({
      login: ghUser.login,
      name: ghUser.name ?? ghUser.login,
      email: ghUser.email,
      avatarUrl: ghUser.avatar_url,
      accessToken: encryptedToken,
      updatedAt: now,
    }).where(eq(schema.users.id, existing.id)).run();
    return existing;
  }

  const user = {
    id: nanoid(),
    githubId: ghUser.id,
    login: ghUser.login,
    name: ghUser.name ?? ghUser.login,
    email: ghUser.email,
    avatarUrl: ghUser.avatar_url,
    accessToken: encryptedToken,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.users).values(user).run();
  logger.info(`New user created: ${ghUser.login}`, "auth");
  return user;
}

export function signJWT(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJWT(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}
