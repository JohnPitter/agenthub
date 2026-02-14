# AgentHub — Plano de Implementação: Fases 6 e 7

## Contexto Geral

**Fases 1-5 completas.** O AgentHub está funcional de ponta a ponta:
- Agents executam tasks reais via Claude Agent SDK
- Review cycle completo (approve/reject com feedback)
- Real-time progress tracking e notifications
- Command palette, toasts, markdown rendering
- Dashboard com dados reais do banco

**O que falta:** Integração Git para versionar mudanças dos agents, criar branches por task, auto-commit após aprovação, e rastreamento de código modificado.

**Objetivo Fase 6:** Adicionar Git integration para:
1. Detectar repositórios Git nos projetos
2. Criar branches automáticas para tasks (`task/{id}-{title-slug}`)
3. Commit automático ou manual após task approval
4. UI mostrando git status, branches, commits
5. Audit trail completo de operações git

---

## Descobertas da Exploração

### Pontos de Integração Existentes

1. **Task Schema Ready:**
   - Campo `task.branch` existe mas **não é usado** (sempre null)
   - Campo `task.result` pode armazenar commit SHA
   - `taskLogs.action` flexível para "git_commit", "git_branch_created"
   - `taskLogs.detail` pode armazenar metadados (SHA, branch name)

2. **Review Cycle Perfeito:**
   - Transição `review → done` é aprovação do usuário (code review implícito)
   - Socket handler `user:approve_task` em `socket-handler.ts:106-109`
   - Momento ideal para auto-commit

3. **Event-Driven Architecture:**
   - EventBus já existe para `task:status`, `task:updated`
   - Pode adicionar `task:git_commit`, `integration:git_status`
   - Socket.io bridge automático para frontend

4. **Integrations Table:**
   - Suporta tipos "whatsapp", "telegram" → adicionar "git"
   - Campos: config (JSON), status, linkedAgentId
   - Pode armazenar: remoteUrl, defaultBranch, autoCommit preference

5. **File System Access:**
   - Agent SDK executa com `cwd: projectPath`
   - Bash tool disponível para agents
   - Pode executar `git` commands via `execFile`

### Constraints

- Sem biblioteca git (nodegit, simple-git) → usar CLI via `execFile`
- **Security:** Usar `execFile` ao invés de `exec` para prevenir command injection
- Agent permission modes podem bloquear Bash (precisa "bypassPermissions")
- Task.result é string simples (não JSON) → usar taskLogs para metadados estruturados

---

## Fase 6A: Git Detection & Repository Setup

**Objetivo:** Detectar .git nos projetos, inicializar se necessário, armazenar config git.

### Arquivos a criar:

#### `apps/orchestrator/src/lib/exec-file.ts`
```typescript
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function execFileNoThrow(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number }
): Promise<{ stdout: string; stderr: string; error?: Error }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options?.cwd,
      timeout: options?.timeout ?? 5000,
      maxBuffer: 1024 * 1024, // 1MB
    });
    return { stdout, stderr };
  } catch (error) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
```

- **Security:** Uses `execFile` instead of `exec` (prevents shell injection)
- Handles Windows compatibility automatically
- Proper error handling with structured output
- Timeout protection (default 5s)

#### `apps/orchestrator/src/git/git-service.ts`
```typescript
import { execFileNoThrow } from "../lib/exec-file.js";

export class GitService {
  async detectGitRepo(projectPath: string): Promise<boolean> {
    const result = await execFileNoThrow("git", ["rev-parse", "--git-dir"], { cwd: projectPath });
    return !result.error;
  }

  async initGitRepo(projectPath: string): Promise<void> {
    await execFileNoThrow("git", ["init"], { cwd: projectPath });
  }

  async getGitStatus(projectPath: string): Promise<GitStatus> {
    // git status --porcelain --branch
    // Parse output to extract staged/unstaged/untracked
  }

  async getCurrentBranch(projectPath: string): Promise<string> {
    const result = await execFileNoThrow("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: projectPath });
    return result.stdout.trim();
  }

  async getRemoteUrl(projectPath: string): Promise<string | null> {
    const result = await execFileNoThrow("git", ["config", "--get", "remote.origin.url"], { cwd: projectPath });
    return result.error ? null : result.stdout.trim();
  }

  async getLastCommit(projectPath: string): Promise<GitCommit | null> {
    // git log -1 --format=%H|%s|%an|%aI
    // Parse with | delimiter
  }
}

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: Date;
}
```

- Usa `execFileNoThrow` para executar git commands (safe from injection)
- Exemplo: `await execFileNoThrow("git", ["status", "--porcelain"], { cwd: projectPath })`
- Wrapper para `git status`, `git rev-parse`, `git log`, etc.
- Error handling para repos não inicializados
- Parse stdout com regex para extrair informações

#### `apps/orchestrator/src/routes/git.ts`
```typescript
import { Router } from "express";
import { db } from "@agenthub/database";
import { eq } from "drizzle-orm";
import { schema } from "@agenthub/database/schema";
import { GitService } from "../git/git-service.js";

const router = Router();
const gitService = new GitService();

router.get("/projects/:id/git/status", async (req, res) => {
  // GET git status for project
  // Returns: { isGitRepo, status: GitStatus | null }
  const project = await db.select().from(schema.projects)
    .where(eq(schema.projects.id, req.params.id)).get();

  const isGitRepo = await gitService.detectGitRepo(project.path);
  const status = isGitRepo ? await gitService.getGitStatus(project.path) : null;

  res.json({ isGitRepo, status });
});

router.post("/projects/:id/git/init", async (req, res) => {
  // POST initialize git repo
  // Creates .git, adds .gitignore, makes initial commit
  const project = await db.select().from(schema.projects)
    .where(eq(schema.projects.id, req.params.id)).get();

  await gitService.initGitRepo(project.path);
  res.json({ success: true });
});

router.get("/projects/:id/git/config", async (req, res) => {
  // GET git config from integrations table
  const integration = await db.select().from(schema.integrations)
    .where(eq(schema.integrations.projectId, req.params.id))
    .where(eq(schema.integrations.type, "git")).get();

  const config = integration ? JSON.parse(integration.config) : null;
  res.json(config);
});

router.put("/projects/:id/git/config", async (req, res) => {
  // PUT update git config
  // Saves to integrations table
  const { remoteUrl, defaultBranch, autoCommit, autoCreateBranch } = req.body;

  await db.insert(schema.integrations).values({
    id: crypto.randomUUID(),
    projectId: req.params.id,
    type: "git",
    status: "connected",
    config: JSON.stringify({ remoteUrl, defaultBranch, autoCommit, autoCreateBranch }),
  }).onConflictDoUpdate({
    target: [schema.integrations.projectId, schema.integrations.type],
    set: { config: JSON.stringify({ remoteUrl, defaultBranch, autoCommit, autoCreateBranch }) },
  });

  res.json({ success: true });
});

export { router as gitRouter };
```

