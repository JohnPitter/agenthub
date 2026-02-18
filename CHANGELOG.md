# Changelog

All notable changes to this project will be documented in this file.

## [0.26.0] - 2026-02-18

### Fase 26: CI Fix + Agent Skills

#### CI Fix

##### Fixed

- **CI pipeline** — removed explicit `version: 9` from `pnpm/action-setup@v4` in `.github/workflows/ci.yml` (3 steps) and `.github/workflows/security.yml` (1 step) to resolve "Multiple versions of pnpm specified" error. Action now reads version from `package.json` `packageManager` field.

#### Fase 26A: Agent Skills — Backend

##### Added

- **Skills schema** (`packages/database/src/schema/skills.ts`)
  - `skills` — id, projectId, name, description, category, instructions, isActive, timestamps
  - `agentSkills` — id, agentId, skillId, createdAt (join table)

- **Skill types** (`packages/shared/src/types/skill.ts`)
  - `SkillCategory` type: coding, testing, review, docs, devops, custom
  - `Skill`, `AgentSkill` interfaces

- **Skills routes** (`apps/orchestrator/src/routes/skills.ts`)
  - `GET /api/skills` — list all skills
  - `POST /api/skills` — create skill
  - `PATCH /api/skills/:id` — update skill
  - `DELETE /api/skills/:id` — delete skill (cascades agent_skills)
  - `GET /api/agents/:agentId/skills` — list assigned skills
  - `POST /api/agents/:agentId/skills` — assign skill
  - `DELETE /api/agents/:agentId/skills/:skillId` — unassign skill

- **Skill injection** — agent-session.ts injects assigned active skills into system prompt after memories block

- **Migration** — CREATE TABLE for skills, agent_skills + 3 indexes
- **Test helpers** — createTestSkill, createTestAgentSkill + cleanTestDb updated

#### Fase 26B: Agent Skills — Frontend

##### Added

- **Skill list** (`apps/web/src/components/skills/skill-list.tsx`)
  - Full CRUD with search, category filter pills, active toggle, delete confirmation
  - Category color badges (blue=coding, green=testing, amber=review, purple=docs, red=devops, gray=custom)

- **Skill dialog** (`apps/web/src/components/skills/skill-dialog.tsx`)
  - Create/edit form: name, description, category select, instructions (monospace textarea), active toggle

- **Skills tab** in Settings page (`apps/web/src/routes/settings.tsx`)
  - New "Skills" tab with Zap icon rendering SkillList component

- **Agent skills assignment** (`apps/web/src/components/agents/agent-config-dialog.tsx`)
  - Skills section with toggleable pills to assign/unassign skills to agents

- **i18n** — 17 new `skills.*` keys in all 5 locales (pt-BR, en-US, es, zh-CN, ja)

##### Stats

- **Build:** 4/4 passing
- **Testes:** 169 passando (sem regressões)
- **Arquivos criados:** 5
- **Arquivos modificados:** 13

---

## [0.25.0] - 2026-02-18

### Fase 25: Multi-Tenant

#### Fase 25A: Teams + Membership

##### Added

- **Teams schema** (`packages/database/src/schema/teams.ts`)
  - `teams` — id, name, slug (unique), ownerId, timestamps
  - `teamMembers` — id, teamId, userId, role (owner/admin/member/viewer), joinedAt
  - `teamInvites` — id, teamId, email, role, token (unique), expiresAt, acceptedAt

- **Team types** (`packages/shared/src/types/team.ts`)
  - `TeamRole`, `Team`, `TeamMember`, `TeamInvite` interfaces

- **Teams routes** (`apps/orchestrator/src/routes/teams.ts`)
  - `POST /api/teams` — criar team (auto-add creator como owner)
  - `GET /api/teams` — listar teams do usuário
  - `GET /api/teams/:id` — detalhes do team
  - `GET /api/teams/:id/members` — listar membros com info do user
  - `POST /api/teams/:id/invite` — enviar convite (token com 7 dias de validade)
  - `POST /api/teams/invite/:token/accept` — aceitar convite
  - `DELETE /api/teams/:id/members/:userId` — remover membro
  - `PATCH /api/teams/:id/members/:userId` — alterar role

- **Migration** — CREATE TABLE para teams, team_members, team_invites + ALTER TABLE projects ADD team_id

##### Changed

- `packages/database/src/schema/projects.ts` — adicionado `teamId` column
- `apps/orchestrator/src/routes/projects.ts` — filtro por `teamId` query param em GET, aceita teamId em POST

#### Fase 25B: RBAC + Frontend

##### Added

- **RBAC Middleware** (`apps/orchestrator/src/middleware/authorization.ts`)
  - `requirePermission(permission)` middleware factory
  - Roles: owner (full), admin, member, viewer com permissões granulares
  - Permissões: project:read/write/delete, task:read/write/assign, agent:read/write, team:manage/invite

- **Team Store** (`apps/web/src/stores/team-store.ts`)
  - Zustand store com fetchTeams, createTeam, fetchMembers, inviteMember, removeMember, updateMemberRole
  - activeTeamId persistido em localStorage

- **Team Switcher** (`apps/web/src/components/teams/team-switcher.tsx`)
  - Dropdown na sidebar para trocar de team
  - Opção "Personal" (sem filtro de team)
  - Botão "Create Team"

- **Team Settings** (`apps/web/src/components/teams/team-settings.tsx`)
  - Lista de membros com avatar, nome, role badge
  - Alterar role (apenas owner)
  - Seção de convites com email + role selector
  - Lista de convites pendentes

- **i18n**: 20 novas chaves `teams.*` em 5 locales

##### Changed

- `apps/web/src/stores/workspace-store.ts` — adicionado `activeTeamId` e `setActiveTeamId`
- `apps/web/src/components/layout/app-sidebar.tsx` — integrado TeamSwitcher
- `apps/web/src/App.tsx` — rota `/teams/:id/settings`

##### Stats

- **Testes:** 169 passando (sem regressões)
- **Arquivos criados:** 7 (teams.ts schema, team.ts types, teams.ts routes, authorization.ts, team-store.ts, team-switcher.tsx, team-settings.tsx)
- **Arquivos modificados:** 16

---

## [0.24.0] - 2026-02-18

### Fase 24: Notification Inbox

#### Fase 24A: Schema + Backend Notifications

##### Added

- **Notifications table** (`packages/database/src/schema/notifications.ts`)
  - Campos: id, projectId, type, title, body, link, read, createdAt
  - Types: `task_completed`, `review_needed`, `agent_error`, `info`

- **Notification Service** (`apps/orchestrator/src/services/notification-service.ts`)
  - `create()` — insere no DB + emite via Socket.io
  - `getAll()` — lista paginada com filtro read/unread e projectId
  - `getUnreadCount()` — contagem de não lidas
  - `markAsRead()`, `markAllAsRead()`, `deleteNotification()`

- **Notifications routes** (`apps/orchestrator/src/routes/notifications.ts`)
  - `GET /api/notifications` — lista paginada (projectId, read, limit, offset)
  - `GET /api/notifications/unread-count` — contagem unread
  - `PUT /api/notifications/:id/read` — marcar como lida
  - `PUT /api/notifications/read-all` — marcar todas como lidas
  - `DELETE /api/notifications/:id` — deletar

- **Event hooks** em `socket-handler.ts`
  - `task:status → "review"` cria notificação `review_needed`
  - `task:status → "done"` cria notificação `task_completed`
  - `agent:error` cria notificação `agent_error`

- **NotificationEvent** type em `packages/shared/src/types/events.ts`
- **`notification:new`** socket event em ServerToClientEvents e EventMap
- **Auto-migration** para criar tabela notifications no startup

#### Fase 24B: Frontend Inbox UI

##### Changed

- **Notification Store** (`apps/web/src/stores/notification-store.ts`)
  - Reescrito para usar API backend (persistência)
  - `fetchNotifications()`, `fetchUnreadCount()` via API
  - `markAsRead()`, `markAllAsRead()`, `deleteNotification()` via API
  - `addNotificationFromSocket()` para real-time
  - Toast system mantido como antes (efêmero)

- **Notification Panel** (`apps/web/src/components/layout/notification-panel.tsx`)
  - Deep link navigation — click navega para link da notificação
  - Botão delete (trash icon) no hover
  - Novos type badges: task_completed (green), review_needed (amber), agent_error (red)
  - i18n em todas as strings

- **Header** (`apps/web/src/components/layout/header.tsx`)
  - Fetch notifications e unread count no mount
  - Polling a cada 60s como fallback

- **Socket hook** (`apps/web/src/hooks/use-socket.ts`)
  - Listener `notification:new` → addNotificationFromSocket + toast para errors

- **i18n**: 9 novas chaves `notifications.*` em 5 locales

##### Stats

- **Testes:** 169 passando (sem regressões)
- **Arquivos criados:** 3 (notifications.ts schema, notification-service.ts, notifications.ts routes)
- **Arquivos modificados:** 14

---

## [0.23.0] - 2026-02-18

### Fase 23: Message Threading

#### Fase 23A: Backend — Thread-aware Messages API

##### Added

- **Thread-aware GET /api/messages** (`apps/orchestrator/src/routes/messages.ts`)
  - Query param `parentId=null` filtra apenas mensagens raiz (não replies)
  - `replyCount` calculado via SQL subquery para cada mensagem raiz
  - Query param `taskId` para filtrar mensagens por task
  - Paginação mantida com offset/limit

- **GET /api/messages/:id/replies** — novo endpoint para buscar replies de uma thread
  - Ordenado por `createdAt ASC` (cronológico)
  - Paginação com offset/limit

- **`replyCount`** adicionado ao tipo `Message` (`packages/shared/src/types/message.ts`)

##### Changed

- `POST /api/messages` agora passa `parentMessageId` do req.body corretamente

#### Fase 23B: Frontend — Thread UI

##### Added

- **Thread View** (`apps/web/src/components/chat/thread-view.tsx`)
  - Painel slide-in dentro do chat mostrando mensagem pai + replies
  - Fetch de replies via GET /api/messages/:id/replies
  - Input de reply no rodapé, botão fechar no header
  - Auto-scroll para novas replies

- **Reply button** em `message-bubble.tsx` — aparece no hover (opacity-0 → group-hover:opacity-100)
- **Reply count badge** — clicável para abrir thread ("N replies")

- **i18n**: chaves `thread.*` em 5 locales (pt-BR, en-US, es, ja, zh-CN)
  - replies, reply, replyPlaceholder, close, noReplies

##### Changed

- `apps/web/src/stores/chat-store.ts` — activeThread, threadReplies state, setActiveThread(), addThreadReply()
- `apps/web/src/hooks/use-messages.ts` — loadThreadReplies(), filtro parentId=null para mensagens raiz
- `apps/web/src/components/chat/chat-panel.tsx` — integração do ThreadView
- `apps/web/src/components/chat/message-list.tsx` — ajuste para thread context

##### Stats

- **Testes:** 169 passando (sem regressões)
- **Arquivos criados:** 1 (thread-view.tsx)
- **Arquivos modificados:** 12

---

## [0.22.0] - 2026-02-18

### Fase 22: Docs Auto-Generation

#### Fase 22A: Doc Generator Agent + API Docs

##### Added

