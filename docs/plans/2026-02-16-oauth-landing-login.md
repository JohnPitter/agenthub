# Phase 15: GitHub OAuth + Landing Page + Login Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add GitHub OAuth2 authentication with JWT cookies, a public landing page, a login page, and protect all existing routes (frontend + backend).

**Architecture:** GitHub OAuth flow → backend exchanges code for token → stores user in SQLite → returns JWT httpOnly cookie. Frontend has public routes (/, /login) and protected routes (everything else via ProtectedRoute wrapper). Logout clears cookie and redirects to /login.

**Tech Stack:** jsonwebtoken (JWT), Node.js crypto (existing), GitHub OAuth API, React Router guards, Zustand auth store.

---

### Task 1: Install backend dependency

**Files:**
- Modify: `apps/orchestrator/package.json`

**Step 1: Install jsonwebtoken**

```bash
cd apps/orchestrator && pnpm add jsonwebtoken && pnpm add -D @types/jsonwebtoken
```

**Step 2: Verify package.json updated**

Check `jsonwebtoken` appears in dependencies.

**Step 3: Commit**

```bash
git add apps/orchestrator/package.json pnpm-lock.yaml
git commit -m "chore: add jsonwebtoken dependency for OAuth JWT"
```

---

### Task 2: Add users table to database

**Files:**
- Create: `packages/database/src/schema/users.ts`
- Modify: `packages/database/src/schema/index.ts` — add export
- Modify: `packages/database/src/migrate.ts` — add CREATE TABLE + index

**Step 1: Create users schema**

