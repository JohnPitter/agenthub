# Fase 18: Admin Panel + OpenRouter + Plans

## Objetivo

Refatoração completa do sistema de providers para usar OpenRouter como único motor dos agentes, criação de painel admin com gestão de planos de acesso, e remoção de OAuth do Claude Code CLI, Gemini e OpenAI.

## SubFases

- **18A**: Database schema (plans, openrouter_config, user role/planId, project ownerId) + migrations
- **18B**: Backend admin routes + middleware + OpenRouter service
- **18C**: OpenRouter session (substitui agent-session + openai-session) + refactor agent-manager
- **18D**: Remoção de código legado (OAuth Claude/OpenAI, sessions antigas, rotas)
- **18E**: Frontend admin page (4 tabs) + sidebar link
- **18F**: Frontend settings cleanup + plan selection + enforcement de limites
- **18G**: Shared types cleanup + build verification

---

## SubFase 18A: Database Schema

### Arquivos

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `packages/database/src/schema/plans.ts` | Criar | Tabela plans |
| `packages/database/src/schema/openrouter-config.ts` | Criar | Tabela openrouter_config |
| `packages/database/src/schema/users.ts` | Modificar | Adicionar role, planId |
| `packages/database/src/schema/projects.ts` | Modificar | Adicionar ownerId |
| `packages/database/src/schema/index.ts` | Modificar | Exportar novas tabelas |
| `packages/database/src/seed.ts` | Modificar | Seed JohnPitter como admin + plano default |

### Snippets

**plans.ts:**
```typescript
import { pgTable, text, integer, numeric, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  maxProjects: integer("max_projects").notNull().default(5),
  maxTasksPerMonth: integer("max_tasks_per_month").notNull().default(100),
  priceMonthly: numeric("price_monthly", { precision: 10, scale: 2 }).notNull().default("0"),
  features: jsonb("features").$type<string[]>().default([]),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});
```

**openrouter-config.ts:**
```typescript
import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export interface EnabledModel {
  id: string;       // e.g. "anthropic/claude-sonnet-4"
  name: string;     // e.g. "Claude Sonnet 4"
  provider: string; // e.g. "Anthropic"
}

export const openrouterConfig = pgTable("openrouter_config", {
  id: text("id").primaryKey(),
  apiKey: text("api_key").notNull(),         // encrypted via AES-256-GCM
  enabledModels: jsonb("enabled_models").$type<EnabledModel[]>().default([]),
  createdBy: text("created_by").notNull(),   // userId do admin
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});
```

**users.ts (modificações):**
```typescript
// Adicionar:
role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
planId: text("plan_id"),  // FK para plans.id (nullable - sem plano = usa default)
```

**projects.ts (modificações):**
```typescript
// Adicionar:
ownerId: text("owner_id"),  // FK para users.id (nullable para backwards compat)
```

**index.ts (adicionar):**
```typescript
export { plans } from "./plans";
export { openrouterConfig } from "./openrouter-config";
```

---

## SubFase 18B: Backend Admin Routes + OpenRouter Service

### Arquivos

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `apps/orchestrator/src/middleware/admin.ts` | Criar | Middleware isAdmin |
| `apps/orchestrator/src/services/openrouter-service.ts` | Criar | Fetch models, validate key, check balance |
| `apps/orchestrator/src/routes/admin.ts` | Criar | CRUD plans, users mgmt, OpenRouter config, dashboard |
| `apps/orchestrator/src/index.ts` | Modificar | Montar rota /api/admin |

### Snippets

**middleware/admin.ts:**
```typescript
import type { Request, Response, NextFunction } from "express";
import { db, schema } from "@agenthub/database";
import { eq } from "drizzle-orm";

export async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [user] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, userId));
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required" });

  next();
}
```

**services/openrouter-service.ts:**
```typescript
// Funções:
// - fetchAvailableModels(): busca GET https://openrouter.ai/api/v1/models
// - validateApiKey(key: string): testa key com request mínimo
// - getApiKey(): busca key decriptada da tabela openrouter_config
// - getEnabledModels(): retorna modelos habilitados
```

