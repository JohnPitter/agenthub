# AgentHub Phases 12-16 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform AgentHub into a modern dark-first SaaS with interactive real-time board, chat on left side, WhatsApp/Telegram messaging integration, and enhanced agent team management.

**Architecture:** Incremental overhaul — Phase 12 redesigns the visual foundation (dark theme + layout), Phase 13 builds the interactive board, Phase 14 adds messaging integrations, Phase 15 enhances agent management, Phase 16 wires autonomous execution improvements.

**Tech Stack:** React 19, Tailwind CSS 4, Zustand, Socket.io, Express, Drizzle ORM, SQLite, Baileys (WhatsApp), Telegraf (Telegram)

---

## Phase 12: Design System Overhaul & Layout Restructure

### Task 12A: New Dark-First Design Tokens

**Files:**
- Modify: `apps/web/src/globals.css` (full rewrite of @theme block + utility classes)

**Description:** Replace Fluent 2 light theme with a modern dark-first design inspired by Linear/Vercel/Cursor. New color palette, typography with Inter font, glass morphism effects, gradient accents.

**New Design Tokens:**
```css
@theme {
  /* Background layers (dark-first) */
  --color-neutral-bg1: #09090B;      /* Base - zinc-950 */
  --color-neutral-bg2: #18181B;      /* Surface - zinc-900 */
  --color-neutral-bg3: #27272A;      /* Elevated - zinc-800 */
  --color-neutral-bg-hover: #3F3F46; /* Hover - zinc-700 */

  /* Foregrounds */
  --color-neutral-fg1: #FAFAFA;      /* Primary text */
  --color-neutral-fg2: #A1A1AA;      /* Secondary text - zinc-400 */
  --color-neutral-fg3: #71717A;      /* Tertiary text - zinc-500 */
  --color-neutral-fg-disabled: #52525B; /* Disabled - zinc-600 */

  /* Brand — Indigo/Purple gradient */
  --color-brand: #6366F1;            /* Indigo-500 */
  --color-brand-hover: #818CF8;      /* Indigo-400 */
  --color-brand-pressed: #4F46E5;    /* Indigo-600 */
  --color-brand-light: rgba(99,102,241,0.15);
  --color-brand-dark: #4338CA;       /* Indigo-700 */

  /* Strokes */
  --color-stroke: rgba(255,255,255,0.08);
  --color-stroke2: rgba(255,255,255,0.05);

  /* Status colors (same semantic, dark-adjusted) */
  --color-success: #10B981;
  --color-success-light: rgba(16,185,129,0.15);
  --color-success-dark: #059669;
  --color-warning: #F59E0B;
  --color-warning-light: rgba(245,158,11,0.15);
  --color-warning-dark: #D97706;
  --color-danger: #EF4444;
  --color-danger-light: rgba(239,68,68,0.15);
  --color-danger-dark: #DC2626;
  --color-info: #3B82F6;
  --color-info-light: rgba(59,130,246,0.15);
  --color-info-dark: #2563EB;
  --color-purple: #8B5CF6;
  --color-purple-light: rgba(139,92,246,0.15);
  --color-purple-dark: #7C3AED;
  --color-orange: #F97316;

  /* Shadows (dark mode adjusted) */
  --shadow-2: 0 1px 2px rgba(0,0,0,0.4);
  --shadow-4: 0 2px 4px rgba(0,0,0,0.4);
  --shadow-8: 0 4px 8px rgba(0,0,0,0.4);
  --shadow-16: 0 8px 16px rgba(0,0,0,0.5);

  /* Typography */
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
}
```

**Also update:** body background, scrollbar colors, button styles, input styles, badge styles, skeleton shimmer — all for dark palette.

**Acceptance:** All existing pages render correctly in dark theme. No white flashes. Buttons, inputs, badges all use new tokens.

---

### Task 12B: Layout Restructure — Chat Panel to Left Side

**Files:**
- Modify: `apps/web/src/components/layout/app-layout.tsx`
- Modify: `apps/web/src/components/chat/chat-panel.tsx`

**Description:** Move ChatPanel from right side to left side, between sidebar and main content. Chat should be globally accessible (not just project routes). Add toggle button in header.

**New layout order:** `Sidebar | ChatPanel (conditional) | Main Content`

**Changes to app-layout.tsx:**
```tsx
<div className="flex h-screen overflow-hidden bg-neutral-bg1">
  <AppSidebar />
  <ChatPanel /> {/* Always rendered, visibility controlled by store */}
  <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
    <Header />
    <main className="flex-1 overflow-y-auto overflow-x-hidden">
      <Outlet />
    </main>
    <ActiveAgentBar />
  </div>
</div>
```

**Changes to chat-panel.tsx:** Remove projectId prop requirement. Use activeProjectId from workspace store. Add glass-morphism border effect on right edge.

**Acceptance:** Chat panel slides in from left. Works on all pages. Toggle in header works.

---

### Task 12C: Sidebar & Header Redesign

