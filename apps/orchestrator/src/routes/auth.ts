import { Router } from "express";
import {
  getGitHubAuthUrl,
  generateOAuthState,
  exchangeCodeForToken,
  fetchGitHubUser,
  upsertUser,
  signJWT,
  verifyJWTIgnoringExpiry,
  blacklistToken,
  type JWTPayload,
} from "../services/auth-service.js";
import { authMiddleware } from "../middleware/auth.js";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const authRouter: ReturnType<typeof Router> = Router();

// Redirect to GitHub OAuth (with CSRF state parameter)
authRouter.get("/github", (_req, res) => {
  const state = generateOAuthState();
  res.cookie("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000, // 10 minutes
    path: "/",
  });
  res.redirect(getGitHubAuthUrl(state));
});

// GitHub callback — validate state, exchange code, upsert user, set JWT cookie
authRouter.get("/github/callback", async (req, res) => {
  const { code, state } = req.query;

  // Validate CSRF state parameter
  const storedState = req.cookies?.oauth_state;
  res.clearCookie("oauth_state", { path: "/" });

  if (!state || !storedState || state !== storedState) {
    logger.warn(`OAuth CSRF mismatch — state: ${state ? "present" : "missing"}, cookie: ${storedState ? "present" : "missing"}, match: ${state === storedState}`, "auth");
    res.redirect("/login?error=auth_failed");
    return;
  }

  if (!code || typeof code !== "string") {
    res.redirect("/login?error=auth_failed");
    return;
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const ghUser = await fetchGitHubUser(accessToken);
    const user = await upsertUser(ghUser, accessToken);

    const token = signJWT({
      userId: user.id,
      githubId: ghUser.id,
      login: ghUser.login,
    });

    res.cookie("agenthub_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    });

    logger.info(`User logged in: ${ghUser.login}`, "auth");
    res.redirect("/dashboard");
  } catch (err) {
    logger.error(`OAuth callback failed: ${err}`, "auth");
    res.redirect("/login?error=auth_failed");
  }
});

// Logout — blacklist token + clear cookie
authRouter.post("/logout", (req, res) => {
  const token = req.cookies?.agenthub_token;
  if (token) {
    blacklistToken(token);
  }
  res.clearCookie("agenthub_token", { path: "/" });
  res.json({ ok: true });
});

// Silent token refresh — re-issue JWT only if recently expired (within 1 hour)
authRouter.post("/refresh", async (req, res) => {
  const token = req.cookies?.agenthub_token;

  if (!token) {
    res.status(401).json({ error: "No token" });
    return;
  }

  const payload = verifyJWTIgnoringExpiry(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  // Only allow refresh for tokens expired within the last hour (prevents infinite refresh loops)
  const exp = (payload as JWTPayload & { exp?: number }).exp;
  const now = Date.now() / 1000;
  if (exp && now - exp > 3600) {
    res.status(401).json({ error: "Session expired — please log in again" });
    return;
  }

  // Absolute session limit: 7 days from original issue
  const iat = (payload as JWTPayload & { iat?: number }).iat;
  if (iat && now - iat > 7 * 24 * 60 * 60) {
    res.status(401).json({ error: "Session expired" });
    return;
  }

  // Verify user still exists and get current role
  const user = await db.select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, payload.userId))
    .then(r => r[0]);

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  // Issue fresh JWT with new iat (rotation — old token can't be re-refreshed)
  const newToken = signJWT({
    userId: payload.userId,
    githubId: payload.githubId,
    login: payload.login,
  });

  res.cookie("agenthub_token", newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  logger.debug(`Token refreshed for user ${payload.login}`, "auth");
  res.json({ ok: true });
});

// Get current user
authRouter.get("/me", authMiddleware, async (req, res) => {
  const user = await db.select({
    id: schema.users.id,
    githubId: schema.users.githubId,
    login: schema.users.login,
    name: schema.users.name,
    email: schema.users.email,
    avatarUrl: schema.users.avatarUrl,
    role: schema.users.role,
  }).from(schema.users).where(eq(schema.users.id, req.user!.userId)).then(r => r[0]);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});
