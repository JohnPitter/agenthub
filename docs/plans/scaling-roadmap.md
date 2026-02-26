# Scaling Roadmap — AgentHub

> Plano de escalabilidade progressiva: 5k → 10k → 50k → 100k+ usuários
> Cada fase contém instruções detalhadas para implementação por agentes IA.

---

## Estado Atual (Baseline)

| Componente | Implementação Atual | Arquivo | Limite Prático |
|------------|--------------------:|---------|---------------:|
| Database | SQLite single-file (WAL) | `packages/database/src/connection.ts` | ~5 escritas/s |
| Process | Node.js single process | `apps/orchestrator/src/index.ts` | ~200 req/s |
| Sessions | In-memory Maps (5 Maps) | `apps/orchestrator/src/agents/agent-manager.ts:79-84` | Perde no restart |
| Rate Limiting | In-memory Map | `apps/orchestrator/src/middleware/rate-limiter.ts:25` | Não multi-worker |
| Socket.io | Default in-memory adapter | `apps/orchestrator/src/realtime/socket-handler.ts` | ~1,000 conn/proc |
| EventBus | Node.js EventEmitter (in-process) | `apps/orchestrator/src/realtime/event-bus.ts:36` | Não multi-worker |
| Task Watcher | Polling 3s (SELECT * sem LIMIT) | `apps/orchestrator/src/tasks/task-watcher.ts:38-48` | O(n) a cada 3s |
| Frontend Bundle | ~16 MB (Monaco = 78%) | `apps/web/vite.config.ts` (sem manualChunks) | Slow initial load |
| Auth | JWT com secret random fallback | `apps/orchestrator/src/services/auth-service.ts:10` | Invalida no restart |
| Input Validation | Nenhuma (sem Zod) | Todos os routes | Vulnerável |
| Zustand | 9 stores, seletores gross | `apps/web/src/stores/` | Re-renders excessivos |
| API Helper | Sem timeout, sem retry, sem dedup | `apps/web/src/lib/utils.ts:33-86` | Requests duplicados |
| Logger | console.log sem correlation ID | `apps/orchestrator/src/lib/logger.ts` | Sem rastreamento |
| **Capacity** | **~200-500 usuários simultâneos** | | |

---

## Fase 1 — MVP (5,000 usuários)

**Objetivo:** Produção estável, segurança básica, performance aceitável com mínimo de mudanças arquiteturais.

### VPS Config

```
CPU:      4 vCPUs
RAM:      8 GB
Storage:  100 GB NVMe SSD
OS:       Ubuntu 24.04 LTS
Network:  1 Gbps
Custo:    ~$20-40/mês (Hetzner CPX31, Contabo VPS M)
```

### Stack

```
Internet → Nginx (SSL + static + gzip) → PM2 (2-3 Node workers) → SQLite (WAL)
```

---

### 1.1 — JWT_SECRET obrigatório

**Arquivo:** `apps/orchestrator/src/services/auth-service.ts`

**Problema:** Linha 10 usa `process.env.JWT_SECRET ?? crypto.randomBytes(32).toString("hex")`. Em produção, restart gera novo secret e invalida todas as sessions. Multi-worker gera secrets diferentes.

**Implementação:**
```typescript
// ANTES (linha 10):
const JWT_SECRET = process.env.JWT_SECRET ?? crypto.randomBytes(32).toString("hex");

// DEPOIS:
const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    logger.error("JWT_SECRET env var is required in production", "auth");
    process.exit(1);
  }
  return secret ?? crypto.randomBytes(32).toString("hex");
})();
```

**Testes:**
```typescript
// apps/orchestrator/src/services/__tests__/auth-service.test.ts
describe("JWT_SECRET enforcement", () => {
  it("should crash in production without JWT_SECRET", () => {
    // Test that process.exit(1) is called when NODE_ENV=production and no JWT_SECRET
  });
  it("should generate random secret in development", () => {
    // Test that a valid secret is generated when NODE_ENV is not production
  });
});
```

**Verificação:** `NODE_ENV=production node dist/index.js` sem JWT_SECRET deve crashar imediatamente.

---

### 1.2 — CORS via env var

**Arquivo:** `apps/orchestrator/src/index.ts`

**Problema:** CORS hardcoded para `localhost:5173/5174`. Em produção precisa do domínio real.

**Implementação:**
```typescript
// ANTES (linhas ~53-58):
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
}));

// DEPOIS:
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(s => s.trim())
  : ["http://localhost:5173", "http://localhost:5174"];

app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true,
}));
```

**Env var:** `CORS_ORIGINS=https://app.agenthub.com,https://www.agenthub.com`

**Testes:**
```typescript
describe("CORS configuration", () => {
  it("should use CORS_ORIGINS env var when set", () => {
    // Set env, verify origin header in response
  });
  it("should default to localhost in development", () => {
    // Verify localhost origins when env not set
  });
});
```

---

### 1.3 — Helmet middleware

**Arquivo:** `apps/orchestrator/src/index.ts`

**Dependência:** `pnpm add helmet --filter @agenthub/orchestrator`

**Implementação:**
```typescript
import helmet from "helmet";

// Adicionar ANTES do CORS (linha ~50):
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,  // Monaco workers need cross-origin
}));
```

**Arquivo a remover:** `apps/orchestrator/src/middleware/security-headers.ts` — Helmet substitui completamente.

**Remover referência em `index.ts`:**
```typescript
// REMOVER:
import { securityHeaders } from "./middleware/security-headers.js";
app.use(securityHeaders);
```

**Testes:**
```typescript
describe("Security headers", () => {
  it("should set X-Content-Type-Options: nosniff", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
  it("should set X-Frame-Options: DENY", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });
  it("should set CSP in production", async () => { /* ... */ });
});
```

---

### 1.4 — Zod validation nos endpoints críticos

**Dependência:** `pnpm add zod --filter @agenthub/orchestrator`

**Novo arquivo:** `apps/orchestrator/src/middleware/validate.ts`

```typescript
import { type ZodSchema, ZodError } from "zod";
import type { Request, Response, NextFunction } from "express";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "Validation error",
          details: err.errors.map(e => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
        return;
      }
      next(err);
    }
  };
}
```

**Novo arquivo:** `apps/orchestrator/src/schemas/task-schemas.ts`

```typescript
import { z } from "zod";

export const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  category: z.enum(["feature", "bug", "chore", "refactor", "docs", "test"]).default("feature"),
  assignedAgentId: z.string().uuid().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  status: z.enum(["created", "assigned", "in_progress", "review", "changes_requested", "done", "cancelled", "blocked", "failed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignedAgentId: z.string().uuid().nullable().optional(),
});
```

**Novo arquivo:** `apps/orchestrator/src/schemas/project-schemas.ts`

```typescript
import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  repoUrl: z.string().url().optional(),
  visibility: z.enum(["public", "private"]).default("private"),
});

export const importProjectSchema = z.object({
  githubUrl: z.string().url().refine(url => url.includes("github.com"), {
    message: "Must be a GitHub URL",
  }),
});
```

**Aplicar nos routes:**

```typescript
// apps/orchestrator/src/routes/tasks.ts
import { validate } from "../middleware/validate.js";
import { createTaskSchema, updateTaskSchema } from "../schemas/task-schemas.js";

router.post("/", validate(createTaskSchema), async (req, res) => { ... });
router.patch("/:id", validate(updateTaskSchema), async (req, res) => { ... });

// apps/orchestrator/src/routes/projects.ts
import { validate } from "../middleware/validate.js";
import { createProjectSchema, importProjectSchema } from "../schemas/project-schemas.js";

router.post("/create", validate(createProjectSchema), async (req, res) => { ... });
router.post("/import", validate(importProjectSchema), async (req, res) => { ... });
```