**routes/admin.ts — Endpoints:**
```
# Plans
GET    /api/admin/plans              — Listar planos
POST   /api/admin/plans              — Criar plano
PUT    /api/admin/plans/:id          — Atualizar plano
DELETE /api/admin/plans/:id          — Deletar plano

# Users
GET    /api/admin/users              — Listar usuários com plano e uso
PUT    /api/admin/users/:id/plan     — Atribuir plano
PUT    /api/admin/users/:id/role     — Mudar role

# OpenRouter
GET    /api/admin/openrouter/config  — Config atual (key masked)
POST   /api/admin/openrouter/config  — Salvar API key + modelos
GET    /api/admin/openrouter/models  — Fetch modelos do OpenRouter API
POST   /api/admin/openrouter/test    — Testar conexão

# Dashboard
GET    /api/admin/dashboard          — Métricas globais (users, projects, tasks, cost)
```

---

## SubFase 18C: OpenRouter Session + Agent Manager Refactor

### Arquivos

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `apps/orchestrator/src/agents/openrouter-session.ts` | Criar | Nova session usando OpenRouter API |
| `apps/orchestrator/src/agents/agent-manager.ts` | Modificar | Trocar imports/uso para OpenRouterSession |

### Snippets

**openrouter-session.ts:**
```typescript
import OpenAI from "openai";
import { getAgentPrompt } from "./agent-prompts.js";
import { eventBus } from "../realtime/event-bus.js";
import { logger } from "../lib/logger.js";
import { db, schema } from "@agenthub/database";
import { nanoid } from "nanoid";
import type { AgentRole } from "@agenthub/shared";
import { agentMemory } from "./agent-memory.js";
import type { SessionConfig, SessionResult } from "./types.js";
// ... tool implementations reutilizadas do openai-session.ts

export class OpenRouterSession {
  // Usa OpenAI SDK com baseURL: "https://openrouter.ai/api/v1"
  // API key vem da tabela openrouter_config (decriptada)
  // Headers extras: HTTP-Referer, X-Title
  // Tool loop idêntico ao openai-session (TOOL_DEFINITIONS, execute tools, etc)
  // Cost: usa response.usage (OpenRouter retorna usage compatível)
  // Mantém: memories injection, skills injection, events, message persistence
}
```

**Funcionalidades a portar do openai-session.ts:**
- TOOL_DEFINITIONS (bash, read_file, write_file, edit_file, list_dir, grep) — copiar intacto
- Tool execution functions (executeBash, executeReadFile, etc) — copiar intacto
- Event emissions (agent:stream, agent:message, agent:tool_use, agent:status, board:activity, board:agent_cursor) — copiar intacto
- Message persistence — copiar intacto
- Memories + skills injection — copiar intacto (igual ao agent-session.ts)

**agent-manager.ts (modificações):**
```typescript
// ANTES:
import { AgentSession } from "./agent-session";
import { OpenAISession } from "./openai-session";
import { getModelProvider } from "@agenthub/shared";

// DEPOIS:
import { OpenRouterSession } from "./openrouter-session";

// Em ActiveSession:
// session: AgentSession | OpenAISession  →  session: OpenRouterSession

// Em assignTask (linha ~1362):
// ANTES:
// const provider = getModelProvider(agent.model);
// const session = provider === "openai" ? new OpenAISession(...) : new AgentSession(...);
// DEPOIS:
// const session = new OpenRouterSession(sessionConfig);

// Em executeSession:
// Assinatura: session: OpenRouterSession (em vez de union type)
```

### SessionConfig e SessionResult

Mover `SessionConfig` e `SessionResult` interfaces para um arquivo compartilhado:
```typescript
// apps/orchestrator/src/agents/types.ts
export interface SessionConfig {
  agent: Agent;
  projectId: string;
  projectPath: string;
  taskId: string;
  prompt: string;
}

export interface SessionResult {
  result?: string;
  cost: number;
  duration: number;
  isError: boolean;
  errors: string[];
}
```

---

## SubFase 18D: Remoção de Código Legado

### Arquivos a DELETAR

