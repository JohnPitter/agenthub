# AgentHub — Plano de Desenvolvimento

## Estado Atual (v0.17.1)

**Fases 1-17A completas.** Resumo por fase:

| Fase | Título | Resumo |
|------|--------|--------|
| 1-5 | Core Platform | Agents, tasks, real-time, dashboard, review cycle, command palette |
| 6 | Git Integration | Detecção, branches por task, auto-commit, activity feed |
| 7 | Git Remote | Push/pull/sync, credentials (AES-256-GCM), conflict detection |
| 8 | File Browser | Tree view, Monaco Editor, diff viewer, breadcrumbs |
| 9 | Analytics | Métricas por agente, trend charts (Recharts), success rates |
| 10 | Code Editor | Monaco com IntelliSense, 50+ languages, git history |
| 11 | Agent Memory & Souls | Sistema de memórias (5 tipos), soul prompts, task watcher |
| 12 | Kanban & War Room | Drag-and-drop board, cross-project war room, agent status strip |
| 13 | Dev Server Preview | Iframe preview, terminal output, start/stop per project |
| 14 | Pull Requests | GitHub PRs via `gh` API, create/merge/close, PR listing |
| 15 | OAuth & Auth | GitHub OAuth, landing page, login, JWT, auth guards |
| 16 | GitHub Repos & Docs | Import repos, knowledge base, WhatsApp ops, JWT refresh |
| 17 | OpenAI + i18n | OpenAI Responses API (agentic loop), Codex OAuth, react-i18next (5 locales) |
| 17A | WhatsApp Hardening | Auto-reconnect on startup, single number whitelist |

### Arquitetura Atual

```
Frontend (16 routes)          Backend (17 route files)         Database (10 tables)
─────────────────────         ──────────────────────           ──────────────────────
Dashboard                     Auth (GitHub OAuth + JWT)        projects
Analytics                     Projects CRUD                    agents
Settings (4 tabs)             Tasks CRUD + state machine       tasks
Agents + Workflow Editor*     Agents CRUD + configs            messages
Tasks (War Room)              Messages + chat                  task_logs
Project Overview              Git (status/log/diff/pull/push)  agent_project_configs
Project Tasks                 Pull Requests (GitHub API)       integrations
Project Board (Kanban)        Files (tree/read/write)          agent_memories
Project Agents                Analytics + Usage                users
Project Files (Monaco)        Memories (agent CRUD)            docs
Project PRs                   Dev Server (start/stop)
Project Settings              Docs (knowledge base)
Project Preview               OpenAI + Codex OAuth
Docs (Knowledge Base)         Integrations (WA/TG/Git)
Landing + Login               Dashboard (aggregated stats)
```

*O Workflow Editor visual (`agents.tsx`) salva no localStorage mas **não está conectado ao backend** — o workflow real é hardcoded em `agent-manager.ts`.

### Gaps Identificados (pós-análise Fase 17A)

| Gap | Severidade | Esforço |
|-----|-----------|---------|
| Workflow Editor desconectado do backend | Alta | Alto |
| `parentTaskId` existe no schema mas sem UI de subtasks | Alta | Médio |
| Custo/tokens coletados por task mas sem dashboard visual | Média | Baixo |
| `agent-manager.ts` sem testes unitários | Média | Médio |
| Zero CI/CD (sem GitHub Actions) | Média | Baixo |
| `users.accessToken` sem criptografia | Média | Baixo |
| `parentMessageId` existe mas chat é flat | Baixa | Baixo |
| Knowledge base 100% manual (sem auto-doc) | Baixa | Médio |

---

## Fase 18: Subtask UI + Cost Analytics Dashboard

### Objetivo

Duas entregas de alto impacto com backend **já pronto**:
1. **Subtask UI** — Visualizar e gerenciar hierarquia de tasks (parent → children)
2. **Cost Dashboard** — Gráficos de custo e consumo de tokens por agente/modelo/período

### Justificativa

Ambos os dados já existem no banco (`parentTaskId`, `costUsd`, `tokensUsed`) e no backend (`checkSubtaskCompletion()`, `/api/usage/summary`). Falta apenas a camada de apresentação. Alta entrega, baixa complexidade relativa.

---

### Fase 18A: Subtask UI + Task Hierarchy

**Objetivo:** Permitir criar, visualizar e gerenciar subtasks no frontend.

#### Descobertas (backend existente)

- `tasks.parentTaskId` — coluna TEXT nullable, referencia outra task
- `agent-manager.ts` → `checkSubtaskCompletion()` — quando todas subtasks completam, parent vai para `review`
- O agent workflow já cria subtasks automaticamente (Architect planeja, Tech Lead cria subtasks para devs)
- Falta: UI para ver a árvore, criar subtasks manuais, progress bar

#### Arquivos a criar

