# Plano: Escalabilidade para 10.000+ Usuários

**Data:** 2026-03-16
**Status:** Planejado
**Pré-requisito:** Fase 19 (Storage Management) completa

---

## Situação Atual (5K usuários — Single Container)

| Componente | Estado | Limite |
|---|---|---|
| PostgreSQL | Pool 50 conexões, 14 indexes | ~5K concurrent queries |
| Node.js | Single thread, single process | ~5K req/s |
| Socket.io | In-memory, room-based | ~5K WebSockets (~1GB RAM) |
| Rate limiter | In-memory Map | Sem sync horizontal |
| Cache | Module-level TTL | Sem compartilhamento |
| Arquivos | Volume local | I/O de disco único |
| WhatsApp | 1 instância Chromium | 1 sessão por container |
| Agent execution | Inline no event loop | Bloqueia sob carga |

---

## Arquitetura Alvo (10K+ usuários)

```
                    ┌─────────────────┐
                    │   Load Balancer  │
                    │   (Nginx/Traefik)│
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼──┐  ┌───────▼────┐  ┌──────▼───────┐
    │ Orchestrator│  │Orchestrator│  │ Orchestrator  │
    │  Instance 1 │  │ Instance 2 │  │  Instance N   │
    │  (Express)  │  │  (Express) │  │   (Express)   │
    └──────┬──────┘  └─────┬──────┘  └──────┬────────┘
           │               │                │
    ┌──────▼───────────────▼────────────────▼──────┐
    │                    Redis                      │
    │  • Socket.io Adapter (pub/sub)               │
    │  • Rate Limiter (sliding window)             │
    │  • Cache (API keys, models, configs)         │
    │  • BullMQ Job Queue (agent execution)        │
    │  • Session Store                             │
    └──────────────────────┬───────────────────────┘
                           │
    ┌──────────────────────▼───────────────────────┐
    │              PostgreSQL 16                     │
    │  • Connection pool per instance (50 each)     │
    │  • Read replicas for analytics/dashboard      │
    │  • PgBouncer for connection multiplexing      │
    └──────────────────────────────────────────────┘
```

---

## Fases de Implementação

### Fase A — Redis Foundation (Semana 1-2)

**Objetivo:** Adicionar Redis como infraestrutura central de cache e pub/sub.

#### A1. Redis Connection

```typescript
// packages/database/src/redis.ts
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 2000),
  lazyConnect: true,
});

export const redisSub = redis.duplicate(); // For pub/sub subscriber
```

**Dependências:** `ioredis`

#### A2. Socket.io Redis Adapter

Permite que WebSocket events sejam broadcast entre múltiplas instâncias.

```typescript
// apps/orchestrator/src/index.ts
import { createAdapter } from "@socket.io/redis-adapter";
import { redis, redisSub } from "@agenthub/database/redis";

const io = new SocketServer(httpServer, { ... });
io.adapter(createAdapter(redis, redisSub));
```

**Dependências:** `@socket.io/redis-adapter`

**Impacto:** WebSocket events funcionam cross-instance. Sem isso, um evento emitido na instância 1 não chega aos clientes da instância 2.

#### A3. Rate Limiter com Redis

Substitui o Map in-memory por sliding window no Redis.

```typescript
// apps/orchestrator/src/middleware/rate-limiter.ts
import { RateLimiterRedis } from "rate-limiter-flexible";
import { redis } from "@agenthub/database/redis";

const apiLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:api",
  points: 120,        // requests
  duration: 60,       // per minute
  blockDuration: 60,  // block for 1 min on exceed
});

const authLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:auth",
  points: 10,
  duration: 900, // 15 min
});
```

**Dependências:** `rate-limiter-flexible`

**Impacto:** Rate limiting funciona corretamente atrás de load balancer. Previne abuse mesmo com múltiplas instâncias.

#### A4. Cache Compartilhado

Move caches module-level para Redis com TTL.

```typescript
// apps/orchestrator/src/lib/cache.ts
import { redis } from "@agenthub/database/redis";

export async function getCached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const value = await fetcher();
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
  return value;
}

export async function invalidateCache(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) await redis.del(...keys);
}
```