Create `packages/database/src/schema/users.ts`:

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  githubId: integer("github_id").notNull().unique(),
  login: text("login").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  avatarUrl: text("avatar_url"),
  accessToken: text("access_token"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

**Step 2: Export from schema/index.ts**

Add to `packages/database/src/schema/index.ts`:

```typescript
export { users } from "./users";
```

**Step 3: Add migration statement**

Add to `packages/database/src/migrate.ts` in the `statements` array:

```typescript
`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL UNIQUE,
  login TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  access_token TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,
`CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id)`,
```

**Step 4: Run migration**

```bash
pnpm db:migrate
```

**Step 5: Build to verify**

```bash
pnpm build
```

**Step 6: Commit**

```bash
git add packages/database/src/schema/users.ts packages/database/src/schema/index.ts packages/database/src/migrate.ts
git commit -m "feat: add users table for OAuth authentication"
```

---

### Task 3: Create auth service on backend

**Files:**
- Create: `apps/orchestrator/src/services/auth-service.ts`

This service handles: GitHub OAuth token exchange, user upsert, JWT sign/verify.

**Step 1: Create auth-service.ts**

```typescript
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
```

**Step 2: Build to verify**

```bash
pnpm build
```

**Step 3: Commit**

```bash
git add apps/orchestrator/src/services/auth-service.ts
git commit -m "feat: add auth service with GitHub OAuth and JWT"
```

---

### Task 4: Create auth middleware

**Files:**
- Create: `apps/orchestrator/src/middleware/auth.ts`

**Step 1: Create auth middleware**

```typescript
import type { Request, Response, NextFunction } from "express";
import { verifyJWT, type JWTPayload } from "../services/auth-service.js";

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.agenthub_token;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    req.user = verifyJWT(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

**Step 2: Build**

```bash
pnpm build
```

**Step 3: Commit**

```bash
git add apps/orchestrator/src/middleware/auth.ts
git commit -m "feat: add auth middleware for JWT cookie validation"
```

---

### Task 5: Create auth routes

**Files:**
- Create: `apps/orchestrator/src/routes/auth.ts`

**Step 1: Create auth routes**

```typescript
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
```

**Step 2: Build**

```bash
pnpm build
```

**Step 3: Commit**

```bash
git add apps/orchestrator/src/routes/auth.ts
git commit -m "feat: add auth routes (github redirect, callback, logout, me)"
```

---

### Task 6: Wire auth into Express server

**Files:**
- Modify: `apps/orchestrator/src/index.ts`

**Step 1: Add cookie-parser dependency**

```bash
cd apps/orchestrator && pnpm add cookie-parser && pnpm add -D @types/cookie-parser
```

**Step 2: Update index.ts**

Add imports for `cookieParser`, `authRouter`, and `authMiddleware`. Mount auth routes as public, apply auth middleware to all other `/api/*` routes. Also add cookie-parser middleware before routes.

Changes to `apps/orchestrator/src/index.ts`:

1. Add imports:
```typescript
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { authMiddleware } from "./middleware/auth.js";
```

2. After `app.use(express.json({ limit: "1mb" }));` add:
```typescript
app.use(cookieParser());
```

3. Before existing routes, add public auth route:
```typescript
// Public auth routes (no auth required)
app.use("/api/auth", authRouter);
```

4. After auth routes, before existing routes, add:
```typescript
// Auth middleware for all other API routes
app.use("/api", authMiddleware);
```

5. Also authenticate Socket.io handshake. In the socket setup area, add middleware:
```typescript
io.use((socket, next) => {
  const cookie = socket.handshake.headers.cookie;
  if (!cookie) return next(new Error("Authentication required"));
  const match = cookie.match(/agenthub_token=([^;]+)/);
  if (!match) return next(new Error("Authentication required"));
  try {
    const { verifyJWT } = require("./services/auth-service.js");
    verifyJWT(match[1]);
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});
```

**Step 3: Build**

```bash
pnpm build
```

**Step 4: Commit**

```bash
git add apps/orchestrator/src/index.ts apps/orchestrator/package.json pnpm-lock.yaml
git commit -m "feat: wire auth middleware into Express and Socket.io"
```

---

### Task 7: Create auth store on frontend

**Files:**
- Create: `apps/web/src/stores/auth-store.ts`

**Step 1: Create auth store**

```typescript
import { create } from "zustand";
import { api } from "../lib/utils";

interface AuthUser {
  id: string;
  githubId: number;
  login: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  fetchUser: async () => {
    try {
      set({ loading: true, error: null });
      const user = await api<AuthUser>("/auth/me");
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  logout: async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      set({ user: null });
      window.location.href = "/login";
    }
  },
}));
```

**Step 2: Build**

```bash
pnpm build
```

**Step 3: Commit**

```bash
git add apps/web/src/stores/auth-store.ts
git commit -m "feat: add auth store with fetchUser and logout"
```

---

### Task 8: Create ProtectedRoute component

**Files:**
- Create: `apps/web/src/components/auth/protected-route.tsx`

**Step 1: Create ProtectedRoute**

```typescript
import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../stores/auth-store";

export function ProtectedRoute() {
  const { user, loading, fetchUser } = useAuthStore();

  useEffect(() => {
    if (!user && loading) {
      fetchUser();
    }
  }, [user, loading, fetchUser]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-app-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-[13px] text-neutral-fg3">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
```

**Step 2: Build**

```bash
pnpm build
```

**Step 3: Commit**

```bash
git add apps/web/src/components/auth/protected-route.tsx
git commit -m "feat: add ProtectedRoute component with auth guard"
```

---

### Task 9: Create Login page

**Files:**
- Create: `apps/web/src/routes/login.tsx`

**Step 1: Create login page**

```typescript
import { useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Github, ArrowLeft } from "lucide-react";
import { useAuthStore } from "../stores/auth-store";

export function LoginPage() {
  const { user, loading, fetchUser } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg">
      {/* Background glow */}
      <div className="glow-orb glow-orb-brand absolute left-1/2 top-1/3 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2" />

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="card p-8 text-center">
          {/* Logo */}
          <div className="mb-6">
            <Link to="/" className="inline-flex items-center gap-2 text-neutral-fg3 hover:text-neutral-fg2 transition-colors text-[13px] mb-6">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao inicio
            </Link>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-purple shadow-brand">
              <span className="text-2xl font-bold text-white">A</span>
            </div>
            <h1 className="text-[22px] font-semibold text-neutral-fg1">Entrar no AgentHub</h1>
            <p className="mt-2 text-[14px] text-neutral-fg3">
              Conecte sua conta GitHub para continuar
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg bg-danger-light px-4 py-3 text-[13px] text-danger">
              {error === "missing_code" && "Codigo de autorizacao ausente."}
              {error === "auth_failed" && "Falha na autenticacao. Tente novamente."}
              {!["missing_code", "auth_failed"].includes(error) && "Erro desconhecido."}
            </div>
          )}

          {/* GitHub Login Button */}
          <a
            href="/api/auth/github"
            className="btn-primary flex w-full items-center justify-center gap-3 px-6 py-3 text-[14px] font-medium"
          >
            <Github className="h-5 w-5" />
            Entrar com GitHub
          </a>

          <p className="mt-6 text-[12px] text-neutral-fg-disabled">
            Ao entrar, voce concorda com nossos termos de uso.
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Build**

```bash
pnpm build
```

**Step 3: Commit**

```bash
git add apps/web/src/routes/login.tsx
git commit -m "feat: add login page with GitHub OAuth button"
```

---

### Task 10: Create Landing Page

**Files:**
- Create: `apps/web/src/routes/landing.tsx`

**Step 1: Create landing page**

Modern SaaS landing page with hero section, features grid, and CTA. Uses existing design tokens (brand, purple, neutral-fg, card, etc.).

Sections:
1. **Nav** — Logo + "Entrar" button
2. **Hero** — Big headline + subtitle + CTA buttons
3. **Features** — 6-card grid (Agent Execution, Git Integration, Code Review, Real-time, Analytics, Code Editor)
4. **CTA** — Final call-to-action
5. **Footer** — Simple copyright

The component is large but straightforward — just Tailwind markup using existing CSS classes and design tokens.

**Step 2: Build**

```bash
pnpm build
```

**Step 3: Commit**

```bash
git add apps/web/src/routes/landing.tsx
git commit -m "feat: add landing page with hero, features, and CTA"
```

---

### Task 11: Update App.tsx routing

**Files:**
- Modify: `apps/web/src/App.tsx`

**Step 1: Update routes**

Change from:
```typescript
<Routes>
  <Route element={<AppLayout />}>
    <Route path="/" element={<Dashboard />} />
    ...
  </Route>
</Routes>
```

To:
```typescript
import { LandingPage } from "./routes/landing";
import { LoginPage } from "./routes/login";
import { ProtectedRoute } from "./components/auth/protected-route";

export function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/project/:id" element={<ProjectOverview />} />
          <Route path="/project/:id/board" element={<ProjectBoard />} />
          <Route path="/project/:id/tasks" element={<ProjectTasks />} />
          <Route path="/project/:id/agents" element={<ProjectAgents />} />
          <Route path="/project/:id/files" element={<ProjectFiles />} />
          <Route path="/project/:id/prs" element={<ProjectPRs />} />
          <Route path="/project/:id/preview" element={<ProjectPreview />} />
          <Route path="/project/:id/settings" element={<ProjectSettings />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/integrations" element={<div className="p-6">Integrations</div>} />
        </Route>
      </Route>
    </Routes>
  );
}
```

**Step 2: Build**

```bash
pnpm build
```

**Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat: update routing with public/protected route split"
```

---

### Task 12: Update Header logout button and user store

**Files:**
- Modify: `apps/web/src/components/layout/header.tsx` — replace logout logic
- Modify: `apps/web/src/stores/user-store.ts` — load from auth store

**Step 1: Update header logout**

In `header.tsx`, replace the Sair button onClick (lines 198-211):

From:
```typescript
onClick={() => {
  localStorage.removeItem("agenthub:userProfile");
  localStorage.removeItem("agenthub:workspacePath");
  localStorage.removeItem("agenthub:theme");
  window.location.href = "/";
}}
```

To:
```typescript
onClick={() => {
  useAuthStore.getState().logout();
}}
```

Add import at top:
```typescript
import { useAuthStore } from "../../stores/auth-store";
```

Also update the user info display to use auth store data (name, avatarUrl from GitHub).

**Step 2: Update header isDashboard check**

Change `location.pathname === "/"` to `location.pathname === "/dashboard"` since dashboard moved.

**Step 3: Update sidebar links**

Any link pointing to `/` for dashboard should now point to `/dashboard`.

**Step 4: Build**

```bash
pnpm build
```

**Step 5: Commit**

```bash
git add apps/web/src/components/layout/header.tsx apps/web/src/stores/user-store.ts
git commit -m "feat: update header logout to use auth store, fix dashboard route"
```

---

### Task 13: Update sidebar and internal links

**Files:**
- Modify: `apps/web/src/components/layout/app-sidebar.tsx` — change `/` links to `/dashboard`

**Step 1: Update sidebar dashboard link**

Find any `to="/"` or `href="/"` referencing dashboard and change to `/dashboard`.

**Step 2: Build**

```bash
pnpm build
```

**Step 3: Commit**

```bash
git add apps/web/src/components/layout/app-sidebar.tsx
git commit -m "fix: update sidebar dashboard link to /dashboard"
```

---

### Task 14: Update .env.example with OAuth vars

**Files:**
- Modify: `apps/orchestrator/.env.example`

**Step 1: Add OAuth environment variables**

```bash
# GitHub OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://localhost:5173/api/auth/github/callback
JWT_SECRET=
```

**Step 2: Commit**

```bash
git add apps/orchestrator/.env.example
git commit -m "chore: add OAuth env vars to .env.example"
```

---

### Task 15: Final build verification and squash commit

**Step 1: Full build**

```bash
pnpm build
```

**Step 2: Verify no TypeScript errors**

```bash
cd apps/web && pnpm lint && cd ../orchestrator && pnpm lint
```

**Step 3: Fix any issues found**

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "feat: Phase 15 — GitHub OAuth, landing page, login, and auth guards"
```