##### `apps/web/src/components/tasks/subtask-tree.tsx`
```typescript
interface SubtaskTreeProps {
  parentTask: Task;
  subtasks: Task[];
  onCreateSubtask: (parentId: string) => void;
  onClickTask: (taskId: string) => void;
}
```
- Tree view com indentação (1 nível — parent → children)
- Cada item mostra: status badge, título, agente atribuído, duração
- Progress bar no parent baseada em `completedChildren / totalChildren`
- Botão "+ Subtask" para criação manual
- Ícone de colapsar/expandir

##### `apps/web/src/components/tasks/create-subtask-dialog.tsx`
```typescript
interface CreateSubtaskDialogProps {
  parentTaskId: string;
  projectId: string;
  onCreated: (task: Task) => void;
  onClose: () => void;
}
```
- Form: título, descrição, prioridade, categoria
- `parentTaskId` enviado automaticamente no POST
- Agente pode ser atribuído ou deixado para o Task Watcher

#### Arquivos a modificar

##### `apps/orchestrator/src/routes/tasks.ts`
- Novo endpoint `GET /api/tasks/:id/subtasks` — retorna tasks com `parentTaskId = id`
- Modificar `POST /api/tasks` para aceitar `parentTaskId` no body
- Modificar `GET /api/tasks` para incluir `subtaskCount` e `completedSubtaskCount` em cada task

##### `apps/web/src/routes/project-tasks.tsx`
- Agrupar tasks por parent/children
- Expandir/colapsar subtasks inline
- Indicador visual de hierarquia (indent + connector line)

##### `apps/web/src/routes/project-board.tsx` (Kanban)
- Cards de parent tasks mostram chip: "3/5 subtasks"
- Click no chip expande subtasks em popover ou drawer
- Subtasks não aparecem como cards independentes no board (opcional: toggle)

##### `apps/web/src/components/tasks/task-detail-drawer.tsx`
- Tab "Subtasks" no drawer com o `SubtaskTree`
- Mostrar progress bar no header do drawer

##### `packages/shared/src/types/task.ts`
- Adicionar ao tipo `Task`:
```typescript
subtaskCount?: number;
completedSubtaskCount?: number;
```

#### Verificação

1. Task criada pelo Architect gera subtasks → UI mostra árvore
2. Progress bar reflete status das subtasks corretamente
3. Criar subtask manual via dialog → task watcher processa automaticamente
4. Kanban mostra chip de subtasks no parent card
5. Parent task move para `review` quando todas subtasks completam
6. `pnpm build` passa

---

### Fase 18B: Cost & Token Analytics Dashboard

**Objetivo:** Dashboard visual de custos e consumo de tokens.

#### Descobertas (dados existentes)

- `tasks.costUsd` — REAL, populado pelo `AgentSession` e `OpenAISession`
- `tasks.tokensUsed` — INTEGER, total de tokens por task
- `GET /api/usage/summary` — endpoint existente com agregação
- `usage-store.ts` — Zustand store para dados de uso (já existe no frontend)
- Recharts já instalado e usado em `analytics.tsx`

#### Arquivos a criar

##### `apps/web/src/components/analytics/cost-dashboard.tsx`
```typescript
interface CostDashboardProps {
  period: "7d" | "30d" | "all";
}
```
- **Card 1 — Total Cost:** Valor total gasto no período com trend indicator (↑↓)
- **Card 2 — Total Tokens:** Input + output tokens com breakdown
- **Card 3 — Tasks Completed:** Quantidade de tasks no período
- **Card 4 — Avg Cost per Task:** Custo médio

##### `apps/web/src/components/analytics/cost-by-agent-chart.tsx`
- BarChart horizontal: custo por agente (Tech Lead, Architect, Frontend Dev, etc.)
- Cores: cada agente usa sua `agent.color` do banco
- Tooltip com breakdown: custo, tokens, tasks

##### `apps/web/src/components/analytics/cost-by-model-chart.tsx`
- PieChart: distribuição de custo por modelo (Opus, Sonnet, Haiku, GPT-4.1, etc.)
- Legenda com percentual e valor absoluto

##### `apps/web/src/components/analytics/cost-trend-chart.tsx`
- AreaChart: custo por dia nos últimos 30 dias
- Linha de tendência
- Área preenchida com gradiente (orange/primary)

##### `apps/web/src/components/analytics/token-breakdown-chart.tsx`
- Stacked BarChart: input tokens vs output tokens por dia
- Cores: input = blue, output = orange

#### Arquivos a modificar

##### `apps/orchestrator/src/routes/usage.ts`
- Novo endpoint `GET /api/usage/analytics` com query params:
  - `period`: "7d" | "30d" | "all"
  - `groupBy`: "agent" | "model" | "day"