**Uso:**
```typescript
// Em plans.ts
const models = await getCached(`models:${userId}`, 300, async () => {
  // ... existing query logic ...
});

// Em openrouter-service.ts
const apiKey = await getCached("openrouter:apikey", 300, async () => {
  // ... existing decrypt logic ...
});
```

---

### Fase B — Job Queue para Agentes (Semana 3-4)

**Objetivo:** Mover a execução de agentes para uma fila de jobs assíncrona, liberando o event loop do Express para requests HTTP.

#### B1. BullMQ Setup

```typescript
// apps/orchestrator/src/queues/agent-queue.ts
import { Queue, Worker } from "bullmq";
import { redis } from "@agenthub/database/redis";

export const agentQueue = new Queue("agent-execution", {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    timeout: 300000, // 5 min
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

// Worker processa jobs em background
const worker = new Worker("agent-execution", async (job) => {
  const { taskId, agentId, projectId, prompt } = job.data;

  // Move a lógica do OpenRouterSession para cá
  const session = new OpenRouterSession({ ... });
  const result = await session.execute();

  return result;
}, {
  connection: redis,
  concurrency: 5, // 5 agents simultâneos por instância
  limiter: {
    max: 10,
    duration: 60000, // max 10 jobs/min (rate limit OpenRouter)
  },
});
```

**Dependências:** `bullmq`

#### B2. Agent Manager → Queue

```typescript
// Em agent-manager.ts, substituir execução inline:

// ANTES:
this.executeSession(taskId, agentId, session);

// DEPOIS:
await agentQueue.add("execute-task", {
  taskId,
  agentId,
  projectId,
  prompt,
  projectPath,
}, {
  jobId: `task:${taskId}`,
  priority: task.priority === "urgent" ? 1 : task.priority === "high" ? 2 : 3,
});
```

**Impacto:**
- Event loop do Express fica livre para HTTP requests
- Jobs são distribuídos entre instâncias automaticamente
- Retry automático em caso de falha
- Priorização por urgência da task
- Monitoramento via BullMQ Dashboard

#### B3. BullMQ Dashboard (Admin)

```typescript
// apps/orchestrator/src/routes/admin.ts
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

const serverAdapter = new ExpressAdapter();
createBullBoard({
  queues: [new BullMQAdapter(agentQueue)],
  serverAdapter,
});

app.use("/api/admin/queues", adminMiddleware, serverAdapter.getRouter());
```

---

### Fase C — Horizontal Scaling (Semana 5-6)

**Objetivo:** Permitir múltiplas instâncias do orchestrator atrás de load balancer.

#### C1. Sticky Sessions para WebSocket

```nginx
# nginx.conf
upstream orchestrator {
    ip_hash;  # Sticky sessions por IP
    server orchestrator-1:3001;
    server orchestrator-2:3001;
    server orchestrator-3:3001;
}

server {
    location /api/ {
        proxy_pass http://orchestrator;
    }

    location /socket.io/ {
        proxy_pass http://orchestrator;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### C2. Health Check Endpoint

```typescript
// apps/orchestrator/src/routes/health.ts
app.get("/api/health", async (_req, res) => {
  const checks = {
    db: false,
    redis: false,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  };

  try {
    await db.select({ count: count() }).from(schema.users);
    checks.db = true;
  } catch {}

  try {
    await redis.ping();
    checks.redis = true;
  } catch {}

  const healthy = checks.db && checks.redis;
  res.status(healthy ? 200 : 503).json(checks);
});
```

#### C3. Docker Compose para Multi-Instance

```yaml
# docker-compose.prod.yml
services:
  orchestrator-1:
    build: .
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://...
      - INSTANCE_ID=1
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'

  orchestrator-2:
    build: .
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://...
      - INSTANCE_ID=2

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - orchestrator-1
      - orchestrator-2
```

---

### Fase D — Database Scaling (Semana 7-8)

**Objetivo:** Otimizar PostgreSQL para alta carga de leitura.

#### D1. PgBouncer (Connection Multiplexing)

```ini
# pgbouncer.ini
[databases]
agenthub = host=postgres port=5432 dbname=agenthub

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
min_pool_size = 10
reserve_pool_size = 5
```

**Impacto:** 3 instâncias × 50 conexões = 150 conexões. PgBouncer multiplexa para 50 conexões reais ao PostgreSQL, reduzindo overhead.

#### D2. Read Replicas para Analytics

```typescript
// packages/database/src/index.ts
const writeClient = postgres(process.env.DATABASE_URL!, { max: 30 });
const readClient = postgres(process.env.DATABASE_READ_URL || process.env.DATABASE_URL!, { max: 20 });