**Testes:**
```typescript
// apps/orchestrator/src/schemas/__tests__/task-schemas.test.ts
describe("createTaskSchema", () => {
  it("should accept valid task data", () => {
    expect(() => createTaskSchema.parse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Fix login bug",
    })).not.toThrow();
  });
  it("should reject empty title", () => {
    expect(() => createTaskSchema.parse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      title: "",
    })).toThrow();
  });
  it("should reject invalid priority", () => {
    expect(() => createTaskSchema.parse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Test",
      priority: "super-urgent",
    })).toThrow();
  });
  it("should sanitize extra fields", () => {
    const result = createTaskSchema.parse({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Test",
      malicious: "<script>alert(1)</script>",
    });
    expect(result).not.toHaveProperty("malicious");
  });
});
```

---

### 1.5 — Socket.io project ownership verification

**Arquivo:** `apps/orchestrator/src/index.ts` (socket auth middleware, linhas ~109-120)

**Problema:** Qualquer socket autenticado pode fazer `socket.join("project:X")` sem verificar se tem acesso ao projeto.

**Implementação:**

```typescript
// apps/orchestrator/src/realtime/socket-handler.ts — no handler de "project:select"
// ANTES (linha ~29):
socket.on("project:select", (projectId: string) => {
  socket.join(`project:${projectId}`);
});

// DEPOIS:
socket.on("project:select", async (projectId: string) => {
  // Verify user has access to this project via team membership
  const userId = socket.data.userId;
  if (!userId) {
    socket.emit("error", { message: "Authentication required" });
    return;
  }

  const project = await db.select().from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();

  if (!project) {
    socket.emit("error", { message: "Project not found" });
    return;
  }

  // Check team membership if project has teamId
  if (project.teamId) {
    const membership = await db.select().from(schema.teamMembers)
      .where(and(
        eq(schema.teamMembers.teamId, project.teamId),
        eq(schema.teamMembers.userId, userId),
      )).get();

    if (!membership) {
      socket.emit("error", { message: "Access denied" });
      return;
    }
  }

  // Leave previous project rooms
  for (const room of socket.rooms) {
    if (room.startsWith("project:")) socket.leave(room);
  }

  socket.join(`project:${projectId}`);
  socket.data.projectId = projectId;
  logger.info(`Socket joined project:${projectId}`, "socket");
});
```

**Guardar userId no socket.data durante auth:**
```typescript
// No middleware de auth do socket (index.ts ~109-120):
io.use((socket, next) => {
  try {
    const cookie = socket.handshake.headers.cookie;
    const match = cookie?.match(/agenthub_token=([^;]+)/);
    if (!match) { next(new Error("Authentication required")); return; }
    const payload = verifyJWT(match[1]);
    socket.data.userId = payload.userId;  // ← guardar aqui
    socket.data.login = payload.login;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});
```

**Testes:**
```typescript
describe("Socket project:select", () => {
  it("should join room when user has team access", async () => { /* ... */ });
  it("should reject when user has no team access", async () => { /* ... */ });
  it("should leave previous project room on new select", async () => { /* ... */ });
});
```

---

### 1.6 — SQLite PRAGMA tuning

**Arquivo:** `packages/database/src/connection.ts`

**Implementação:**
```typescript
// DEPOIS de criar o client (linha ~12):
export const client = createClient({ url: `file:${DB_PATH}` });

// Otimizações SQLite para produção
client.execute("PRAGMA journal_mode = WAL");
client.execute("PRAGMA busy_timeout = 5000");
client.execute("PRAGMA synchronous = NORMAL");
client.execute("PRAGMA cache_size = -64000");       // 64MB cache
client.execute("PRAGMA foreign_keys = ON");
client.execute("PRAGMA temp_store = MEMORY");
client.execute("PRAGMA mmap_size = 268435456");     // 256MB mmap

export const db = drizzle(client, { schema });
```

**Explicação de cada PRAGMA:**
- `busy_timeout = 5000` — espera até 5s em vez de falhar imediatamente quando outra write está em progresso
- `synchronous = NORMAL` — boa durabilidade com WAL, 2x mais rápido que FULL
- `cache_size = -64000` — 64MB de page cache em memória (valor negativo = KB)
- `temp_store = MEMORY` — tabelas temporárias em RAM em vez de disco
- `mmap_size = 256MB` — memory-map do DB file para leituras rápidas

**Índices faltantes — adicionar em `packages/database/src/migrate.ts`:**

```typescript
// Adicionar ao array de statements:
"CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent_id)",
"CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)",
"CREATE INDEX IF NOT EXISTS idx_tasks_status_agent ON tasks(status, assigned_agent_id)",
"CREATE INDEX IF NOT EXISTS idx_integrations_project_type ON integrations(project_id, type)",
"CREATE INDEX IF NOT EXISTS idx_task_logs_task_action ON task_logs(task_id, action)",
```

**Testes:**
```typescript
describe("SQLite PRAGMAs", () => {
  it("should have WAL mode enabled", async () => {
    const result = await client.execute("PRAGMA journal_mode");
    expect(result.rows[0][0]).toBe("wal");
  });
  it("should have busy_timeout set to 5000", async () => {
    const result = await client.execute("PRAGMA busy_timeout");
    expect(result.rows[0][0]).toBe(5000);
  });
});
```

---

### 1.7 — Cookie secure flags em produção

**Arquivo:** `apps/orchestrator/src/routes/auth.ts` (ou onde o cookie é setado)

**Implementação:**
```typescript
// Em todo res.cookie("agenthub_token", ...):
const isProduction = process.env.NODE_ENV === "production";

res.cookie("agenthub_token", token, {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "strict" : "lax",
  maxAge: 30 * 60 * 1000,  // 30 min (match JWT expiry)
  path: "/",
});
```

**Verificação:** Em produção, cookie deve ter flags `HttpOnly; Secure; SameSite=Strict`.

---

### 1.8 — Monaco lazy loading + Vite chunk splitting

**Arquivo:** `apps/web/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
  server: {
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
      "/socket.io": { target: "http://localhost:3001", ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": ["zustand", "clsx", "class-variance-authority", "tailwind-merge", "lucide-react"],
          "vendor-i18n": ["i18next", "react-i18next", "i18next-browser-languagedetector"],
          "vendor-socket": ["socket.io-client"],
          "vendor-markdown": ["react-markdown", "remark-gfm"],
          "vendor-dnd": ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
          "vendor-recharts": ["recharts"],
        },
      },
    },
    chunkSizeWarningLimit: 600,
    sourcemap: false,
  },
});
```

**Monaco já é lazy** via route-level `React.lazy()` no `App.tsx` (code-editor page). Verificar que NÃO está importado em nenhum componente eager. Buscar:
```bash
grep -r "monaco-editor\|@monaco-editor" apps/web/src/ --include="*.tsx" --include="*.ts" \
  | grep -v "node_modules" | grep -v ".lazy("
```

Se Monaco for importado diretamente em algum lugar fora de lazy, mover para dynamic import.

**Resultado esperado:** Bundle initial load < 4MB (atualmente ~16MB).

**Verificação:**
```bash
pnpm build 2>&1 | grep -E "dist/assets.*\.js" | sort -t'|' -k2 -rn | head -20
```

---

### 1.9 — Health check endpoint

**Novo arquivo:** `apps/orchestrator/src/routes/health.ts`