- Retorna dados agregados com SQL GROUP BY:
```typescript
// groupBy=agent
[{ agentId, agentName, totalCost, totalTokens, taskCount }]

// groupBy=model
[{ model, totalCost, totalTokens, taskCount }]

// groupBy=day
[{ date, totalCost, inputTokens, outputTokens, taskCount }]
```

##### `apps/web/src/routes/analytics.tsx`
- Adicionar tab "Custos" ao lado da tab existente "Performance"
- Tab Custos renderiza o `CostDashboard` + charts
- Period selector (7d / 30d / all) compartilhado entre tabs

##### `apps/web/src/stores/usage-store.ts`
- Adicionar actions para buscar analytics data:
```typescript
fetchCostByAgent: (period) => Promise<void>
fetchCostByModel: (period) => Promise<void>
fetchCostTrend: (period) => Promise<void>
```

#### Verificação

1. Tab "Custos" mostra cards com totais corretos
2. Gráfico por agente reflete custo real das tasks
3. Gráfico por modelo mostra distribuição correta
4. Trend chart mostra evolução diária
5. Period selector (7d/30d/all) filtra corretamente
6. Tasks sem custo (ex: manuais) não quebram os gráficos
7. `pnpm build` passa

---

### Ordem de Execução

```
18A (Subtask UI)         → prioridade 1 (base visual para hierarquia de tasks)
18B (Cost Dashboard)     → prioridade 2 (independente de 18A, pode ser paralelo)
```

### Dependências Novas

Nenhuma — usa Recharts (já instalado), Zustand (já instalado), Lucide icons (já instalado).

### Estimativa de Arquivos

| SubFase | Arquivos novos | Arquivos modificados |
|---------|---------------|---------------------|
| 18A | 2 (subtask-tree, create-subtask-dialog) | 5 (tasks route, project-tasks, project-board, task-detail-drawer, shared types) |
| 18B | 5 (cost-dashboard, cost-by-agent, cost-by-model, cost-trend, token-breakdown) | 3 (usage route, analytics page, usage-store) |

---

## Fase 19: Workflow Editor → Backend

### Objetivo

Conectar o editor visual de workflows (atualmente desconectado, salva apenas no localStorage) ao backend, persistir workflows no DB e criar uma engine de execução de DAG que substitua o fluxo hardcoded em `agent-manager.ts`.

### Gap Atual

- `agents.tsx` tem um editor visual (React Flow) que salva workflows em localStorage
- `agent-manager.ts` tem o workflow hardcoded: Receptionist → Architect → Tech Lead → devs → QA
- Não há persistência de workflows no banco
- Não há engine para executar workflows customizados

---

### Fase 19A: Schema + Persistência de Workflows

**Objetivo:** Criar tabela de workflows no DB e endpoints CRUD.

#### Arquivos a criar

##### `packages/database/src/schema/workflows.ts`
```typescript
export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  projectId: text("projectId").references(() => projects.id),
  name: text("name").notNull(),
  description: text("description"),
  nodes: text("nodes").notNull(),      // JSON: array of WorkflowNode
  edges: text("edges").notNull(),      // JSON: array of WorkflowEdge
  isDefault: integer("isDefault", { mode: "boolean" }).default(false),
  createdAt: text("createdAt").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updatedAt").default(sql`CURRENT_TIMESTAMP`),
});
```

##### `packages/shared/src/types/workflow.ts`
```typescript
interface WorkflowNode {
  id: string;
  type: "agent" | "condition" | "parallel" | "merge";
  agentId?: string;          // para type=agent
  condition?: string;        // para type=condition (campo da task a avaliar)
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface WorkflowEdge {
  id: string;
  source: string;            // nodeId
  target: string;            // nodeId
  label?: string;            // "success" | "failure" | condição
  conditionValue?: string;   // valor que ativa essa edge
}

interface Workflow {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isDefault: boolean;
}
```

##### `apps/orchestrator/src/routes/workflows.ts`
- `GET /api/workflows?projectId=` — listar workflows do projeto
- `GET /api/workflows/:id` — detalhe de um workflow
- `POST /api/workflows` — criar workflow
- `PUT /api/workflows/:id` — atualizar workflow
- `DELETE /api/workflows/:id` — deletar workflow
- `POST /api/workflows/:id/set-default` — marcar como default do projeto

#### Arquivos a modificar

- `packages/database/src/schema/index.ts` — exportar nova tabela
- `apps/orchestrator/src/index.ts` — registrar workflowsRouter
- `apps/web/src/routes/agents.tsx` — salvar no backend ao invés de localStorage

#### Verificação
1. CRUD de workflows funciona via API
2. Editor visual salva e carrega do backend
3. Migration roda sem erro
4. `pnpm build` passa

---

### Fase 19B: Engine de Execução de DAG

