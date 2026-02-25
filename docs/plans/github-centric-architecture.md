# Fase 18B: Arquitetura GitHub-Centric

## Objetivo

Remover o rastreamento de workspace por diretório local. Todo o fluxo de projetos passa a ser via GitHub API. Cada usuário tem um workspace (`~/.agenthub/repos/`) e pode:

- **Criar projeto** → cria repositório no GitHub + clona no workspace local
- **Importar projeto** → lista repos do GitHub do usuário + clona o selecionado

O login via GitHub OAuth já garante o `accessToken` necessário para as operações.

---

## Fase 1: Schema + Types

### 1A. Database Schema (`packages/database/src/schema/projects.ts`)

Adicionar 3 colunas:

```ts
githubUrl: text("github_url"),       // ex: "https://github.com/user/repo"
githubOwner: text("github_owner"),   // ex: "joaop"
githubRepo: text("github_repo"),     // ex: "my-project"
```

### 1B. Migration (`packages/database/src/migrate.ts`)

Adicionar em `alterStatements`:

```ts
`ALTER TABLE projects ADD COLUMN github_url TEXT`,
`ALTER TABLE projects ADD COLUMN github_owner TEXT`,
`ALTER TABLE projects ADD COLUMN github_repo TEXT`,
```

Adicionar índice:

```ts
await client.execute(`CREATE INDEX IF NOT EXISTS idx_projects_github ON projects(github_owner, github_repo)`);
```

### 1C. Shared Types (`packages/shared/src/types/project.ts`)

Atualizar interface `Project`:

