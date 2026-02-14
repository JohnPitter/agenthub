# AgentHub

> **Multi-Agent Task Orchestration Platform powered by Claude Agent SDK**

AgentHub é uma plataforma moderna de orquestração de agentes de IA para automação de desenvolvimento de software. Ele permite que múltiplos agents Claude trabalhem em paralelo em diferentes tasks, com gerenciamento completo de projetos, code review, git integration e analytics.

![Version](https://img.shields.io/badge/version-0.11.0-purple)
![License](https://img.shields.io/badge/license-MIT-blue)

## 🎯 Visão Geral

O AgentHub transforma o desenvolvimento de software através de agentes autônomos que:
- ✅ Executam tasks de código usando Claude Agent SDK
- ✅ Trabalham em branches git isoladas
- ✅ Passam por code review antes de merge
- ✅ Reportam progresso em tempo real
- ✅ Integram com Git, WhatsApp e Telegram
- ✅ Fornecem analytics detalhados de performance

## 🚀 Features Implementadas

### ✅ Fase 1-5: Core Functionality
- **Agent Execution** — Agents executam tasks reais usando Claude Agent SDK
- **Review Cycle** — Approve/reject tasks com feedback estruturado
- **Real-time Updates** — WebSocket notifications para progresso de tasks
- **Command Palette** — Quick actions com ⌘K
- **Dashboard** — Métricas em tempo real de projetos e agents

### ✅ Fase 6: Git Integration (Completa)
- **Git Detection** — Auto-detecção de repositórios git
- **Branch Management** — Criação automática de branches por task (`task/{id}-{slug}`)
- **Auto-commit** — Commit automático após task approval
- **Git UI** — Status git, branches, commits no settings
- **Activity Log** — Rastreamento completo de operações git

### ✅ Fase 7: Git Remote Operations (Completa)
- **Credential Management** — Armazenamento seguro (AES-256-GCM) de SSH keys e tokens
- **Push Operations** — Auto-push opcional após commits
- **Pull/Sync** — Sincronização com remote, detecção de conflitos
- **Remote Status** — UI mostrando ahead/behind indicators

### ✅ Fase 8: File Browsing (Completa)
- **File Tree Explorer** — Navegação hierárquica de arquivos
- **Code Viewer** — Monaco Editor com syntax highlighting
- **Breadcrumbs** — Navegação fácil entre diretórios
- **File Icons** — Ícones específicos por tipo de arquivo

### ✅ Fase 9: Code Editor (Completa)
- **Monaco Editor** — Editor completo com IntelliSense
- **Read/Write Modes** — Visualização e edição de código
- **Auto-save** — Salvamento automático de mudanças
- **Language Support** — Suporte para 50+ linguagens

### ✅ Fase 10: Diff Viewer (Completa)
- **Monaco Diff Editor** — Comparação lado-a-lado de código
- **Version Selector** — Seletor de commits git
- **Three Modes** — View, Edit, Diff modes
- **Git History API** — Busca de histórico de arquivos

### ✅ Fase 11: Analytics Dashboard (Completa)
- **Agent Metrics** — Taxa de sucesso, tempo médio, distribuição de status
- **Performance Charts** — Gráficos de tendência com Recharts
- **Period Filters** — Visualização por 7d, 30d, all time
- **Agent Ranking** — Ranking por performance

## 🏗️ Arquitetura

### Monorepo Structure
```
agenthub/
├── apps/
│   ├── web/              # React + Vite frontend
│   └── orchestrator/     # Node.js + Express backend
├── packages/
│   ├── database/         # Drizzle ORM + SQLite
│   └── shared/           # Shared types & utilities
└── turbo.json           # Turborepo config
```

### Tech Stack

**Frontend:**
- ⚛️ React 19 + TypeScript
- 🎨 Tailwind CSS
- 📊 Recharts para visualizações
- 🔧 Monaco Editor para code editing
- 🔌 Socket.io para real-time

**Backend:**
- 🚀 Node.js + Express
- 🤖 Claude Agent SDK
- 🗄️ SQLite + Drizzle ORM
- 🔄 WebSocket (Socket.io)
- 🔐 AES-256-GCM encryption

**Integrations:**
- 🔧 Git CLI (branch, commit, push, pull)
- 📱 WhatsApp (via whatsapp-web.js)
- 💬 Telegram Bot API

## 📋 Getting Started

### Pré-requisitos
- Node.js 18+
- pnpm 8+
- Git
- Anthropic API Key

### Instalação

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/agenthub.git
cd agenthub

# Instalar dependências
pnpm install

# Configurar variáveis de ambiente
cp apps/orchestrator/.env.example apps/orchestrator/.env
# Adicionar ANTHROPIC_API_KEY no .env

# Build
pnpm build

# Iniciar development
pnpm dev
```

### Acessar a aplicação
- **Web UI:** http://localhost:5173
- **API:** http://localhost:3000

## 🗺️ Plano de Implementação

O AgentHub foi desenvolvido em fases incrementais:

### Fase 1-5: Core Platform ✅
- Agent execution engine com Claude SDK
- Real-time task tracking
- Review cycle completo
- Dashboard e command palette

### Fase 6: Git Integration ✅
- **6A:** Git detection & repository setup
- **6B:** Branch management automático
- **6C:** Commit tracking & auto-commit
- **6D:** Git UI & activity log

### Fase 7: Git Remote Operations ✅
- **7A:** Credential management (SSH/HTTPS)
- **7B:** Push operations (auto/manual)
- **7C:** Pull/fetch & sync com conflitos
- **7D:** Remote status UI (ahead/behind)

### Fase 8: File Browsing ✅
- Tree view explorer
- File navigation
- Breadcrumbs

### Fase 9: Code Editor ✅
- Monaco Editor integration
- Read/write modes
- Syntax highlighting

### Fase 10: Diff Viewer ✅
- Monaco Diff Editor
- Git history API
- Version comparison

### Fase 11: Analytics Dashboard ✅
- Agent performance metrics
- Trend charts (Recharts)
- Success rates e rankings

### Fase 12: PR Management (Planejada)
- GitHub PR integration
- Code review workflow
- PR status tracking
- Automated PR creation

### Fase 13: Testing & Deployment (Planejada)
- E2E tests com Playwright
- CI/CD pipeline
- Docker containers
- Production deployment

## 📊 Database Schema

**Core Tables:**
- `projects` — Projetos gerenciados
- `agents` — Agents Claude configurados
- `tasks` — Tasks de desenvolvimento
- `taskLogs` — Audit trail de operações
- `integrations` — Git, WhatsApp, Telegram configs

**Relationships:**
- Project → Tasks (1:N)
- Agent → Tasks (1:N)
- Task → TaskLogs (1:N)
- Project → Integrations (1:N)

## 🔐 Security

- **Credential Storage:** AES-256-GCM encryption
- **Git Operations:** `execFile` (no shell injection)
- **API Authentication:** Session-based auth
- **Input Validation:** Zod schemas
- **Path Traversal Protection:** Normalized paths

## 📝 Development

### Scripts disponíveis

```bash
# Development
pnpm dev              # Start all apps
pnpm dev:web          # Start web only
pnpm dev:orchestrator # Start orchestrator only

# Build
pnpm build            # Build all packages
pnpm build:web        # Build web only

# Type checking
pnpm typecheck        # Check all packages

# Database
pnpm db:push          # Push schema changes
pnpm db:studio        # Open Drizzle Studio
```

### Convenções de Código

- **TypeScript strict mode** habilitado
- **ESLint** para linting
- **Prettier** para formatting
- **Conventional Commits** para mensagens de commit
- **Component-first** architecture no frontend

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma feature branch (`git checkout -b feature/amazing-feature`)
3. Commit suas mudanças (`git commit -m 'feat: add amazing feature'`)
4. Push para a branch (`git push origin feature/amazing-feature`)
5. Abra um Pull Request

## 📄 License

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🙏 Agradecimentos

- [Anthropic](https://anthropic.com) pelo Claude Agent SDK
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) pelo editor de código
- [Recharts](https://recharts.org/) pelos gráficos
- [Drizzle ORM](https://orm.drizzle.team/) pelo ORM moderno

---

**Built with ❤️ using Claude Agent SDK**