**Objetivo:** Criar engine que interpreta o workflow salvo e executa agents na ordem definida pelo grafo.

#### Arquivos a criar

##### `apps/orchestrator/src/workflows/workflow-engine.ts`
```typescript
class WorkflowEngine {
  constructor(private workflow: Workflow) {}

  // Faz topological sort do grafo para ordem de execução
  getExecutionOrder(): WorkflowNode[][] // array de "camadas" (paralelas)

  // Encontra próximos nodes dado o estado atual
  getNextNodes(completedNodeIds: string[], taskResult?: string): WorkflowNode[]

  // Valida que o workflow é um DAG válido (sem ciclos)
  validate(): { valid: boolean; errors: string[] }

  // Executa o workflow para uma task
  async execute(task: Task, projectId: string): Promise<void>
}
```

- **Topological sort** para determinar ordem de execução
- **Parallel nodes** executam simultaneamente (Promise.all)
- **Condition nodes** avaliam campo da task (ex: `task.category === "frontend"`) para branching
- **Merge nodes** esperam todas entradas completarem antes de prosseguir
- Validação do DAG: sem ciclos, todos nodes alcançáveis, pelo menos 1 nó de entrada

##### `apps/orchestrator/src/workflows/workflow-executor.ts`
```typescript
class WorkflowExecutor {
  // Substitui o fluxo hardcoded de agent-manager.ts
  async executeWorkflow(taskId: string, workflowId: string): Promise<void>

  // Cria subtasks para cada agent node do workflow
  private async createAgentSubtask(node: WorkflowNode, parentTask: Task): Promise<Task>

  // Avalia condição em condition nodes
  private evaluateCondition(node: WorkflowNode, task: Task): boolean
}
```

#### Arquivos a modificar

- `apps/orchestrator/src/agents/agent-manager.ts` — refatorar para usar WorkflowEngine quando workflow custom existe, manter fluxo hardcoded como fallback
- `apps/orchestrator/src/tasks/task-watcher.ts` — integrar com workflow executor

#### Verificação
1. Workflow custom executado corretamente (ordem respeitada)
2. Parallel nodes executam simultaneamente
3. Condition nodes fazem branching correto
4. Fallback para workflow hardcoded quando não há custom
5. `pnpm build` passa

---

### Fase 19C: UI Polish — Editor Visual Completo

**Objetivo:** Melhorar o editor visual com nodes customizados, validação e preview de execução.

#### Arquivos a criar

##### `apps/web/src/components/workflows/workflow-node.tsx`
- Custom node para React Flow com ícone do agente, role, status
- Cores: agent=verde, condition=amarelo, parallel=azul, merge=roxo

##### `apps/web/src/components/workflows/workflow-toolbar.tsx`
- Toolbar com drag-and-drop de node types
- Botão "Validar" que chama a engine de validação
- Botão "Simular" que mostra preview da ordem de execução

##### `apps/web/src/components/workflows/workflow-condition-editor.tsx`
- Modal para editar condições de condition nodes
- Campos disponíveis: category, priority, complexity
- Operadores: equals, contains, in

#### Arquivos a modificar

- `apps/web/src/routes/agents.tsx` — integrar novos componentes
- `apps/web/src/stores/workflow-store.ts` — criar Zustand store (substituir localStorage)

#### Verificação
1. Editor visual bonito com nodes customizados
2. Drag-and-drop de novos nodes funciona
3. Validação mostra erros visuais (nodes vermelhos)
4. Preview de execução mostra ordem
5. `pnpm build` passa

---

## Fase 20: CI/CD + Test Coverage

### Objetivo

Implementar pipeline de CI/CD com GitHub Actions e adicionar testes unitários e de integração para os módulos críticos do backend.

---

### Fase 20A: GitHub Actions Pipeline

**Objetivo:** CI que roda lint, build e testes em cada PR.

#### Arquivos a criar

##### `.github/workflows/ci.yml`
```yaml
name: CI
on:
  pull_request:
    branches: [master]
  push:
    branches: [master]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
      - run: pnpm lint
```

##### `.github/workflows/security.yml`
```yaml
name: Security Audit
on:
  schedule:
    - cron: "0 6 * * 1"   # Toda segunda 6h
  pull_request:
    branches: [master]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm audit --audit-level moderate
```

##### `apps/orchestrator/.eslintrc.json` + `apps/web/.eslintrc.json`
- Configuração ESLint com TypeScript rules
- Regras: no-unused-vars, no-explicit-any, consistent-return

#### Arquivos a modificar

- `package.json` (root) — adicionar scripts `test`, `lint`
- `turbo.json` — adicionar tasks `test`, `lint`

#### Verificação
1. `pnpm lint` roda sem erros em todos packages
2. `pnpm test` roda (mesmo sem testes ainda)
3. GitHub Actions CI pipeline funciona em PR
4. Security audit reporta vulnerabilidades conhecidas