### Arquivos a modificar:

#### `apps/orchestrator/src/index.ts`
- Importar e montar `gitRouter`:
```typescript
import { gitRouter } from "./routes/git.js";
app.use("/api", gitRouter);
```

#### `packages/database/src/schema/integrations.ts`
- Adicionar "git" ao enum `type`:
```typescript
type: text("type", { enum: ["whatsapp", "telegram", "git"] })
```
- Adicionar unique constraint por (projectId, type)
- Config structure documentation:
```typescript
// config JSON for type="git":
{
  remoteUrl?: string;
  defaultBranch: string; // "main" or "master"
  autoCommit: boolean;   // auto-commit on task approval
  autoCreateBranch: boolean; // auto-create branch on task assign
}
```

#### `apps/web/src/routes/project-settings.tsx`
- Substituir Git placeholder (lines 130-146)
- Fetch git status via `GET /api/projects/${id}/git/status`
- Se `!isGitRepo`: botão "Inicializar Repositório"
- Se `isGitRepo`: mostrar branch atual, commits ahead/behind, last commit
- Form para editar git config (remote URL, auto-commit toggle)

### Verificação:
- Projeto com .git → mostra status real
- Projeto sem .git → botão "Inicializar" cria repo
- Git config salva e carrega do banco
- Endpoint `/git/status` retorna dados corretos

---

## Fase 6B: Branch Management for Tasks

**Objetivo:** Criar branches automaticamente para tasks, popular `task.branch` field.

### Arquivos a modificar:

#### `apps/orchestrator/src/git/git-service.ts`
- Adicionar métodos:
```typescript
async createBranch(projectPath: string, branchName: string, baseBranch?: string): Promise<void> {
  if (baseBranch) {
    await execFileNoThrow("git", ["checkout", baseBranch], { cwd: projectPath });
  }
  await execFileNoThrow("git", ["checkout", "-b", branchName], { cwd: projectPath });
}

async checkoutBranch(projectPath: string, branchName: string): Promise<void> {
  await execFileNoThrow("git", ["checkout", branchName], { cwd: projectPath });
}

async branchExists(projectPath: string, branchName: string): Promise<boolean> {
  const result = await execFileNoThrow("git", ["rev-parse", "--verify", branchName], { cwd: projectPath });
  return !result.error;
}
```

#### `apps/orchestrator/src/agents/agent-manager.ts`
- No `assignTask()` (line 20-86):
  1. Gerar branch name: `task/${task.id}-${slugify(task.title)}`
  2. Verificar git config do projeto (integrations table)
  3. Se `autoCreateBranch === true`:
     - Criar branch via `gitService.createBranch()`
     - Checkout para a branch
     - Atualizar `task.branch` no banco
     - Log em taskLogs: `action="git_branch_created"`, `detail=branchName`
  4. Emitir event `task:git_branch` para frontend

#### `apps/orchestrator/src/lib/utils.ts`
- Adicionar função `slugify`:
```typescript
export function slugify(text: string, maxLength = 50): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, "");
}
```

#### `apps/orchestrator/src/routes/tasks.ts`
- Adicionar endpoint:
```typescript
router.post("/tasks/:id/git/branch", async (req, res) => {
  // POST create git branch for task (manual trigger)
  // Body: { branchName?: string } // optional override
  const task = await db.select().from(schema.tasks)
    .where(eq(schema.tasks.id, req.params.id)).get();

  const branchName = req.body.branchName || `task/${task.id}-${slugify(task.title)}`;

  const project = await db.select().from(schema.projects)
    .where(eq(schema.projects.id, task.projectId)).get();

  await gitService.createBranch(project.path, branchName);

  await db.update(schema.tasks).set({ branch: branchName })
    .where(eq(schema.tasks.id, req.params.id));

  res.json({ branchName });
});
```

#### `packages/shared/src/types/events.ts`
- Adicionar:
```typescript
export interface TaskGitBranchEvent {
  taskId: string;
  projectId: string;
  branchName: string;
  baseBranch: string;
}
```

#### `apps/orchestrator/src/realtime/event-bus.ts`
- Adicionar `"task:git_branch"` ao EventMap:
```typescript
"task:git_branch": TaskGitBranchEvent;
```

#### `apps/orchestrator/src/realtime/socket-handler.ts`
- Bridge `task:git_branch` para rooms:
```typescript
eventBus.on("task:git_branch", (data) => {
  io.to(`project:${data.projectId}`).emit("task:git_branch", data);
});
```

### Arquivos UI:

#### `apps/web/src/components/tasks/task-card.tsx`
- Se `task.branch`: mostrar badge com `GitBranch` icon + branch name
- Badge style: purple-light bg, purple text, rounded-lg

#### `apps/web/src/routes/project-tasks.tsx`
- Ouvir socket event `onTaskGitBranch`:
```typescript
const handleTaskGitBranch = (data: TaskGitBranchEvent) => {
  setTasks(prev => prev.map(t =>
    t.id === data.taskId ? { ...t, branch: data.branchName } : t
  ));
};
```

### Verificação:
- Task assigned com autoCreateBranch=true → branch criada, campo `task.branch` populado
- TaskCard mostra badge com branch name
- `git branch` no terminal confirma branch existe
- taskLogs registra `git_branch_created`

---

## Fase 6C: Commit Tracking & Auto-Commit

**Objetivo:** Commit automático quando task aprovada, ou dialog manual.

### Arquivos a modificar:

#### `apps/orchestrator/src/git/git-service.ts`
- Adicionar métodos:
```typescript
async stageAll(projectPath: string): Promise<void> {
  await execFileNoThrow("git", ["add", "."], { cwd: projectPath });
}

async commit(projectPath: string, message: string, author?: string): Promise<string> {
  const args = ["commit", "-m", message];
  if (author) {
    args.push("--author", author);
  }
  const result = await execFileNoThrow("git", args, { cwd: projectPath });

  // Extract SHA from commit output
  const shaResult = await execFileNoThrow("git", ["rev-parse", "HEAD"], { cwd: projectPath });
  return shaResult.stdout.trim();
}

async push(projectPath: string, branch: string, remote = "origin"): Promise<void> {
  await execFileNoThrow("git", ["push", remote, branch], { cwd: projectPath });
}

async getDiff(projectPath: string, staged = false): Promise<string> {
  const args = staged ? ["diff", "--staged"] : ["diff"];
  const result = await execFileNoThrow("git", args, { cwd: projectPath });
  return result.stdout;
}

async getChangedFiles(projectPath: string): Promise<string[]> {
  const result = await execFileNoThrow("git", ["status", "--porcelain"], { cwd: projectPath });
  return result.stdout.split("\n")
    .filter(line => line.trim())
    .map(line => line.substring(3));
}
```

