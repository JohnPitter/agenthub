import { Router } from "express";
import {
  getGitHubAuthUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
  upsertUser,
  signJWT,
} from "../services/auth-service.js";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "@agenthub/database";
import { schema } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const authRouter = Router();

// Redirect to GitHub OAuth
authRouter.get("/github", (_req, res) => {
  res.redirect(getGitHubAuthUrl());
});

// GitHub callback — exchange code, upsert user, set JWT cookie
authRouter.get("/github/callback", async (req, res) => {
  const { code } = req.query;

  if (!code || typeof code !== "string") {
    res.redirect("/login?error=missing_code");
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
      sameSite: "lax",
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

// Logout — clear cookie
authRouter.post("/logout", (_req, res) => {
  res.clearCookie("agenthub_token", { path: "/" });
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
  }).from(schema.users).where(eq(schema.users.id, req.user!.userId)).get();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});