---

### Fase 20B: Testes Unitários — agent-manager.ts

**Objetivo:** Testar o módulo mais crítico do backend.

#### Arquivos a criar

##### `apps/orchestrator/src/agents/__tests__/agent-manager.test.ts`
```typescript
describe("AgentManager", () => {
  describe("assignTask", () => {
    it("should assign task to correct agent based on category")
    it("should create branch for new task")
    it("should transition task to assigned state")
    it("should emit task:assigned event")
  })

  describe("checkSubtaskCompletion", () => {
    it("should move parent to review when all subtasks complete")
    it("should not move parent when subtasks are still pending")
    it("should handle parent with no subtasks")
  })

  describe("handleTaskReview", () => {
    it("should transition to done on approve")
    it("should transition back to assigned on reject with feedback")
    it("should create revision subtask on reject")
  })
})
```

##### `apps/orchestrator/src/agents/__tests__/agent-session.test.ts`
- Testar criação de sessão Claude
- Testar streaming de eventos
- Testar error handling (API failure, timeout)
- Mock do Claude SDK

##### `apps/orchestrator/vitest.config.ts`
```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/agents/**", "src/tasks/**", "src/services/**"],
    },
  },
});
```

#### Dependências novas
- `vitest` — test runner
- `@vitest/coverage-v8` — coverage

#### Verificação
1. `pnpm test` roda todos os testes
2. Coverage report gerado em `coverage/`
3. Coverage > 70% para agent-manager.ts
4. CI roda testes automaticamente

---

### Fase 20C: Testes de Integração — Routes API

**Objetivo:** Testar endpoints da API com requests reais.

#### Arquivos a criar

##### `apps/orchestrator/src/routes/__tests__/tasks.test.ts`
```typescript
describe("Tasks API", () => {
  it("POST /api/tasks — creates task and returns 201")
  it("GET /api/tasks — returns paginated list")
  it("GET /api/tasks/:id — returns task detail")
  it("PUT /api/tasks/:id — updates task")
  it("POST /api/tasks/:id/assign — assigns to agent")
  it("POST /api/tasks/:id/review — approve/reject")
})
```

##### `apps/orchestrator/src/routes/__tests__/projects.test.ts`
- CRUD de projetos
- Validação de input
- Projeto com path inválido retorna 400

##### `apps/orchestrator/src/__tests__/setup.ts`
- Setup de banco de dados in-memory para testes
- Seed de dados mínimos
- Cleanup entre testes

#### Dependências novas
- `supertest` — HTTP testing

#### Verificação
1. Testes de integração passam com DB in-memory
2. Coverage combinado (unit + integration) > 60%
3. CI verde com todos os testes

---

## Fase 21: Security Hardening

### Objetivo

Corrigir vulnerabilidades conhecidas: tokens sem criptografia, rate limiting genérico, e dependências desatualizadas.

---

### Fase 21A: Criptografar users.accessToken

**Objetivo:** Aplicar AES-256-GCM ao campo `accessToken` da tabela `users`.

#### Descobertas

- `apps/orchestrator/src/lib/encryption.ts` já implementa `encrypt()` / `decrypt()` com AES-256-GCM
- `users.accessToken` armazena GitHub OAuth access token em **plain text**
- O token é usado em operações Git e GitHub API

#### Arquivos a modificar

##### `apps/orchestrator/src/services/auth-service.ts`
- No fluxo de OAuth callback, criptografar `accessToken` antes de salvar:
```typescript
import { encrypt, decrypt } from "../lib/encryption.js";
// Ao salvar:
const encryptedToken = encrypt(accessToken);
await db.update(schema.users).set({ accessToken: encryptedToken });
// Ao ler:
const decryptedToken = decrypt(user.accessToken);
```

##### `apps/orchestrator/src/routes/git.ts`
- Ao buscar token do usuário, decriptar antes de usar
- Injetar token decriptado temporariamente para operação git

##### `apps/orchestrator/src/routes/pull-requests.ts`
- Mesma abordagem: decrypt antes de usar em `gh` API

#### Migration

- Script one-time para criptografar tokens existentes
- Detectar se token já está criptografado (prefixo ou formato)

#### Verificação
1. Novos tokens salvos criptografados no DB
2. Tokens existentes migrados
3. Git push/pull funciona com token decriptado
4. PR operations funcionam
5. `pnpm build` passa

---

### Fase 21B: Rate Limiter Granular

**Objetivo:** Rate limiting por rota ao invés de global.

#### Arquivos a modificar