#### `apps/orchestrator/src/realtime/socket-handler.ts`
- No handler `user:approve_task` (line 106-109):
```typescript
socket.on("user:approve_task", async ({ taskId }) => {
  await transitionTask(taskId, "done", undefined, "Approved by user");

  // Git auto-commit logic
  const task = await db.select().from(schema.tasks)
    .where(eq(schema.tasks.id, taskId)).get();

  const project = await db.select().from(schema.projects)
    .where(eq(schema.projects.id, task.projectId)).get();

  const gitConfig = await db.select().from(schema.integrations)
    .where(eq(schema.integrations.projectId, task.projectId))
    .where(eq(schema.integrations.type, "git")).get();

  if (gitConfig && JSON.parse(gitConfig.config).autoCommit) {
    const commitMessage = `feat(task-${task.id}): ${task.title}`;

    await gitService.stageAll(project.path);
    const commitSha = await gitService.commit(project.path, commitMessage);

    // Log commit in taskLogs
    await db.insert(schema.taskLogs).values({
      id: crypto.randomUUID(),
      taskId: task.id,
      agentId: task.assignedAgentId,
      action: "git_commit",
      fromStatus: null,
      toStatus: null,
      detail: commitSha,
      filePath: null,
      createdAt: new Date(),
    });

    // Update task.result
    await db.update(schema.tasks).set({
      result: `Committed as ${commitSha}`,
    }).where(eq(schema.tasks.id, taskId));

    // Emit event
    eventBus.emit("task:git_commit", {
      taskId: task.id,
      projectId: task.projectId,
      commitSha,
      commitMessage,
      branchName: task.branch || "main",
    });
  } else {
    // Emit ready-to-commit event
    const changedFiles = await gitService.getChangedFiles(project.path);
    eventBus.emit("task:ready_to_commit", {
      taskId: task.id,
      projectId: task.projectId,
      changedFiles,
    });
  }
});
```

#### `packages/shared/src/types/events.ts`
- Adicionar:
```typescript
export interface TaskGitCommitEvent {
  taskId: string;
  projectId: string;
  commitSha: string;
  commitMessage: string;
  branchName: string;
}

export interface TaskReadyToCommitEvent {
  taskId: string;
  projectId: string;
  changedFiles: string[];
}
```

#### `apps/orchestrator/src/realtime/event-bus.ts`
- Adicionar ao EventMap:
```typescript
"task:git_commit": TaskGitCommitEvent;
"task:ready_to_commit": TaskReadyToCommitEvent;
```

### Arquivos a criar:

#### `apps/web/src/components/tasks/task-commit-dialog.tsx`
```typescript
interface TaskCommitDialogProps {
  taskId: string;
  changedFiles: string[];
  defaultMessage: string;
  onCommit: (taskId: string, message: string) => void;
  onCancel: () => void;
}

export function TaskCommitDialog({ taskId, changedFiles, defaultMessage, onCommit, onCancel }: TaskCommitDialogProps) {
  const [message, setMessage] = useState(defaultMessage);
  const [showFiles, setShowFiles] = useState(false);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Commit Changes</h2>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} />

        <button onClick={() => setShowFiles(!showFiles)}>
          {showFiles ? "Hide" : "Show"} changed files ({changedFiles.length})
        </button>

        {showFiles && (
          <ul>
            {changedFiles.map(file => <li key={file}>{file}</li>)}
          </ul>
        )}

        <div className="actions">
          <button onClick={() => onCommit(taskId, message)}>Commit</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

#### `apps/web/src/hooks/use-socket.ts`
- Adicionar método:
```typescript
const commitTask = (taskId: string, message: string) => {
  socket?.emit("user:commit_task", { taskId, message });
};