- **ApiEndpoint type** (`packages/shared/src/types/api-docs.ts`)
  - `ApiEndpoint` e `ApiEndpointParam` types exportados via barrel
  - Campos: method, path, description, group, params (in: query/body/path)

- **DocGenerator agent** (`apps/orchestrator/src/agents/doc-generator.ts`)
  - Análise estática de arquivos de rota via regex (sem IA)
  - `generateApiDocs()` — parseia router.get/post/patch/delete patterns
  - `generateChangeSummary()` — gera markdown summary de task lifecycle (logs, status transitions, files changed)
  - `getRouteFiles()` — lista route files no diretório
  - Extrai path params (`:id`), query params (`req.query`), body params (`req.body`)
  - Extrai descrições de comments acima dos endpoints

- **Docs Generator routes** (`apps/orchestrator/src/routes/docs-generator.ts`)
  - `POST /api/docs-gen/generate-api` — trigger geração de API docs
  - `GET /api/docs-gen/api` — retorna docs em cache (auto-gera se vazio)
  - `POST /api/docs-gen/generate-summary/:taskId` — gera change summary

- **API Docs Viewer** (`apps/web/src/components/docs/api-docs-viewer.tsx`)
  - Endpoints agrupados por route group (collapsible sections)
  - Method badges coloridos: GET=green, POST=blue, PATCH=amber, DELETE=red, PUT=purple
  - Expand endpoint para ver params com tipo e required indicator
  - Search/filter bar por path, description, ou method
  - Botão "Regenerate" para forçar re-análise
  - Loading, error, e empty states

- **Doc Writer agent** no seed (`packages/database/src/seed.ts`)
  - Role `doc_writer`, model claude-sonnet-4-5
  - System prompt para geração e atualização de documentação

- **i18n**: 15 novas chaves `apiDocs.*` em 5 locales (pt-BR, en-US, es, ja, zh-CN)

##### Changed

- `apps/web/src/routes/docs.tsx` — Tab bar "Documentos" / "API Docs" no topo da página
- `apps/orchestrator/src/routes/tasks.ts` — Fire-and-forget change summary generation ao marcar task como "done"
- `apps/orchestrator/src/index.ts` — Registrado `docsGeneratorRouter` em `/api/docs-gen`
- `packages/shared/src/constants/agents.ts` — Blueprint do Doc Writer agent
- `packages/shared/src/constants/souls.ts` — Soul system prompt do Doc Writer
- `packages/shared/src/types/agent.ts` — Adicionado `doc_writer` ao AgentRole union type

##### Stats

- **Testes:** 169 passando (sem regressões)
- **Arquivos criados:** 4 (api-docs.ts, doc-generator.ts, docs-generator.ts, api-docs-viewer.tsx)
- **Arquivos modificados:** 10

---

## [0.21.0] - 2026-02-18

### Fase 21: Security Hardening

#### Fase 21A: Token Encryption Verification + safeDecrypt

##### Added

- **`safeDecrypt()` helper** (`apps/orchestrator/src/lib/encryption.ts`)
  - Detecta automaticamente se valor é formato criptografado (iv:tag:data) ou texto plain
  - Compatibilidade retroativa com tokens armazenados antes da criptografia
  - `isEncryptedFormat()` helper interno para detecção de formato

##### Changed

- `apps/orchestrator/src/agents/agent-manager.ts` — usa `safeDecrypt()` para tokens de acesso
- `apps/orchestrator/src/agents/openai-session.ts` — usa `safeDecrypt()` para tokens OpenAI
- `apps/orchestrator/src/routes/openai.ts` — usa `safeDecrypt()` para tokens de API
- `apps/orchestrator/src/routes/projects.ts` — usa `safeDecrypt()` para credenciais git
- `apps/orchestrator/src/integrations/telegram-service.ts` — usa `safeDecrypt()` para bot token
- `apps/orchestrator/src/realtime/socket-handler.ts` — usa `safeDecrypt()` para tokens em WebSocket

#### Fase 21B: Granular Rate Limiting

##### Changed