##### `apps/orchestrator/src/middleware/rate-limiter.ts`
```typescript
// Atual: 1 rate limiter global (100 req/min)
// Novo: limites por categoria de rota

export const rateLimiters = {
  auth: rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }),     // Login: 20/15min
  api: rateLimit({ windowMs: 60 * 1000, max: 100 }),           // API geral: 100/min
  git: rateLimit({ windowMs: 60 * 1000, max: 30 }),            // Git ops: 30/min
  upload: rateLimit({ windowMs: 60 * 1000, max: 10 }),         // Upload: 10/min
  agent: rateLimit({ windowMs: 60 * 1000, max: 200 }),         // Agent exec: 200/min
};
```

##### `apps/orchestrator/src/index.ts`
- Aplicar rate limiters por grupo de rotas
- Remover rate limiter global

#### Verificação
1. Auth routes limitados a 20/15min
2. Git routes limitados a 30/min
3. API geral limitado a 100/min
4. Respostas incluem headers `X-RateLimit-*`

---

### Fase 21C: Dependency Audit + CSP Headers

**Objetivo:** Auditar dependências e adicionar security headers.

#### Arquivos a criar

##### `apps/orchestrator/src/middleware/security-headers.ts`
```typescript
export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // CSP apenas para produção (dev precisa de HMR)
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'");
  }
  next();
}
```

#### Arquivos a modificar

- `apps/orchestrator/src/index.ts` — adicionar security headers middleware
- `package.json` (root) — adicionar script `pnpm audit:fix`

#### Verificação
1. `pnpm audit` sem vulnerabilidades high/critical
2. Security headers presentes em todas as respostas
3. CSP não bloqueia funcionalidade em dev
4. `pnpm build` passa

---

## Fase 22: Docs Auto-Generation

### Objetivo

Agente que gera e atualiza documentação automaticamente após task completion, e API docs geradas a partir dos route files.

---

### Fase 22A: Doc Generator Agent + API Docs

**Objetivo:** Novo agent role "doc_writer" + geração automática de API docs.

#### Arquivos a criar

##### `apps/orchestrator/src/agents/doc-generator.ts`
```typescript
class DocGenerator {
  // Gera README para módulo/feature baseado no código
  async generateModuleDoc(projectPath: string, files: string[]): Promise<string>

  // Atualiza API docs baseado nos route files
  async generateApiDocs(routeFiles: string[]): Promise<string>

  // Gera summary de changes após task completion
  async generateChangeSummary(taskId: string): Promise<string>
}
```

##### `apps/orchestrator/src/routes/docs-generator.ts`
- `POST /api/docs/generate` — trigger manual de geração
- `POST /api/docs/generate-api` — gera docs da API
- `GET /api/docs/api` — retorna API docs geradas

##### `apps/web/src/components/docs/api-docs-viewer.tsx`
- Visualizador de API docs com endpoint list
- Cada endpoint: method, path, params, response example
- Search e filter por route group

#### Arquivos a modificar

- `apps/orchestrator/src/tasks/task-watcher.ts` — trigger doc generation após task `done`
- `apps/web/src/routes/docs.tsx` — adicionar tab "API Docs"
- `packages/database/src/seed.ts` — adicionar agent "Doc Writer" ao seed

#### Verificação
1. Agent "Doc Writer" criado no seed
2. API docs geradas com endpoints corretos
3. Visualizador mostra endpoints com detalhes
4. Doc generation triggered após task completion
5. `pnpm build` passa

---

## Fase 23: Message Threading

### Objetivo

Implementar threads de mensagens usando `parentMessageId` (já existe no schema), permitindo conversas organizadas por tópico dentro de cada task.

---

### Fase 23A: Backend Thread Support

**Objetivo:** Endpoints e lógica para mensagens com hierarquia.

#### Arquivos a modificar

##### `apps/orchestrator/src/routes/messages.ts`
- `GET /api/messages?taskId=&parentId=null` — retorna apenas root messages (thread starters)
- `GET /api/messages/:id/replies` — retorna replies de uma thread
- `POST /api/messages` — aceitar `parentMessageId` no body
- Incluir `replyCount` em cada root message

##### `packages/shared/src/types/message.ts`
```typescript
// Adicionar ao tipo Message:
parentMessageId?: string;
replyCount?: number;
```

#### Verificação
1. Messages sem parent retornam como root
2. Replies retornam quando consultadas por parentId
3. replyCount calculado corretamente
4. `pnpm build` passa

---

### Fase 23B: Frontend Thread UI

**Objetivo:** Chat UI com suporte a threads inline.

#### Arquivos a criar

##### `apps/web/src/components/chat/thread-view.tsx`
```typescript
interface ThreadViewProps {
  parentMessage: Message;
  replies: Message[];
  onReply: (content: string) => void;
  onClose: () => void;
}
```
- Panel lateral ou inline que mostra replies
- Input de resposta no bottom
- Indicador de "N replies" no message card