return { ..., commitTask };
```

#### `apps/orchestrator/src/realtime/socket-handler.ts`
- Adicionar handler:
```typescript
socket.on("user:commit_task", async ({ taskId, message }) => {
  const task = await db.select().from(schema.tasks)
    .where(eq(schema.tasks.id, taskId)).get();

  const project = await db.select().from(schema.projects)
    .where(eq(schema.projects.id, task.projectId)).get();

  await gitService.stageAll(project.path);
  const commitSha = await gitService.commit(project.path, message);

  // Same logging as auto-commit
  await db.insert(schema.taskLogs).values({ ... });
  await db.update(schema.tasks).set({ result: `Committed as ${commitSha}` });

  eventBus.emit("task:git_commit", { ... });
});
```

### Arquivos UI:

#### `apps/web/src/components/tasks/task-card.tsx`
- Se task.status === "done" e `task.result?.includes("Committed as")`:
  - Extrair SHA via regex: `Committed as ([a-f0-9]+)`
  - Mostrar badge verde: `CheckCircle2` icon + "Committed {sha.slice(0,7)}"
- Se task.status === "done" e `readyToCommit` (state do parent):
  - Mostrar botão "Commit Changes" (verde outline)
  - onClick → abre TaskCommitDialog

#### `apps/web/src/routes/project-tasks.tsx`
- State: `readyToCommitTasks: Map<string, string[]>` (taskId → changedFiles)
- Ouvir socket `onTaskReadyToCommit`:
```typescript
const handleTaskReadyToCommit = (data: TaskReadyToCommitEvent) => {
  setReadyToCommitTasks(prev => new Map(prev).set(data.taskId, data.changedFiles));
};
```
- Ouvir socket `onTaskGitCommit`:
```typescript
const handleTaskGitCommit = (data: TaskGitCommitEvent) => {
  setReadyToCommitTasks(prev => {
    const next = new Map(prev);
    next.delete(data.taskId);
    return next;
  });
  setTasks(prev => prev.map(t =>
    t.id === data.taskId ? { ...t, result: `Committed as ${data.commitSha}` } : t
  ));
};
```

### Verificação:
- Task aprovada com autoCommit=true → commit criado, SHA no badge
- Task aprovada com autoCommit=false → botão "Commit Changes" aparece
- Click botão → dialog abre, permite editar message, commit funciona
- `git log` no terminal mostra commits com mensagens corretas
- taskLogs registra `git_commit` com SHA no detail

---

## Fase 6D: Git UI & Activity Log

**Objetivo:** UI completa de git no settings, activity log de operações git.

### Arquivos a modificar:

#### `apps/web/src/routes/project-settings.tsx`
- Seção Git (substituir placeholder lines 130-146):

**Git Status Card:**
- Ícone: GitBranch (purple)
- Se `!isGitRepo`:
  - Texto: "Repositório Git não inicializado"
  - Botão: "Inicializar Git" → chama `POST /api/projects/${id}/git/init`
- Se `isGitRepo`:
  - Current branch badge (purple): `<Badge>{status.branch}</Badge>`
  - Commits ahead/behind (se remote configurado): "↑ {ahead} ↓ {behind}"
  - Last commit info:
    - SHA (7 chars): `{lastCommit.sha.slice(0, 7)}`
    - Message: `{lastCommit.message}`
    - Author + time: `{lastCommit.author} · {formatRelativeTime(lastCommit.date)}`
  - Uncommitted changes count:
    - Badge vermelho se `status.staged.length + status.unstaged.length + status.untracked.length > 0`
    - Texto: "{count} arquivos modificados"

**Git Configuration Card:**
- Form com campos:
  - Remote URL: `<input type="text" value={config.remoteUrl} />`
  - Default branch: `<select><option>main</option><option>master</option></select>`
  - Toggle "Auto-create branch for tasks": `<ToggleSwitch checked={config.autoCreateBranch} />`
  - Toggle "Auto-commit on task approval": `<ToggleSwitch checked={config.autoCommit} />`
- Botão "Salvar Configurações" → chama `PUT /api/projects/${id}/git/config`

#### `apps/web/src/routes/project-board.tsx`
- Activity Feed: adicionar git events
- Quando `onTaskGitBranch`:
  ```typescript
  addActivity({
    id: crypto.randomUUID(),
    agentId: data.agentId,
    action: "git_branch_created",
    detail: `Branch criada: ${data.branchName}`,
    timestamp: new Date(),
  });
  ```
- Quando `onTaskGitCommit`:
  ```typescript
  addActivity({
    id: crypto.randomUUID(),
    agentId: data.agentId,
    action: "git_commit",
    detail: `Commit criado: ${data.commitSha.slice(0, 7)} - ${data.commitMessage}`,
    timestamp: new Date(),
  });
  ```

#### `apps/web/src/components/board/activity-item.tsx`
- Adicionar cases para `action === "git_branch_created"` e `action === "git_commit"`:
```typescript
const iconMap = {
  ...existingIcons,
  git_branch_created: GitBranch,
  git_commit: GitCommit,
};

const colorMap = {
  ...existingColors,
  git_branch_created: "purple",
  git_commit: "green",
};
```

### Arquivos a criar:

#### `apps/web/src/hooks/use-git-status.ts`
```typescript
import { useState, useEffect } from "react";
import { api } from "../lib/utils";

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: Date;
}

