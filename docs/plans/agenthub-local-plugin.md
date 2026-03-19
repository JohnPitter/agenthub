# Plano: AgentHub Local Plugin — UI Completa

**Data:** 2026-03-16
**Status:** Fase 1 completa (servidor), Fase 2 pendente (UI)

---

## O que já foi feito (Fase 1)

- Express server com SQLite (better-sqlite3 + drizzle-orm)
- API: projects, tasks, agents, files CRUD
- Workspace scanner (detecta Node.js, Python, Go, Rust, Java, .NET)
- Leitor de token Claude Code CLI (~/.claude/.credentials.json)
- Seed de agents default (Tech Lead, Developer, QA)
- Socket.io para real-time
- Porta dinâmica (OS atribui, grava em ~/.agenthub-local/port)
- Plugin Claude Code com 4 comandos: /agenthub, /scan, /task, /usage

## Pendente (Fase 2) — Interface React

### Objetivo
Reutilizar o frontend React do AgentHub Cloud (`apps/web/`) adaptado para modo local:
- Remover: auth, login, planos, teams, WhatsApp, Telegram, admin panel
- Manter: dashboard, kanban board, agents, analytics, file browser, preview
- Adaptar: sidebar simplificada, sem UsageWidget de plano
- Build: gerar dist/ e servir via Express static

### Abordagem
1. Copiar `apps/web/` para `agenthub-plugin/web/`
2. Remover componentes desnecessários (auth, admin, teams, integrations)
3. Simplificar router (sem /login, /admin, /setup)
4. Adaptar stores (sem auth-store, sem team-store)
5. Adaptar API helper (sem cookie JWT, mesma origem)
6. Build com Vite → dist/ servido pelo Express do plugin

### Estimativa
- ~4-6 horas de trabalho
- Pode ser feito com agent teams (frontend + backend adaptations)

### Arquivos a remover do web/:
- routes/login.tsx, routes/admin.tsx, routes/setup-wizard.tsx, routes/settings.tsx (simplificar)
- stores/auth-store.ts, stores/team-store.ts, stores/admin-store.ts
- components/teams/, components/integrations/whatsapp-config.tsx, telegram-config.tsx
- middleware/auth.ts (no backend)

### Arquivos a adaptar:
- App.tsx — remover auth check, remover /login route
- app-sidebar.tsx — remover UsageWidget, TeamSwitcher, admin link
- lib/utils.ts (api helper) — remover cookie-based auth
- lib/socket.ts — apontar para localhost dinâmico