##### `apps/web/src/components/chat/message-card.tsx`
- Redesign do card de mensagem
- Badge "N replies" clicável
- Avatar do agente + timestamp
- Botão "Reply" no hover

#### Arquivos a modificar

- `apps/web/src/components/chat/chat-panel.tsx` — integrar thread view
- `apps/web/src/stores/chat-store.ts` — adicionar state para thread aberta

#### Verificação
1. Chat mostra root messages com reply count
2. Click em "replies" abre thread view
3. Reply é enviado com parentMessageId correto
4. Thread view fecha ao clicar fora
5. `pnpm build` passa

---

## Fase 24: Notification Inbox

### Objetivo

Sistema de notificações persistentes com inbox UI, substituindo as notificações efêmeras atuais (toast only).

---

### Fase 24A: Schema + Backend Notifications

**Objetivo:** Tabela de notificações e endpoints.

#### Arquivos a criar

##### `packages/database/src/schema/notifications.ts`
```typescript
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("userId").references(() => users.id),
  type: text("type").notNull(),            // "task_completed" | "review_needed" | "mention" | "error"
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),                       // deep link (ex: /project/123/tasks/456)
  read: integer("read", { mode: "boolean" }).default(false),
  createdAt: text("createdAt").default(sql`CURRENT_TIMESTAMP`),
});
```

##### `apps/orchestrator/src/routes/notifications.ts`
- `GET /api/notifications` — listar (paginado, filtro read/unread)
- `PUT /api/notifications/:id/read` — marcar como lida
- `PUT /api/notifications/read-all` — marcar todas como lidas
- `DELETE /api/notifications/:id` — deletar

##### `apps/orchestrator/src/services/notification-service.ts`
```typescript
class NotificationService {
  async create(userId: string, notification: CreateNotification): Promise<void>
  async getUnreadCount(userId: string): Promise<number>

  // Triggers automáticos
  onTaskCompleted(task: Task): void
  onReviewNeeded(task: Task): void
  onAgentError(task: Task, error: string): void
}
```

#### Arquivos a modificar

- `packages/database/src/schema/index.ts` — exportar tabela
- `apps/orchestrator/src/index.ts` — registrar router
- `apps/orchestrator/src/agents/agent-manager.ts` — criar notificações em eventos chave

#### Verificação
1. Notificações criadas em task events
2. API retorna lista paginada
3. Mark as read funciona
4. `pnpm build` passa

---

### Fase 24B: Frontend Inbox UI

**Objetivo:** Inbox UI com badge de contagem e lista de notificações.

#### Arquivos a criar

##### `apps/web/src/components/notifications/notification-inbox.tsx`
- Dropdown ou panel com lista de notificações
- Cada item: ícone por tipo, título, body preview, timestamp, indicador unread
- Click navega para o link (deep link)
- "Mark all as read" button

##### `apps/web/src/components/notifications/notification-bell.tsx`
- Ícone de sino no header
- Badge vermelho com contagem de unread
- Click abre inbox dropdown

##### `apps/web/src/stores/notification-store.ts`
```typescript
interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}
```

#### Arquivos a modificar

- `apps/web/src/components/layout/header.tsx` — adicionar notification bell
- `apps/web/src/lib/socket.ts` — listener para `notification:new` event

#### Verificação
1. Bell icon com badge no header
2. Dropdown mostra notificações recentes
3. Click navega para deep link correto
4. Mark as read atualiza UI em tempo real
5. WebSocket envia new notifications
6. `pnpm build` passa

---

## Fase 25: Multi-Tenant

### Objetivo

Suporte a múltiplos usuários e equipes com permissões por projeto (RBAC).

---

### Fase 25A: Teams + Membership

**Objetivo:** Schema de teams e convites.

#### Arquivos a criar

##### `packages/database/src/schema/teams.ts`
```typescript
export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: text("ownerId").references(() => users.id),
  createdAt: text("createdAt").default(sql`CURRENT_TIMESTAMP`),
});

export const teamMembers = sqliteTable("team_members", {
  id: text("id").primaryKey(),
  teamId: text("teamId").references(() => teams.id),
  userId: text("userId").references(() => users.id),
  role: text("role").notNull(),   // "owner" | "admin" | "member" | "viewer"
  joinedAt: text("joinedAt").default(sql`CURRENT_TIMESTAMP`),
});

export const teamInvites = sqliteTable("team_invites", {
  id: text("id").primaryKey(),
  teamId: text("teamId").references(() => teams.id),
  email: text("email").notNull(),
  role: text("role").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expiresAt").notNull(),
  acceptedAt: text("acceptedAt"),
});
```