export function useGitStatus(projectId: string | undefined) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [lastCommit, setLastCommit] = useState<GitCommit | null>(null);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    fetchGitStatus();
  }, [projectId]);

  const fetchGitStatus = async () => {
    const data = await api(`/projects/${projectId}/git/status`);
    setIsGitRepo(data.isGitRepo);
    setStatus(data.status);
    setLastCommit(data.lastCommit);
    setLoading(false);
  };

  const initRepo = async () => {
    await api(`/projects/${projectId}/git/init`, { method: "POST" });
    await fetchGitStatus();
  };

  const updateConfig = async (config: GitConfig) => {
    await api(`/projects/${projectId}/git/config`, {
      method: "PUT",
      body: JSON.stringify(config),
    });
  };

  return {
    status,
    lastCommit,
    isGitRepo,
    loading,
    initRepo,
    updateConfig,
    refresh: fetchGitStatus,
  };
}
```

### Verificação:
- Settings page mostra git status real (branch, commits, changes)
- Botão "Inicializar Git" cria .git e atualiza UI
- Git config save/load funciona
- Activity feed mostra git operations com ícones corretos
- Toggles controlam auto-create branch e auto-commit

---

## Ordem de Execução

```
6A (Git Detection & Setup)       → prioridade 1 (base para tudo)
6B (Branch Management)           → prioridade 2 (depende de 6A para GitService)
6C (Commit Tracking)             → prioridade 3 (depende de 6A+6B)
6D (Git UI & Activity Log)       → prioridade 4 (depende de 6A para status, 6B+6C para events)
```

Cada sub-fase termina com builds limpos + testes manuais com projeto real.

---

## Arquivos Críticos (Referência)

### Orchestrator:
- `apps/orchestrator/src/agents/agent-manager.ts` — Task assignment (adicionar branch creation)
- `apps/orchestrator/src/realtime/socket-handler.ts` — Approve handler (adicionar auto-commit)
- `apps/orchestrator/src/tasks/task-lifecycle.ts` — Transition logic (sem mudanças)
- `apps/orchestrator/src/index.ts` — Montar git router

### Frontend:
- `apps/web/src/routes/project-settings.tsx` — Substituir git placeholder
- `apps/web/src/components/tasks/task-card.tsx` — Branch badge, commit badge
- `apps/web/src/routes/project-board.tsx` — Git events no activity feed
- `apps/web/src/hooks/use-socket.ts` — Adicionar commitTask method

### Database:
- `packages/database/src/schema/integrations.ts` — Adicionar "git" type
- `packages/database/src/schema/tasks.ts` — Campo `branch` já existe (popular)
- `packages/database/src/schema/task-logs.ts` — Usar action="git_*" (já flexível)

### Shared:
- `packages/shared/src/types/events.ts` — Adicionar TaskGitBranchEvent, TaskGitCommitEvent

---

## Verificação Final Fase 6

1. **Git Detection:**
   - Projeto com .git → status aparece corretamente
   - Projeto sem .git → botão init cria repositório
   - Git config salva e carrega (remote, auto-commit, auto-branch)

2. **Branch Management:**
   - Task assigned → branch `task/{id}-{slug}` criada automaticamente (se config enabled)
   - TaskCard mostra badge com branch name
   - `git branch` confirma branch existe

3. **Auto-Commit:**
   - Task aprovada com autoCommit=true → commit criado com SHA
   - Task aprovada com autoCommit=false → botão "Commit Changes"
   - Commit message editável via dialog
   - taskLogs registra todas operações git

4. **UI Integration:**
   - Settings page mostra git status completo
   - Activity feed mostra git operations
   - Branch/commit badges nos task cards
   - Toasts para sucesso/erro de git operations

5. **Builds:**
   - `pnpm --filter web build` — limpo
   - `pnpm --filter orchestrator build` — limpo
   - `pnpm --filter database build` — limpo (migrations se necessário)

6. **CHANGELOG.md:**
   - Atualizado com v0.6.0 e sub-fases 6A-6D

---

## Considerações Técnicas

### Git CLI via execFile:
- **Security:** `execFile` previne command injection (args separados)
- Parse output via regex para extrair info (branch, SHA, status)
- Error handling: repositório não inicializado, branch não existe, merge conflicts
- Timeout protection: 5s default, ajustável

### Permission Mode:
- GitService precisa executar git commands (sem shell injection risk)
- Se agent.permissionMode === "acceptEdits", user approva changes
- Git operations automáticas (branch/commit) são "system" level

### Transaction Safety:
- Operações git devem ser idempotent
- Se commit falha, não marcar task como "done"
- Rollback: manter task em "review", log error, notify user via toast

### Remote Push (Opcional):
- Push automático pode ser adicionado na 6C (método já existe)
- Requer autenticação (SSH keys ou tokens)
- Pode ser feature flag: `autoPush: boolean` no git config
- **Decisão:** deixar push manual para Fase 7 ou como enhancement

### Branch Naming Convention:
- Default: `task/{id}-{title-slug}`
- Slug: lowercase, replace spaces/special chars com `-`, max 50 chars
- Se branch já existe: append `-v2`, `-v3` (retry logic)

### Commit Message Format:
- Default: `"feat(task-${id}): ${title}"`
- Conventional Commits style
- Pode incluir task description no body (opcional)

---

## Dependências Novas

### Orchestrator:
Nenhuma — usa git CLI nativo via `child_process.execFile`

### Frontend:
Nenhuma — usa APIs REST e Socket.io existentes

---

## Migration (Se necessário)

Se houver mudanças no schema de `integrations`:
- Adicionar unique constraint: `(projectId, type)`
- SQLite suporta via drizzle migration

Não é necessário migration para outros schemas — campos existentes suportam git integration.

---
---

# Fase 7: Git Remote Push & Sync

## Contexto

**Fase 6 completa!** Git integration local está funcionando:
- ✅ Detecção e inicialização de repositórios
- ✅ Auto-criação de branches por task
- ✅ Auto-commit e commit manual
- ✅ Activity feed com operações git
- ✅ Git config armazenado no banco

**O que falta:** Sincronização com git remotes (GitHub, GitLab, Bitbucket, etc.) para:
1. Push de branches e commits para remote
2. Pull/fetch para sincronizar com equipe
3. Gerenciamento de credenciais (SSH/HTTPS)
4. Detecção de conflitos e divergências
5. UI mostrando status remoto (ahead/behind)

**Objetivo Fase 7:** Adicionar Git remote operations para:
1. Configurar remote URL e credenciais
2. Push automático ou manual após commit
3. Pull/fetch com merge/rebase options
4. Detecção de conflitos e avisos ao usuário
5. UI mostrando remote status e operações

---

## Descobertas da Base Existente

### O que já existe (Fase 6):

1. **GitService completo:**
   - `push(projectPath, branch, remote)` já existe mas não é chamado
   - `execFileNoThrow` para todas operações git
   - `getRemoteUrl()` já implementado
   - Todas operações usam security best practices (execFile, no shell injection)

2. **Git Config no Banco:**
   - `integrations` table com type="git"
   - Config JSON: `{ remoteUrl, defaultBranch, autoCommit, autoCreateBranch }`
   - Pode adicionar: `autoPush, credentials, pushOnCommit`

3. **Event System:**
   - EventBus para internal events
   - Socket.io para real-time updates
   - Pode adicionar: `task:git_push`, `task:git_pull`, `git:conflict`

4. **Error Handling:**
   - Logger estruturado
   - Toast notifications para usuário
   - Task logs para audit trail

### O que precisa adicionar:

1. **Credential Storage:**
   - SSH keys: path para private key file (~/.ssh/id_rsa)
   - HTTPS: Personal Access Tokens (encrypted storage)
   - Método de autenticação configurável (ssh vs https)

2. **Push Operations:**
   - Auto-push após commit (flag `pushOnCommit`)
   - Manual push button na UI
   - Push specific branch or all branches
   - Force push warnings (nunca em main/master)

3. **Pull/Fetch Operations:**
   - Fetch remote status (ahead/behind)
   - Pull com merge strategy (merge vs rebase)
   - Conflito detection antes de pull
   - Stash changes se houver uncommitted work

4. **Remote Status UI:**
   - Mostrar ahead/behind em git status card
   - Lista de remote branches
   - Sync button para pull + push
   - Status indicators (up-to-date, diverged, behind, ahead)

---

## Fase 7A: Credential Management & Remote Config

**Objetivo:** Armazenar credenciais git de forma segura, configurar remotes.

### Arquivos a modificar:

#### `packages/database/src/schema/integrations.ts`
- Adicionar campo `credentials` (TEXT, encrypted):
```typescript
export const integrations = sqliteTable("integrations", {
  // ... existing fields
  credentials: text("credentials"), // Encrypted JSON { type: "ssh" | "https", sshKeyPath?: string, token?: string }
});
```

- Config JSON structure atualizada:
```typescript
// config JSON for type="git":
{
  remoteUrl: string;           // e.g. "git@github.com:user/repo.git"
  defaultBranch: string;        // "main" or "master"
  autoCommit: boolean;
  autoCreateBranch: boolean;
  pushOnCommit: boolean;        // NEW: auto-push after commit
  authMethod: "ssh" | "https";  // NEW: authentication method
}

// credentials JSON (encrypted):
{
  type: "ssh" | "https";
  sshKeyPath?: string;          // e.g. "/Users/user/.ssh/id_rsa"
  token?: string;               // Personal Access Token for HTTPS
  username?: string;            // For HTTPS auth
}
```

#### `apps/orchestrator/src/lib/encryption.ts` (CRIAR)
- Encryption/decryption utilities para credentials:
```typescript
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(KEY, "hex"), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  const [ivHex, authTagHex, encryptedText] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(KEY, "hex"), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
```

**Security Notes:**
- `ENCRYPTION_KEY` deve ser env var (32 bytes hex)
- Usar AES-256-GCM (authenticated encryption)
- IV aleatório para cada encryption
- **Nunca** logar credentials decrypted

#### `apps/orchestrator/src/git/git-service.ts`
- Adicionar métodos para remote operations:
```typescript
async addRemote(projectPath: string, remoteUrl: string, remoteName = "origin"): Promise<void> {
  await execFileNoThrow("git", ["remote", "add", remoteName, remoteUrl], { cwd: projectPath });
}