```ts
export interface Project {
  id: string;
  name: string;
  path: string;
  stack: string[];
  icon: string | null;
  description: string | null;
  status: "active" | "archived";
  githubUrl: string | null;
  githubOwner: string | null;
  githubRepo: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

Remover `ScannedProject` (não será mais usado).

---

## Fase 2: Backend — Routes + Services

### 2A. Remover Scan Endpoint

**Arquivo:** `apps/orchestrator/src/routes/projects.ts`

- Deletar rota `POST /api/projects/scan` e `GET /api/projects/scan`
- Remover imports do scanner

### 2B. Simplificar Create (`POST /api/projects`)

Fluxo novo:

1. Receber: `{ name, description?, private?, template? }`
2. Obter `accessToken` do usuário autenticado
3. Chamar `githubService.createRepo(token, name, description, private)`
4. Clonar repo: `git clone <clone_url> ~/.agenthub/repos/<name>`
5. Detectar stack com scanner leve (package.json, etc.)
6. Inserir projeto no DB com `githubUrl`, `githubOwner`, `githubRepo`
7. Retornar projeto

### 2C. Novo Import Endpoint (`POST /api/projects/import`)

Fluxo:

1. Receber: `{ githubUrl }` ou `{ owner, repo }`
2. Obter `accessToken` do usuário autenticado
3. Verificar que repo existe e usuário tem acesso: `githubService.getRepo(token, owner, repo)`
4. Clonar repo: `git clone <clone_url> ~/.agenthub/repos/<repo>`
5. Detectar stack
6. Inserir projeto no DB
7. Retornar projeto

### 2D. Listar Repos do Usuário (`GET /api/github/repos`)

- Já existe em `github-service.ts` (`fetchUserRepos`)
- Garantir paginação e busca por nome
- Filtrar repos já importados (comparar com DB)

### 2E. Remover Scanner

**Arquivo:** `apps/orchestrator/src/workspace/scanner.ts` — DELETAR

Manter apenas detecção leve de stack (verificar `package.json`, `Cargo.toml`, etc.) — isso pode ficar em um util.

### 2F. GitHub Service Updates (`apps/orchestrator/src/integrations/github-service.ts`)

Garantir que os seguintes métodos existem:

```ts
async createRepo(token: string, name: string, description?: string, isPrivate?: boolean): Promise<GitHubRepo>
async getRepo(token: string, owner: string, repo: string): Promise<GitHubRepo>
async listUserRepos(token: string, page?: number, perPage?: number, query?: string): Promise<GitHubRepo[]>
```

---

## Fase 3: Frontend — UI

### 3A. Novo Dialog de Criar/Importar Projeto

**Arquivo:** `apps/web/src/components/projects/create-project-dialog.tsx`

Dois tabs/modos:

**Tab 1 — Criar:**
- Input: nome do repositório
- Input: descrição (opcional)
- Toggle: público/privado
- Botão: "Criar no GitHub"
- Feedback: loading → sucesso (mostra link do repo) → redirect

**Tab 2 — Importar:**
- Lista de repositórios do GitHub do usuário (com busca)
- Cada item mostra: nome, descrição, linguagem, última atualização
- Botão "Importar" por item
- Feedback: clonando → sucesso → redirect

### 3B. Remover Scan UI

**Arquivo:** `apps/web/src/routes/projects-page.tsx` (ou equivalente)

- Remover botão/ação "Scan Workspace"
- Botão principal: "Novo Projeto" → abre dialog 3A

### 3C. Remover Workspace Path das Settings

**Arquivo:** `apps/web/src/routes/settings.tsx`

- Remover seção "Workspace" (input do path do workspace)
- O workspace agora é fixo em `~/.agenthub/repos/`

### 3D. Atualizar Project Cards

Mostrar GitHub info nos cards de projeto:

- Ícone do GitHub + link para o repo
- Owner/repo name como subtitle
- Badge público/privado

---

## Fase 4: Cleanup

### 4A. Remover Código Morto

- `apps/orchestrator/src/workspace/scanner.ts` — DELETAR
- `ScannedProject` type em `packages/shared/src/types/project.ts` — DELETAR
- Rotas de scan no backend — DELETAR
- Componentes de scan no frontend — DELETAR
- i18n keys relacionadas a scan — REMOVER

### 4B. Atualizar i18n

Adicionar keys para:

```json
{
  "projects.createOnGithub": "Create on GitHub",
  "projects.importFromGithub": "Import from GitHub",
  "projects.selectRepo": "Select a repository",
  "projects.cloning": "Cloning repository...",
  "projects.repoName": "Repository name",
  "projects.repoDescription": "Description (optional)",
  "projects.repoPrivate": "Private repository",
  "projects.repoPublic": "Public repository",
  "projects.alreadyImported": "Already imported",
  "projects.noReposFound": "No repositories found",
  "projects.searchRepos": "Search your repositories..."
}
```

Em todos os 5 locales (en-US, pt-BR, es, ja, zh-CN).

---

## Fase 5: Data Migration

### Backfill para Projetos Existentes

Para projetos já cadastrados que têm remote git configurado:

```ts
// Em um migration script ou lazy no startup
const projects = await db.select().from(schema.projects).where(isNull(schema.projects.githubUrl));
for (const project of projects) {
  const remoteUrl = await getGitRemoteUrl(project.path);
  if (remoteUrl && remoteUrl.includes("github.com")) {
    const { owner, repo } = parseGithubUrl(remoteUrl);
    await db.update(schema.projects)
      .set({ githubUrl: remoteUrl, githubOwner: owner, githubRepo: repo })
      .where(eq(schema.projects.id, project.id));
  }
}
```

---

## Ordem de Implementação

1. **Schema + Types** (Fase 1) — DB columns + shared types
2. **GitHub Service** (Fase 2F) — garantir métodos existem
3. **Backend Routes** (Fases 2A-2E) — create, import, remover scan
4. **Frontend Dialog** (Fase 3A) — novo create/import
5. **Frontend Cleanup** (Fases 3B-3D) — remover scan UI, atualizar cards
6. **Cleanup + i18n** (Fase 4)
7. **Data Migration** (Fase 5)
8. **`pnpm build`** — verificar tudo compila

---

## Arquivos Modificados (resumo)

| Fase | Arquivo | Ação |
|------|---------|------|
| 1A | `packages/database/src/schema/projects.ts` | Add 3 columns |
| 1B | `packages/database/src/migrate.ts` | Add ALTER + INDEX |
| 1C | `packages/shared/src/types/project.ts` | Update Project, remove ScannedProject |
| 2A | `apps/orchestrator/src/routes/projects.ts` | Remove scan routes |
| 2B | `apps/orchestrator/src/routes/projects.ts` | Simplify POST create |
| 2C | `apps/orchestrator/src/routes/projects.ts` | Add POST import |
| 2D | `apps/orchestrator/src/routes/projects.ts` | Ensure GET github/repos |
| 2E | `apps/orchestrator/src/workspace/scanner.ts` | DELETE |
| 2F | `apps/orchestrator/src/integrations/github-service.ts` | Ensure methods |
| 3A | `apps/web/src/components/projects/create-project-dialog.tsx` | New/rewrite |
| 3B | `apps/web/src/routes/projects-page.tsx` | Remove scan |
| 3C | `apps/web/src/routes/settings.tsx` | Remove workspace section |
| 3D | Various project cards | Show GitHub info |
| 4 | Multiple files | Cleanup dead code |
| 4B | 5 locale files | New i18n keys |
| 5 | Migration script or startup | Backfill existing projects |

---

## Verificação

1. `pnpm build` passa sem erros
2. Criar projeto → repo aparece no GitHub + clonado localmente
3. Importar projeto → lista repos, seleciona, clona
4. Projetos existentes com remote GitHub → backfill automático
5. Scan removido completamente — sem botão, sem rota, sem código
6. Cards mostram info do GitHub (link, owner/repo)
7. Settings não tem mais "Workspace path"
