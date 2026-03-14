# Plano: Gestão de Armazenamento + Isolamento por Usuário

**Data:** 2026-03-14
**Fase:** 19 — Storage Management
**Complexidade:** Complexa (multi-package, novo service, migration, frontend)

---

## Objetivo

Resolver os problemas de armazenamento quando múltiplos usuários importam projetos do GitHub:

1. **Isolamento por usuário** — cada user tem seu diretório `repos/<userId>/`
2. **Shallow clones** — `--depth 1` por padrão para economizar ~70-90% de espaço
3. **Cotas por plano** — limitar espaço em disco e número de projetos por plano (free/pro/enterprise)
4. **Cleanup automático (TTL)** — projetos inativos há X dias têm clone local removido
5. **Monitoramento de uso** — endpoint para consultar storage usado vs. cota

---

## Estado Atual

### Problemas identificados:
- `REPOS_DIR` = `~/.agenthub/repos/` — flat, sem separação por user
- `git clone` sem `--depth 1` — histórico completo sempre
- Sem verificação de cota antes de clonar
- Sem cleanup de repos inativos
- `projects.ownerId` existe no schema mas **não é populado** nos endpoints `create` e `import`
- `plans.maxProjects` existe mas **não é verificado** antes de criar projeto
- Clone duplicado em 3 lugares: `projects.ts:cloneGitHubRepo()`, `git.ts:POST init`, `agent-manager.ts:autoCloneProject()`

### O que já existe:
- `storage.ts` com `STORAGE_BASE` e `REPOS_DIR`
- `users.planId` — referência ao plano do usuário
- `plans.maxProjects` — limite de projetos por plano
- `projects.ownerId` — campo para associar projeto ao usuário
- Auth middleware com `req.user.userId`

---

## Arquivos Afetados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `packages/database/src/schema/plans.ts` | **Modificar** | Adicionar `maxStorageMb`, `repoTtlDays` |
| `packages/database/src/schema/projects.ts` | **Modificar** | Adicionar `lastAccessedAt`, `diskSizeMb`, `isShallowClone` |
| `apps/orchestrator/src/lib/storage.ts` | **Modificar** | Adicionar `userReposDir()`, `getDirectorySize()`, `getUserStorageUsage()` |
| `apps/orchestrator/src/services/storage-service.ts` | **Criar** | Service de gestão de storage: cotas, cleanup, métricas |
| `apps/orchestrator/src/routes/projects.ts` | **Modificar** | Isolar por userId, verificar cotas, shallow clone, popular `ownerId` |
| `apps/orchestrator/src/routes/git.ts` | **Modificar** | Usar `userReposDir()` no clone do `git/init` |
| `apps/orchestrator/src/agents/agent-manager.ts` | **Modificar** | Usar `userReposDir()` no `autoCloneProject()` |
| `apps/orchestrator/src/routes/storage.ts` | **Criar** | Endpoints: GET usage, POST cleanup, DELETE project files |
| `apps/orchestrator/src/tasks/storage-cleanup.ts` | **Criar** | Cron job para TTL cleanup de repos inativos |
| `packages/shared/src/types/storage.ts` | **Criar** | Types: `StorageUsage`, `StorageQuota` |

---

## SubFases

### SubFase 19A — Schema + Storage Service (Backend Foundation)

#### 1. Atualizar schema `plans.ts`

```typescript
// packages/database/src/schema/plans.ts
export const plans = pgTable("plans", {
  // ... campos existentes ...
  maxStorageMb: integer("max_storage_mb").notNull().default(500),    // 500MB free
  repoTtlDays: integer("repo_ttl_days").notNull().default(30),      // 30 dias free
});
```

#### 2. Atualizar schema `projects.ts`

```typescript
// packages/database/src/schema/projects.ts
export const projects = pgTable("projects", {
  // ... campos existentes ...
  lastAccessedAt: timestamp("last_accessed_at").$defaultFn(() => new Date()),
  diskSizeMb: numeric("disk_size_mb", { precision: 10, scale: 2 }).default("0"),
  isShallowClone: boolean("is_shallow_clone").notNull().default(true),
});
```

#### 3. Expandir `storage.ts`