```typescript
import { Router } from "express";
import { db, schema } from "@agenthub/database";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router: ReturnType<typeof Router> = Router();

router.get("/health", async (_req, res) => {
  const checks: Record<string, { status: string; latency?: number }> = {};

  // Database check
  const dbStart = Date.now();
  try {
    await db.select({ count: sql<number>`1` }).from(schema.projects).limit(1);
    checks.database = { status: "ok", latency: Date.now() - dbStart };
  } catch (err) {
    checks.database = { status: "error", latency: Date.now() - dbStart };
    logger.error(`Health check DB failed: ${err}`, "health");
  }

  // Memory check
  const mem = process.memoryUsage();
  checks.memory = {
    status: mem.heapUsed / mem.heapTotal < 0.9 ? "ok" : "warning",
    latency: Math.round(mem.heapUsed / 1024 / 1024),  // MB used
  };

  // Uptime
  checks.uptime = { status: "ok", latency: Math.round(process.uptime()) };

  const allOk = Object.values(checks).every(c => c.status === "ok");
  res.status(allOk ? 200 : 503).json({
    status: allOk ? "healthy" : "degraded",
    checks,
    version: process.env.npm_package_version ?? "unknown",
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };
```

**Registrar em `index.ts`:**
```typescript
// ANTES do authMiddleware (rota pública):
app.use(healthRouter);
```

**Testes:**
```typescript
describe("GET /health", () => {
  it("should return 200 when all checks pass", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.checks.database.status).toBe("ok");
  });
});
```

---

### 1.10 — Request logger com correlation ID

**Arquivo:** `apps/orchestrator/src/middleware/request-logger.ts`

**Implementação:**
```typescript
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  req.requestId = req.headers["x-request-id"] as string ?? crypto.randomUUID().slice(0, 8);
  res.setHeader("X-Request-ID", req.requestId);

  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? "warn" : "info";
    logger[level](`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, "http", {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      userId: req.user?.userId,
    });
  });
  next();
}
```

**Usar requestId nos logs subsequentes:**
```typescript
// Em qualquer route handler:
logger.info(`Task created: ${taskId}`, "tasks", { requestId: req.requestId });
```

---

### 1.11 — Graceful shutdown

**Arquivo:** `apps/orchestrator/src/index.ts`

**Adicionar ao final do arquivo:**
```typescript
function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, starting graceful shutdown...`, "server");

  // Stop accepting new connections
  server.close(() => {
    logger.info("HTTP server closed", "server");
  });

  // Close Socket.io connections
  io.close(() => {
    logger.info("Socket.io closed", "server");
  });

  // Stop task watcher
  taskWatcher.stop();

  // Wait for active agent sessions to finish (max 30s)
  const shutdownTimeout = setTimeout(() => {
    logger.warn("Shutdown timeout reached, forcing exit", "server");
    process.exit(1);
  }, 30_000);

  // Check every second if all sessions are done
  const checkInterval = setInterval(() => {
    const activeSessions = agentManager.getActiveSessionCount();
    if (activeSessions === 0) {
      clearInterval(checkInterval);
      clearTimeout(shutdownTimeout);
      logger.info("All sessions drained, exiting cleanly", "server");
      process.exit(0);
    }
    logger.info(`Waiting for ${activeSessions} active sessions to finish...`, "server");
  }, 1000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

**Adicionar método em agent-manager.ts:**
```typescript
getActiveSessionCount(): number {
  return this.activeSessions.size;
}
```

---

### 1.12 — Env validation no startup

**Novo arquivo:** `apps/orchestrator/src/lib/env.ts`

```typescript
import { logger } from "./logger.js";

interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  JWT_SECRET: string;
  ENCRYPTION_KEY?: string;
  CORS_ORIGINS: string[];
  ANTHROPIC_API_KEY?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

export function validateEnv(): EnvConfig {
  const isProduction = process.env.NODE_ENV === "production";
  const errors: string[] = [];

  // Required in production
  if (isProduction) {
    if (!process.env.JWT_SECRET) errors.push("JWT_SECRET is required");
    if (!process.env.ENCRYPTION_KEY) errors.push("ENCRYPTION_KEY is required");
    if (!process.env.CORS_ORIGINS) errors.push("CORS_ORIGINS is required");
  }

  if (errors.length > 0) {
    for (const err of errors) logger.error(err, "env");
    logger.error(`${errors.length} required env vars missing. Exiting.`, "env");
    process.exit(1);
  }

  return {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    PORT: Number(process.env.ORCHESTRATOR_PORT ?? process.env.PORT ?? 3001),
    JWT_SECRET: process.env.JWT_SECRET ?? "",
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    CORS_ORIGINS: process.env.CORS_ORIGINS?.split(",").map(s => s.trim())
      ?? ["http://localhost:5173", "http://localhost:5174"],
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  };
}
```

**Chamar no topo de `index.ts`:**
```typescript
import { validateEnv } from "./lib/env.js";
const env = validateEnv();
```

**Testes:**
```typescript
describe("validateEnv", () => {
  it("should pass in development without env vars", () => {
    process.env.NODE_ENV = "development";
    expect(() => validateEnv()).not.toThrow();
  });
  it("should fail in production without JWT_SECRET", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    expect(() => validateEnv()).toThrow("exit");
    exitSpy.mockRestore();
  });
});
```

---

### Fase 1 — Checklist de Verificação

```bash
# Build passa
pnpm build

# Health check funciona
curl http://localhost:3001/health

# Security headers presentes
curl -I http://localhost:3001/health | grep -E "x-content-type|x-frame|strict-transport"

# Zod rejeita payload inválido
curl -X POST http://localhost:3001/api/tasks -H "Content-Type: application/json" \
  -d '{"title": ""}' # deve retornar 400