##### `apps/orchestrator/src/routes/teams.ts`
- `POST /api/teams` — criar team
- `GET /api/teams` — listar teams do usuário
- `GET /api/teams/:id/members` — listar membros
- `POST /api/teams/:id/invite` — enviar convite
- `POST /api/teams/invite/:token/accept` — aceitar convite
- `DELETE /api/teams/:id/members/:userId` — remover membro

#### Arquivos a modificar

- `packages/database/src/schema/index.ts` — exportar tabelas
- `packages/database/src/schema/projects.ts` — adicionar `teamId` a projects
- `apps/orchestrator/src/index.ts` — registrar teamsRouter

#### Verificação
1. CRUD de teams funciona
2. Convites enviados e aceitos
3. Projetos vinculados a teams
4. `pnpm build` passa

---

### Fase 25B: RBAC (Role-Based Access Control)

**Objetivo:** Middleware de autorização por role.

#### Arquivos a criar

##### `apps/orchestrator/src/middleware/authorization.ts`
```typescript
type Permission = "project:read" | "project:write" | "project:delete" |
  "task:read" | "task:write" | "task:assign" |
  "agent:read" | "agent:write" |
  "team:manage" | "team:invite";

const rolePermissions: Record<string, Permission[]> = {
  owner: ["*"],           // tudo
  admin: ["project:*", "task:*", "agent:*", "team:invite"],
  member: ["project:read", "project:write", "task:read", "task:write", "agent:read"],
  viewer: ["project:read", "task:read", "agent:read"],
};

export function requirePermission(permission: Permission) {
  return async (req, res, next) => {
    const userRole = await getUserRoleInTeam(req.user.id, req.params.teamId);
    if (!hasPermission(userRole, permission)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
```

##### `apps/web/src/components/teams/team-settings.tsx`
- Gerenciamento de membros
- Alterar roles
- Revogar acesso
- Enviar convites

##### `apps/web/src/components/teams/team-switcher.tsx`
- Dropdown no header para trocar de team
- Mostra team atual + projetos

#### Arquivos a modificar

- `apps/orchestrator/src/routes/projects.ts` — filtrar projetos por team
- `apps/orchestrator/src/routes/tasks.ts` — verificar permissão antes de write
- `apps/web/src/components/layout/sidebar.tsx` — team switcher
- `apps/web/src/stores/workspace-store.ts` — adicionar activeTeamId

#### Verificação
1. Viewer não pode criar tasks
2. Member pode criar mas não deletar projetos
3. Admin pode gerenciar team
4. Owner tem acesso total
5. Team switcher funciona
6. `pnpm build` passa

---

## Roadmap Visual

```
Fase 18 ─── Subtask UI + Cost Dashboard ─────── (próxima)
  │
Fase 19 ─── Workflow Editor → Backend ────────── (alta prioridade)
  │
Fase 20 ─── CI/CD + Test Coverage ────────────── (infraestrutura)
  │
Fase 21 ─── Security Hardening ───────────────── (segurança)
  │
  ├── Fase 22 ─── Docs Auto-Generation ────────── (independente)
  ├── Fase 23 ─── Message Threading ───────────── (independente)
  └── Fase 24 ─── Notification Inbox ──────────── (independente)
        │
Fase 25 ─── Multi-Tenant ────────────────────── (último, precisa de tudo acima)
```

## Tabela de Prioridade

| Fase | Impacto | Esforço | Prioridade | Dependências |
|------|---------|---------|------------|-------------|
| 18 | Alto | Baixo | 1 | Nenhuma |
| 19 | Alto | Alto | 2 | 18 (subtasks para workflow) |
| 20 | Médio | Médio | 3 | Nenhuma (pode ser paralelo) |
| 21 | Médio | Baixo | 4 | Nenhuma (pode ser paralelo) |
| 22 | Médio | Médio | 5 | Nenhuma |
| 23 | Baixo | Baixo | 6 | Nenhuma |
| 24 | Médio | Médio | 7 | Nenhuma |
| 25 | Alto | Alto | 8 | 20, 21 (precisa de CI e security) |

---

## Verificação Final Fase 18

1. **Subtask UI:**
   - Árvore de subtasks visível no task detail drawer
   - Progress bar no parent task reflete completamento
   - Criação manual de subtask via dialog
   - Kanban mostra contagem de subtasks por card
   - Hierarquia correta na lista de tasks

2. **Cost Dashboard:**
   - Cards de resumo (total cost, tokens, avg cost)
   - Gráfico de custo por agente com cores corretas
   - Gráfico de distribuição por modelo (pie chart)
   - Trend chart diário com área preenchida
   - Token breakdown (input vs output stacked)
   - Period selector funcional

3. **Builds:**
   - `pnpm build` — limpo (4 packages)
   - Zero erros TypeScript
   - Zero imports não utilizados

4. **CHANGELOG.md:**
   - Atualizado com v0.18.0 e sub-fases 18A-18B