| Arquivo | Motivo |
|---------|--------|
| `apps/orchestrator/src/agents/agent-session.ts` | Substituído por openrouter-session |
| `apps/orchestrator/src/agents/openai-session.ts` | Substituído por openrouter-session |
| `apps/orchestrator/src/services/codex-oauth.ts` | OAuth OpenAI removido |
| `apps/orchestrator/src/routes/codex-oauth.ts` | Rotas OAuth OpenAI removidas |
| `apps/orchestrator/src/routes/usage.ts` | OAuth Claude CLI removido |
| `apps/orchestrator/src/routes/openai.ts` | Rotas OpenAI removidas |

### Arquivos a MODIFICAR

| Arquivo | Mudança |
|---------|---------|
| `apps/orchestrator/src/index.ts` | Remover imports e montagem de: usageRouter, openaiRouter, codexOAuthRouter, codexCallbackRouter. Adicionar adminRouter |
| `packages/shared/src/types/agent.ts` | Remover OPENAI_MODELS, CLAUDE_MODELS, ALL_MODELS, getModelProvider, ModelProvider |
| `packages/shared/src/index.ts` | Remover exports de OPENAI_MODELS, CLAUDE_MODELS, ALL_MODELS, getModelProvider |

### Dependências a avaliar

- `@anthropic-ai/claude-agent-sdk` — remover do package.json do orchestrator
- `openai` SDK — MANTER (usado pelo OpenRouterSession com baseURL diferente)

---

## SubFase 18E: Frontend Admin Page

### Arquivos

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `apps/web/src/routes/admin.tsx` | Criar | Página admin com 4 tabs |
| `apps/web/src/stores/admin-store.ts` | Criar | Store para dados admin |
| `apps/web/src/App.tsx` | Modificar | Adicionar rota /admin |
| `apps/web/src/components/layout/app-sidebar.tsx` | Modificar | Link admin (condicional role) |

### Layout da página admin

```
┌─────────────────────────────────────────┐
│ Admin Panel                     Shield  │
├──────┬──────┬───────────┬───────────────┤
│Plans │Users │OpenRouter │Dashboard      │
├──────┴──────┴───────────┴───────────────┤
│                                         │
│  [Tab content area]                     │
│                                         │
└─────────────────────────────────────────┘
```

**Tab Plans:**
- Tabela: nome, max projetos, max tasks, preço, default, ações
- Dialog criar/editar plano

**Tab Users:**
- Tabela: avatar, nome, login, plano, projetos (usado/max), tasks mês (usado/max), role
- Dropdown plano, toggle admin

**Tab OpenRouter:**
- API key input (masked) + botão testar + salvar
- Status badge (conectado/desconectado)
- Lista de modelos com toggle enable/disable
- Filtro por provider

**Tab Dashboard:**
- 4 stat cards: total users, total projects, tasks este mês, custo total mês
- Gráfico tasks/dia (últimos 30 dias) — Recharts
- Top 5 usuários por consumo
- Top 5 modelos por uso

### Store admin

```typescript
interface AdminStore {
  // Plans
  plans: Plan[];
  fetchPlans(): Promise<void>;
  createPlan(data: CreatePlanInput): Promise<void>;
  updatePlan(id: string, data: UpdatePlanInput): Promise<void>;
  deletePlan(id: string): Promise<void>;

  // Users
  users: AdminUser[];
  fetchUsers(): Promise<void>;
  updateUserPlan(userId: string, planId: string | null): Promise<void>;
  updateUserRole(userId: string, role: "user" | "admin"): Promise<void>;

  // OpenRouter
  openrouterConfig: OpenRouterConfig | null;
  availableModels: OpenRouterModel[];
  fetchConfig(): Promise<void>;
  saveConfig(apiKey: string, enabledModels: EnabledModel[]): Promise<void>;
  fetchAvailableModels(): Promise<void>;
  testConnection(): Promise<boolean>;

  // Dashboard
  dashboardMetrics: DashboardMetrics | null;
  fetchDashboardMetrics(): Promise<void>;
}
```

---

## SubFase 18F: Frontend Settings Cleanup + Plan Selection + Enforcement