# Bundle size reduzido
ls -la apps/web/dist/assets/*.js | sort -k5 -rn | head -5

# Testes passam
pnpm test
```

### Estimativas

| Métrica | Valor |
|---------|-------|
| Concurrent connections | ~2,000-3,000 |
| Requests/sec | ~500-800 |
| DB writes/sec | ~5-10 (SQLite limit) |
| Frontend initial load | ~4 MB |
| Cold start | ~3s |
| Esforço | **5-7 dias** |

### Limitações Aceitas
- SQLite é gargalo para escritas pesadas, mas aceitável para 5k users (maioria lê)
- Sem Redis = sem cache distribuído, mas 2-3 workers gerenciam com SQLite busy_timeout
- Task watcher polling mantido (3s ok para esta escala)
- In-memory agent sessions ok com 2-3 workers (cada worker gerencia suas sessions)

---

## Fase 2 — Crescimento (10,000 usuários)

**Objetivo:** Remover gargalos de I/O, introduzir cache distribuído, preparar para horizontal scaling.

### VPS Config

```
CPU:      8 vCPUs
RAM:      32 GB
Storage:  200 GB NVMe SSD
OS:       Ubuntu 24.04 LTS
Network:  1 Gbps
Custo:    ~$60-100/mês (Hetzner CCX23, OVH Advance-2)
```

### Stack

```
Internet → Nginx (SSL + static + rate limit)
              │
         ┌────┴────┐
         ▼         ▼
     PM2 Worker  PM2 Worker  (6-8 workers)
         │         │
    ┌────┴─────────┴────┐
    ▼                   ▼
PostgreSQL 16       Redis 7
(20-30 pool)     (sessions, cache,
                  socket adapter)
```

---

### 2.1 — SQLite → PostgreSQL

**Dependências:**
```bash
pnpm add drizzle-orm/pg-core pg pg-pool --filter @agenthub/database
pnpm add -D @types/pg --filter @agenthub/database
pnpm remove @libsql/client --filter @agenthub/database
```

**Arquivo:** `packages/database/src/connection.ts`

```typescript
// ANTES:
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

const client = createClient({ url: `file:${DB_PATH}` });
export const db = drizzle(client, { schema });

// DEPOIS:
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://agenthub:agenthub@localhost:5432/agenthub",
  max: Number(process.env.DB_POOL_SIZE ?? 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("Unexpected PG pool error:", err);
});

export const db = drizzle(pool, { schema });
export { pool };
```

**Schema migration SQLite → PostgreSQL:**

Todos os schemas em `packages/database/src/schema/` precisam mudar de:
```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
```
Para:
```typescript
import { pgTable, text, integer, boolean, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
```

**Mapeamento de tipos:**

| SQLite | PostgreSQL |
|--------|-----------|
| `sqliteTable` | `pgTable` |
| `text("id")` | `uuid("id").defaultRandom()` |
| `integer("created_at")` | `timestamp("created_at").defaultNow()` |
| `text("status", { enum: [...] })` | `varchar("status", { length: 50 })` |
| `integer("is_active", { mode: "boolean" })` | `boolean("is_active").default(true)` |
| `integer("tokens_used")` | `integer("tokens_used")` |
| `real("cost_usd")` | `real("cost_usd")` |

**Exemplo — tasks.ts:**
```typescript
// ANTES:
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").references(() => projects.id),
  status: text("status", { enum: ["created", "assigned", ...] }).default("created"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// DEPOIS:
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id),
  status: varchar("status", { length: 50 }).default("created").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("idx_tasks_status").on(table.status),
  projectIdx: index("idx_tasks_project").on(table.projectId),
  statusAgentIdx: index("idx_tasks_status_agent").on(table.status, table.assignedAgentId),
  parentIdx: index("idx_tasks_parent").on(table.parentTaskId),
}));
```

**Migration system — usar Drizzle Kit:**
```bash
pnpm add -D drizzle-kit --filter @agenthub/database
```

**Novo `packages/database/drizzle.config.ts`:**
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://agenthub:agenthub@localhost:5432/agenthub",
  },
});
```

**Data migration script** (one-time):
```bash
# 1. Export SQLite data
sqlite3 ~/.agenthub/agenthub.db ".dump" > backup.sql

# 2. Create PostgreSQL schema
pnpm drizzle-kit push

# 3. Use pgloader for data migration
pgloader sqlite://~/.agenthub/agenthub.db postgresql://agenthub:agenthub@localhost/agenthub
```

**Testes:**
```typescript
describe("PostgreSQL connection", () => {
  it("should connect to the database", async () => {
    const result = await db.select({ one: sql<number>`1` });
    expect(result[0].one).toBe(1);
  });
  it("should have connection pool", async () => {
    expect(pool.totalCount).toBeGreaterThanOrEqual(0);
    expect(pool.idleCount).toBeGreaterThanOrEqual(0);
  });
});
```

---

### 2.2 — Redis

**Dependência:** `pnpm add ioredis --filter @agenthub/orchestrator`

**Novo arquivo:** `apps/orchestrator/src/lib/redis.ts`

```typescript
import Redis from "ioredis";
import { logger } from "./logger.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 200, 5000),
  lazyConnect: true,
});

export const redisSub = redis.duplicate();  // Subscriber connection (separate for pub/sub)

redis.on("connect", () => logger.info("Redis connected", "redis"));
redis.on("error", (err) => logger.error(`Redis error: ${err.message}`, "redis"));

export async function connectRedis(): Promise<void> {
  await redis.connect();
  await redisSub.connect();
  logger.info("Redis connections established", "redis");
}

// Cache helpers
export async function cacheGet<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function cacheSet(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  await redis.setex(key, ttlSeconds, JSON.stringify(data));
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}
```

---

### 2.3 — Socket.io Redis adapter

**Dependência:** `pnpm add @socket.io/redis-adapter --filter @agenthub/orchestrator`

**Arquivo:** `apps/orchestrator/src/index.ts`

```typescript
import { createAdapter } from "@socket.io/redis-adapter";
import { redis, redisSub } from "./lib/redis.js";

// Após criar o io:
const io = new Server(server, { ... });
io.adapter(createAdapter(redis, redisSub));
```

**Resultado:** Todos os events emitidos via `io.to("project:X").emit(...)` são automaticamente propagados entre todos os PM2 workers.

---

### 2.4 — Rate limiter Redis-backed

**Arquivo:** `apps/orchestrator/src/middleware/rate-limiter.ts`

```typescript
// REESCREVER usando ioredis diretamente para controle total:
import { redis } from "../lib/redis.js";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const CONFIGS: Record<string, RateLimitConfig> = {
  auth:   { windowMs: 15 * 60_000, maxRequests: 100 },
  api:    { windowMs: 60_000,      maxRequests: 300 },
  git:    { windowMs: 60_000,      maxRequests: 30 },
  upload: { windowMs: 60_000,      maxRequests: 10 },
  agent:  { windowMs: 60_000,      maxRequests: 200 },
};

export function createRateLimiter(category: string) {
  const config = CONFIGS[category] ?? CONFIGS.api;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `ratelimit:${category}:${req.ip}`;
    const windowSec = Math.ceil(config.windowMs / 1000);

    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSec);
      }

      const ttl = await redis.ttl(key);
      res.setHeader("X-RateLimit-Limit", config.maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, config.maxRequests - current));
      res.setHeader("X-RateLimit-Reset", Math.ceil(Date.now() / 1000) + ttl);

      if (current > config.maxRequests) {
        res.setHeader("Retry-After", ttl);
        res.status(429).json({ error: "Too many requests" });
        return;
      }

      next();
    } catch (err) {
      // Redis down: allow request but log warning
      logger.warn(`Rate limiter Redis error: ${err}, allowing request`, "rate-limiter");
      next();
    }
  };
}

export const authLimiter = createRateLimiter("auth");
export const apiLimiter = createRateLimiter("api");
export const gitLimiter = createRateLimiter("git");
export const uploadLimiter = createRateLimiter("upload");
export const agentLimiter = createRateLimiter("agent");
```

**Testes:**
```typescript
describe("Redis rate limiter", () => {
  it("should allow requests within limit", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.status).not.toBe(429);
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
  });
  it("should block requests exceeding limit", async () => {
    // Send maxRequests + 1 requests
    for (let i = 0; i <= 300; i++) {
      await request(app).get("/api/projects");
    }
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });
  it("should gracefully degrade when Redis is down", async () => {
    // Disconnect Redis, verify requests still pass
  });
});
```

---

### 2.5 — Agent sessions em Redis

**Arquivo:** `apps/orchestrator/src/agents/agent-manager.ts`

**Migrar as 5 Maps para Redis hashes/sets:**

```typescript
import { redis } from "../lib/redis.js";

// REMOVER as 5 Maps in-memory (linhas 79-84):
// private activeSessions = new Map<string, ActiveSession>();
// private agentToTask = new Map<string, string>();
// private taskQueue = new Map<string, QueuedTask[]>();
// private taskRetryCount = new Map<string, number>();
// private workflowStates = new Map<string, WorkflowState>();

// SUBSTITUIR por métodos Redis:

// Session tracking
private async setActiveSession(taskId: string, session: ActiveSession): Promise<void> {
  // Keep the actual Session object in memory (not serializable)
  this._localSessions.set(taskId, session);
  // Store metadata in Redis for cross-worker visibility
  await redis.hset(`session:${taskId}`, {
    agentId: session.agentId,
    projectId: session.projectId,
    startedAt: Date.now().toString(),
  });
  await redis.set(`agent:task:${session.agentId}`, taskId);
}

private async removeActiveSession(taskId: string, agentId: string): Promise<void> {
  this._localSessions.delete(taskId);
  await redis.del(`session:${taskId}`);
  await redis.del(`agent:task:${agentId}`);
}

async isAgentBusy(agentId: string): Promise<boolean> {
  const taskId = await redis.get(`agent:task:${agentId}`);
  return taskId !== null;
}

// Workflow state
private async setWorkflowState(taskId: string, state: WorkflowState): Promise<void> {
  await redis.hset(`workflow:${taskId}`, {
    phase: state.phase,
    agentId: state.agentId,
    data: JSON.stringify(state.data ?? {}),
  });
}

private async getWorkflowState(taskId: string): Promise<WorkflowState | null> {
  const data = await redis.hgetall(`workflow:${taskId}`);
  if (!data.phase) return null;
  return {
    phase: data.phase as WorkflowPhase,
    agentId: data.agentId,
    data: JSON.parse(data.data ?? "{}"),
  };
}

// Retry count
private async incrementRetryCount(taskId: string): Promise<number> {
  return redis.incr(`retry:${taskId}`);
}

private async getRetryCount(taskId: string): Promise<number> {
  const count = await redis.get(`retry:${taskId}`);
  return count ? parseInt(count, 10) : 0;
}

// Task queue
private async enqueueTask(agentId: string, task: QueuedTask): Promise<void> {
  await redis.rpush(`queue:${agentId}`, JSON.stringify(task));
}

private async dequeueTask(agentId: string): Promise<QueuedTask | null> {
  const data = await redis.lpop(`queue:${agentId}`);
  return data ? JSON.parse(data) : null;
}
```

**Nota:** O objeto `Session` do Claude SDK não é serializável — ele fica em `_localSessions` (Map local). Só o metadata (agentId, projectId) vai para Redis. Isso significa que se um worker crashar, as sessions dele são perdidas, mas os outros workers sabem que o agent está "busy" e não tentam roubar a task.

**Recovery on startup:**
```typescript
async recoverSessions(): Promise<void> {
  // Find any sessions that belong to this worker (by PID) and clean up
  // Tasks stuck in "in_progress" without a live session → transition to "assigned"
  const stuckTasks = await db.select().from(schema.tasks)
    .where(eq(schema.tasks.status, "in_progress"));

  for (const task of stuckTasks) {
    const hasSession = await redis.exists(`session:${task.id}`);
    if (!hasSession) {
      logger.warn(`Recovering stuck task ${task.id}: in_progress without session`, "agent-manager");
      await transitionTask(task.id, "assigned" as TaskStatus, undefined, "Auto-recovered: session lost");
    }
  }
}
```

---

### 2.6 — Task watcher event-driven

**Arquivo:** `apps/orchestrator/src/tasks/task-watcher.ts`

```typescript
// ANTES: polling com setInterval + unbounded SELECT

// DEPOIS: event-driven via Redis pub/sub
import { redisSub, redis } from "../lib/redis.js";
import { agentManager } from "../agents/agent-manager.js";
import { logger } from "../lib/logger.js";

class TaskWatcher {
  private processingTasks = new Set<string>();  // still local (dedup per-worker)

  async start(): Promise<void> {
    // Subscribe to task creation events via Redis pub/sub
    await redisSub.subscribe("task:new");

    redisSub.on("message", async (channel, message) => {
      if (channel === "task:new") {
        const { taskId } = JSON.parse(message);
        await this.processTask(taskId);
      }
    });

    // Initial scan on startup (catch tasks created while offline)
    await this.scanPendingTasks();

    logger.info("Task watcher started (event-driven)", "task-watcher");
  }

  private async scanPendingTasks(): Promise<void> {
    const tasks = await db.select().from(schema.tasks)
      .where(and(
        eq(schema.tasks.status, "created"),
        isNull(schema.tasks.assignedAgentId),
        isNull(schema.tasks.parentTaskId),
      ))
      .limit(50)  // ← BOUNDED
      .all();

    for (const task of tasks) {
      await this.processTask(task.id);
    }
  }

  private async processTask(taskId: string): Promise<void> {
    // Distributed lock via Redis SETNX
    const lockKey = `lock:task:${taskId}`;
    const acquired = await redis.set(lockKey, process.pid.toString(), "EX", 30, "NX");
    if (!acquired) return;  // Another worker is handling this task

    try {
      // ... existing assignment logic ...
    } finally {
      await redis.del(lockKey);
    }
  }

  stop(): void {
    redisSub.unsubscribe("task:new");
  }
}
```

**Publicar evento ao criar task:**
```typescript
// Em routes/tasks.ts após INSERT:
await redis.publish("task:new", JSON.stringify({ taskId: newTask.id }));
```

---

### 2.7 — Zustand selectors granulares

**Padrão a aplicar em todos os 9 stores:**

```typescript
// ANTES (apps/web/src/stores/workspace-store.ts):
export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({ ... }));

// Componentes fazem:
const projects = useWorkspaceStore(s => s.projects);  // OK mas repetitivo

// DEPOIS — exportar hooks granulares:
export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({ ... }));

// Granular selectors (exportados)
export const useProjects = () => useWorkspaceStore(s => s.projects);
export const useActiveProjectId = () => useWorkspaceStore(s => s.activeProjectId);
export const useAgents = () => useWorkspaceStore(s => s.agents);
export const useChatPanelOpen = () => useWorkspaceStore(s => s.chatPanelOpen);

// Actions (stable references, won't cause re-renders)
export const useWorkspaceActions = () => useWorkspaceStore(s => ({
  setActiveProjectId: s.setActiveProjectId,
  fetchProjects: s.fetchProjects,
  fetchAgents: s.fetchAgents,
  toggleChatPanel: s.toggleChatPanel,
}));
```

**Stores prioritários (maior impacto):**

1. **`chat-store.ts`** — `messages` array é o mais problemático. Adicionar:
   ```typescript
   export const useMessages = () => useChatStore(s => s.messages);
   export const useStreamingAgents = () => useChatStore(s => s.streamingAgents);
   export const useIsLoadingMessages = () => useChatStore(s => s.isLoadingMessages);
   ```

2. **`usage-store.ts`** — 23 campos, god-object. Dividir em sub-selectors:
   ```typescript
   export const useUsageSummary = () => useUsageStore(s => s.summary);
   export const useUsageConnection = () => useUsageStore(s => s.connection);
   export const useUsageModels = () => useUsageStore(s => s.models);
   export const useAnalyticsData = () => useUsageStore(s => ({
     costByAgent: s.costByAgent,
     costByModel: s.costByModel,
     costTrend: s.costTrend,
     analyticsLoading: s.analyticsLoading,
   }));
   ```

3. **`notification-store.ts`** — já tem `useUnreadCount`, adicionar mais.

**Buscar e substituir nos componentes:**
```bash
# Encontrar todos os usos de useWorkspaceStore sem selector:
grep -rn "useWorkspaceStore()" apps/web/src/ --include="*.tsx"
# Cada resultado deve ser migrado para o selector granular correspondente.
```

---

### 2.8 — API helper com timeout e deduplication

**Arquivo:** `apps/web/src/lib/utils.ts`

```typescript
// Adicionar ao api() helper:
const pendingRequests = new Map<string, Promise<unknown>>();

export async function api<T>(path: string, options?: RequestInit & { timeout?: number }): Promise<T> {
  const method = options?.method ?? "GET";
  const timeout = options?.timeout ?? 30_000;

  // Deduplication for GET requests
  if (method === "GET") {
    const cacheKey = `${method}:${path}`;
    const pending = pendingRequests.get(cacheKey);
    if (pending) return pending as Promise<T>;

    const promise = apiInternal<T>(path, options, timeout);
    pendingRequests.set(cacheKey, promise);
    promise.finally(() => pendingRequests.delete(cacheKey));
    return promise;
  }

  return apiInternal<T>(path, options, timeout);
}

async function apiInternal<T>(path: string, options: RequestInit | undefined, timeout: number): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...options?.headers,
      },
      credentials: "include",
    });

    if (res.status === 401 && !path.includes("/auth/")) {
      // ... existing refresh logic ...
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(error.error ?? `HTTP ${res.status}`);
    }

    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Melhorias:**
- `AbortController` com timeout de 30s por padrão
- GET deduplication via `pendingRequests` Map
- Não seta `Content-Type` para `FormData` (fix para uploads)

**Testes:**
```typescript
describe("api() helper", () => {
  it("should deduplicate concurrent GET requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const [r1, r2] = await Promise.all([api("/projects"), api("/projects")]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);  // Only one actual fetch
    expect(r1).toEqual(r2);
  });
  it("should abort after timeout", async () => {
    await expect(api("/slow", { timeout: 10 })).rejects.toThrow();
  });
  it("should not set Content-Type for FormData", async () => {
    const formData = new FormData();
    await api("/upload", { method: "POST", body: formData });
    // Verify Content-Type was NOT explicitly set
  });
});
```

---

### 2.9 — Chat virtualization

**Dependência:** `pnpm add react-window --filter @agenthub/web`

**Arquivo:** `apps/web/src/components/chat/message-list.tsx`

```typescript
import { FixedSizeList as List } from "react-window";

// Substituir map de messages por lista virtualizada:
<List
  height={containerHeight}
  itemCount={messages.length}
  itemSize={80}  // Estimativa, pode usar VariableSizeList para tamanhos dinâmicos
  width="100%"
  ref={listRef}
  initialScrollOffset={messages.length * 80}  // Scroll to bottom
>
  {({ index, style }) => (
    <div style={style}>
      <MessageBubble message={messages[index]} />
    </div>
  )}
</List>
```

**Cap de mensagens no store:**
```typescript
// apps/web/src/stores/chat-store.ts — no addMessage:
addMessage: (message) => set((state) => ({
  messages: [...state.messages.slice(-500), message],  // Keep last 500
})),
```

---

### Fase 2 — Checklist de Verificação

```bash
# PostgreSQL conecta
psql $DATABASE_URL -c "SELECT 1"

# Redis conecta
redis-cli ping

# Build passa
pnpm build

# Health check inclui DB + Redis
curl http://localhost:3001/health | jq

# Rate limiter usa Redis (teste multi-worker)
pm2 start ecosystem.config.js
# Requests do worker 1 contam no worker 2

# Socket.io funciona cross-worker
# Abrir 2 tabs do browser, ambas no mesmo project board
# Criar task em tab 1 → aparece em tab 2

# Agent sessions sobrevivem a restart (metadata)
pm2 restart all
# Tasks in_progress devem ser recuperadas para "assigned"

# Testes passam
pnpm test
```

### Estimativas

| Métrica | Valor |
|---------|-------|
| Concurrent connections | ~5,000-8,000 |
| Requests/sec | ~3,000-5,000 |
| DB writes/sec | ~500-1,000 |
| Frontend initial load | ~3 MB |
| WebSocket sync | Cross-worker via Redis |
| Esforço | **10-15 dias** (sobre Fase 1) |

---

## Fase 3 — Consolidação (50,000 usuários)

**Objetivo:** Alta disponibilidade, observabilidade, job queues, zero-downtime deploys.

### VPS Config

```
CPU:      16 vCPUs
RAM:      64 GB
Storage:  500 GB NVMe SSD
OS:       Ubuntu 24.04 LTS
Network:  1 Gbps dedicado
Custo:    ~$150-250/mês (Hetzner CCX43, OVH Advance-4)
```

### Stack

```
Cloudflare (CDN + WAF + DDoS)
              │
Internet → Nginx (SSL + load balance)
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
 PM2 x12   BullMQ     Cron Jobs
 Workers   Workers     (backup, cleanup)
    │         │
    ▼         ▼
┌───────────────────────┐
│       Redis 7         │
│  (cache, sessions,    │
│   socket adapter,     │
│   job queue)          │
│  4-8 GB RAM allocated │
└───────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
 PG Primary  PG Replica
 (writes)    (reads: dashboard,
              analytics, search)
```

---

### 3.1 — BullMQ para agent execution

**Dependência:** `pnpm add bullmq --filter @agenthub/orchestrator`

**Novo arquivo:** `apps/orchestrator/src/queue/agent-queue.ts`

```typescript
import { Queue, Worker, Job } from "bullmq";
import { redis } from "../lib/redis.js";
import { agentManager } from "../agents/agent-manager.js";
import { logger } from "../lib/logger.js";

// Queue definition
export const agentQueue = new Queue("agent-tasks", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 1000 },  // Keep last 1000 completed jobs
    removeOnFail: { count: 500 },
  },
});

// Worker definition
const worker = new Worker("agent-tasks", async (job: Job) => {
  const { taskId, agentId, projectId } = job.data;
  logger.info(`Processing job ${job.id}: task=${taskId} agent=${agentId}`, "agent-queue");

  await job.updateProgress(10);

  try {
    await agentManager.executeTask(taskId, agentId);
    await job.updateProgress(100);
    return { success: true, taskId };
  } catch (err) {
    logger.error(`Job ${job.id} failed: ${err}`, "agent-queue");
    throw err;  // BullMQ will retry based on attempts config
  }
}, {
  connection: redis,
  concurrency: Number(process.env.AGENT_CONCURRENCY ?? 5),  // Max concurrent agent jobs per worker
  limiter: {
    max: 10,
    duration: 60_000,  // Max 10 jobs per minute per worker
  },
});

// Events
worker.on("completed", (job) => {
  logger.info(`Job ${job.id} completed`, "agent-queue");
});

worker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} failed permanently: ${err.message}`, "agent-queue");
  // Move task to "failed" status after all retries exhausted
  if (job) {
    const { taskId } = job.data;
    transitionTask(taskId, "failed" as TaskStatus, undefined, `Agent execution failed: ${err.message}`);
  }
});

// Enqueue a task
export async function enqueueAgentTask(taskId: string, agentId: string, projectId: string, priority: string): Promise<void> {
  const priorityMap: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4 };
  await agentQueue.add("execute", { taskId, agentId, projectId }, {
    priority: priorityMap[priority] ?? 3,
    jobId: `task:${taskId}`,  // Prevent duplicate jobs for same task
  });
  logger.info(`Enqueued task ${taskId} for agent ${agentId} (priority: ${priority})`, "agent-queue");
}

// Dashboard metrics
export async function getQueueMetrics() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    agentQueue.getWaitingCount(),
    agentQueue.getActiveCount(),
    agentQueue.getCompletedCount(),
    agentQueue.getFailedCount(),
    agentQueue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}
```

**Testes:**
```typescript
describe("Agent Queue", () => {
  it("should enqueue and process a task", async () => {
    await enqueueAgentTask("task-1", "agent-1", "project-1", "medium");
    // Wait for job completion
    const job = await agentQueue.getJob("task:task-1");
    expect(job).toBeDefined();
  });
  it("should prevent duplicate jobs for same task", async () => {
    await enqueueAgentTask("task-1", "agent-1", "project-1", "medium");
    await enqueueAgentTask("task-1", "agent-1", "project-1", "medium");
    const count = await agentQueue.getWaitingCount();
    expect(count).toBe(1);
  });
  it("should retry failed jobs up to 3 times", async () => { /* ... */ });
  it("should move task to failed after exhausting retries", async () => { /* ... */ });
});
```

---

### 3.2 — Structured logging com Pino

**Dependência:** `pnpm add pino pino-pretty --filter @agenthub/orchestrator`

**Arquivo:** `apps/orchestrator/src/lib/logger.ts` — reescrever:

```typescript
import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  ...(isProduction ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
  base: {
    pid: process.pid,
    hostname: undefined,  // Remove hostname from logs (noisy)
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: ["accessToken", "credentials", "password", "secret", "token", "*.accessToken", "*.credentials"],
    censor: "***",
  },
});