- **Rate Limiter refatorado** (`apps/orchestrator/src/middleware/rate-limiter.ts`)
  - 5 categorias com limites específicos: `auth` (20/15min), `api` (100/min), `git` (30/min), `upload` (10/min), `agent` (200/min)
  - `createRateLimiter(category)` factory function
  - Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` em cada resposta
  - Header `Retry-After` quando limite excedido (429)
  - Stores por categoria com cleanup automático a cada 5 minutos
  - Pre-built limiters exportados: `authLimiter`, `apiLimiter`, `gitLimiter`, `uploadLimiter`, `agentLimiter`
  - `rateLimiter` mantido como alias para `apiLimiter` (backward compat)

- **Middleware stack atualizado** (`apps/orchestrator/src/index.ts`)
  - `securityHeaders` como primeiro middleware
  - `/api/auth` → `authLimiter` (20 req / 15 min)
  - `/api/tasks`, `/api/openai`, `/api/workflows` → `agentLimiter` (200 req / min)
  - `/api/git`, `/api/pull-requests` → `gitLimiter` (30 req / min)
  - Demais rotas `/api/*` → `apiLimiter` (100 req / min)

#### Fase 21C: Security Headers + Audit Scripts

##### Added

- **Security Headers Middleware** (`apps/orchestrator/src/middleware/security-headers.ts`)
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Content-Security-Policy` apenas em produção (não quebra HMR/dev tooling)

- **Security Headers Tests** (`apps/orchestrator/src/__tests__/security-headers.test.ts`) — 7 tests
  - Verifica presença de cada header de segurança
  - Testa ausência de CSP em dev e presença em production

- **Audit Scripts** (`package.json`)
  - `pnpm audit:check` — verifica vulnerabilidades (audit-level moderate)
  - `pnpm audit:fix` — corrige vulnerabilidades automaticamente

##### Security

- Todos os pontos de uso de token verificados: decrypt é chamado antes de uso em todas as operações (git, AI, webhooks)
- Rate limiting granular previne brute force em auth e abuso de endpoints de IA
- Headers HSTS forçam HTTPS em produção
- CSP restringe fontes de scripts/estilos/imagens em produção

##### Stats

- **Testes totais:** 169 (162 anteriores + 7 novos de security headers)
- **Arquivos modificados:** 10
- **Arquivos criados:** 2 (security-headers.ts, security-headers.test.ts)

---

## [0.20.0] - 2026-02-18

### Fase 20: CI/CD + Test Coverage

### Fase 20A: GitHub Actions Pipeline

#### Added

- **Security Audit Workflow** (`.github/workflows/security.yml`)
  - Executa `pnpm audit --audit-level moderate` em PRs e semanalmente (segunda 6h)

#### Changed

- `.github/workflows/ci.yml` — branch corrigido de `main` para `master`, adicionado `pnpm build` antes de testes

#### Configuração

- `vitest.config.ts` (root) — adicionada configuração de coverage (v8 provider, text/html/lcov reporters)

### Fase 20B: Testes Unitários

#### Added

- **Test Setup** (`apps/orchestrator/src/test/setup.ts`)
  - Mock do logger para suprimir output durante testes
  - Setup global para vitest

- **Test Helpers** (`apps/orchestrator/src/test/helpers.ts`)
  - `createTestApp()` — factory de Express app sem auth middleware para testes
  - DB in-memory com migrations automáticas
  - Seed de dados mínimos (projeto, agentes)

- **WorkflowEngine Tests** (`apps/orchestrator/src/__tests__/workflow-engine.test.ts`) — 36 tests
  - Topological sort: DAG linear, branches paralelas, formato diamante
  - Validação: DAG válido, detecção de ciclos, nós desconectados, sem entry
  - `getNextNodes()` com avaliação de condições
  - `getEntryNodes()`, `getExecutionOrder()`

- **WorkflowExecutor Tests** (`apps/orchestrator/src/__tests__/workflow-executor.test.ts`) — 10 tests
  - Criação de subtasks, avanço do DAG
  - Avaliação de condition nodes
  - Mocks de DB e agent-manager

- **Web Test Setup** (`apps/web/src/test/setup.ts`)
  - Ambiente jsdom, mocks de matchMedia, IntersectionObserver, ResizeObserver
  - Import de @testing-library/jest-dom matchers

- **Web Tests** — 17 tests
  - `utils.test.ts` — testes de utilidades
  - `use-pull-requests.test.ts` — testes de hooks

### Fase 20C: Testes de Integração — Routes API

#### Added

- **Tasks Route Tests** (`apps/orchestrator/src/__tests__/routes/tasks.test.ts`) — 27 tests
  - POST /api/tasks — criação com 201
  - GET /api/tasks — listagem paginada com filtros
  - GET /api/tasks/:id — detalhe e 404
  - PATCH /api/tasks/:id — atualização de campos
  - DELETE /api/tasks/:id — deleção
  - GET /api/tasks/:id/subtasks — subtasks
  - GET /api/tasks/:id/logs — logs

- **Projects Route Tests** (`apps/orchestrator/src/__tests__/routes/projects.test.ts`) — 15 tests
  - CRUD completo de projetos
  - Validação de input (campos obrigatórios)
  - Paginação

- **Workflows Route Tests** (`apps/orchestrator/src/__tests__/routes/workflows.test.ts`) — 22 tests
  - CRUD completo de workflows
  - POST /api/workflows/:id/set-default
  - Validação de nodes/edges JSON
  - Desmarcar default anterior ao definir novo

- **Health/Agents Tests** — 12 tests adicionais
  - Health check endpoint
  - Agents CRUD

#### Resultado Final

- **162 testes passando** em 11 arquivos de teste
- **2 ambientes**: orchestrator (node) + web (jsdom)
- **Tempo total**: ~3.6s

#### Arquivos Criados

- `.github/workflows/security.yml`
- `apps/orchestrator/src/test/setup.ts`
- `apps/orchestrator/src/test/helpers.ts`
- `apps/orchestrator/src/__tests__/workflow-engine.test.ts`
- `apps/orchestrator/src/__tests__/workflow-executor.test.ts`
- `apps/orchestrator/src/__tests__/routes/tasks.test.ts`
- `apps/orchestrator/src/__tests__/routes/projects.test.ts`
- `apps/orchestrator/src/__tests__/routes/workflows.test.ts`
- `apps/orchestrator/src/__tests__/health.test.ts`
- `apps/orchestrator/src/__tests__/agents.test.ts`
- `apps/orchestrator/src/__tests__/projects.test.ts`
- `apps/orchestrator/src/__tests__/tasks.test.ts`
- `apps/web/src/test/setup.ts`
- `apps/web/src/__tests__/utils.test.ts`
- `apps/web/src/__tests__/use-pull-requests.test.ts`

#### Arquivos Modificados

- `.github/workflows/ci.yml`
- `vitest.config.ts`

---

## [0.19.0] - 2026-02-18

### Fase 19: Workflow Editor → Backend

### Fase 19A: Schema + Persistência de Workflows

#### Added

- **Workflow Types** (`packages/shared/src/types/workflow.ts`)
  - `WorkflowNode` (agent | condition | parallel | merge), `WorkflowEdge`, `Workflow`, `WorkflowExecutionState`
  - Exportados via barrel `packages/shared/src/index.ts`

- **Workflows Table** (`packages/database/src/schema/workflows.ts`)
  - Schema Drizzle: id, projectId (FK), name, description, nodes (JSON), edges (JSON), isDefault, timestamps
  - Migration em `packages/database/src/migrate.ts` com índice por projectId

- **Workflows CRUD API** (`apps/orchestrator/src/routes/workflows.ts`)
  - `GET /api/workflows?projectId=` — listar workflows do projeto
  - `GET /api/workflows/:id` — detalhe
  - `POST /api/workflows` — criar workflow
  - `PUT /api/workflows/:id` — atualizar
  - `DELETE /api/workflows/:id` — deletar
  - `POST /api/workflows/:id/set-default` — marcar como default do projeto

- **Workflow Store** (`apps/web/src/stores/workflow-store.ts`)
  - Zustand store com fetch/save/delete via API
  - Substitui localStorage para persistência de workflows

### Fase 19B: Engine de Execução de DAG

#### Added

- **Workflow Engine** (`apps/orchestrator/src/workflows/workflow-engine.ts`)
  - Topological sort (algoritmo de Kahn) para ordem de execução em camadas
  - Validação de DAG: detecção de ciclos, alcançabilidade, nós de entrada
  - `getNextNodes()` com avaliação segura de condições (switch/case, sem code execution)
  - `getEntryNodes()`, `getNode()`, `getExecutionOrder()` helpers

- **Workflow Executor** (`apps/orchestrator/src/workflows/workflow-executor.ts`)
  - `executeWorkflow(taskId, workflowId)` — inicia execução do DAG
  - Cria subtasks (`parentTaskId`) para cada nó "agent"
  - Resolve agents por role ou ID explícito
  - Suporte a nós parallel/merge/condition
  - `onSubtaskCompleted()` avança o DAG automaticamente
  - `isRunningWorkflow()` / `isWorkflowSubtask()` para consultas de estado

#### Changed

- `apps/orchestrator/src/agents/agent-manager.ts`
  - `getProjectDefaultWorkflow()` busca workflow custom no DB
  - `runWorkflow()` tenta workflow custom antes do fluxo hardcoded (fallback automático)
  - `executeSession()` integra com `workflowExecutor.onSubtaskCompleted()`

- `apps/orchestrator/src/tasks/task-watcher.ts`
  - Filtro para ignorar subtasks (`parentTaskId IS NULL`) — evita reprocessamento
  - Log de detecção de workflow custom

### Fase 19C: UI Polish — Editor Visual Completo

#### Added

- **Custom Workflow Node** (`apps/web/src/components/workflows/workflow-node.tsx`)
  - Nodes coloridos por tipo: agent=verde, condition=amarelo, parallel=azul, merge=roxo
  - Ícone do agente, role label, handles de conexão

- **Workflow Toolbar** (`apps/web/src/components/workflows/workflow-toolbar.tsx`)
  - Botões para adicionar node types (Agent, Condition, Parallel, Merge)
  - Botões Validar e Simular
  - Save/Load com nome do workflow

- **Condition Editor** (`apps/web/src/components/workflows/workflow-condition-editor.tsx`)
  - Modal para editar condições de condition nodes
  - Campos: category, priority, status, assignedAgentId
  - Operadores: equals, not_equals, contains, in

- **Workflow Editor Rewrite** (`apps/web/src/components/agents/workflow-editor.tsx`)
  - Integração com novos componentes (custom nodes, toolbar, condition editor)
  - Suporte a 4 tipos de nó (agent, condition, parallel, merge)
  - Salva no backend via workflow-store (não mais localStorage)

- **i18n** — 80 novas chaves de workflow em 5 locales (pt-BR, en-US, es, ja, zh-CN)

#### Changed

- `apps/web/src/routes/agents.tsx` — integração com workflow-store, carrega do backend
- `apps/orchestrator/src/index.ts` — registro do workflowsRouter

#### Arquivos Criados

- `packages/shared/src/types/workflow.ts`
- `packages/database/src/schema/workflows.ts`
- `apps/orchestrator/src/routes/workflows.ts`
- `apps/orchestrator/src/workflows/workflow-engine.ts`
- `apps/orchestrator/src/workflows/workflow-executor.ts`
- `apps/web/src/stores/workflow-store.ts`
- `apps/web/src/components/workflows/workflow-node.tsx`
- `apps/web/src/components/workflows/workflow-toolbar.tsx`
- `apps/web/src/components/workflows/workflow-condition-editor.tsx`

#### Arquivos Modificados

- `packages/shared/src/index.ts`
- `packages/database/src/schema/index.ts`
- `packages/database/src/migrate.ts`
- `apps/orchestrator/src/index.ts`
- `apps/orchestrator/src/agents/agent-manager.ts`
- `apps/orchestrator/src/tasks/task-watcher.ts`
- `apps/web/src/components/agents/workflow-editor.tsx`
- `apps/web/src/routes/agents.tsx`
- `apps/web/src/i18n/locales/pt-BR.json`
- `apps/web/src/i18n/locales/en-US.json`
- `apps/web/src/i18n/locales/es.json`
- `apps/web/src/i18n/locales/ja.json`
- `apps/web/src/i18n/locales/zh-CN.json`

---

## [0.18.0] - 2026-02-18

### Fase 18A: Subtask UI + Task Hierarchy

#### Added

- **Subtask Tree Component** (`apps/web/src/components/tasks/subtask-tree.tsx`)
  - Árvore colapsável com status dots coloridos por estado
  - Barra de progresso (completadas/total)
  - Nome do agente atribuído em cada subtask
  - Botão "+ Subtask" integrado ao topo da árvore

- **Create Subtask Dialog** (`apps/web/src/components/tasks/create-subtask-dialog.tsx`)
  - Formulário com título, descrição, prioridade e categoria
  - Herda `parentTaskId` automaticamente da task pai

- **Subtask API Endpoints** (`apps/orchestrator/src/routes/tasks.ts`)
  - `GET /api/tasks/:id/subtasks` — lista subtasks de uma task pai
  - `POST /api/tasks` agora aceita `parentTaskId` para criação de subtasks
  - `GET /api/tasks` enriquecido com `subtaskCount` e `completedSubtaskCount` via single query
  - Subtasks ocultas da listagem principal (filtro `isNull(parentTaskId)` por padrão)

- **Subtask Count Chips** nos componentes de task:
  - `task-card.tsx` — chip "X/Y subtasks" em cards de lista
  - `kanban-card.tsx` — chip com ícone no board Kanban
  - `kanban-board.tsx` — filtro para excluir subtasks do board
  - `project-tasks.tsx` — badge de contagem na tabela

- **Task Type Extension** (`packages/shared/src/types/task.ts`)
  - Campos `subtaskCount?: number` e `completedSubtaskCount?: number`

#### Changed

- `apps/web/src/components/tasks/task-detail-drawer.tsx` — seção SubtaskTree com fetch de subtasks

### Fase 18B: Cost & Token Analytics Dashboard

#### Added

- **Cost Dashboard** (`apps/web/src/components/analytics/cost-dashboard.tsx`)
  - 4 stat cards: Total Cost, Total Tokens, Tasks Completed, Avg Cost/Task
  - Layout responsivo com grid

- **Cost by Agent Chart** (`apps/web/src/components/analytics/cost-by-agent-chart.tsx`)
  - BarChart horizontal com custo por agente (Recharts)

- **Cost by Model Chart** (`apps/web/src/components/analytics/cost-by-model-chart.tsx`)
  - Donut PieChart com distribuição de custo por modelo

- **Cost Trend Chart** (`apps/web/src/components/analytics/cost-trend-chart.tsx`)
  - AreaChart com gradiente orange mostrando tendência temporal

- **Token Breakdown Chart** (`apps/web/src/components/analytics/token-breakdown-chart.tsx`)
  - Stacked BarChart separando tokens de input/output

- **Analytics API** (`apps/orchestrator/src/routes/usage.ts`)
  - `GET /api/usage/analytics` — agregação por agente, modelo e dia
  - Suporte a filtro `period` (7d, 30d, 90d, all) e `groupBy`
  - SQL joins com tasks e agents para enrichment

- **Usage Store** (`apps/web/src/stores/usage-store.ts`)
  - Interfaces `CostByAgentEntry`, `CostByModelEntry`, `CostTrendEntry`
  - Actions `fetchCostByAgent`, `fetchCostByModel`, `fetchCostTrend`
  - Estado `analyticsPeriod` com seletor de período

- **Analytics Page** (`apps/web/src/routes/analytics.tsx`)
  - Nova tab "Custos" com todos os charts
  - Seletor de período (7d/30d/90d/all)
  - Lazy loading dos componentes de chart

#### Changed

- i18n: 5 locales atualizados (`pt-BR`, `en-US`, `es`, `ja`, `zh-CN`) com `analytics.costsTab`

#### Arquivos Criados

- `apps/web/src/components/tasks/subtask-tree.tsx`
- `apps/web/src/components/tasks/create-subtask-dialog.tsx`
- `apps/web/src/components/analytics/cost-dashboard.tsx`
- `apps/web/src/components/analytics/cost-by-agent-chart.tsx`
- `apps/web/src/components/analytics/cost-by-model-chart.tsx`
- `apps/web/src/components/analytics/cost-trend-chart.tsx`
- `apps/web/src/components/analytics/token-breakdown-chart.tsx`

#### Arquivos Modificados

- `packages/shared/src/types/task.ts`
- `apps/orchestrator/src/routes/tasks.ts`
- `apps/orchestrator/src/routes/usage.ts`
- `apps/web/src/components/board/kanban-board.tsx`
- `apps/web/src/components/board/kanban-card.tsx`
- `apps/web/src/components/tasks/task-card.tsx`
- `apps/web/src/components/tasks/task-detail-drawer.tsx`
- `apps/web/src/routes/analytics.tsx`
- `apps/web/src/routes/project-tasks.tsx`
- `apps/web/src/stores/usage-store.ts`
- `apps/web/src/i18n/locales/pt-BR.json`
- `apps/web/src/i18n/locales/en-US.json`
- `apps/web/src/i18n/locales/es.json`
- `apps/web/src/i18n/locales/ja.json`
- `apps/web/src/i18n/locales/zh-CN.json`

---

## [0.17.1] - 2026-02-18

### Fase 17A: WhatsApp Auto-Reconnect + Single Number Whitelist

#### Added

- **WhatsApp Auto-Reconnect** (`apps/orchestrator/src/integrations/whatsapp-service.ts`)
  - `restoreWhatsAppSessions()` — ao iniciar o orchestrator, consulta DB por integrações com `status = "connected"` e reconecta automaticamente via tokens salvos pelo wppconnect (sem QR code)
  - Chamado fire-and-forget em `index.ts` após `httpServer.listen()`

- **Single Number Whitelist** (`apps/orchestrator/src/integrations/whatsapp-service.ts`)
  - Campo `allowedNumber` no `WhatsAppServiceConfig`
  - Filtro em `onMessage` — compara sender (sem `@c.us`) com número autorizado (stripped de não-dígitos)
  - Mensagens de números não autorizados são bloqueadas e logadas
  - `updateAllowedNumber()` para atualização em memória sem reconexão

- **Config Endpoint** (`apps/orchestrator/src/routes/integrations.ts`)
  - `PUT /api/integrations/whatsapp/config` — atualiza `allowedNumber` no DB e em memória
  - `POST /connect` agora aceita e persiste `allowedNumber` no campo `config` (JSON)
  - `GET /status` retorna `allowedNumber` do config

- **UI de Número Autorizado** (`apps/web/src/components/integrations/whatsapp-config.tsx`)
  - Input "Número autorizado" com ícone Shield
  - Botão "Salvar" com estado visual (changed/saved)
  - Número enviado no request de conexão
  - Texto explicativo: "Apenas este número poderá enviar mensagens para o sistema"

#### Changed

- `apps/orchestrator/src/index.ts` — import e chamada de `restoreWhatsAppSessions()` no startup
- `apps/orchestrator/src/routes/integrations.ts` — connect e status endpoints atualizados para `allowedNumber`

#### Security

- Whitelist de número único previne acesso não autorizado via WhatsApp
- Mensagens de números não autorizados são rejeitadas antes de qualquer processamento

#### Arquivos Modificados

- `apps/orchestrator/src/integrations/whatsapp-service.ts`
- `apps/orchestrator/src/routes/integrations.ts`
- `apps/orchestrator/src/index.ts`
- `apps/web/src/components/integrations/whatsapp-config.tsx`

---

## [0.17.0] - 2026-02-18

### Fase 17: OpenAI Responses API + i18n + Model Updates

#### Added

- **OpenAI Session** (`apps/orchestrator/src/agents/openai-session.ts`)
  - Agentic loop com OpenAI Responses API (máx 50 iterações)
  - 6 tools built-in: Read, Write, Edit, Glob, Grep, Bash
  - Suporte a API key direta e Codex OAuth (`~/.codex/auth.json`)
  - `OAUTH_MODEL_MAP` — traduz modelos padrão (gpt-4.1, o3, o4-mini) para família gpt-5.x-codex compatível com backend ChatGPT
  - Multi-turn sem `previous_response_id` para OAuth (rebuild completo da conversa a cada turno)
  - 3-tier credential resolution: env var → OAuth → DB integrations
  - Path validation e sandbox por projeto
  - Pricing table para cálculo de custo (input/output tokens)
  - Cancel via `AbortController`

- **Codex OAuth Service** (`apps/orchestrator/src/services/codex-oauth.ts`)
  - Leitura de `~/.codex/auth.json` com token refresh automático
  - Endpoint para status de autenticação OAuth

- **OpenAI Routes** (`apps/orchestrator/src/routes/openai.ts`)
  - `POST /api/openai/execute` — executa task com agente OpenAI
  - `GET /api/openai/status` — status de sessão ativa

- **Codex OAuth Routes** (`apps/orchestrator/src/routes/codex-oauth.ts`)
  - `GET /api/codex-oauth/status` — verifica se OAuth está configurado
  - `POST /api/codex-oauth/refresh` — força refresh do token

- **i18n** (`apps/web/src/i18n/`)
  - `react-i18next` configurado com 5 locales: pt-BR, en-US, es, zh-CN, ja
  - Todos os componentes e rotas migrados para usar `useTranslation()`
  - Locale files com 200+ chaves de tradução

- **Flow Tests** (`apps/orchestrator/test-openai-session.ts`)
  - 22 testes de fluxo cobrindo: imports, construção, credenciais, tools, pricing, abort, EventBus, API real

#### Changed

- **Model Lists** (`packages/shared/src/types/agent.ts`)
  - Adicionado `claude-sonnet-4-6` (Claude Sonnet 4.6) aos CLAUDE_MODELS
  - Adicionado `gpt-4.1-nano` (GPT-4.1 Nano) e `codex-mini` (Codex Mini) aos OPENAI_MODELS
  - MODEL_LABELS atualizados em `agent-card.tsx`, `agent-config-panel.tsx`, `agents.tsx`

- **UI Improvements**
  - `workflow-editor.tsx` — Editor de workflow expandido com melhor UX
  - `app-sidebar.tsx` — Sidebar com navegação atualizada
  - `header.tsx` — Header com melhorias visuais
  - `settings.tsx` — Página de configurações expandida com usage tracking
  - `dashboard.tsx` — Dashboard com dados atualizados
  - `tasks.tsx` — Rota de tasks com filtros e ordenação melhorados
  - `kanban-card.tsx` / `kanban-column.tsx` — Board com ajustes visuais
  - `active-agent-bar.tsx` — Barra de agentes ativos atualizada

- **Backend**
  - `agent-manager.ts` — Integração com OpenAI sessions
  - `agent-prompts.ts` — Prompts expandidos para novos roles
  - `event-bus.ts` / `socket-handler.ts` — Novos eventos para OpenAI sessions
  - `usage.ts` — Endpoint de usage expandido
  - `tasks.ts` — Rotas de tasks melhoradas

- `apps/web/src/stores/usage-store.ts` — Store para tracking de uso de tokens/custo
- `packages/shared/src/types/events.ts` — Novos event types para OpenAI sessions
- `packages/shared/src/constants/agents.ts` / `souls.ts` — Constantes atualizadas
- `packages/database/src/seed.ts` — Seed atualizado com novos modelos

#### Security

- Credenciais OAuth nunca logadas em plain text
- Path traversal protection em todas as operações de arquivo do OpenAI session
- Sandbox por projeto: tools só acessam arquivos dentro do diretório do projeto

#### Arquivos Criados

- `apps/orchestrator/src/agents/openai-session.ts`
- `apps/orchestrator/src/services/codex-oauth.ts`
- `apps/orchestrator/src/routes/openai.ts`
- `apps/orchestrator/src/routes/codex-oauth.ts`
- `apps/orchestrator/test-openai-session.ts`
- `apps/web/src/i18n/i18n.ts`
- `apps/web/src/i18n/locales/pt-BR.json`
- `apps/web/src/i18n/locales/en-US.json`
- `apps/web/src/i18n/locales/es.json`
- `apps/web/src/i18n/locales/zh-CN.json`
- `apps/web/src/i18n/locales/ja.json`

---

## [0.16.0] - 2026-02-17

### Fase 16: GitHub Repos + Docs + WhatsApp Ops + JWT Refresh

#### Added

- **GitHub Repos no Dashboard** (`apps/web/src/routes/dashboard.tsx`)
  - Listagem de repositórios GitHub do usuário autenticado
  - Import de repos como projetos com paginação e busca
  - OAuth scope expandido para acesso a repos privados

- **Knowledge Base** (`apps/web/src/routes/docs.tsx`, `apps/orchestrator/src/routes/docs.ts`)
  - Página `/docs` com editor Monaco markdown + preview side-by-side
  - CRUD de documentos via API REST
  - Schema `docs` adicionado ao database

- **WhatsApp Receptionist** (`apps/orchestrator/src/integrations/whatsapp-ops.ts`)
  - Serviço de recepcionista com operações em linguagem natural
  - 522 linhas de lógica de operações WhatsApp
  - Integração com `receptionist-service.ts` para processamento de mensagens

- **Task Detail Drawer** (`apps/web/src/components/tasks/task-detail-drawer.tsx`)
  - Drawer lateral com detalhes completos da task
  - Histórico de atividades, arquivos modificados, resultado

- **Agent Avatars** — Avatares visuais para agentes com cores customizadas

- **JWT Silent Refresh** (`apps/web/src/stores/auth-store.ts`, `apps/orchestrator/src/routes/auth.ts`)
  - Tokens short-lived (30min) com refresh silencioso automático
  - Protected route atualizado com retry de autenticação

#### Changed

- `apps/orchestrator/src/agents/agent-manager.ts` — Expansão significativa (+320 linhas) com melhorias de gerenciamento
- `apps/orchestrator/src/agents/agent-prompts.ts` — Prompts expandidos para novos cenários
- `apps/orchestrator/src/routes/tasks.ts` — Filtros avançados, ordenação e operações bulk
- `apps/orchestrator/src/routes/usage.ts` — Endpoints de uso expandidos
- `apps/orchestrator/src/routes/dashboard.ts` — Stats com repos GitHub
- `apps/orchestrator/src/lib/encryption.ts` — Persistência de encryption key em dev mode
- `apps/web/src/routes/tasks.tsx` — UI de tasks expandida com filtros e ordenação
- `apps/web/src/components/board/kanban-card.tsx` — Cards do board redesenhados
- `apps/web/src/components/tasks/task-changes-dialog.tsx` — Dialog de mudanças expandido
- `apps/web/src/lib/markdown.tsx` — Renderer markdown melhorado
- `packages/database/src/seed.ts` — Seed com novos agentes e dados
- `packages/shared/src/constants/agents.ts` / `souls.ts` — Novas constantes
- `packages/shared/src/types/agent.ts` — Tipo AgentAvatar adicionado
- `packages/shared/src/types/docs.ts` — Tipos para knowledge base
- `packages/shared/src/types/project.ts` — Tipos expandidos para GitHub repos

#### Arquivos Criados

- `apps/orchestrator/src/agents/receptionist-service.ts`
- `apps/orchestrator/src/integrations/whatsapp-ops.ts`
- `apps/orchestrator/src/routes/docs.ts`
- `apps/web/src/routes/docs.tsx`
- `apps/web/src/components/tasks/task-detail-drawer.tsx`
- `packages/database/src/schema/docs.ts`
- `packages/shared/src/types/docs.ts`

---

## [0.15.0] - 2026-02-16

### Fase 15: GitHub OAuth + Landing Page + Login

#### Added

- **Users Table** (`packages/database/src/schema/users.ts`)
  - Tabela `users` com campos: id, githubId, login, name, email, avatarUrl, accessToken (encrypted)
  - Index em `github_id` para lookup rápido
  - Migration adicionada em `migrate.ts`

- **Auth Service** (`apps/orchestrator/src/services/auth-service.ts`)
  - `getGitHubAuthUrl()` — gera URL de autorização GitHub OAuth
  - `exchangeCodeForToken(code)` — troca code por access_token via GitHub API
  - `fetchGitHubUser(accessToken)` — busca perfil do usuário no GitHub
  - `upsertUser(ghUser, accessToken)` — cria ou atualiza usuário no SQLite com token encrypted (AES-256-GCM)
  - `signJWT(payload)` / `verifyJWT(token)` — JWT com expiração de 7 dias

- **Auth Middleware** (`apps/orchestrator/src/middleware/auth.ts`)
  - Valida JWT do cookie httpOnly `agenthub_token` em todas as rotas `/api/*`
  - Retorna 401 se ausente ou inválido
  - Extende `Express.Request` com `user?: JWTPayload`

- **Auth Routes** (`apps/orchestrator/src/routes/auth.ts`)
  - `GET /api/auth/github` — redireciona para GitHub OAuth
  - `GET /api/auth/github/callback` — callback OAuth, upsert user, set cookie JWT, redirect `/dashboard`
  - `POST /api/auth/logout` — limpa cookie
  - `GET /api/auth/me` — retorna perfil do usuário autenticado

- **Socket.io Auth** — middleware de handshake que valida JWT do cookie antes de permitir conexão WebSocket

- **Landing Page** (`apps/web/src/routes/landing.tsx`)
  - Página pública em `/` com hero, badge "Powered by Claude Agent SDK"
  - Grid de 6 features (Agentes Autônomos, Git Integration, Code Review, Real-time, Analytics, Code Editor)
  - Seção CTA com botão "Começar gratuitamente"
  - Footer com copyright
  - Glows e gradientes usando design tokens existentes

- **Login Page** (`apps/web/src/routes/login.tsx`)
  - Página pública em `/login` com botão "Entrar com GitHub"
  - Tratamento de erros via query params (`missing_code`, `auth_failed`)
  - Auto-redirect para `/dashboard` se já autenticado
  - Link "Voltar ao início" para landing page

- **Auth Store** (`apps/web/src/stores/auth-store.ts`)
  - Zustand store com `fetchUser()` (GET /api/auth/me) e `logout()` (POST /api/auth/logout + redirect)

- **ProtectedRoute** (`apps/web/src/components/auth/protected-route.tsx`)
  - Route guard: chama `fetchUser()`, mostra spinner enquanto verifica, redireciona para `/login` se não autenticado

- **`.env.example`** (`apps/orchestrator/.env.example`)
  - Template com variáveis: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL, JWT_SECRET

#### Changed

- `apps/web/src/App.tsx` — Rotas reorganizadas: `/` (landing, pública), `/login` (pública), demais rotas protegidas por `<ProtectedRoute>`, dashboard movido para `/dashboard`
- `apps/web/src/components/layout/header.tsx` — Botão "Sair" usa `useAuthStore.getState().logout()`, exibe nome/avatar do GitHub, `isDashboard` check atualizado para `/dashboard`
- `apps/web/src/components/layout/app-sidebar.tsx` — Link Dashboard atualizado de `/` para `/dashboard`
- `apps/orchestrator/src/index.ts` — cookie-parser middleware, auth routes públicas em `/api/auth`, auth middleware em `/api/*`, Socket.io auth handshake
- `apps/orchestrator/package.json` — Dependências: `jsonwebtoken`, `cookie-parser`; dev script com `--env-file=.env`
- Docs movidos para `docs/` (DEPLOYMENT.md, DEVELOPMENT_PLAN.md, SETUP.md)

#### Security

- JWT armazenado em cookie httpOnly (não acessível via JavaScript)
- Access token do GitHub encrypted com AES-256-GCM antes de salvar no banco
- Cookie `sameSite: "lax"` e `secure: true` em produção
- Todas as rotas API protegidas por auth middleware (exceto `/api/auth/*`)
- WebSocket protegido por validação de JWT no handshake

---

## [0.14.0] - 2026-02-16

### Fase 14: Dev Server Preview

#### Added

- **Dev Server Process Manager** (`apps/orchestrator/src/processes/dev-server-manager.ts`)
  - Singleton `DevServerManager` gerencia processos dev server por projeto (`Map<projectId, entry>`)
  - `start(projectId, projectPath)` — detecta script (`dev`/`start` em package.json), spawna com `spawn()`
  - `stop(projectId)` — SIGTERM → timeout 5s → SIGKILL
  - `getStatus(projectId)` — retorna status, porta e últimas 500 linhas de log
  - `stopAll()` — cleanup de todos os processos (chamado no graceful shutdown)
  - Detecção automática de package manager (pnpm/yarn/bun/npm) via lockfile
  - Detecção de porta: flags `--port`/`-p`, `.env`/`.env.local`, defaults por framework (Vite=5173, Next=3000, etc.)
  - Detecção de porta via stdout com regex em `http://localhost:PORT`
  - `stripAnsi()` — remove ANSI escape codes antes do regex match (fix para Vite/Next que emitem cores no output)
  - Buffer circular de logs (max 500 linhas) por processo
  - Emissão de eventos via EventBus: `devserver:output` (cada linha) e `devserver:status` (mudanças de estado)

- **Dev Server REST API** (`apps/orchestrator/src/routes/dev-server.ts`)
  - `POST /api/projects/:id/dev-server/start` — inicia dev server do projeto
  - `POST /api/projects/:id/dev-server/stop` — para dev server
  - `GET /api/projects/:id/dev-server/status` — retorna status, porta e logs

- **Shared Event Types** (`packages/shared/src/types/events.ts`)
  - `DevServerOutputEvent` — `{ projectId, line, stream: "stdout"|"stderr", timestamp }`
  - `DevServerStatusEvent` — `{ projectId, status: "stopped"|"starting"|"running"|"error", port?, error? }`
  - Eventos adicionados a `ServerToClientEvents`

- **EventBus + Socket Bridge**
  - `devserver:output` e `devserver:status` adicionados ao `EventMap` (`event-bus.ts`)
  - Bridge EventBus → Socket.io com scoping por project room (`socket-handler.ts`)

- **Frontend Preview Route** (`apps/web/src/routes/project-preview.tsx`)
  - Layout split: CommandBar (controles) + iframe (app rodando) + terminal (logs)
  - Estados: idle (botão centralizado), starting (spinner + terminal), running (iframe + terminal), error
  - Controles: Start/Stop, refresh iframe, abrir em nova aba, botão voltar ao projeto
  - iframe com `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"`
  - Terminal com scroll automático, linhas coloridas (stdout=branco, stderr=vermelho)
  - Socket.io real-time: `onDevServerOutput` e `onDevServerStatus` handlers
  - Fetch de status inicial no mount (persiste estado se servidor já rodando)

- **Socket Hook** (`apps/web/src/hooks/use-socket.ts`)
  - `onDevServerOutput` e `onDevServerStatus` adicionados a `SocketHandlers`
  - Listeners registrados e cleanup no unmount

- **Navegação e Integração**
  - Rota `/project/:id/preview` adicionada em `App.tsx`
  - `preview: "Preview"` adicionado a `ROUTE_LABELS` em `header.tsx`
  - Botão "Ver Projeto" na CommandBar do `project-overview.tsx` (gradiente brand→purple)

#### Changed

- `apps/orchestrator/src/index.ts` — Router `devServerRouter` montado + `devServerManager.stopAll()` no graceful shutdown
- `apps/web/src/routes/settings.tsx` — Versão atualizada para 0.14.0, link do GitHub funcional com `<a>` para `https://github.com/JohnPitter/agenthub`

#### Arquivos Criados

- `apps/orchestrator/src/processes/dev-server-manager.ts`
- `apps/orchestrator/src/routes/dev-server.ts`
- `apps/web/src/routes/project-preview.tsx`

#### Arquivos Modificados

- `packages/shared/src/types/events.ts`
- `apps/orchestrator/src/realtime/event-bus.ts`
- `apps/orchestrator/src/realtime/socket-handler.ts`
- `apps/orchestrator/src/index.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/components/layout/header.tsx`
- `apps/web/src/hooks/use-socket.ts`
- `apps/web/src/routes/project-overview.tsx`
- `apps/web/src/routes/settings.tsx`

## [0.13.0] - 2026-02-14

### Fase 13: Testing & Deployment

#### Added

- **Testing Infrastructure**
  - Vitest 4 configurado com workspace (orchestrator + web)
  - In-memory SQLite para isolamento total entre testes
  - `@testing-library/react` + jsdom para testes frontend
  - `supertest` para testes de integração de API
  - Test helpers: `createTestDb()`, `createTestProject()`, `createTestAgent()`, `createTestTask()`
  - 52 testes passando (35 backend + 17 frontend)

- **Backend Integration Tests** (`apps/orchestrator/src/__tests__/`)
  - `health.test.ts` — Health check endpoint
  - `projects.test.ts` — CRUD completo de projetos (9 testes)
  - `agents.test.ts` — CRUD de agentes + proteção de default agents (11 testes)
  - `tasks.test.ts` — CRUD + filtros por projeto/status + completedAt automático (14 testes)

- **Frontend Tests** (`apps/web/src/__tests__/`)
  - `utils.test.ts` — cn(), formatDate(), formatRelativeTime() (11 testes)
  - `use-pull-requests.test.ts` — Hook de PRs com URL-based fetch mocking (6 testes)

- **Docker Containers**
  - `apps/orchestrator/Dockerfile` — Multi-stage build (deps → build → runtime com node:20-alpine)
  - `apps/web/Dockerfile` — Multi-stage build (deps → build → nginx:alpine serve)
  - `apps/web/nginx.conf` — SPA fallback, proxy API/Socket.io, cache headers, security headers
  - `docker-compose.yml` — Produção: web (port 80) + orchestrator (port 3001) + SQLite volume
  - `docker-compose.dev.yml` — Desenvolvimento: hot-reload com volumes montados
  - `.dockerignore` — Exclude node_modules, dist, .git, tests

- **CI/CD Pipeline** (`.github/workflows/`)
  - `ci.yml` — Lint + typecheck + test (Node 20 & 22 matrix) + build em cada PR/push
  - `docker.yml` — Build e push de Docker images via GitHub Container Registry em releases
  - `dependabot.yml` — Auto-updates semanais para npm e GitHub Actions

- **Production Deployment**
  - `DEPLOYMENT.md` — Guia completo: Docker Compose, manual, variáveis de ambiente, backup, troubleshooting
  - `scripts/deploy.sh` — Script helper: up/down/restart/logs/build commands

#### Changed

- `package.json` — Adicionado scripts `test`, `test:watch`, `test:coverage`
- `turbo.json` — Adicionado task `test`

## [0.12.0] - 2026-02-14

### Fase 12: PR Management

#### Added

- **GitHub Service** (`apps/orchestrator/src/git/github-service.ts`)
  - Full `gh` CLI integration via `execFileNoThrow` (no shell injection risk)
  - `isGhAvailable()` / `isAuthenticated()` — environment checks
  - `getRepoSlug()` — detect GitHub remote from project path
  - `listPRs()` — list PRs with state/limit filters
  - `getPR()` — single PR detail with full metadata
  - `createPR()` — create PRs with title, body, head/base branch, draft flag
  - `mergePR()` — merge/squash/rebase strategies
  - `closePR()` — close without merging
  - `getPRReviews()` — fetch review approvals/change requests
  - `getPRChecks()` — CI/CD check status aggregation (pass/fail/pending)
  - `findPRForBranch()` — find existing PR for a branch (dedup check)
  - State normalization: `gh` returns `OPEN`/`CLOSED`/`MERGED` → lowercased to `open`/`closed`/`merged`

- **PR REST API** (`apps/orchestrator/src/routes/pull-requests.ts`)
  - `GET /api/projects/:id/prs/status` — GitHub integration availability check
  - `GET /api/projects/:id/prs` — list PRs with state/limit query params
  - `GET /api/projects/:id/prs/:number` — PR detail with reviews + checks
  - `POST /api/projects/:id/prs` — create PR, optionally links to taskId via taskLogs
  - `POST /api/projects/:id/prs/:number/merge` — merge with method selection
  - `POST /api/projects/:id/prs/:number/close` — close PR
  - `GET /api/projects/:id/prs/branch/:branch` — find PR by branch name

- **Shared Event Types** (`packages/shared/src/types/events.ts`)
  - `TaskPRCreatedEvent` — emitted when a PR is created (taskId, prNumber, prUrl, prTitle, headBranch, baseBranch)
  - `TaskPRMergedEvent` — emitted when a PR is merged (taskId, prNumber, method)
  - `user:push_task` added to `ClientToServerEvents`
  - Events added to `ServerToClientEvents` for socket bridging

- **EventBus PR Events** (`apps/orchestrator/src/realtime/event-bus.ts`)
  - `task:pr_created` and `task:pr_merged` added to `EventMap`

- **Socket Bridge** (`apps/orchestrator/src/realtime/socket-handler.ts`)
  - `task:pr_created` and `task:pr_merged` forwarded to project rooms via Socket.io
  - `tryAutoPR()` — auto-creates PR after successful push when `autoPR` config enabled
    - Dedup check via `findPRForBranch` to avoid duplicate PRs
    - Logs PR creation in `taskLogs`
    - Integrated into both auto-push (commit_task) and manual push (push_task) flows

- **Frontend PR Hook** (`apps/web/src/hooks/use-pull-requests.ts`)
  - `usePullRequests(projectId)` — full PR management hook
  - Returns: `prs`, `loading`, `ghStatus`, `filter`, `setFilter`, `createPR`, `mergePR`, `closePR`, `getPRDetail`, `refresh`
  - Typed interfaces: `PullRequest`, `PRCheck`, `PRReview`, `GitHubStatus`

- **Frontend PR Page** (`apps/web/src/routes/project-prs.tsx`)
  - Full PR management UI with design system compliance
  - `PRStateIcon` / `PRStateBadge` — state visualization (green open, purple merged, red closed)
  - `CreatePRDialog` — form with head/base branch, title, body, draft toggle
  - `PRCard` — PR info card with merge/close action buttons, external link
  - Filter tabs (open/closed/merged/all) with counters
  - Empty states for: gh CLI not available, not authenticated, no GitHub remote, no PRs
  - Real-time updates via `useSocket` — auto-refreshes on `task:pr_created` / `task:pr_merged`

- **Navigation Integration**
  - Route added: `/project/:id/prs` in `App.tsx`
  - Breadcrumb: "Pull Requests" added to `ROUTE_LABELS` in `header.tsx`
  - Navigation card added to `project-overview.tsx` with GitPullRequest icon

- **Socket Hook PR Events** (`apps/web/src/hooks/use-socket.ts`)
  - `onTaskPRCreated` and `onTaskPRMerged` handlers added to `SocketHandlers`
  - Full listener registration and cleanup for PR events

- **Auto-PR Config** (`apps/web/src/routes/project-settings.tsx`)
  - New toggle: "Auto-PR após push" in Git configuration section
  - `autoPR` field added to `GitConfig` interface in `use-git-status.ts`

## [0.11.0] - 2026-02-14

### Fase 11: Agent Performance Dashboard

#### Added

- **Analytics API** — Backend endpoints for agent performance metrics
  - `GET /api/analytics/agents` — Calculate metrics for each agent
    - Task counts (total, completed, failed, in-progress)
    - Success rate calculation
    - Average completion time (from creation to completion)
    - Task distribution by status (pending, assigned, in_progress, review, done, failed)
    - Period filtering (7d, 30d, all time)
    - Optional project filtering
  - `GET /api/analytics/trends` — Time-series data for trend visualization
    - Daily aggregation of completed/failed/total tasks
    - Date range initialization for consistent visualization
    - Period filtering support
    - Gap filling for dates with no activity
  - `apps/orchestrator/src/routes/analytics.ts` — Full analytics router implementation
  - Mounted in `apps/orchestrator/src/index.ts`

- **Recharts Integration** — Professional data visualization
  - Installed `recharts@^3.7.0` dependency
  - Area charts for trend visualization
  - Line chart support as alternative
  - Custom tooltips with formatted data
  - Responsive container for adaptive sizing
  - CartesianGrid, XAxis, YAxis with styling

- **Analytics UI Components**
  - `apps/web/src/components/analytics/agent-metrics-card.tsx` — Agent performance card
    - Rank badge with color coding (gold #1, silver #2, bronze #3)
    - Agent name and avatar icon
    - Large success rate display with trend icon
    - Dynamic color based on performance (green ≥80%, orange ≥50%, red <50%)
    - Stats grid (total tasks, avg completion time)
    - Status distribution bar with proportional segments
    - Hover tooltips for detailed counts
  - `apps/web/src/components/analytics/performance-chart.tsx` — Trend chart component
    - Line and area chart type support
    - Date formatting for display (Mon DD)
    - Custom tooltip with breakdown (completed, failed, total)
    - Legend with color coding
    - Responsive height (300px)
    - Stroke and fill customization per series

- **Analytics Page** — Comprehensive dashboard
  - `apps/web/src/routes/analytics.tsx` — Main analytics route
    - Period selector toggle (Last 7 days, Last 30 days, All time)
    - Summary stats cards (4 metrics):
      - Total tasks count
      - Completed tasks (green)
      - Failed tasks (red)
      - Overall success rate (purple)
    - Performance trends chart (area chart)
    - Agent performance grid (2 columns)
    - Agent ranking by success rate
    - Loading state with spinner
    - Empty state message
    - Real-time data fetching on period change
  - Added route to `apps/web/src/App.tsx` at `/analytics`
  - BarChart3 icon for analytics sections

#### Technical Details

- **Metrics Calculation**:
  - Success rate: `(completedTasks / totalTasks) * 100`
  - Average completion time: `sum(completedAt - createdAt) / doneTasks.length`
  - Converted to hours with 2 decimal precision

- **Period Filtering**:
  - 7d: Tasks from last 7 days
  - 30d: Tasks from last 30 days
  - all: All tasks in database

- **Trend Aggregation**:
  - Group tasks by date (YYYY-MM-DD)
  - Initialize all dates in range to 0
  - Count completed/failed/total per day
  - Return sorted chronological array

- **UI Patterns**:
  - Card-based layout with consistent spacing
  - Color-coded metrics (green=success, red=failure, purple=rate)
  - Responsive grid layout
  - Typography hierarchy (24px stats, 14px headers, 11px labels)

#### Files Changed

- **Created**:
  - `apps/orchestrator/src/routes/analytics.ts`
  - `apps/web/src/components/analytics/agent-metrics-card.tsx`
  - `apps/web/src/components/analytics/performance-chart.tsx`
  - `apps/web/src/routes/analytics.tsx`

- **Modified**:
  - `apps/orchestrator/src/index.ts` — Mounted analytics router
  - `apps/web/src/App.tsx` — Added `/analytics` route
  - `apps/web/package.json` — Added recharts dependency

## [0.10.0] - 2026-02-14

### Fase 10: Diff Viewer & Version Comparison

#### Added

- **Monaco Diff Editor Integration** — Side-by-side code comparison
  - `apps/web/src/components/files/diff-viewer.tsx` — Monaco Diff Editor component with:
    - Side-by-side diff view (split panes)
    - Advanced diff algorithm for accurate change detection
    - Syntax highlighting in both panes
    - Scrollable diff with minimap
    - Configurable render options
  - `apps/web/src/components/files/version-selector.tsx` — Git commit selector dropdown with:
    - Working tree option (current unsaved changes)
    - Last 20 commits for the file
    - Commit metadata (SHA, message, author, timestamp)
    - Search and selection UI
    - Real-time relative timestamps
- **File History API**
  - `GET /api/projects/:id/files/history` — Get commit history for a specific file
  - `GET /api/projects/:id/files/at-commit` — Fetch file content at a specific commit SHA
  - Path traversal protection for both endpoints
  - Git repository detection and validation
- **GitService Extensions**
  - `getFileAtCommit()` — Retrieve file content from git history
  - `getFileHistory()` — Get commit history for a file (configurable limit)
  - `getWorkingTreeDiff()` — Compare working tree against HEAD
  - `getDiffBetweenCommits()` — Compare file between two commits
- **Three-Mode File Viewer**
  - View mode (read-only Monaco Editor)
  - Edit mode (editable Monaco Editor with Save/Cancel)
  - **Diff mode** (Monaco Diff Editor with version selectors)
  - Mode toggle buttons (Eye/Edit3/GitCompare icons)
  - Persistent state management across mode switches

#### Changed

- `apps/orchestrator/src/git/git-service.ts` — Added 4 new methods for file history and diff operations
- `apps/orchestrator/src/routes/files.ts` — Added GitService import, 2 new endpoints for history and at-commit
- `apps/web/src/components/files/file-viewer.tsx` — Complete rewrite with:
  - ViewMode type ("view" | "edit" | "diff")
  - Diff state management (originalVersion, modifiedVersion, content loading)
  - Version selectors in header when in diff mode
  - Conditional rendering based on mode
  - Integrated DiffViewer and VersionSelector components
- Bundle size: ~4.40 MB (~1.16 MB gzipped) — slight increase for diff functionality

#### Security

- Path traversal protection on all file history/content endpoints
- Git repository existence validation before operations
- Commit SHA validation (prevents arbitrary command execution)

#### Technical Details

- Monaco Diff Editor uses advanced diff algorithm for accurate line-by-line comparison
- File history limited to 20 commits by default (configurable via query param)
- Working tree comparison allows viewing uncommitted changes
- Version selectors show relative timestamps (e.g., "2 hours ago")
- Diff view supports full syntax highlighting in both panes

---

## [0.9.0] - 2026-02-14

### Fase 9: Code Editor & Syntax Highlighting

#### Added

- **Monaco Editor Integration** — Full VS Code editor experience in the browser
  - `@monaco-editor/react` and `monaco-editor` packages for code editing
  - `apps/web/src/components/files/code-editor.tsx` — Monaco-based code editor component with:
    - Syntax highlighting for 80+ languages (TypeScript, JavaScript, Python, Go, Rust, Java, etc.)
    - Dark theme (vs-dark) optimized for readability
    - Keyboard shortcuts (Ctrl+S / Cmd+S to save)
    - Minimap, line numbers, bracket pair colorization
    - Configurable read-only mode
    - Auto-layout and smooth scrolling
  - `getLanguageFromFilename()` utility — Auto-detects language from file extension
- **File Editing Capabilities**
  - `PUT /api/projects/:id/files/content` endpoint for saving edited files
  - Edit mode toggle in file viewer with Edit/Save/Cancel buttons
  - Real-time change detection (Save button disabled when no changes)
  - Auto-save on Ctrl+S keyboard shortcut
  - Toast notifications for save success/failure
- **Enhanced File Viewer**
  - Replaced basic `<pre><code>` with Monaco Editor
  - Edit button to enable editing mode
  - Save/Cancel buttons with loading states
  - Visual indicators for unsaved changes
  - File metadata display (size, modified date)

#### Changed

- `apps/orchestrator/src/routes/files.ts` — Added `writeFile` import and PUT endpoint for saving file contents with path traversal protection
- `apps/web/src/components/files/file-viewer.tsx` — Complete rewrite to integrate Monaco Editor with edit mode, state management for editing/saving
- Bundle size increase to ~4.4 MB (~1.16 MB gzipped) due to Monaco Editor and language workers (TypeScript, HTML, CSS, JSON workers included)

#### Security

- Path traversal protection on file save (validates paths stay within project directory)
- Content validation (ensures content is a string before writing)
- Audit logging for file saves via logger

#### Technical Details

- Monaco Editor loads language workers on-demand for optimal performance
- Workers included: `json.worker.js`, `html.worker.js`, `css.worker.js`, `ts.worker.js`
- Supports 80+ programming languages with proper syntax highlighting
- Editor uses browser's native rendering for smooth scrolling and performance

---

## [0.8.0] - 2026-02-14

### Fase 8: File Browser & Code Viewer

#### Added

- `apps/orchestrator/src/routes/files.ts` — File browser API with two endpoints:
  - `GET /api/projects/:id/files` — Returns recursive file tree (max depth 5, auto-ignores node_modules/.git/dist/build)
  - `GET /api/projects/:id/files/content?path=<path>` — Returns file contents with security check against path traversal
- `apps/web/src/components/files/file-tree.tsx` — Collapsible tree component with Folder/FolderOpen/File icons, file size display
- `apps/web/src/components/files/file-viewer.tsx` — File content viewer with syntax highlighting, file metadata (size, modified date)
- `apps/web/src/routes/project-files.tsx` — Complete file browser page with sidebar tree (320px) + viewer (flex)
- Project route `/project/:id/files` for browsing project files

#### Changed

- `apps/orchestrator/src/index.ts` — Mounted filesRouter at `/api`
- `apps/web/src/App.tsx` — Added ProjectFiles route
- `apps/web/src/components/layout/header.tsx` — Added "Arquivos" to ROUTE_LABELS

#### Security

- Path traversal protection: validates file paths stay within project directory
- File tree automatically filters out sensitive directories (.git, node_modules, .env files)

---

## [0.7.0] - 2026-02-14

### Fase 7: Git Remote Push & Sync

#### Fase 7A: Credential Management & Remote Config

##### Added

- `apps/orchestrator/src/lib/encryption.ts` — AES-256-GCM encryption/decryption utilities for secure credential storage
- Encrypted credential storage in `integrations` table with new `credentials` field (TEXT, encrypted)
- SSH key and HTTPS token authentication support for git remote operations
- Remote configuration endpoints: `PUT /api/projects/:id/git/credentials`, `POST /api/projects/:id/git/remote/add`, `GET /api/projects/:id/git/remote/branches`
- 10+ new GitService methods: `addRemote`, `setRemoteUrl`, `fetch`, `getRemoteBranches`, `getAheadBehind`, `pull`, `hasUncommittedChanges`, `stash`, `stashPop`, `getConflictedFiles`

##### Changed

- `packages/database/src/schema/integrations.ts` — Added `credentials` field for encrypted storage
- `apps/orchestrator/src/git/git-service.ts` — Modified `push()` method to accept optional credentials (SSH/HTTPS), handles credential injection and cleanup
- `apps/orchestrator/src/routes/git.ts` — Added credential and remote management endpoints

##### Security

- AES-256-GCM encryption with random IV per encryption
- ENCRYPTION_KEY environment variable required in production
- Credentials never logged in plain text
- Temporary token injection in URLs with automatic cleanup

#### Fase 7B: Push Operations

##### Added

- Auto-push after commit feature (configurable via `pushOnCommit` flag in git config)
- Manual push button in task cards for committed tasks
- `task:git_push` and `task:git_push_error` events for real-time push notifications
- Socket handler `user:push_task` for manual push operations

##### Changed

- `apps/orchestrator/src/realtime/socket-handler.ts` — Added auto-push logic to `user:commit_task` handler, added new `user:push_task` handler with error handling
- `apps/orchestrator/src/realtime/event-bus.ts` — Added `task:git_push` and `task:git_push_error` to EventMap
- `packages/shared/src/types/events.ts` — Added `TaskGitPushEvent` and `TaskGitPushErrorEvent` interfaces
- `apps/web/src/components/board/activity-item.tsx` — Added `Upload` icon (blue) for `git_push` action in activity feed

#### Fase 7C: Pull/Fetch & Sync

##### Added

- Sync with remote endpoint: `POST /api/projects/:id/git/sync`
- Auto-stash of uncommitted changes before pull
- Conflict detection and reporting
- Auto-restore stashed changes after successful pull

##### Changed

- `apps/orchestrator/src/git/git-service.ts` — All pull/merge methods already implemented in Phase 7A
- `apps/orchestrator/src/routes/git.ts` — Added `/git/sync` endpoint with full stash/fetch/pull/conflict workflow

#### Fase 7D: Remote Status UI & Polish

##### Added

- Remote status display in project settings with remote URL, ahead/behind indicators, "Up to date" badge
- Sync button with loading state (spinning RefreshCw icon)
- `apps/web/src/hooks/use-git-status.ts` — Added `GitRemoteStatus` interface and `remoteStatus` state

##### Changed

- `apps/orchestrator/src/routes/git.ts` — Modified `GET /api/projects/:id/git/status` to include `remoteStatus` (remoteUrl, ahead, behind, remoteBranches)
- `apps/web/src/routes/project-settings.tsx` — Added remote status section with:
  - Remote URL display
  - Ahead/behind indicators (↑/↓ arrows)
  - CheckCircle2 "Up to date" badge when synced
  - Sync button with loading state and toast notifications
- `apps/web/src/hooks/use-git-status.ts` — Hook now returns `remoteStatus` from API

---

## [0.6.0] - 2026-02-14

### Fase 6: Git Integration

#### Fase 6A: Git Detection & Repository Setup

##### Added

- `apps/orchestrator/src/lib/exec-file.ts` — Secure wrapper for executing git commands using `execFile` to prevent command injection
- `apps/orchestrator/src/git/git-service.ts` — Core Git service with 13 methods: detectGitRepo, initGitRepo, getGitStatus, getCurrentBranch, getRemoteUrl, getLastCommit, createBranch, checkoutBranch, branchExists, stageAll, commit, push, getDiff, getChangedFiles
- `apps/orchestrator/src/routes/git.ts` — REST endpoints for git status, init, and config (GET/PUT `/api/projects/:id/git/status`, `/git/init`, `/git/config`)
- `apps/web/src/hooks/use-git-status.ts` — React hook for fetching git status, last commit, and repo initialization
- Git configuration stored in `integrations` table with type "git" (remoteUrl, defaultBranch, autoCommit, autoCreateBranch flags)

##### Changed

- `apps/orchestrator/src/index.ts` — Mounted gitRouter at `/api`
- `packages/database/src/schema/integrations.ts` — Added "git" to type enum, unique constraint on (projectId, type)
- `apps/web/src/routes/project-settings.tsx` — Replaced git placeholder with full UI: git status card (branch, ahead/behind, last commit, uncommitted changes), git config form (remote URL, default branch, auto-commit/auto-branch toggles)

#### Fase 6B: Branch Management for Tasks

##### Added

- Auto-branch creation on task assignment with format `task/{id}-{slugified-title}`
- `apps/orchestrator/src/lib/utils.ts` — `slugify()` function for URL-safe branch names (max 50 chars)
- `packages/shared/src/types/events.ts` — `TaskGitBranchEvent` interface (taskId, projectId, branchName, baseBranch)
- `task:git_branch` event emitted when branch is created

##### Changed

- `apps/orchestrator/src/agents/agent-manager.ts` — Added auto-branch creation logic in `assignTask()` when `autoCreateBranch` config is enabled
- `apps/orchestrator/src/realtime/event-bus.ts` — Added `task:git_branch` to EventMap
- `apps/orchestrator/src/realtime/socket-handler.ts` — Bridge `task:git_branch` event to project rooms
- `apps/web/src/components/tasks/task-card.tsx` — Purple branch badge (GitBranch icon) when `task.branch` exists
- `apps/web/src/routes/project-tasks.tsx` — Socket listener for `onTaskGitBranch` updates task state

#### Fase 6C: Commit Tracking & Auto-Commit

##### Added

- `apps/web/src/components/tasks/task-commit-dialog.tsx` — Modal dialog for manual commit with editable message and changed files list
- `packages/shared/src/types/events.ts` — `TaskGitCommitEvent` (taskId, projectId, commitSha, commitMessage, branchName) and `TaskReadyToCommitEvent` (taskId, projectId, changedFiles)
- `task:git_commit` and `task:ready_to_commit` events
- Auto-commit on task approval when `autoCommit` config is enabled (format: `feat(task-{id}): {title}`)
- Manual commit flow with `user:commit_task` socket event

##### Changed

- `apps/orchestrator/src/realtime/socket-handler.ts` — Added auto-commit logic to `user:approve_task` handler, added `user:commit_task` handler for manual commits
- `apps/orchestrator/src/realtime/event-bus.ts` — Added `task:git_commit` and `task:ready_to_commit` to EventMap
- `apps/web/src/hooks/use-socket.ts` — Added `commitTask(taskId, message)` method
- `apps/web/src/components/tasks/task-card.tsx` — Green commit badge (CheckCircle2 icon) when `task.result` contains "Committed as {sha}"
- `apps/web/src/routes/project-tasks.tsx` — Socket listeners for `onTaskGitCommit` and `onTaskReadyToCommit`, state management for ready-to-commit tasks
- `packages/database/src/schema/task-logs.ts` — Added `git_commit` and `git_branch_created` actions to task logs

#### Fase 6D: Git UI & Activity Log

##### Added

- Git icons in activity feed: `GitBranch` (purple) for `git_branch_created`, `GitCommit` (green) for `git_commit`
- Real-time git events in Live Board activity feed

##### Changed

- `apps/web/src/routes/project-board.tsx` — Added `onTaskGitBranch` and `onTaskGitCommit` handlers to populate activity feed with git operations
- `apps/web/src/components/board/activity-item.tsx` — Added `GitBranch` and `GitCommit` icons to `ACTION_ICONS`, added `ACTION_COLORS` mapping for git actions (purple/green)

---

## [0.5.0] - 2026-02-14

### Fase 5A: ActiveAgentBar + Live Board Enhancement

#### Added

- Real-time progress tracking (0-100%) based on tool call count in `agent-session.ts`
- `progress` field in `AgentStatusEvent` and `AgentActivityInfo` interfaces
- `board:agent_cursor` event for tracking current file being edited by agents
- Task context display in agent status cards (task title, status, progress)
- Review actions (Approve/Reject) in agent status cards for tasks in review

#### Changed

- `apps/web/src/components/layout/active-agent-bar.tsx` — Progress bar now dynamic (`style={{ width: \`${progress}%\` }}`), Stop button cancels task
- `apps/web/src/components/board/agent-status-card.tsx` — Added task prop, mini progress bar for running tasks, inline approve/reject buttons for review
- `apps/web/src/routes/project-board.tsx` — Wired task lookup and review handlers to agent cards
- `apps/orchestrator/src/agents/agent-session.ts` — Emits progress updates with each tool call, caps at 95% until completion
- `apps/web/src/hooks/use-socket.ts` — Added listeners for `task:queued`, `board:agent_cursor`, `agent:notification`
- `packages/shared/src/types/events.ts` — Added `BoardAgentCursorEvent` and `AgentNotificationEvent`

### Fase 5B: Sistema de Notificações + Chat System Messages

#### Added

- `apps/web/src/stores/notification-store.ts` — Zustand store for notifications and toasts with auto-dismiss
- `apps/web/src/components/ui/toast-container.tsx` — Bottom-right toast notifications with auto-remove after duration
- `apps/web/src/components/layout/notification-panel.tsx` — Dropdown from bell icon with unread badge, mark all as read
- System messages in chat for task lifecycle events (created, queued, started, review, approved, rejected, completed)
- `"system"` content type in `MessageContentType` for centered info messages

#### Changed

- `apps/web/src/components/layout/header.tsx` — Bell icon shows real unread count badge, opens notification panel on click
- `apps/web/src/components/chat/chat-panel.tsx` — Wired socket events to create system messages for task status changes
- `apps/web/src/components/layout/app-layout.tsx` — Renders `ToastContainer` globally
- `apps/web/src/components/chat/message-content.tsx` — Added system message rendering with Info icon

### Fase 5C: Command Palette (Buscar)

#### Added

- `apps/web/src/components/ui/command-palette.tsx` — Global search modal with grouped results (Projects, Tasks, Agents, Navigation)
- `apps/web/src/hooks/use-command-palette.ts` — Ctrl+K / Cmd+K keyboard shortcut handler
- Keyboard navigation: ↑↓ for selection, Enter to navigate, Esc to close
- Client-side filtering with case-insensitive search across all categories

#### Changed

- `apps/web/src/components/layout/header.tsx` — Search bar now clickable button opening command palette, added Ctrl+K hint

### Fase 5D: Polish & Estabilidade

#### Added

- `apps/web/src/components/ui/confirm-dialog.tsx` — Reusable confirmation dialog with danger/default variants
- `apps/web/src/lib/markdown.tsx` — Markdown renderer using `react-markdown` + `remark-gfm` with custom prose styles
- `removeProject(id)` action in workspace store for project removal
- Archive project functionality with DELETE endpoint, confirmation dialog, success/error toasts

#### Changed

- `apps/web/package.json` — Added `react-markdown` and `remark-gfm` dependencies
- `apps/web/src/components/chat/message-content.tsx` — Uses `MarkdownContent` for text and markdown content types
- `apps/web/src/routes/project-settings.tsx` — Wired archive button with ConfirmDialog, DELETE API call, store update, toast notifications
- `apps/web/src/stores/workspace-store.ts` — Added `removeProject` with auto-clear of activeProjectId if archived
- Git integration placeholder updated from "Fase 5" to "Fase 6"

---

## [0.4.0] - 2026-02-13

### Fase 4A: Task Execution Wiring

#### Added

- `apps/web/src/components/tasks/task-execute-dialog.tsx` — Dialog to select task + agent and execute
- `user:execute_task` socket event — Frontend triggers agent execution via Socket.io
- Task queue in `agent-manager.ts` — When agent is busy, tasks enqueue and auto-process when agent becomes idle
- `task:queued` event — Notifies frontend when a task is queued

#### Changed

- `apps/orchestrator/src/agents/agent-manager.ts` — Added `taskQueue`, `enqueueTask()`, `processQueue()`, modified `executeSession()` to chain queued tasks
- `apps/orchestrator/src/realtime/socket-handler.ts` — Added `user:execute_task` handler and `task:queued` bridge
- `apps/web/src/components/tasks/task-card.tsx` — Added green Play button for executable tasks with assigned agents
- `apps/web/src/routes/project-overview.tsx` — "Executar Agents" button now opens TaskExecuteDialog
- `apps/web/src/hooks/use-socket.ts` — Added `executeTask(taskId, agentId)`

### Fase 4B: Task Review Cycle

#### Added

- `apps/web/src/components/tasks/task-review-actions.tsx` — Inline approve/reject buttons for tasks in review
- `apps/web/src/components/tasks/task-reject-dialog.tsx` — Modal with feedback textarea for rejecting tasks

#### Changed

- `apps/orchestrator/src/realtime/socket-handler.ts` — `user:reject_task` now appends feedback to task description and auto-re-assigns to original agent
- `apps/web/src/components/tasks/task-card.tsx` — Renders review actions when task status is "review"
- `apps/web/src/routes/project-tasks.tsx` — Passes `approveTask`/`rejectTask` from socket to TaskCard

### Fase 4C: Dashboard Real Data

#### Added

- `apps/orchestrator/src/routes/dashboard.ts` — `GET /api/dashboard/stats` endpoint with real counts and recent activities from task_logs
- `formatRelativeTime()` utility in `apps/web/src/lib/utils.ts`

#### Changed

- `apps/web/src/routes/dashboard.tsx` — Replaced all hardcoded data (recentActivities, insights, workflows) with real API data
- Hero stats now show real agent count and task count from database
- Stats row with real running/review/done task counts
- Recent activities fetched from task_logs with agent name and relative timestamps
- Removed fake "Insights Estratégicos" and "Workflows" sections

### Fase 4D: Project Settings Route

#### Added

- `apps/web/src/routes/project-settings.tsx` — Settings page with 4 sections: workspace path, agent toggles, git placeholder, danger zone

#### Changed

- `apps/web/src/App.tsx` — Added `/project/:id/settings` route
- `apps/web/src/routes/settings.tsx` — Version bumped to 0.4.0

---

## [0.3.0] - 2026-02-13

### Fase 3A: Chat Store + Message Persistence

#### Added
- `apps/web/src/stores/chat-store.ts` — Zustand store for messages, streaming agents, agent activity
- `apps/web/src/hooks/use-messages.ts` — Hook for loading/sending messages via REST API
- Message persistence in `agent-session.ts` — Agent text messages, tool uses, and errors saved to database

#### Changed
- `apps/web/src/stores/workspace-store.ts` — Added `chatPanelOpen` state and `toggleChatPanel()` action

### Fase 3B: Chat Panel UI

#### Added
- `apps/web/src/components/chat/chat-panel.tsx` — Collapsible 380px right panel with header, messages, and input
- `apps/web/src/components/chat/message-list.tsx` — Scrollable message list with auto-scroll, load more, typing indicators
- `apps/web/src/components/chat/message-bubble.tsx` — Message bubbles: user (right, orange), agent (left, avatar), system (center)
- `apps/web/src/components/chat/chat-input.tsx` — Auto-resize textarea, agent selector dropdown, Enter to send
- `apps/web/src/components/chat/typing-indicator.tsx` — Animated dots with agent name
- `apps/web/src/components/chat/message-content.tsx` — Content renderer: text, code (dark block + copy), thinking (collapsible purple), tool_use (blue card), error (red)

#### Changed
- `apps/web/src/components/layout/app-layout.tsx` — ChatPanel rendered alongside Outlet in project routes
- `apps/web/src/components/layout/header.tsx` — Chat toggle button (MessageSquare icon) in project routes

### Fase 3C: Live Board Page

#### Added
- `apps/web/src/routes/project-board.tsx` — Real-time monitoring: agent status cards, activity feed, tool timeline
- `apps/web/src/components/board/agent-status-card.tsx` — Agent card with status badge (Ocioso/Executando/Erro), current task, current file
- `apps/web/src/components/board/activity-feed.tsx` — Scrollable feed of recent activities (max 100)
- `apps/web/src/components/board/activity-item.tsx` — Activity entry with agent avatar, action icon, detail, relative timestamp
- `apps/web/src/components/board/tool-timeline.tsx` — Visual timeline of tools used by agents

#### Changed
- `apps/web/src/App.tsx` — Replaced Live Board stub with real `ProjectBoard` component

### Fase 3D: Real-time Wiring

#### Changed
- `apps/web/src/hooks/use-socket.ts` — Added listeners for `agent:stream`, `agent:tool_use`, `agent:result`, `agent:error`
- `apps/web/src/components/chat/chat-panel.tsx` — Socket events wired to chat store (messages, typing, status)
- `apps/web/src/components/layout/active-agent-bar.tsx` — Reads real-time agent status from chat store instead of static flag

---

## [0.2.0] - 2026-02-13

### Fase 2A: Logger + Infraestrutura

#### Added
- Structured logger (`apps/orchestrator/src/lib/logger.ts`) with levels info/warn/error/debug, timestamps, and context tags
- HTTP request logger middleware — logs method, path, status code, and duration
- Rate limiter middleware — Map-based, 100 req/min per IP, auto-cleanup every 5min
- Global error handler — catches unhandled errors, sanitizes stack traces from client responses

#### Changed
- `apps/orchestrator/src/index.ts` — Integrated middleware stack: cors → json(1mb) → requestLogger → rateLimiter → routes → errorHandler
- Replaced `console.log` with structured `logger.info` in server startup

### Fase 2B: Tasks Management Page

#### Added
- `apps/web/src/routes/project-tasks.tsx` — Kanban board with 4 columns (Criadas, Em Progresso, Em Review, Concluídas)
- `apps/web/src/components/tasks/task-card.tsx` — Task card with priority badge, category, agent avatar, timestamp
- `apps/web/src/components/tasks/task-form.tsx` — Create/edit modal with title, description, priority, category, agent
- `apps/web/src/components/tasks/task-filters.tsx` — Priority pill filters + agent dropdown
- `apps/web/src/hooks/use-tasks.ts` — CRUD hook (fetch, create, update, delete, filter)
- Drag and drop between Kanban columns to change task status

### Fase 2C: Agent Configuration Page

#### Added
- `apps/web/src/routes/project-agents.tsx` — 3-column grid of agent cards with status
- `apps/web/src/components/agents/agent-card.tsx` — Card with colored avatar, role, model, toggle, configure
- `apps/web/src/components/agents/agent-config-dialog.tsx` — Config dialog: model select, thinking tokens slider, tools toggles, system prompt
- `apps/web/src/hooks/use-agents.ts` — Hook for fetch, update, toggle agents

### Fase 2D: Settings Page

#### Added
- `apps/web/src/routes/settings.tsx` — Global settings with workspace path, theme toggle (placeholder), about section

### Fase 2E: Agent Orchestration Engine

#### Added
- `apps/orchestrator/src/agents/agent-session.ts` — Wrapper for Claude Agent SDK `query()` with streaming events
- `apps/orchestrator/src/agents/agent-manager.ts` — Singleton managing active sessions, task assignment, cancellation
- `apps/orchestrator/src/agents/agent-prompts.ts` — Role-based system prompts (Architect, Tech Lead, Frontend, Backend, QA)
- `apps/orchestrator/src/tasks/task-lifecycle.ts` — Task state machine with validated transitions and task_logs
- `apps/orchestrator/src/realtime/event-bus.ts` — Typed EventEmitter bridge between services and Socket.io
- Uses `@anthropic-ai/claude-agent-sdk` with Claude Code CLI OAuth (no API key required)

### Fase 2F: Socket.io Event Handlers

#### Added
- `apps/orchestrator/src/realtime/socket-handler.ts` — Full implementation: user:message → Tech Lead, create_task, cancel_task, approve_task, reject_task
- EventBus → Socket.io bridge: all agent/task/board events forwarded to project rooms
- `apps/web/src/hooks/use-socket.ts` — Frontend hook: connect, join room, listen to events, send messages/commands

---

## [0.1.0] - 2026-02-12

### Fase 1: Fundação

#### Added
- Monorepo setup (pnpm workspaces + Turborepo)
- Database schema: 7 tables (projects, agents, tasks, messages, task_logs, agent_project_configs, integrations)
- REST API: Full CRUD for projects, agents, tasks, messages
- Frontend: Dashboard + Project Overview pages
- Design system: Streaming platform-inspired (beige page, warm gray sidebar, orange primary, dark hero gradient)
- Layout: 240px sidebar with labels, header with search, ActiveAgentBar bottom bar
- Socket.io infrastructure (typed events, stubs)
- 5 default agents seeded (Architect, Tech Lead, Frontend Dev, Backend Dev, QA Engineer)
- Shared package: types, constants, task state machine