async setRemoteUrl(projectPath: string, remoteUrl: string, remoteName = "origin"): Promise<void> {
  await execFileNoThrow("git", ["remote", "set-url", remoteName, remoteUrl], { cwd: projectPath });
}

async fetch(projectPath: string, remote = "origin"): Promise<void> {
  await execFileNoThrow("git", ["fetch", remote], { cwd: projectPath, timeout: 30000 });
}

async getRemoteBranches(projectPath: string, remote = "origin"): Promise<string[]> {
  const result = await execFileNoThrow("git", ["branch", "-r"], { cwd: projectPath });
  return result.stdout.split("\n")
    .filter(line => line.trim())
    .map(line => line.trim().replace(`${remote}/`, ""));
}

async getAheadBehind(projectPath: string, branch: string, remote = "origin"): Promise<{ ahead: number; behind: number }> {
  const result = await execFileNoThrow(
    "git",
    ["rev-list", "--left-right", "--count", `${branch}...${remote}/${branch}`],
    { cwd: projectPath }
  );

  if (result.error) return { ahead: 0, behind: 0 };

  const [ahead, behind] = result.stdout.trim().split("\t").map(Number);
  return { ahead: ahead || 0, behind: behind || 0 };
}
```

- Modificar método `push` para aceitar credentials:
```typescript
async push(
  projectPath: string,
  branch: string,
  remote = "origin",
  credentials?: { type: "ssh" | "https"; sshKeyPath?: string; token?: string; username?: string }
): Promise<void> {
  const env: Record<string, string> = { ...process.env };

  if (credentials?.type === "ssh" && credentials.sshKeyPath) {
    // Use SSH key
    env.GIT_SSH_COMMAND = `ssh -i ${credentials.sshKeyPath} -o StrictHostKeyChecking=no`;
  } else if (credentials?.type === "https" && credentials.token) {
    // Inject token into URL (https://<token>@github.com/user/repo.git)
    const remoteUrlResult = await this.getRemoteUrl(projectPath);
    if (remoteUrlResult) {
      const urlWithToken = remoteUrlResult.replace("https://", `https://${credentials.token}@`);
      await execFileNoThrow("git", ["remote", "set-url", remote, urlWithToken], { cwd: projectPath });
    }
  }

  const result = await execFileNoThrow("git", ["push", remote, branch], { cwd: projectPath, timeout: 60000 });

  if (result.error) {
    throw new Error(`Push failed: ${result.stderr}`);
  }
}
```

#### `apps/orchestrator/src/routes/git.ts`
- Adicionar endpoints para credentials e remote operations:
```typescript
router.put("/projects/:id/git/credentials", async (req, res) => {
  // PUT save credentials (encrypted)
  const { type, sshKeyPath, token, username } = req.body;

  const credentials = JSON.stringify({ type, sshKeyPath, token, username });
  const encrypted = encrypt(credentials);

  await db.update(schema.integrations)
    .set({ credentials: encrypted })
    .where(and(
      eq(schema.integrations.projectId, req.params.id),
      eq(schema.integrations.type, "git")
    ));

  res.json({ success: true });
});

router.post("/projects/:id/git/remote/add", async (req, res) => {
  // POST add/update remote
  const { remoteUrl } = req.body;
  const project = await db.select().from(schema.projects)
    .where(eq(schema.projects.id, req.params.id)).get();

  const hasRemote = await gitService.getRemoteUrl(project.path);

  if (hasRemote) {
    await gitService.setRemoteUrl(project.path, remoteUrl);
  } else {
    await gitService.addRemote(project.path, remoteUrl);
  }

  res.json({ success: true });
});

router.get("/projects/:id/git/remote/branches", async (req, res) => {
  // GET list remote branches
  const project = await db.select().from(schema.projects)
    .where(eq(schema.projects.id, req.params.id)).get();

  await gitService.fetch(project.path);
  const branches = await gitService.getRemoteBranches(project.path);

  res.json({ branches });
});
```

### Arquivos UI:

#### `apps/web/src/routes/project-settings.tsx`
- Adicionar seção "Credentials" no Git Configuration Card:
```typescript
<div className="credential-section">
  <label>Authentication Method</label>
  <select value={authMethod} onChange={(e) => setAuthMethod(e.target.value)}>
    <option value="ssh">SSH Key</option>
    <option value="https">HTTPS (Token)</option>
  </select>

  {authMethod === "ssh" && (
    <input
      type="text"
      placeholder="Path to SSH private key (e.g., ~/.ssh/id_rsa)"
      value={sshKeyPath}
      onChange={(e) => setSshKeyPath(e.target.value)}
    />
  )}

  {authMethod === "https" && (
    <>
      <input
        type="text"
        placeholder="Username (optional)"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Personal Access Token"
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />
    </>
  )}

  <button onClick={saveCredentials}>Save Credentials</button>