**Files:**
- Modify: `apps/web/src/components/layout/app-sidebar.tsx`
- Modify: `apps/web/src/components/layout/header.tsx`

**Description:** Redesign sidebar with dark glass effect, project list with stack icons, agent status indicators. Header with gradient accent line, breadcrumbs, chat toggle, notification bell.

**Sidebar spec:**
- Width: 240px
- Background: semi-transparent dark with backdrop-blur
- Logo/brand at top
- Project list with colored stack icons
- Agent avatars with online/busy/idle indicators at bottom
- Collapse button

**Header spec:**
- Height: 48px
- Thin gradient accent line at top (indigo → purple)
- Breadcrumb navigation
- Chat toggle button (left panel)
- Notification bell with badge count

---

### Task 12D: Dashboard Redesign with Project Grid

**Files:**
- Modify: `apps/web/src/routes/dashboard.tsx`
- Create: `apps/web/src/components/projects/project-card.tsx`

**Description:** Redesign dashboard with a visual project grid. Each project shows as a card with: stack icon (large, colored), project name, quick stats (tasks, agents), last activity. Cards have hover glow effect matching stack color.

**Project card spec:**
- Glass-morphism card with subtle border
- Stack icon prominently displayed (React, Node, Python, etc.)
- Project name bold
- Mini stats row (tasks: X, agents: Y)
- Hover: subtle glow + scale(1.02)
- Click: navigate to project overview

---

## Phase 13: Interactive Real-time Board

### Task 13A: Kanban Board Component

**Files:**
- Create: `apps/web/src/components/board/kanban-board.tsx`
- Create: `apps/web/src/components/board/kanban-column.tsx`
- Create: `apps/web/src/components/board/kanban-card.tsx`
- Modify: `apps/web/src/routes/project-board.tsx`

**Description:** Replace current activity feed board with an interactive Kanban board. Columns: Pending, In Progress, Review, Done. Cards are draggable between columns (state transitions). Real-time updates via Socket.io — when an agent changes task status, the card moves live.

**Features:**
- Drag & drop between columns (using @dnd-kit/core)
- Real-time card movement (Socket.io task:status events)
- Card shows: title, assigned agent avatar, priority badge, time elapsed
- Column header shows count
- Smooth animations on card move

**Backend dependency:** Task PATCH endpoint already supports status changes. Socket events already emit task:status.

---

### Task 13B: Spreadsheet-like Task View

**Files:**
- Create: `apps/web/src/components/board/task-table.tsx`
- Create: `apps/web/src/components/board/editable-cell.tsx`

**Description:** Alternative view to Kanban — a spreadsheet/table view where users can inline-edit task fields (title, status, priority, assigned agent). Changes save on blur and emit via Socket.io. Other connected clients see changes in real-time, like Google Sheets.

**Features:**
- Columns: Status icon, Title (editable), Agent (dropdown), Priority (dropdown), Category, Branch, Updated
- Inline editing on click
- Tab navigation between cells
- Real-time sync via Socket.io
- Row selection for bulk actions

---

### Task 13C: Board View Toggle & Agent Activity Overlay

**Files:**
- Modify: `apps/web/src/routes/project-board.tsx`
- Create: `apps/web/src/components/board/agent-activity-overlay.tsx`

**Description:** Add toggle between Kanban/Table views. Add floating agent activity overlay showing what each agent is currently doing (thinking, editing file X, running tests, etc.) — data comes from agent:stream and agent:tool_use socket events.

---

## Phase 14: WhatsApp & Telegram Integration

### Task 14A: WhatsApp Service (Baileys)

**Files:**
- Create: `apps/orchestrator/src/integrations/whatsapp-service.ts`
- Modify: `apps/orchestrator/src/routes/integrations.ts` (create if not exists)
- Modify: `apps/orchestrator/src/index.ts` (register route)

**Description:** WhatsApp integration using Baileys (open-source WhatsApp Web API). User scans QR code to link. Messages from linked number are routed to the Tech Lead agent. Agent responses are sent back via WhatsApp.

**Flow:**
1. User configures phone number in settings
2. Backend generates QR code via Baileys
3. User scans with WhatsApp
4. Incoming messages → create Message (source: "whatsapp") → route to Tech Lead agent
5. Agent response → send back via WhatsApp

**API endpoints:**
- `POST /api/integrations/whatsapp/connect` — Start connection, return QR code
- `GET /api/integrations/whatsapp/status` — Connection status
- `POST /api/integrations/whatsapp/disconnect` — Disconnect
- `POST /api/integrations/whatsapp/send` — Send message (internal use)

**Socket events:**
- `integration:whatsapp:qr` — QR code for scanning
- `integration:whatsapp:connected` — Successfully linked
- `integration:whatsapp:message` — Incoming message

---

### Task 14B: Telegram Bot Service (Telegraf)

**Files:**
- Create: `apps/orchestrator/src/integrations/telegram-service.ts`
- Modify: `apps/orchestrator/src/routes/integrations.ts`

