# AgentHub — Diretrizes de Desenvolvimento

## Projeto

AgentHub é uma plataforma de orquestração multi-agentes de IA para automação de desenvolvimento de software, powered by Claude Agent SDK. Monorepo com pnpm workspaces + Turborepo.

**Versão atual:** 0.11.0 (Fases 1-11 completas)
**Próxima fase:** 12 — PR Management (GitHub PR integration)

## Estrutura do Monorepo

```
agenthub/
├── apps/
│   ├── web/              # React 19 + Vite + Tailwind 4 (porta 5173)
│   └── orchestrator/     # Node.js + Express + Socket.io (porta 3001)
├── packages/
│   ├── database/         # Drizzle ORM + SQLite (@libsql)
│   └── shared/           # Types compartilhados + constantes
├── turbo.json
├── pnpm-workspace.yaml
└── CHANGELOG.md
```

## Comandos

```bash
pnpm install              # Instalar dependências
pnpm dev                  # Start all (web + orchestrator)
pnpm dev:web              # Start frontend only
pnpm dev:orchestrator     # Start backend only
pnpm build                # Build all packages
pnpm db:migrate           # Rodar migrations
pnpm db:seed              # Seed database
```

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, React Router 7, Socket.io Client, Monaco Editor, Recharts, Lucide React
- **Backend:** Express, Socket.io, Claude Agent SDK, Node.js crypto (AES-256-GCM)
- **Database:** SQLite via @libsql + Drizzle ORM
- **Tooling:** pnpm 9, Turborepo, TypeScript 5.8 strict mode

## Arquitetura dos Packages

- `@agenthub/shared` — Types (Agent, Task, Project, Events), constantes (task states, agent roles), exportados via barrel `src/index.ts`
- `@agenthub/database` — Schema Drizzle (7 tabelas: projects, agents, tasks, messages, task_logs, agent_project_configs, integrations), connection, seed, migrate
- `@agenthub/web` — SPA React com routes (dashboard, project-overview, project-tasks, project-board, project-agents, project-files, project-settings, analytics, settings)
- `@agenthub/orchestrator` — API REST + WebSocket, agent execution engine, git service, file service

## Convenções de Código

- TypeScript strict mode em todos os packages
- Imports com extensão `.js` no orchestrator (ESM)
- Componentes React: function components + hooks
- Estado global: Zustand stores (`workspace-store`, `chat-store`, `notification-store`)
- Realtime: EventBus (backend) → Socket.io → hooks (frontend)
- Rotas API: `/api/<resource>` (REST) + Socket.io events
- Git operations: sempre `execFile` (nunca `exec`) para prevenir injection
- Encryption: AES-256-GCM via `apps/orchestrator/src/lib/encryption.ts`
- Logger estruturado: `apps/orchestrator/src/lib/logger.ts`

## Database Schema (tabelas principais)

- `projects` — id, name, path, description, status
- `agents` — id, name, role, model, systemPrompt, enabled
- `tasks` — id, projectId, assignedAgentId, title, description, status, priority, category, branch, result
- `messages` — id, projectId, agentId, role, content, contentType
- `task_logs` — id, taskId, agentId, action, fromStatus, toStatus, detail, filePath
- `integrations` — id, projectId, type (git/whatsapp/telegram), config, credentials, status

## Task State Machine

`pending → assigned → in_progress → review → done`
`review → assigned` (reject com feedback)
`* → failed` (erro)

---

## Princípios Mestres

### 1. Arquitetura Limpa
- Separação clara de responsabilidades: routes → services → database
- Camadas: middleware → routes → business logic → data access
- Shared types entre frontend e backend via `@agenthub/shared`
- Sem lógica de negócio em routes — delegar para services

### 2. Performance (Big O Notation)
- Evitar loops O(n²) — preferir Maps/Sets para lookups
- Queries SQL com índices e filtros WHERE (nunca buscar tudo e filtrar em memória)
- Paginação em endpoints que retornam listas
- Debounce em eventos de alta frequência (socket, input)
- Lazy loading de componentes pesados (Monaco Editor, Recharts)