</div>
```

### Verificação:
- Credentials salvos encrypted no banco
- Remote URL configurado em .git/config
- `git remote -v` mostra origin correto
- Encryption/decryption funciona corretamente
- UI permite escolher SSH vs HTTPS

---

## Fase 7B: Push Operations

**Objetivo:** Push branches e commits para remote, auto-push opcional.

### Arquivos a modificar:

#### `apps/orchestrator/src/realtime/socket-handler.ts`
- Modificar `user:commit_task` handler para incluir auto-push:
```typescript
socket.on("user:commit_task", async ({ taskId, message }) => {
  // ... existing commit logic ...

  const commitSha = await gitService.commit(project.path, message);

  // Auto-push logic
  const gitConfig = await db.select().from(schema.integrations)
    .where(and(
      eq(schema.integrations.projectId, task.projectId),
      eq(schema.integrations.type, "git")
    )).get();

  if (gitConfig && JSON.parse(gitConfig.config).pushOnCommit) {
    try {
      const credentials = gitConfig.credentials
        ? JSON.parse(decrypt(gitConfig.credentials))
        : undefined;

      await gitService.push(project.path, task.branch || "main", "origin", credentials);

      eventBus.emit("task:git_push", {
        taskId: task.id,
        projectId: task.projectId,
        branchName: task.branch || "main",
        commitSha,
        remote: "origin",
      });
    } catch (error) {
      logger.error(`Push failed for task ${taskId}: ${error}`, "socket-handler");
      eventBus.emit("task:git_push_error", {
        taskId: task.id,
        projectId: task.projectId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
});
```

- Adicionar handler para manual push:
```typescript
socket.on("user:push_task", async ({ taskId }) => {
  const task = await db.select().from(schema.tasks)
    .where(eq(schema.tasks.id, taskId)).get();

  const project = await db.select().from(schema.projects)
    .where(eq(schema.projects.id, task.projectId)).get();

  const gitConfig = await db.select().from(schema.integrations)
    .where(and(
      eq(schema.integrations.projectId, task.projectId),
      eq(schema.integrations.type, "git")
    )).get();

  if (!gitConfig) {
    throw new Error("Git integration not configured");
  }

  const credentials = gitConfig.credentials
    ? JSON.parse(decrypt(gitConfig.credentials))
    : undefined;

  try {
    await gitService.push(project.path, task.branch || "main", "origin", credentials);

    eventBus.emit("task:git_push", {
      taskId: task.id,
      projectId: task.projectId,
      branchName: task.branch || "main",
      commitSha: "", // Will be fetched if needed
      remote: "origin",
    });
  } catch (error) {
    eventBus.emit("task:git_push_error", {
      taskId: task.id,
      projectId: task.projectId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
```

#### `packages/shared/src/types/events.ts`
- Adicionar eventos:
```typescript
export interface TaskGitPushEvent {
  taskId: string;
  projectId: string;
  branchName: string;
  commitSha: string;
  remote: string;
}

export interface TaskGitPushErrorEvent {
  taskId: string;
  projectId: string;
  error: string;
}
```

#### `apps/orchestrator/src/realtime/event-bus.ts`
- Adicionar ao EventMap:
```typescript
"task:git_push": TaskGitPushEvent;
"task:git_push_error": TaskGitPushErrorEvent;
```

### Arquivos UI:

#### `apps/web/src/components/tasks/task-card.tsx`
- Adicionar botão "Push to Remote" se task committed mas não pushed:
```typescript
{task.branch && task.result?.includes("Committed as") && !isPushed(task) && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onPush(task.id);
    }}
    className="push-button"
  >
    <Upload className="h-3 w-3" />
    Push
  </button>
)}
```

#### `apps/web/src/hooks/use-socket.ts`
- Adicionar método:
```typescript
const pushTask = (taskId: string) => {
  socket?.emit("user:push_task", { taskId });
};

return { ..., pushTask };
```

#### `apps/web/src/routes/project-board.tsx`
- Ouvir socket events:
```typescript
onTaskGitPush: (data) => {
  addActivity({
    action: "git_push",
    detail: `Push: ${data.branchName} → ${data.remote}`,
    timestamp: Date.now(),
  });
},
onTaskGitPushError: (data) => {
  toast.error(`Push failed: ${data.error}`);
},
```

### Verificação:
- Task committed → botão "Push" aparece
- Click push → branch sobe para remote
- Auto-push funciona se enabled
- Errors mostrados como toast
- Activity feed registra pushes
- `git log origin/<branch>` mostra commits remotos

---

## Fase 7C: Pull/Fetch & Sync

**Objetivo:** Pull changes do remote, detectar conflitos, sincronizar.

### Arquivos a modificar:

#### `apps/orchestrator/src/git/git-service.ts`
- Adicionar métodos pull/merge:
```typescript
async pull(projectPath: string, remote = "origin", branch?: string): Promise<{ success: boolean; conflicts: boolean }> {
  const currentBranch = branch || await this.getCurrentBranch(projectPath);

  const result = await execFileNoThrow(
    "git",
    ["pull", remote, currentBranch],
    { cwd: projectPath, timeout: 60000 }
  );

  if (result.error) {
    // Check if it's a conflict
    const conflicts = result.stderr.includes("CONFLICT") || result.stderr.includes("Merge conflict");
    return { success: false, conflicts };
  }

  return { success: true, conflicts: false };
}

async hasUncommittedChanges(projectPath: string): Promise<boolean> {
  const result = await execFileNoThrow("git", ["status", "--porcelain"], { cwd: projectPath });
  return result.stdout.trim().length > 0;
}

async stash(projectPath: string, message = "Auto-stash before pull"): Promise<void> {
  await execFileNoThrow("git", ["stash", "push", "-m", message], { cwd: projectPath });
}

async stashPop(projectPath: string): Promise<void> {
  await execFileNoThrow("git", ["stash", "pop"], { cwd: projectPath });
}

async getConflictedFiles(projectPath: string): Promise<string[]> {
  const result = await execFileNoThrow("git", ["diff", "--name-only", "--diff-filter=U"], { cwd: projectPath });
  return result.stdout.split("\n").filter(line => line.trim());
}
```

#### `apps/orchestrator/src/routes/git.ts`
- Adicionar endpoint para sync:
```typescript
router.post("/projects/:id/git/sync", async (req, res) => {
  // POST sync with remote (fetch + pull)
  const project = await db.select().from(schema.projects)
    .where(eq(schema.projects.id, req.params.id)).get();

  // Check for uncommitted changes
  const hasChanges = await gitService.hasUncommittedChanges(project.path);

  if (hasChanges) {
    await gitService.stash(project.path);
  }

  // Fetch latest
  await gitService.fetch(project.path);

  // Pull with merge
  const pullResult = await gitService.pull(project.path);

  if (hasChanges && pullResult.success) {
    await gitService.stashPop(project.path);
  }

  if (pullResult.conflicts) {
    const conflictedFiles = await gitService.getConflictedFiles(project.path);
    res.json({
      success: false,
      conflicts: true,
      conflictedFiles,
    });
  } else {
    res.json({ success: true, conflicts: false });
  }
});
```

### Arquivos UI:

#### `apps/web/src/routes/project-settings.tsx`
- Adicionar botão "Sync with Remote" no Git Status Card:
```typescript
<button onClick={handleSync} className="sync-button">
  <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
  Sync with Remote
</button>
```

- Handler:
```typescript
const handleSync = async () => {
  setSyncing(true);
  try {
    const result = await api(`/projects/${id}/git/sync`, { method: "POST" });

    if (result.conflicts) {
      toast.error(`Merge conflicts in ${result.conflictedFiles.length} files`);
      // Show conflict dialog
    } else {
      toast.success("Synced with remote successfully");
      refreshGitStatus();
    }
  } catch (error) {
    toast.error("Sync failed");
  } finally {
    setSyncing(false);
  }
};
```

### Verificação:
- Sync button puxa changes do remote
- Uncommitted changes são stashed automaticamente
- Conflitos detectados e mostrados ao usuário
- `git log` mostra commits do remote merged
- Activity feed registra sync operations

---

## Fase 7D: Remote Status UI & Polish

**Objetivo:** UI completa mostrando status remoto, ahead/behind, polish.

### Arquivos a modificar:

#### `apps/orchestrator/src/routes/git.ts`
- Modificar endpoint `/git/status` para incluir remote status:
```typescript
router.get("/projects/:id/git/status", async (req, res) => {
  const project = await db.select().from(schema.projects)
    .where(eq(schema.projects.id, req.params.id)).get();

  const isGitRepo = await gitService.detectGitRepo(project.path);

  if (!isGitRepo) {
    return res.json({ isGitRepo: false, status: null, remoteStatus: null });
  }

  const status = await gitService.getGitStatus(project.path);
  const remoteUrl = await gitService.getRemoteUrl(project.path);

  let remoteStatus = null;
  if (remoteUrl) {
    try {
      await gitService.fetch(project.path);
      const aheadBehind = await gitService.getAheadBehind(project.path, status.branch);
      const remoteBranches = await gitService.getRemoteBranches(project.path);

      remoteStatus = {
        remoteUrl,
        ahead: aheadBehind.ahead,
        behind: aheadBehind.behind,
        remoteBranches,
      };
    } catch (error) {
      logger.warn(`Failed to fetch remote status: ${error}`, "git-routes");
    }
  }

  const lastCommit = await gitService.getLastCommit(project.path);

  res.json({ isGitRepo, status, remoteStatus, lastCommit });
});
```

### Arquivos UI:

#### `apps/web/src/routes/project-settings.tsx`
- Atualizar Git Status Card para mostrar remote status:
```typescript
{remoteStatus && (
  <div className="remote-status">
    <div className="remote-url">
      <GitBranch className="h-4 w-4" />
      <span>{remoteStatus.remoteUrl}</span>
    </div>

    {(remoteStatus.ahead > 0 || remoteStatus.behind > 0) && (
      <div className="ahead-behind">
        {remoteStatus.ahead > 0 && (
          <span className="ahead">↑ {remoteStatus.ahead} ahead</span>
        )}
        {remoteStatus.behind > 0 && (
          <span className="behind">↓ {remoteStatus.behind} behind</span>
        )}
      </div>
    )}

    {remoteStatus.ahead === 0 && remoteStatus.behind === 0 && (
      <span className="up-to-date">
        <CheckCircle2 className="h-3 w-3" />
        Up to date
      </span>
    )}
  </div>
)}
```

#### `apps/web/src/components/board/activity-item.tsx`
- Adicionar ícones para git push:
```typescript
const ACTION_ICONS: Record<string, typeof Activity> = {
  // ... existing
  git_push: Upload,
};

const ACTION_COLORS: Record<string, string> = {
  // ... existing
  git_push: "#3b82f6", // blue
};
```

### Verificação Final Fase 7:

1. **Credentials:**
   - SSH keys e tokens salvos encrypted
   - Auth method selecionável (SSH vs HTTPS)
   - Credentials nunca logados em plain text

2. **Push Operations:**
   - Auto-push funciona após commit
   - Manual push button funcional
   - Errors tratados e mostrados
   - Activity feed registra pushes

3. **Pull/Sync:**
   - Sync button puxa changes do remote
   - Stash automático de uncommitted work
   - Conflitos detectados e exibidos
   - Merge bem-sucedido atualiza local

4. **Remote Status UI:**
   - Ahead/behind mostrado corretamente
   - Remote URL exibido
   - "Up to date" badge quando synced
   - Remote branches listados

5. **Builds:**
   - `pnpm --filter orchestrator build` — limpo
   - `pnpm --filter web build` — limpo
   - Todas operações git testadas end-to-end

---

## Ordem de Execução Fase 7

```
7A (Credentials & Remote Config)  → prioridade 1 (base para push/pull)
7B (Push Operations)              → prioridade 2 (depende de 7A para credentials)
7C (Pull/Sync)                    → prioridade 3 (depende de 7A+7B)
7D (Remote Status UI)             → prioridade 4 (polish, depende de 7A-7C)
```

---

## Security Considerations Fase 7

1. **Credential Storage:**
   - AES-256-GCM encryption para credentials
   - ENCRYPTION_KEY em env var (nunca hardcoded)
   - IV aleatório para cada encryption
   - Auth tag para integrity check

2. **Git Operations:**
   - Timeouts maiores para network ops (30s-60s)
   - Error handling para auth failures
   - Nunca logar credentials decrypted
   - SSH strict host key checking disabled (controlled env)

3. **Token Injection:**
   - HTTPS tokens injetados em URL temporariamente
   - URL resetado após push
   - Tokens nunca logados ou expostos em stderr

4. **Force Push Protection:**
   - Nunca force push em main/master
   - Warning ao usuário antes de force push
   - Bloqueio hard-coded para branches protegidas

---

## Dependências Novas Fase 7

### Orchestrator:
- Nenhuma — usa Node.js `crypto` nativo para encryption

### Frontend:
- Ícone novo: `Upload` (lucide-react) para push operations

---

## Migration Fase 7

### Database Schema:
- Adicionar coluna `credentials` em `integrations` table:
```sql
ALTER TABLE integrations ADD COLUMN credentials TEXT;
```

- Ou usar Drizzle migration:
```typescript
export default {
  up: async (db) => {
    await db.schema.alterTable("integrations").addColumn("credentials", "text");
  },
  down: async (db) => {
    await db.schema.alterTable("integrations").dropColumn("credentials");
  },
};
```

---

## CHANGELOG Update Fase 7

Adicionar ao CHANGELOG.md:

```markdown
## [0.7.0] - 2026-02-14

### Fase 7: Git Remote Push & Sync

#### Fase 7A: Credential Management & Remote Config

##### Added
- Encrypted credential storage in `integrations` table
- `apps/orchestrator/src/lib/encryption.ts` for AES-256-GCM encryption/decryption
- SSH key and HTTPS token authentication support
- Remote configuration UI in project settings

##### Changed
- `apps/orchestrator/src/git/git-service.ts` — Added credential injection for push operations

#### Fase 7B: Push Operations

##### Added
- Auto-push after commit (configurable via `pushOnCommit` flag)
- Manual push button in task cards
- `task:git_push` and `task:git_push_error` events

##### Changed
- `apps/orchestrator/src/realtime/socket-handler.ts` — Added `user:push_task` handler

#### Fase 7C: Pull/Fetch & Sync

##### Added
- Sync button in project settings to pull from remote
- Auto-stash uncommitted changes before pull
- Conflict detection and warning dialogs

##### Changed
- `apps/orchestrator/src/git/git-service.ts` — Added pull, stash, conflict detection methods

#### Fase 7D: Remote Status UI & Polish

##### Added
- Ahead/behind indicators in git status card
- Remote URL display
- "Up to date" badge when synced
- Upload icon for push operations in activity feed
```