**Description:** Telegram integration using Telegraf. User creates a Telegram bot via BotFather, enters token in settings. Messages sent to the bot are routed to the Tech Lead. Agent responses sent back via Telegram.

**Flow:**
1. User provides Telegram bot token in settings
2. Backend starts Telegraf bot
3. User sends message to bot on Telegram
4. Message → create Message (source: "telegram") → route to Tech Lead
5. Response → send via Telegram bot

**API endpoints:**
- `POST /api/integrations/telegram/connect` — Start bot with token
- `GET /api/integrations/telegram/status` — Bot status
- `POST /api/integrations/telegram/disconnect` — Stop bot

---

### Task 14C: Integration Settings UI

**Files:**
- Create: `apps/web/src/components/integrations/whatsapp-config.tsx`
- Create: `apps/web/src/components/integrations/telegram-config.tsx`
- Create: `apps/web/src/routes/settings-integrations.tsx`
- Modify: `apps/web/src/routes/settings.tsx` (add integrations tab)
- Modify: `apps/web/src/App.tsx` (add route)

**Description:** Settings page for configuring WhatsApp and Telegram. WhatsApp shows QR code for scanning. Telegram shows bot token input and test button. Both show connection status with real-time updates.

---

## Phase 15: Agent Team Enhancements

### Task 15A: Update Default Agent Definitions

**Files:**
- Modify: `packages/shared/src/constants/agents.ts`
- Modify: `packages/shared/src/types/agent.ts`

**Description:** Update default agents per user spec:
- **Architect**: Opus 4.6, maxThinkingTokens: 32000 (thinking active)
- **Tech Lead**: Opus 4.6, maxThinkingTokens: 32000 (thinking active)
- **Frontend Dev (UX Design)**: Sonnet 4.5, maxThinkingTokens: 16000
- **Backend Dev (Design Systems)**: Sonnet 4.5, maxThinkingTokens: 16000
- **QA Engineer (Automation)**: Sonnet 4.5, maxThinkingTokens: 16000

All agents level: "senior". Update descriptions to match enhanced roles.

---

### Task 15B: Agent Configuration Panel

**Files:**
- Modify: `apps/web/src/routes/project-agents.tsx`
- Create: `apps/web/src/components/agents/agent-config-panel.tsx`

**Description:** Enhanced agent config panel where user can:
- Change model per agent
- Set thinking token budget
- Enable/disable specific tools
- Set permission level (default, acceptEdits, bypassPermissions)
- View agent activity history
- Toggle agent active/inactive

---

### Task 15C: Custom Agent Creation Wizard

**Files:**
- Create: `apps/web/src/components/agents/create-agent-wizard.tsx`
- Modify: `apps/web/src/routes/project-agents.tsx`

**Description:** Step-by-step wizard for creating custom agents:
1. Name & role selection
2. Model & thinking budget
3. System prompt (with templates)
4. Tool selection (checkboxes)
5. Permission level
6. Color & avatar

---

## Phase 16: Autonomous Execution Improvements

### Task 16A: Auto-Assignment & Queue

**Files:**
- Modify: `apps/orchestrator/src/agents/agent-manager.ts`

**Description:** When a task is created, auto-assign to the most appropriate available agent based on:
- Task category vs agent role (feature → frontend/backend, bug → qa, architecture → architect)
- Agent availability (not busy)
- Queue management with priority

---

### Task 16B: Task Auto-Completion Flow

**Files:**
- Modify: `apps/orchestrator/src/tasks/task-lifecycle.ts`
- Modify: `apps/orchestrator/src/agents/agent-session.ts`

**Description:** Tasks must always reach a terminal state:
- Agent completes work → auto-move to "review"
- User approves → "done" (auto-commit if configured)
- User rejects → back to "in_progress" with feedback
- Agent error → retry once, then "failed" with error log
- Timeout (configurable) → "failed" with timeout reason

---

## Execution Order (Team Assignment)

| Task | Agent | Priority | Dependencies |
|------|-------|----------|-------------|
| 12A | Frontend Dev | P0 | None |
| 12B | Frontend Dev | P0 | 12A |
| 12C | Frontend Dev | P1 | 12A |
| 12D | Frontend Dev | P1 | 12A |
| 13A | Frontend Dev | P1 | 12A |
| 13B | Frontend Dev | P2 | 13A |
| 13C | Frontend Dev | P2 | 13A, 13B |
| 14A | Backend Dev | P0 | None |
| 14B | Backend Dev | P1 | None |
| 14C | Frontend Dev | P2 | 14A, 14B |
| 15A | Backend Dev | P0 | None |
| 15B | Frontend Dev | P2 | 15A |
| 15C | Frontend Dev | P2 | 15B |
| 16A | Backend Dev | P1 | 15A |
| 16B | Backend Dev | P1 | 16A |

**Parallel tracks:**
- Frontend: 12A → 12B → 12C → 12D → 13A → 13B → 13C → 14C → 15B → 15C
- Backend: 14A + 15A (parallel) → 14B → 16A → 16B