// Child logger factory for context
export function createLogger(context: string) {
  return logger.child({ context });
}

// Usage:
// const log = createLogger("agent-manager");
// log.info({ taskId, agentId }, "Task assigned");
```

**Benefícios:**
- JSON estruturado em produção (compatível com Loki, Datadog, ELK)
- Redação automática de campos sensíveis
- Child loggers com contexto persistente
- 5x mais rápido que console.log (async I/O)

**Migration:** Buscar e substituir todos os `logger.info("msg", "context")` para `logger.info({ context }, "msg")` ou usar child loggers.

---

### 3.3 — Health check completo com DB + Redis + Queue

**Atualizar:** `apps/orchestrator/src/routes/health.ts`

```typescript
// Adicionar checks de Redis e Queue:
// Redis check
const redisStart = Date.now();
try {
  await redis.ping();
  checks.redis = { status: "ok", latency: Date.now() - redisStart };
} catch {
  checks.redis = { status: "error", latency: Date.now() - redisStart };
}

// Queue check
try {
  const metrics = await getQueueMetrics();
  checks.queue = {
    status: metrics.active < 50 ? "ok" : "warning",
    latency: metrics.waiting,  // waiting count as "latency"
  };
} catch {
  checks.queue = { status: "error" };
}
```

---

### 3.4 — Docker Compose production

**Novo arquivo:** `docker-compose.production.yml`

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: agenthub
      POSTGRES_USER: agenthub
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agenthub"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 2gb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  orchestrator:
    build:
      context: .
      dockerfile: apps/orchestrator/Dockerfile
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://agenthub:${DB_PASSWORD}@postgres:5432/agenthub
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      JWT_SECRET: ${JWT_SECRET}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      CORS_ORIGINS: ${CORS_ORIGINS}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    ports:
      - "127.0.0.1:3001:3001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 4G

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./apps/web/dist:/var/www/html:ro
      - ./certbot/conf:/etc/letsencrypt:ro
    depends_on:
      - orchestrator

volumes:
  pgdata:
  redisdata:
```