export const db = drizzle(writeClient, { schema });
export const readDb = drizzle(readClient, { schema });

// Em analytics.ts, dashboard.ts, admin.ts (leitura):
import { readDb } from "@agenthub/database";
const stats = await readDb.select(...).from(...);
```

#### D3. Materialized Views para Dashboard

```sql
-- Para queries pesadas que agregam dados de múltiplas tabelas
CREATE MATERIALIZED VIEW dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM projects) as total_projects,
  (SELECT COUNT(*) FROM tasks WHERE created_at >= date_trunc('month', now())) as tasks_this_month,
  (SELECT COALESCE(SUM(cost_usd::numeric), 0) FROM tasks WHERE created_at >= date_trunc('month', now())) as cost_this_month;

-- Refresh a cada 5 minutos via cron ou pg_cron
REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_stats;
```

---

### Fase E — Observabilidade (Semana 9-10)

#### E1. Métricas Prometheus

```typescript
// apps/orchestrator/src/middleware/metrics.ts
import { Counter, Histogram, Gauge, register } from "prom-client";

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

export const activeWebSockets = new Gauge({
  name: "active_websocket_connections",
  help: "Number of active WebSocket connections",
});

export const agentJobsProcessed = new Counter({
  name: "agent_jobs_processed_total",
  help: "Total agent jobs processed",
  labelNames: ["status", "model"],
});

app.get("/api/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});
```

#### E2. Grafana Dashboard

Métricas essenciais:
- Request rate e latência (p50, p95, p99)
- Conexões WebSocket ativas
- Pool de conexões DB (usado/disponível)
- Fila de agentes (tamanho, processing time)
- Uso de memória e CPU por instância
- Taxa de erros por endpoint

---

## Estimativas de Capacidade

| Cenário | Single Container | 3 Instâncias + Redis | 5 Instâncias + PgBouncer |
|---|---|---|---|
| **Usuários simultâneos** | 5.000 | 15.000 | 30.000+ |
| **Requests/segundo** | ~500 | ~1.500 | ~2.500 |
| **WebSockets** | 5.000 | 15.000 | 25.000 |
| **Agent tasks/hora** | ~50 | ~150 | ~250 |
| **RAM total** | 1GB | 4GB | 7GB |
| **DB connections** | 50 | 150 (50 via PgBouncer) | 250 (50 via PgBouncer) |

---

## Custo Estimado (Infraestrutura)

| Componente | Free/Dev | Pro ($29/user) | Enterprise |
|---|---|---|---|
| **LuxView Cloud** (container) | 1× free | 3× instances | 5× instances |
| **PostgreSQL** | Shared | Dedicated 2GB | Dedicated 8GB + replica |
| **Redis** | — | Managed 256MB | Managed 1GB |
| **Object Storage** | — | 10GB S3 | 100GB S3 |
| **Custo infra/mês** | $0 | ~$50 | ~$200 |

---

## Ordem de Prioridade

1. **Fase A** (Redis) — desbloqueia horizontal scaling
2. **Fase B** (Job Queue) — libera event loop, melhora reliability
3. **Fase C** (Multi-instance) — escala linear de capacidade
4. **Fase D** (DB scaling) — suporta analytics pesados
5. **Fase E** (Observabilidade) — visibilidade para tuning

**Recomendação:** Implementar Fases A+B primeiro ($50/mês extra). Isso suporta 10K+ usuários confortavelmente. Fases C-E são para 30K+.

---

## Variáveis de Ambiente Novas

| Variável | Descrição | Default |
|---|---|---|
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `DATABASE_READ_URL` | Read replica connection | Falls back to `DATABASE_URL` |
| `INSTANCE_ID` | Instance identifier for logging | `1` |
| `BULL_CONCURRENCY` | Agent jobs per instance | `5` |
| `BULL_MAX_RATE` | Max jobs/min per instance | `10` |