### 3. Mitigação de CVEs
- `execFile` ao invés de `exec` (prevenir command injection)
- Path traversal protection em todos endpoints de arquivo
- Input validation com schemas (Zod quando aplicável)
- Sanitização de output (nunca confiar em dados do banco para HTML)
- Dependências auditadas: `pnpm audit` antes de cada release
- Usar react-markdown para renderizar conteúdo markdown (nunca injetar HTML raw)

### 4. Resiliência e Cache
- Retry logic com backoff exponencial em operações de rede
- Timeout protection em git operations (5s local, 60s remote)
- Stash automático antes de pull para preservar work-in-progress
- Error boundaries no React para isolar falhas de componentes
- Graceful degradation: se git remote falha, operações locais continuam

### 5. Design Moderno Baseado no Contexto
- Design system: beige page (#FFFDF7), warm gray sidebar, orange primary (#F97316), dark hero gradient
- Tipografia hierárquica: 24px stats, 14px headers, 11px labels
- Cards com bordas sutis, sombras suaves, ícones Lucide
- Responsivo com Tailwind utility classes
- Dark theme preparado (variáveis CSS)

### 6. Pirâmide de Testes
- Unit tests para services e utils (base da pirâmide)
- Integration tests para routes API (meio)
- E2E tests com Playwright para fluxos críticos (topo, planejado Fase 13)
- Cada service novo deve ter ao menos testes unitários

### 7. Segurança Contra Vazamento de Dados
- Credentials encrypted com AES-256-GCM (nunca plain text)
- `.env` no `.gitignore` — nunca commitar secrets
- ENCRYPTION_KEY obrigatória em env var de produção
- Tokens injetados temporariamente em URLs com cleanup automático
- Logs nunca exibem credentials decrypted
- Rate limiter em todas as rotas API

### 8. Logs e Observabilidade
- Logger estruturado com levels: info, warn, error, debug
- Context tags em cada log: `logger.info("msg", "context-tag")`
- Request logger middleware logando method, path, status, duration
- Task logs (audit trail) para todas operações de task e git
- Eventos do EventBus para rastreamento real-time

### 9. Design System
- Ícones: Lucide React (consistência no set inteiro)
- Cores: mapeamento semântico (green=sucesso, red=erro, purple=git, orange=primary, blue=push)
- Componentes: Cards, Badges, Dialogs, Toasts, ConfirmDialog reutilizáveis
- Layout: Sidebar 240px + Header + Content + ChatPanel 380px (opcional)
- Padrão de componente: `apps/web/src/components/<domain>/<component>.tsx`

### 10. Construção Por Fases e SubFases
- Cada feature é uma Fase numerada (ex: Fase 12)
- SubFases com letras (ex: 12A, 12B, 12C, 12D)
- Cada SubFase termina com build limpo verificado
- Incrementos pequenos e testáveis
- Plano documentado em DEVELOPMENT_PLAN.md antes de implementar

### 11. CHANGELOG.md
- Toda alteração documentada no CHANGELOG.md
- Formato: `## [x.y.0] - YYYY-MM-DD` + `### Fase N: Título`
- SubFases com `#### Fase NA: Subtítulo` + seções Added/Changed/Security
- Listar arquivos criados e modificados
- Detalhes técnicos relevantes para debug futuro

### 12. Build Funcional
- Após qualquer alteração: `pnpm build` deve passar sem erros
- Imports não utilizados removidos antes de commitar
- Sem variáveis unused, sem `any` desnecessário
- TypeScript strict — resolver todos os erros de tipo

---

## Regras do Agente

### 1. Comandos Longos
- Se um comando demorar mais de 2 minutos, cancelar ou converter para background task
- Usar `timeout` em operações de rede/git
- Preferir execuções paralelas quando possível

### 2. Abordagem Alternativa
- Se uma solução falhar 2x, pesquisar na internet por alternativas
- Não ficar preso em uma abordagem — pivotar rapidamente
- Consultar documentação oficial quando APIs mudam

### 3. Economia de Token
- Foco na implementação — menos resumos, mais código
- Não repetir código já lido — referenciar por arquivo:linha
- Respostas concisas e diretas
- Não gerar documentação desnecessária (só quando pedido)
- Agrupar operações similares em blocos