---

### 3.5 — Segurança avançada

**WAF + 2FA + RBAC** — implementação detalhada:

**RBAC granular (já parcialmente implementado em `authorization.ts`):**
```typescript
// Garantir que TODAS as rotas de projeto passam por requirePermission:
router.get("/projects/:id", requirePermission("project:read"), ...);
router.patch("/projects/:id", requirePermission("project:write"), ...);
router.delete("/projects/:id", requirePermission("project:delete"), ...);
router.post("/tasks", requirePermission("task:write"), ...);
router.patch("/tasks/:id", requirePermission("task:write"), ...);
router.patch("/tasks/:id/assign", requirePermission("task:assign"), ...);
```

**Fix no bypass de `requirePermission`:**
```typescript
// ANTES (authorization.ts ~55-58): bypasses if no teamId
// DEPOIS:
if (!teamId) {
  // Se o projeto tem teamId, NEGAR acesso
  // Se não tem teamId, verificar se é owner direto
  res.status(403).json({ error: "Access denied: no team context" });
  return;
}
```

---

### Fase 3 — Checklist de Verificação

```bash
# Docker Compose up
docker compose -f docker-compose.production.yml up -d

# Health check com todos os serviços
curl http://localhost:3001/health | jq '.checks | keys'
# Deve incluir: database, redis, queue, memory, uptime

# Queue metrics
curl http://localhost:3001/api/queue/metrics | jq

# Structured logs (JSON)
docker logs orchestrator | head -5
# Deve ser JSON com timestamp, level, context, msg

# BullMQ retry
# Simular falha de agent → verificar 3 retries → task vai para "failed"

# Zero-downtime deploy
docker compose -f docker-compose.production.yml up -d --no-deps orchestrator
# Verificar que requests não falharam durante o deploy
```

