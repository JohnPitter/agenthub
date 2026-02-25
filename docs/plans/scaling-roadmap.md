# Scaling Roadmap — AgentHub

> Plano de escalabilidade progressiva: 5k → 10k → 50k → 100k+ usuários

---

## Estado Atual (Baseline)

| Componente | Implementação Atual | Limite Prático |
|------------|--------------------:|---------------:|
| Database | SQLite single-file (WAL) | ~5 escritas/s concorrentes |
| Process | Node.js single process | ~200 req/s |
| Sessions | In-memory Maps (5 Maps em agent-manager) | Perde tudo no restart |
| Rate Limiting | In-memory Map | Não funciona multi-worker |
| Socket.io | Default in-memory adapter | ~1,000 conexões/processo |
| Task Watcher | Polling 3s (SELECT * unassigned) | O(n) a cada 3s |
| Frontend Bundle | ~16 MB (Monaco = 78%) | Slow initial load |
| Auth | JWT verificado por request, sem cache | CPU overhead |
| Input Validation | Nenhuma (sem Zod/Joi) | Vulnerável a payloads malformados |
| Capacity | **~200-500 usuários simultâneos** | |

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

### Mudanças Necessárias

#### Infraestrutura
- [ ] **Nginx reverse proxy** — SSL termination (Let's Encrypt), serve static frontend, gzip/brotli
- [ ] **PM2** com 2-3 workers (cluster mode)
- [ ] **SQLite otimizado** — WAL mode + PRAGMA journal_size_limit + busy_timeout 5000ms
- [ ] **Firewall (UFW)** — apenas portas 22, 80, 443 abertas

#### Backend
- [ ] **JWT_SECRET obrigatório** — crash no startup se env var ausente em production
- [ ] **CORS via env var** — `CORS_ORIGINS=https://app.seudominio.com`
- [ ] **Helmet middleware** — security headers production-ready
- [ ] **Zod validation** nos 5 endpoints mais críticos: login, register, create task, create project, update task
- [ ] **Socket.io auth** — verificar ownership de project no `connection` handler antes de `socket.join()`
- [ ] **Rate limiter file-based** — SQLite-backed ou simples file para funcionar com PM2 (2-3 workers)

#### Frontend
- [ ] **Monaco lazy loading** — `React.lazy()` + dynamic import (reduz bundle de 16MB → ~4MB initial)
- [ ] **Build otimizado** — Vite chunk splitting para vendor, monaco, app

#### Segurança
- [ ] **HTTPS obrigatório** — redirect HTTP → HTTPS no Nginx
- [ ] **Cookie secure flags** — `httpOnly`, `secure`, `sameSite: strict` em production
- [ ] **Fail2ban** — proteção SSH + rate limit por IP no Nginx

### Stack na VPS

```
Internet → Nginx (SSL + static) → PM2 (2-3 Node workers) → SQLite (WAL)
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
- Sem Redis = sem cache distribuído, mas 2-3 workers gerenciam
- Task watcher polling mantido (3s ok para esta escala)

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

### Mudanças Necessárias

#### Database: SQLite → PostgreSQL
- [ ] **PostgreSQL 16** instalado na VPS (ou managed DB se preferir)
- [ ] **Drizzle migration** — adaptar schema de SQLite para Postgres (tipos, índices)
- [ ] **Connection pool** — pg-pool com 20-30 conexões
- [ ] **Índices compostos** — `(projectId, status)` em tasks, `(taskId, action)` em task_logs
- [ ] **Prepared statements** — Drizzle já usa por padrão, mas validar

#### Redis
- [ ] **Redis 7** — sessions, rate limiting, cache
- [ ] **Socket.io Redis adapter** — `@socket.io/redis-adapter` para sync entre workers
- [ ] **Rate limiter Redis-backed** — `express-rate-limit` + `rate-limit-redis`
- [ ] **JWT verification cache** — LRU em Redis com TTL 5min
- [ ] **API response cache** — dashboard stats, analytics com TTL 60s

#### Backend
- [ ] **PM2 cluster** — 6-8 workers (1 por vCPU disponível)
- [ ] **Zod validation completa** — todos os endpoints POST/PATCH/PUT
- [ ] **Task watcher event-driven** — substituir polling por EventBus + Redis pub/sub
- [ ] **Agent sessions em Redis** — migrar as 5 Maps de agent-manager para Redis hashes
- [ ] **Graceful shutdown** — drain connections, finish current agent tasks

#### Frontend
- [ ] **Zustand selectors granulares** — `useStore(s => s.field)` em todos os componentes
- [ ] **Request deduplication** — abort controller + loading flags no api() helper
- [ ] **Chat virtualization** — react-window para lista de mensagens (limite 50 visíveis)
- [ ] **Image optimization** — WebP, lazy loading, srcset

#### Segurança
- [ ] **PostgreSQL roles** — user separado para app (sem SUPERUSER/CREATEDB)
- [ ] **Redis AUTH** — senha obrigatória, bind 127.0.0.1 only
- [ ] **Audit logging** — todas as operações de admin/config em log dedicado
- [ ] **Backup automático** — pg_dump diário + upload para S3/B2

### Stack na VPS

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

### Mudanças Necessárias

#### Job Queue
- [ ] **BullMQ** (Redis-based) para agent execution
- [ ] **Concurrency control** — max 10-20 agent jobs simultâneos por worker
- [ ] **Priority queues** — tasks urgent > high > normal
- [ ] **Dead letter queue** — jobs que falham 3x vão para DLQ para review manual
- [ ] **Job progress tracking** — tool_use, workflow_phase via BullMQ events

#### Database Avançado
- [ ] **PgBouncer** — connection pooler (suporta 500+ conexões aparentes com 30 reais)
- [ ] **Read replica** — PostgreSQL streaming replication para queries de leitura (dashboard, analytics, search)
- [ ] **Partitioning** — `task_logs` particionado por mês (tabela cresce rápido)
- [ ] **Vacuum automático** — tuning de autovacuum para tabelas quentes

#### Observabilidade
- [ ] **Prometheus + Grafana** — métricas de sistema, Node.js, PostgreSQL, Redis
- [ ] **Structured logging → Loki** — logs centralizados com query (substitui arquivos)
- [ ] **Health checks** — `/health` endpoint com status de DB, Redis, disk
- [ ] **Alertas** — CPU > 80%, RAM > 90%, disk > 85%, error rate > 1%, queue depth > 100

#### Deploy
- [ ] **Docker Compose production** — todos os serviços containerizados
- [ ] **Zero-downtime deploy** — rolling restart via PM2 ou Docker health checks
- [ ] **Database migrations** — safe migrations (add column, create index concurrently)
- [ ] **Rollback plan** — blue-green ou canary via Nginx upstream toggle

#### Frontend
- [ ] **CDN para assets** — Cloudflare ou BunnyCDN (JS/CSS/fonts)
- [ ] **Service Worker** — cache offline para app shell
- [ ] **Prefetch** — rotas mais acessadas pré-carregadas
- [ ] **Bundle analysis** — manter < 2MB initial load

#### Segurança Avançada
- [ ] **WAF** — Cloudflare ou ModSecurity no Nginx (SQLi, XSS, bot detection)
- [ ] **CSP nonce-based** — Content Security Policy com nonces dinâmicos
- [ ] **RBAC completo** — roles (owner, admin, member, viewer) com permissões granulares
- [ ] **2FA** — TOTP para contas admin
- [ ] **Secrets management** — env vars via Docker secrets ou Vault
- [ ] **Penetration testing** — audit antes de abrir para 50k users

### Stack na VPS

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

### Mudanças Necessárias

#### Containerização Completa
- [ ] **Docker Swarm ou K3s** — orquestração leve (não precisa de K8s completo)
- [ ] **Auto-scaling** — spin up workers baseado em queue depth e CPU
- [ ] **Service mesh** — comunicação entre serviços via rede interna

#### Database Enterprise
- [ ] **PostgreSQL HA** — Patroni cluster (primary + 2 replicas)
- [ ] **Connection routing** — pgcat ou Odyssey para smart routing (writes → primary, reads → replica)
- [ ] **Sharding por tenant** — se multi-tenant, cada organização em schema separado
- [ ] **TimescaleDB** — para task_logs e métricas (hypertables com retenção automática)

#### Redis Cluster
- [ ] **Redis Sentinel** — HA com failover automático
- [ ] **Redis Cluster** — se dataset > 16GB RAM, distribuir por shards
- [ ] **Cache warming** — pré-popular cache no deploy

#### Event Architecture
- [ ] **NATS ou RabbitMQ** — substituir EventBus por message broker real
- [ ] **Event sourcing** — task lifecycle como stream de eventos (audit + replay)
- [ ] **CQRS** — separar command model (writes) de query model (reads)

#### Frontend Global
- [ ] **Multi-region CDN** — Cloudflare com cache rules por rota
- [ ] **Edge functions** — auth validation na edge (Cloudflare Workers)
- [ ] **Progressive loading** — skeleton → cached data → fresh data
- [ ] **WebSocket fallback** — long polling para redes restritivas

#### Segurança Enterprise
- [ ] **SOC2 compliance** — audit logs imutáveis, access reviews, encryption everywhere
- [ ] **IP allowlisting** — para admin APIs
- [ ] **API key management** — rate limits per-key, usage tracking, rotation
- [ ] **Vulnerability scanning** — automated CVE scan no CI/CD
- [ ] **Incident response** — runbook documentado, PagerDuty/OpsGenie alertas
- [ ] **Data residency** — opção de escolher região do banco de dados

#### Performance
- [ ] **GraphQL ou tRPC** — reduzir over-fetching (substituir REST progressivamente)
- [ ] **Materialized views** — dashboard stats pré-computados
- [ ] **Full-text search** — PostgreSQL `tsvector` ou Meilisearch para busca de tasks/projects
- [ ] **Compression** — Brotli para API responses, WebSocket per-message deflate

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

### Estimativas

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
| **DB** | SQLite (WAL) | PostgreSQL | PG + Replica | PG HA Cluster |
| **Cache** | Nenhum | Redis | Redis + CDN | Redis Cluster + Edge |
| **Workers** | PM2 × 2-3 | PM2 × 6-8 | PM2 × 12 | Docker × 12-24 |
| **Queue** | Nenhum | Nenhum | BullMQ | BullMQ + NATS |
| **Socket** | In-memory | Redis adapter | Redis adapter | Redis Cluster adapter |
| **Monitoring** | PM2 logs | PM2 + basic health | Prometheus + Grafana | Full observability |
| **Deploy** | PM2 restart | PM2 reload | Docker rolling | K3s auto-scale |
| **CDN** | Nenhum | Nenhum | Cloudflare | Multi-region CDN |
| **Security** | Basic (JWT, HTTPS) | + Zod, Redis auth | + WAF, 2FA, RBAC | + SOC2, edge auth |
| **VPS** | 4C/8G ($30) | 8C/32G ($80) | 16C/64G ($200) | Multi-VPS ($500) |
| **Esforço** | 5-7 dias | 10-15 dias | 15-20 dias | 20-30 dias |
| **Esforço acumulado** | 5-7 dias | 15-22 dias | 30-42 dias | 50-72 dias |

---

## Quick Wins (aplicáveis em qualquer fase)

Mudanças que dão resultado imediato com esforço mínimo:

1. **Monaco lazy load** — 1 hora, reduz bundle 78%
2. **JWT_SECRET enforcement** — 30 min, fecha brecha crítica
3. **Nginx + HTTPS** — 2 horas, SSL + static serving + gzip
4. **Helmet middleware** — 30 min, security headers
5. **SQLite PRAGMA tuning** — 30 min, melhora WAL performance
6. **Zustand selectors** — 2-3 horas, reduz re-renders significativamente