```typescript
// apps/orchestrator/src/lib/storage.ts
import { homedir } from "os";
import { join } from "path";

export const STORAGE_BASE = process.env.STORAGE_PATH || join(homedir(), ".agenthub");
export const REPOS_DIR = join(STORAGE_BASE, "repos");

/** Get user-scoped repos directory: ~/.agenthub/repos/<userId>/ */
export function userReposDir(userId: string): string {
  return join(REPOS_DIR, userId);
}

/** Calculate directory size in MB using `du` (Unix) or PowerShell (Windows). */
export async function getDirectorySizeMb(dirPath: string): Promise<number> {
  // Implementation: use execFile with `du -sb` on Unix, PowerShell on Windows
  // Return size in MB rounded to 2 decimal places
}
```

#### 4. Criar `storage-service.ts`

```typescript
// apps/orchestrator/src/services/storage-service.ts
import { db, schema } from "@agenthub/database";
import { eq, sum, and, lt } from "drizzle-orm";
import { userReposDir, getDirectorySizeMb } from "../lib/storage.js";
import { rm, readdir } from "fs/promises";
import { logger } from "../lib/logger.js";

export interface StorageUsage {
  usedMb: number;
  limitMb: number;
  usedPercent: number;
  projectCount: number;
  maxProjects: number;
}

export class StorageService {
  /** Get user's current storage usage vs. plan limits */
  async getUserStorageUsage(userId: string): Promise<StorageUsage> {
    // 1. Query user's plan limits (maxStorageMb, maxProjects)
    // 2. Sum diskSizeMb from user's projects (WHERE ownerId = userId)
    // 3. Count user's projects
    // 4. Return usage object
  }

  /** Check if user can clone a new repo (within quota) */
  async canCloneRepo(userId: string, estimatedSizeMb?: number): Promise<{ allowed: boolean; reason?: string }> {
    // Check maxProjects and maxStorageMb
  }

  /** Update disk size for a project after clone */
  async updateProjectDiskSize(projectId: string, projectPath: string): Promise<number> {
    const sizeMb = await getDirectorySizeMb(projectPath);
    await db.update(schema.projects).set({ diskSizeMb: String(sizeMb) }).where(eq(schema.projects.id, projectId));
    return sizeMb;
  }

  /** Touch lastAccessedAt for a project */
  async touchProject(projectId: string): Promise<void> {
    await db.update(schema.projects)
      .set({ lastAccessedAt: new Date() })
      .where(eq(schema.projects.id, projectId));
  }

  /** Cleanup expired repos based on plan TTL */
  async cleanupExpiredRepos(): Promise<{ cleaned: number; freedMb: number }> {
    // 1. For each user, get their plan's repoTtlDays
    // 2. Find projects where lastAccessedAt < now - ttlDays AND path exists locally
    // 3. Delete local clone (rm -rf), keep DB record with metadata
    // 4. Set project.path = project.githubUrl (marks as "not cloned locally")
    // 5. Log and return stats
  }

  /** Delete a specific project's local clone */
  async deleteProjectClone(projectId: string): Promise<void> {
    // 1. Get project from DB
    // 2. rm -rf project.path
    // 3. Update project.path = githubUrl, diskSizeMb = 0
    // 4. Log deletion
  }

  /** Re-clone a project that was previously cleaned up */
  async recloneProject(projectId: string, userId: string): Promise<string> {
    // 1. Check quota
    // 2. Resolve accessToken
    // 3. Shallow clone to userReposDir(userId)/<name>
    // 4. Update project.path, diskSizeMb, lastAccessedAt
    // 5. Return new path
  }
}

export const storageService = new StorageService();
```

#### 5. Gerar migration

```bash
pnpm db:generate  # Gera migration para novos campos
pnpm db:migrate   # Aplica migration
```

#### Verificação 19A:
- `pnpm build` passa
- Migration roda sem erro
- `storageService.getUserStorageUsage()` retorna dados corretos

---

### SubFase 19B — Integração nos Endpoints (Clone Isolado + Cotas)

#### 1. Atualizar `projects.ts` — clone com isolamento

```typescript
// apps/orchestrator/src/routes/projects.ts

// ANTES (flat):
// let targetPath = join(REPOS_DIR, dirName);

// DEPOIS (isolado por user):
import { userReposDir } from "../lib/storage.js";
import { storageService } from "../services/storage-service.js";

async function cloneGitHubRepo(
  cloneUrl: string,
  projectName: string,
  accessToken: string,
  userId: string,           // NOVO: obrigatório
): Promise<string> {
  const userDir = userReposDir(userId);
  await mkdir(userDir, { recursive: true });
  const dirName = projectName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  let targetPath = join(userDir, dirName);
  if (existsSync(targetPath)) {
    targetPath = join(userDir, `${dirName}-${nanoid(6)}`);
  }
  // Shallow clone por padrão
  await git.clone(cloneUrl, targetPath, { type: "https", token: accessToken }, { depth: 1 });
  return targetPath;
}
```