### Arquivos

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `apps/web/src/routes/settings.tsx` | Modificar | Remover aba Providers, adicionar seção plano |
| `apps/web/src/stores/usage-store.ts` | Modificar | Remover lógica Claude/OpenAI, simplificar |
| `apps/web/src/components/layout/app-sidebar.tsx` | Modificar | Remover UsageWidget de providers, simplificar |

**Settings — seção "Meu Plano":**
- Mostra plano atual (nome, limites, preço)
- Barra de uso: projetos X/Y, tasks X/Y
- Botão "Trocar Plano" → dialog com lista de planos disponíveis
- Endpoint: `GET /api/plans` (público para usuários autenticados) + `PUT /api/users/me/plan`

**Enforcement (backend):**
- `POST /api/projects` → check maxProjects antes de criar
- `POST /api/tasks` → check maxTasksPerMonth antes de criar
- Helper: `checkPlanLimits(userId, resource: "project" | "task"): { allowed: boolean; current: number; max: number }`

### Endpoints públicos (não admin):
```
GET  /api/plans                — Listar planos disponíveis
PUT  /api/users/me/plan        — Trocar próprio plano
GET  /api/users/me/usage       — Uso atual (projetos, tasks do mês)
```

---

## SubFase 18G: Shared Types Cleanup + Build

### Arquivos

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `packages/shared/src/types/agent.ts` | Modificar | Remover model lists e getModelProvider |
| `packages/shared/src/types/admin.ts` | Criar | Types para Plan, AdminUser, OpenRouterConfig, DashboardMetrics |
| `packages/shared/src/index.ts` | Modificar | Exportar novos types, remover exports antigos |

**types/admin.ts:**
```typescript
export interface Plan {
  id: string;
  name: string;
  description: string | null;
  maxProjects: number;
  maxTasksPerMonth: number;
  priceMonthly: string;
  features: string[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlanInput {
  name: string;
  description?: string;
  maxProjects: number;
  maxTasksPerMonth: number;
  priceMonthly: string;
  features?: string[];
  isDefault?: boolean;
}

export interface AdminUser {
  id: string;
  login: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: "user" | "admin";
  planId: string | null;
  planName: string | null;
  projectCount: number;
  taskCountThisMonth: number;
  createdAt: Date;
}

export interface OpenRouterConfig {
  id: string;
  apiKeyMasked: string;   // "sk-or-...****"
  enabledModels: EnabledModel[];
  updatedAt: Date;
}

export interface EnabledModel {
  id: string;
  name: string;
  provider: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
  architecture: { modality: string };
}

export interface DashboardMetrics {
  totalUsers: number;
  totalProjects: number;
  tasksThisMonth: number;
  costThisMonth: number;
  tasksTrend: { date: string; count: number; cost: number }[];
  topUsersByUsage: { userId: string; name: string; taskCount: number; cost: number }[];
  topModelsByUsage: { model: string; taskCount: number; cost: number }[];
}
```

### Verificação final
```bash
pnpm build   # Deve passar sem erros
pnpm dev     # Testar fluxo completo
```

---

## Dependências entre SubFases

```
18A (schema) → 18B (admin backend) → 18C (openrouter session)
                                    → 18D (remoção legado) — depende de 18C
18A → 18G (shared types) → 18E (admin frontend) → 18F (settings cleanup)
```

**Ordem de implementação:**
1. 18G (shared types) — types primeiro, sempre
2. 18A (database schema)
3. 18B (admin backend routes)
4. 18C (openrouter session)
5. 18D (remoção legado)
6. 18E (admin frontend)
7. 18F (settings cleanup + enforcement)

---

## Como testar

1. **Schema:** `pnpm db:migrate` sem erros
2. **Admin routes:** curl para cada endpoint, verificar auth/admin middleware
3. **OpenRouter:** configurar API key real, testar fetch de modelos, executar uma task
4. **Plans:** criar plano, atribuir a usuário, verificar enforcement nos endpoints de create project/task
5. **Frontend:** navegar para /admin, testar CRUD de planos, configurar OpenRouter
6. **Agent execution:** criar task, verificar que agente executa via OpenRouter, cost tracking funciona
7. **Build:** `pnpm build` sem erros
