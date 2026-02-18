# AgentHub

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.17.1-purple?style=for-the-badge)](CHANGELOG.md)

**Multi-Agent Task Orchestration Platform powered by Claude Agent SDK**

*Autonomous AI agents working in parallel to automate software development*

[Installation](#installation) •
[Features](#features) •
[Screenshots](#screenshots) •
[Configuration](#configuration) •
[Documentation](#documentation)

</div>

---

## Overview

AgentHub orchestrates multiple AI agents to automate software development. Agents execute tasks in isolated git branches, go through code review, and report progress in real-time.

**What you get:**

- 🤖 **Agent Execution** — Claude SDK agents executing real coding tasks
- 🔀 **Git Integration** — Automatic branch creation, commits, push/pull
- 👀 **Code Review** — Approve/reject cycle with structured feedback
- ⚡ **Real-time Updates** — WebSocket notifications for all operations
- 📊 **Analytics** — Performance metrics, success rates, trend charts
- 📝 **Code Editor** — Monaco Editor with diff viewer and git history
- 📱 **Integrations** — Git, WhatsApp, Telegram notifications

---

## Installation

### Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | 18+ |
| pnpm | 9+ |
| Git | 2.x+ |
| Anthropic API Key | — |

### Setup

```bash
# Clone the repository
git clone https://github.com/JohnPitter/agenthub.git
cd agenthub

# Install dependencies
pnpm install

# Configure environment
cp apps/orchestrator/.env.example apps/orchestrator/.env
# Add your ANTHROPIC_API_KEY to .env

# Build all packages
pnpm build

# Start development
pnpm dev
```

**That's it!** Access the Web UI at `http://localhost:5173` and the API at `http://localhost:3001`.

---

## Features

| Feature | Description |
|---------|-------------|
| 🤖 **Agent Execution** | Claude SDK agents running real development tasks |
| 🔀 **Branch Management** | Automatic branch creation per task (`task/{id}-{slug}`) |
| 👀 **Review Cycle** | Approve/reject tasks with structured feedback |
| ⚡ **Real-time Tracking** | WebSocket notifications for task progress |
| 📁 **File Browser** | Tree view explorer with breadcrumbs and file icons |
| 📝 **Code Editor** | Monaco Editor with IntelliSense and 50+ languages |
| 🔍 **Diff Viewer** | Side-by-side comparison with git history |
| 📊 **Analytics Dashboard** | Agent metrics, trend charts, success rates |
| 🔐 **Credential Storage** | AES-256-GCM encrypted secrets |
| 🔄 **Remote Operations** | Push, pull, sync with conflict detection |
| 📱 **Notifications** | WhatsApp (auto-reconnect + number whitelist), Telegram, Slack |
| 🧠 **Autonomous Agents** | Soul system, memory, and task watcher |
| 🖥️ **Dev Server Preview** | Live iframe preview with terminal output |

---

## Screenshots

### Dashboard

[![Dashboard](assets/dashboard.png)](assets/dashboard.png)

### Project Board

[![Board](assets/board.png)](assets/board.png)

### Code Editor

[![Editor](assets/editor.png)](assets/editor.png)

---

## Configuration

### Monorepo Structure

```
agenthub/
├── apps/
│   ├── web/              # ⚛️ React 19 + Vite + Tailwind 4 (port 5173)
│   └── orchestrator/     # 🚀 Node.js + Express + Socket.io (port 3001)
├── packages/
│   ├── database/         # 🗄️ Drizzle ORM + SQLite (@libsql)
│   └── shared/           # 📦 Shared types & constants
└── turbo.json            # ⚙️ Turborepo config
```

### Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | ⚛️ React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, Monaco Editor, Recharts |
| **Backend** | 🚀 Express, Socket.io, Claude Agent SDK, Node.js crypto (AES-256-GCM) |
| **Database** | 🗄️ SQLite via @libsql + Drizzle ORM |
| **Tooling** | ⚙️ pnpm 9, Turborepo, TypeScript 5.8 strict mode |

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Optional
ENCRYPTION_KEY=your-32-byte-key    # For credential encryption
PORT=3001                           # Orchestrator port
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [CHANGELOG.md](CHANGELOG.md) | Version history and phase details |
| [DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) | Roadmap with Phases 18-25 detailed |

---

## Compatibility

### Task State Machine

```
pending → assigned → in_progress → review → done
                                   review → assigned (reject with feedback)
                                   * → failed (error)
```

### Database Schema

| Table | Description |
|-------|-------------|
| `projects` | Managed projects with path and status |
| `agents` | Claude agents with role and system prompt |
| `tasks` | Development tasks with priority, category, branch |
| `messages` | Agent conversation messages |
| `task_logs` | Audit trail for all operations |
| `integrations` | Git, WhatsApp, Telegram configs |

---

## Scripts

```bash
# Development
pnpm dev                  # Start all apps
pnpm dev:web              # Start frontend only
pnpm dev:orchestrator     # Start backend only

# Build
pnpm build                # Build all packages

# Database
pnpm db:migrate           # Run migrations
pnpm db:seed              # Seed database
```

---

## Engineering Principles

AgentHub follows **12 master principles**:

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Clean Architecture** | DRY, single responsibility, no business logic in routes |
| 2 | **Big O Performance** | O(1) lookups, paginated endpoints, lazy loading, memoization |
| 3 | **CVE Mitigation** | OWASP Top 10 protection, `execFile` only, parameterized queries |
| 4 | **Resilience & Cache** | Retry with backoff, timeouts, Error Boundaries, auto-reconnect |
| 5 | **Modern Design** | Semantic palette, typography hierarchy, 4px grid, accessibility |
| 6 | **Test Pyramid** | Unit (70%), Integration (20%), E2E (10%) with Vitest |
| 7 | **Data Security** | AES-256-GCM encryption, no secrets in logs/responses, httpOnly cookies |
| 8 | **Observability** | Structured logger, context tags, audit trail, full lifecycle tracing |
| 9 | **Design System** | Lucide icons, CSS variables, reusable components, consistent states |
| 10 | **Phase-based Dev** | Numbered phases, sub-phases, plans before code |
| 11 | **CHANGELOG** | Semantic versioning, every change documented |
| 12 | **Clean Builds** | Zero unused imports, zero `any`, TypeScript strict, `pnpm build` always passes |

---

## Security

- 🔐 **Credential Storage** — AES-256-GCM encryption (never plain text)
- 🛡️ **Git Operations** — `execFile` only (no shell injection)
- ✅ **Input Validation** — Zod schemas, parameterized SQL via Drizzle ORM
- 🚫 **Path Traversal** — `path.resolve()` + directory boundary validation
- 🔒 **Rate Limiting** — All API routes protected
- 🍪 **Cookie Security** — httpOnly, secure, sameSite strict
- 🛡️ **Error Handling** — No stack traces leaked to clients, Error Boundaries per route

---

## License

MIT License — see [LICENSE](LICENSE) file.

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## Support

- **Issues:** [GitHub Issues](https://github.com/JohnPitter/agenthub/issues)
- **Discussions:** [GitHub Discussions](https://github.com/JohnPitter/agenthub/discussions)

---

## 🙏 Acknowledgements

- [Anthropic](https://anthropic.com) — Claude Agent SDK
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — Code editor
- [Recharts](https://recharts.org/) — Charts and visualizations
- [Drizzle ORM](https://orm.drizzle.team/) — Modern TypeScript ORM