#### 2. Verificação de cota antes de clone

Nos handlers `POST /create` e `POST /import`:

```typescript
// Antes de clonar:
const quota = await storageService.canCloneRepo(req.user!.userId);
if (!quota.allowed) {
  return res.status(403).json({ error: "storage_quota_exceeded", message: quota.reason });
}

// No insert do projeto, popular ownerId:
const project = {
  // ...
  ownerId: req.user!.userId,  // NOVO: associar ao user
};

// Após clonar, atualizar tamanho:
await storageService.updateProjectDiskSize(project.id, localPath);
```

#### 3. Touch `lastAccessedAt` no GET /:id

```typescript
// GET /api/projects/:id — touch access timestamp
projectsRouter.get("/:id", async (req, res) => {
  // ... existing code ...
  // Touch lastAccessedAt (fire-and-forget)
  storageService.touchProject(req.params.id).catch(() => {});
  res.json({ project });
});
```

#### 4. Atualizar `git-service.ts` — suportar shallow clone

```typescript
// apps/orchestrator/src/git/git-service.ts
async clone(
  repoUrl: string,
  targetPath: string,
  credentials?: { type: "ssh" | "https"; token?: string; sshKeyPath?: string },
  options?: { depth?: number },
): Promise<void> {
  // ... existing url/env setup ...
  const args = ["clone"];
  if (options?.depth) {
    args.push("--depth", String(options.depth));
  }
  args.push(url, targetPath);

  const result = await execFileNoThrow("git", args, { timeout: 120000, env });
  if (result.error) {
    throw new Error(`Failed to clone repository: ${result.stderr}`);
  }
}
```

#### 5. Atualizar `agent-manager.ts` — `autoCloneProject` com userId

```typescript
// Passar userId para autoCloneProject, usar userReposDir(userId)
private async autoCloneProject(repoUrl: string, projectName: string, userId: string): Promise<string> {
  const userDir = userReposDir(userId);
  await mkdir(userDir, { recursive: true });
  // ... rest com shallow clone ...
}
```

#### Verificação 19B:
- `pnpm build` passa
- Novo clone vai para `~/.agenthub/repos/<userId>/<project>/`
- Clone com `--depth 1` (verificar com `git log --oneline` no repo clonado)
- Criar projeto sem cota → retorna 403
- `ownerId` populado no DB

---

### SubFase 19C — Cleanup Automático + Endpoints de Storage

#### 1. Criar `storage-cleanup.ts` (cron job)

```typescript
// apps/orchestrator/src/tasks/storage-cleanup.ts
import { storageService } from "../services/storage-service.js";
import { logger } from "../lib/logger.js";

const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 horas
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export const storageCleanup = {
  start(): void {
    cleanupTimer = setInterval(async () => {
      try {
        logger.info("Starting storage cleanup scan", "storage-cleanup");
        const result = await storageService.cleanupExpiredRepos();
        if (result.cleaned > 0) {
          logger.info(`Cleaned ${result.cleaned} repos, freed ${result.freedMb.toFixed(1)}MB`, "storage-cleanup");
        }
      } catch (err) {
        logger.error(`Storage cleanup failed: ${err}`, "storage-cleanup");
      }
    }, CLEANUP_INTERVAL);
    logger.info("Storage cleanup scheduler started (every 6h)", "storage-cleanup");
  },

  stop(): void {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  },
};
```

#### 2. Criar endpoints `routes/storage.ts`

```typescript
// apps/orchestrator/src/routes/storage.ts
import { Router } from "express";
import { storageService } from "../services/storage-service.js";
import { logger } from "../lib/logger.js";

export const storageRouter: ReturnType<typeof Router> = Router();

// GET /api/storage/usage — retorna uso do usuário autenticado
storageRouter.get("/usage", async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  const usage = await storageService.getUserStorageUsage(userId);
  res.json({ usage });
});

// DELETE /api/storage/projects/:id/clone — remove clone local (mantém metadata)
storageRouter.delete("/projects/:id/clone", async (req, res) => {
  await storageService.deleteProjectClone(req.params.id);
  res.json({ success: true });
});

// POST /api/storage/projects/:id/reclone — re-clona projeto previamente limpo
storageRouter.post("/projects/:id/reclone", async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  const newPath = await storageService.recloneProject(req.params.id, userId);
  res.json({ success: true, path: newPath });
});
```