### Estimativas

| Métrica | Valor |
|---------|-------|
| Concurrent connections | ~20,000-30,000 |
| Requests/sec | ~8,000-12,000 |
| DB writes/sec | ~3,000-5,000 |
| DB reads/sec | ~10,000+ (replica) |
| Agent jobs concurrent | ~50-100 |
| Frontend initial load | < 2 MB |
| Uptime target | 99.9% |
| Esforço | **15-20 dias** (sobre Fase 2) |

---

## Fase 4 — Expansão (100,000+ usuários)

**Objetivo:** Escala horizontal ilimitada, multi-region ready, enterprise-grade.

### Infra Config

```
Opção A — VPS Grande:
  CPU:      32 vCPUs
  RAM:      128 GB
  Storage:  1 TB NVMe SSD
  Custo:    ~$400-600/mês

Opção B — Multi-VPS (recomendado):
  App Server:   16 vCPUs, 32 GB RAM (x2)     ~$200/mês
  DB Server:    8 vCPUs, 64 GB RAM            ~$150/mês
  Redis Server: 4 vCPUs, 16 GB RAM            ~$50/mês
  Custo total:  ~$400-600/mês
```

### Stack Multi-VPS

```
Cloudflare (CDN + WAF + Edge Auth + DDoS)
                    │
           ┌────────┴────────┐
           ▼                 ▼
      Nginx LB #1       Nginx LB #2  (failover)
           │                 │
    ┌──────┼──────┐   ┌─────┼──────┐
    ▼      ▼      ▼   ▼     ▼      ▼
  App    App    App  App   App   App    (Docker/K3s)
  Node   Node   Node Node  Node  Node   (12-24 workers)
    │      │      │    │     │     │
    └──────┼──────┘    └─────┼─────┘
           ▼                 ▼
    ┌─────────────────────────────┐
    │     Redis Sentinel/Cluster  │
    │  (16 GB, HA, 3 nodes)      │
    └─────────────────────────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
PG Primary    PG Replica x2
(writes)      (reads, analytics)
+ Patroni     + auto-failover
```

---

### 4.1 — K3s + auto-scaling

**Arquivo:** `k8s/deployment.yaml` (exemplo)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agenthub-api
spec:
  replicas: 6
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2
      maxUnavailable: 0
  template:
    spec:
      containers:
        - name: api
          image: agenthub/orchestrator:latest
          resources:
            requests: { memory: "256Mi", cpu: "250m" }
            limits: { memory: "2Gi", cpu: "1000m" }
          readinessProbe:
            httpGet: { path: /health, port: 3001 }
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: /health, port: 3001 }
            initialDelaySeconds: 15
            periodSeconds: 30
          env:
            - name: DATABASE_URL
              valueFrom: { secretKeyRef: { name: agenthub-secrets, key: database-url } }
            - name: REDIS_URL
              valueFrom: { secretKeyRef: { name: agenthub-secrets, key: redis-url } }
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: agenthub-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: agenthub-api
  minReplicas: 6
  maxReplicas: 24
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }
    - type: Resource
      resource:
        name: memory
        target: { type: Utilization, averageUtilization: 80 }
```

---

### 4.2 — PostgreSQL HA com Patroni

```yaml
# docker-compose.pg-ha.yml
services:
  pg-primary:
    image: postgres:16
    environment:
      POSTGRES_DB: agenthub
      POSTGRES_USER: agenthub
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pg-primary-data:/var/lib/postgresql/data
    command: >
      postgres
      -c wal_level=replica
      -c max_wal_senders=5
      -c max_replication_slots=5
      -c hot_standby=on
      -c shared_buffers=4GB
      -c effective_cache_size=12GB
      -c work_mem=64MB
      -c maintenance_work_mem=512MB

  pg-replica:
    image: postgres:16
    environment:
      PGUSER: replicator
      PGPASSWORD: ${REPL_PASSWORD}
    depends_on: [pg-primary]
    command: >
      bash -c "
        pg_basebackup -h pg-primary -D /var/lib/postgresql/data -U replicator -vP &&
        echo \"primary_conninfo = 'host=pg-primary port=5432 user=replicator'\" >> /var/lib/postgresql/data/postgresql.auto.conf &&
        touch /var/lib/postgresql/data/standby.signal &&
        postgres
      "