#### 3. Registrar no `index.ts`

```typescript
import { storageRouter } from "./routes/storage.js";
import { storageCleanup } from "./tasks/storage-cleanup.js";

app.use("/api/storage", storageRouter);

// No listen callback:
storageCleanup.start();

// No SIGINT/SIGTERM:
storageCleanup.stop();
```

#### 4. Types compartilhados

```typescript
// packages/shared/src/types/storage.ts
export interface StorageUsage {
  usedMb: number;
  limitMb: number;
  usedPercent: number;
  projectCount: number;
  maxProjects: number;
}

export interface StorageQuota {
  maxStorageMb: number;
  maxProjects: number;
  repoTtlDays: number;
}
```

#### Verificação 19C:
- `pnpm build` passa
- `GET /api/storage/usage` retorna uso correto
- `DELETE /api/storage/projects/:id/clone` remove clone, mantém registro
- `POST /api/storage/projects/:id/reclone` re-clona sob demanda
- Cleanup job logga execução a cada 6h

---

### SubFase 19D — Frontend (Storage Dashboard) [Opcional/Futuro]

- Componente `StorageUsageBar` na sidebar ou settings
- Indicador visual de cota (progress bar com cores: green < 70%, yellow < 90%, red >= 90%)
- Botão "Liberar espaço" que lista projetos inativos para cleanup manual
- Badge "Não clonado" em projetos cujo clone foi removido, com botão "Re-clonar"

---

## Valores Default por Plano

| Plano | maxProjects | maxStorageMb | repoTtlDays |
|-------|-------------|--------------|-------------|
| Free | 3 | 500 | 14 |
| Pro | 20 | 5000 | 90 |
| Enterprise | Unlimited (-1) | 50000 | 365 |

---

## Key Details

### Imports necessários:
- `import { userReposDir, getDirectorySizeMb } from "../lib/storage.js"`
- `import { storageService } from "../services/storage-service.js"`
- `import { rm } from "fs/promises"` — para deletar clones
- `import { numeric, boolean } from "drizzle-orm/pg-core"` — novos campos

### Edge cases:
- **Clone em andamento** — usar lock file (`<path>.cloning`) para evitar clone duplicado
- **User sem plano** — fallback para plano free (default)
- **Projeto sem ownerId** — migration de backfill: atribuir ao primeiro user admin
- **Windows paths** — `getDirectorySizeMb` precisa detectar OS e usar PowerShell no Windows
- **Projeto compartilhado via team** — conta no storage do owner, não dos membros
- **Re-clone falha** — manter status anterior, retornar erro claro

### Variáveis de ambiente:
- `STORAGE_PATH` — já existe, base dir para repos
- Sem novas env vars necessárias

### Segurança:
- `userReposDir()` deve validar que userId não contém path traversal (`..`, `/`)
- `deleteProjectClone()` deve verificar que path está dentro de `REPOS_DIR`
- Cleanup nunca deleta projetos com tasks `in_progress`

---

## Dependências entre passos

```
19A (schema + service) → 19B (integração endpoints) → 19C (cleanup + routes)
                                                     → 19D (frontend) [independente após 19C]
```

## Como testar

1. **Isolamento:** Criar 2 users, importar mesmo repo → verificar que clones estão em dirs separados
2. **Shallow clone:** Após import, rodar `git log --oneline` no clone → deve ter apenas 1 commit
3. **Cota de projetos:** User free com 3 projetos → tentar criar 4º → deve retornar 403
4. **Cota de storage:** Simular cota baixa (1MB) → tentar clonar → deve retornar 403
5. **TTL cleanup:** Criar projeto, setar `lastAccessedAt` para 30 dias atrás → rodar cleanup → verificar que clone foi removido e DB mantém registro
6. **Re-clone:** Após cleanup, acessar projeto → deve re-clonar automaticamente ou via botão
7. **Storage usage endpoint:** `GET /api/storage/usage` → retorna números corretos