```

**Read replica routing no app:**
```typescript
// packages/database/src/connection.ts
import { Pool } from "pg";

const writePool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

const readPool = new Pool({
  connectionString: process.env.DATABASE_READ_URL ?? process.env.DATABASE_URL,
  max: 30,
});

export const dbWrite = drizzle(writePool, { schema });
export const dbRead = drizzle(readPool, { schema });

// Usage in routes:
// Writes: dbWrite.insert(...)
// Reads: dbRead.select(...)
```

---

### 4.3 — Event architecture (NATS/RabbitMQ)

**Substituir EventBus in-process por NATS:**

```typescript
// apps/orchestrator/src/realtime/event-bus.ts
import { connect, NatsConnection, StringCodec } from "nats";
import { logger } from "../lib/logger.js";

const sc = StringCodec();
let nc: NatsConnection;

export async function connectNATS(): Promise<void> {
  nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  logger.info("NATS connected", "event-bus");
}

class DistributedEventBus {
  async emit<K extends keyof EventMap>(event: K, data: EventMap[K]): Promise<void> {
    nc.publish(event, sc.encode(JSON.stringify(data)));
  }

  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): () => void {
    const sub = nc.subscribe(event);
    (async () => {
      for await (const msg of sub) {
        try {
          const data = JSON.parse(sc.decode(msg.data)) as EventMap[K];
          handler(data);
        } catch (err) {
          logger.error(`Event handler error: ${err}`, "event-bus");
        }
      }
    })();
    return () => sub.unsubscribe();
  }
}

export const eventBus = new DistributedEventBus();
```

---

### Fase 4 — Estimativas

| Métrica | Valor |
|---------|-------|
| Concurrent connections | ~50,000-80,000 |
| Requests/sec | ~20,000-40,000 |
| DB writes/sec | ~5,000-10,000 |
| DB reads/sec | ~30,000+ (replicas) |
| Agent jobs concurrent | ~200-500 |
| Frontend initial load | < 1.5 MB |
| Uptime target | 99.95% |
| P99 latency | < 200ms |
| Esforço | **20-30 dias** (sobre Fase 3) |

---

## Resumo Comparativo

| | Fase 1 (5k) | Fase 2 (10k) | Fase 3 (50k) | Fase 4 (100k+) |
|---|---|---|---|---|
| **DB** | SQLite (WAL + PRAGMAs) | PostgreSQL | PG + Replica | PG HA Cluster |
| **Cache** | Nenhum | Redis | Redis + CDN | Redis Cluster + Edge |
| **Workers** | PM2 x 2-3 | PM2 x 6-8 | PM2 x 12 | K3s x 12-24 |
| **Queue** | Nenhum | Nenhum | BullMQ | BullMQ + NATS |
| **Socket** | In-memory | Redis adapter | Redis adapter | Redis Cluster adapter |
| **Logging** | Console (logger.ts) | Console + requestId | Pino JSON + Loki | Full observability |
| **Monitoring** | /health endpoint | /health + PM2 | Prometheus + Grafana | Full APM |
| **Deploy** | PM2 restart | PM2 reload | Docker rolling | K3s auto-scale |
| **CDN** | Nenhum | Nenhum | Cloudflare | Multi-region CDN |
| **Validation** | Zod (5 endpoints) | Zod (all endpoints) | Zod + WAF | Zod + WAF + Edge |
| **Security** | JWT forced, Helmet, CORS | + Redis auth, PG roles | + 2FA, RBAC, backups | + SOC2, edge auth |
| **VPS** | 4C/8G ($30) | 8C/32G ($80) | 16C/64G ($200) | Multi-VPS ($500) |
| **Esforço** | 5-7 dias | 10-15 dias | 15-20 dias | 20-30 dias |
| **Esforço total** | 5-7 dias | 15-22 dias | 30-42 dias | 50-72 dias |

---

## Referência — Arquivos Modificados por Fase

### Fase 1
| Arquivo | Mudança |
|---------|---------|
| `apps/orchestrator/src/services/auth-service.ts` | JWT_SECRET obrigatório em prod |
| `apps/orchestrator/src/index.ts` | CORS env var, Helmet, graceful shutdown |
| `apps/orchestrator/src/middleware/validate.ts` | **NOVO** — Zod middleware |
| `apps/orchestrator/src/schemas/task-schemas.ts` | **NOVO** — Zod schemas tasks |
| `apps/orchestrator/src/schemas/project-schemas.ts` | **NOVO** — Zod schemas projects |
| `apps/orchestrator/src/routes/tasks.ts` | Aplicar validate() |
| `apps/orchestrator/src/routes/projects.ts` | Aplicar validate() |
| `apps/orchestrator/src/routes/health.ts` | **NOVO** — Health check endpoint |
| `apps/orchestrator/src/middleware/request-logger.ts` | Correlation ID |
| `apps/orchestrator/src/middleware/security-headers.ts` | **REMOVER** (Helmet substitui) |
| `apps/orchestrator/src/lib/env.ts` | **NOVO** — Env validation |
| `apps/orchestrator/src/realtime/socket-handler.ts` | Project ownership check |
| `packages/database/src/connection.ts` | SQLite PRAGMAs |
| `packages/database/src/migrate.ts` | Novos índices |
| `apps/web/vite.config.ts` | manualChunks, chunkSizeWarningLimit |

### Fase 2
| Arquivo | Mudança |
|---------|---------|
| `packages/database/src/connection.ts` | SQLite → PostgreSQL (pg + pool) |
| `packages/database/src/schema/*.ts` | sqliteTable → pgTable (todas as 15 tabelas) |
| `packages/database/drizzle.config.ts` | **NOVO** — Drizzle Kit config |
| `apps/orchestrator/src/lib/redis.ts` | **NOVO** — Redis connection + helpers |
| `apps/orchestrator/src/index.ts` | Socket.io Redis adapter |
| `apps/orchestrator/src/middleware/rate-limiter.ts` | In-memory → Redis-backed |
| `apps/orchestrator/src/agents/agent-manager.ts` | 5 Maps → Redis hashes + recovery |
| `apps/orchestrator/src/tasks/task-watcher.ts` | Polling → Event-driven + Redis lock |
| `apps/web/src/stores/*.ts` | Granular selectors (9 stores) |
| `apps/web/src/lib/utils.ts` | API timeout + deduplication |
| `apps/web/src/components/chat/message-list.tsx` | react-window virtualization |
| `apps/web/src/stores/chat-store.ts` | Cap messages at 500 |

### Fase 3
| Arquivo | Mudança |
|---------|---------|
| `apps/orchestrator/src/queue/agent-queue.ts` | **NOVO** — BullMQ queue + worker |
| `apps/orchestrator/src/lib/logger.ts` | Console → Pino structured logging |
| `apps/orchestrator/src/routes/health.ts` | + Redis, Queue checks |
| `docker-compose.production.yml` | **NOVO** — Full production stack |
| `apps/orchestrator/Dockerfile` | **NOVO** — Production Dockerfile |
| `nginx.conf` | **NOVO** — Production Nginx config |
| `apps/orchestrator/src/middleware/authorization.ts` | Fix bypass, enforce RBAC |

### Fase 4
| Arquivo | Mudança |
|---------|---------|
| `k8s/deployment.yaml` | **NOVO** — K3s deployment + HPA |
| `packages/database/src/connection.ts` | Write pool + Read pool |
| `apps/orchestrator/src/realtime/event-bus.ts` | EventEmitter → NATS |
| `docker-compose.pg-ha.yml` | **NOVO** — PG primary + replica |
