import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  GitPullRequest,
  GitMerge,
  ExternalLink,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  FileCode2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { usePullRequests, type PullRequest } from "../hooks/use-pull-requests";
import { useGitStatus } from "../hooks/use-git-status";
import { useSocket } from "../hooks/use-socket";
import { useNotificationStore } from "../stores/notification-store";
import { cn, formatRelativeTime } from "../lib/utils";

function PRStateIcon({ state, draft }: { state: string; draft: boolean }) {
  if (draft) return <Clock className="h-4 w-4 text-text-tertiary" />;
  if (state === "merged") return <GitMerge className="h-4 w-4 text-purple" />;
  if (state === "closed") return <XCircle className="h-4 w-4 text-red" />;
  return <GitPullRequest className="h-4 w-4 text-green" />;
}

function PRStateBadge({ state, draft }: { state: string; draft: boolean }) {
  if (draft) {
    return (
      <span className="rounded-lg bg-page px-2 py-0.5 text-[10px] font-semibold text-text-tertiary">
        Draft
      </span>
    );
  }
  if (state === "merged") {
    return (
      <span className="rounded-lg bg-purple-light px-2 py-0.5 text-[10px] font-semibold text-purple">
        Merged
      </span>
    );
  }
  if (state === "closed") {
    return (
      <span className="rounded-lg bg-red-light px-2 py-0.5 text-[10px] font-semibold text-red">
        Closed
      </span>
    );
  }
  return (
    <span className="rounded-lg bg-green-light px-2 py-0.5 text-[10px] font-semibold text-green">
      Open
    </span>
  );
}

function CreatePRDialog({
  branches,
  defaultBranch,
  onClose,
  onSubmit,
}: {
  branches: { current: string; default: string };
  defaultBranch: string;
  onClose: () => void;
  onSubmit: (data: { title: string; body: string; headBranch: string; baseBranch: string; draft: boolean }) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [headBranch, setHeadBranch] = useState(branches.current);
  const [baseBranch, setBaseBranch] = useState(defaultBranch);
  const [draft, setDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    await onSubmit({ title, body, headBranch, baseBranch, draft });
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-[16px] font-semibold text-text-primary">Criar Pull Request</h2>

        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[12px] text-text-secondary">Head Branch</label>
              <input
                type="text"
                value={headBranch}
                onChange={(e) => setHeadBranch(e.target.value)}
                className="w-full rounded-lg border border-edge bg-page px-3 py-2 text-[12px] text-text-primary"
              />
            </div>
            <div className="flex items-end pb-2 text-[12px] text-text-tertiary">→</div>
            <div className="flex-1">
              <label className="mb-1 block text-[12px] text-text-secondary">Base Branch</label>
              <input
                type="text"
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                className="w-full rounded-lg border border-edge bg-page px-3 py-2 text-[12px] text-text-primary"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] text-text-secondary">Titulo</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="feat: add new feature"
              className="w-full rounded-lg border border-edge bg-page px-3 py-2 text-[13px] text-text-primary"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] text-text-secondary">Descricao</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="## Summary&#10;&#10;- What changed&#10;- Why"
              rows={5}
              className="w-full resize-none rounded-lg border border-edge bg-page px-3 py-2 text-[12px] text-text-primary font-mono"
            />
          </div>

          <label className="flex items-center gap-2 text-[12px] text-text-secondary">
            <input
              type="checkbox"
              checked={draft}
              onChange={(e) => setDraft(e.target.checked)}
              className="rounded"
            />
            Criar como Draft
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[12px] font-semibold text-text-secondary hover:bg-page"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || submitting}
            className="rounded-lg bg-green px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-green/90 disabled:opacity-50"
          >
            {submitting ? "Criando..." : "Criar PR"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PRCard({
  pr,
  onMerge,
  onClose,
}: {
  pr: PullRequest;
  onMerge: (prNumber: number) => void;
  onClose: (prNumber: number) => void;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-card transition-all hover:shadow-card-hover">
      <div className="flex items-start gap-3">
        <PRStateIcon state={pr.state} draft={pr.draft} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[14px] font-semibold text-text-primary hover:text-primary transition-colors"
            >
              {pr.title}
            </a>
            <PRStateBadge state={pr.state} draft={pr.draft} />
          </div>

          <div className="mt-1 flex items-center gap-3 text-[11px] text-text-tertiary">
            <span className="font-mono">#{pr.number}</span>
            <span>{pr.author}</span>
            <span>
              <span className="rounded bg-purple-light px-1.5 py-0.5 font-mono text-[10px] text-purple">
                {pr.headBranch}
              </span>
              {" → "}
              <span className="rounded bg-page px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                {pr.baseBranch}
              </span>
            </span>
            <span>{formatRelativeTime(pr.createdAt)}</span>
          </div>

          <div className="mt-2 flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1 text-green">
              +{pr.additions}
            </span>
            <span className="flex items-center gap-1 text-red">
              -{pr.deletions}
            </span>
            <span className="flex items-center gap-1 text-text-tertiary">
              <FileCode2 className="h-3 w-3" />
              {pr.changedFiles} files
            </span>
            {pr.labels.length > 0 && (
              <div className="flex gap-1">
                {pr.labels.map((label) => (
                  <span
                    key={label}
                    className="rounded bg-primary-light px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {pr.state === "open" && !pr.draft && (
            <>
              <button
                onClick={() => onMerge(pr.number)}
                className="flex items-center gap-1 rounded-lg bg-purple-light px-2.5 py-1.5 text-[11px] font-semibold text-purple transition-colors hover:bg-purple hover:text-white"
                title="Merge PR"
              >
                <GitMerge className="h-3 w-3" />
                Merge
              </button>
              <button
                onClick={() => onClose(pr.number)}
                className="flex items-center gap-1 rounded-lg bg-red-light px-2.5 py-1.5 text-[11px] font-semibold text-red transition-colors hover:bg-red hover:text-white"
                title="Close PR"
              >
                <XCircle className="h-3 w-3" />
              </button>
            </>
          )}
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-page hover:text-text-primary"
            title="Abrir no GitHub"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

export function ProjectPRs() {
  const { id } = useParams<{ id: string }>();
  const { addToast } = useNotificationStore();
  const {
    prs,
    loading,
    ghStatus,
    filter,
    setFilter,
    createPR,
    mergePR,
    closePR,
    refresh,
  } = usePullRequests(id);
  const { status } = useGitStatus(id);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Real-time PR updates via socket
  useSocket(id, {
    onTaskPRCreated: () => refresh(),
    onTaskPRMerged: () => refresh(),
  });

  const handleCreatePR = async (data: {
    title: string;
    body: string;
    headBranch: string;
    baseBranch: string;
    draft: boolean;
  }) => {
    try {
      const pr = await createPR(data);
      if (pr) {
        addToast("success", "PR criado", `#${pr.number} — ${pr.title}`);
        setShowCreateDialog(false);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Falha ao criar PR";
      addToast("error", "Erro", msg);
    }
  };

  const handleMerge = async (prNumber: number) => {
    try {
      const ok = await mergePR(prNumber);
      if (ok) {
        addToast("success", "PR merged", `#${prNumber} merged com sucesso`);
      }
    } catch {
      addToast("error", "Erro ao merge", "Falha ao fazer merge do PR");
    }
  };

  const handleClose = async (prNumber: number) => {
    try {
      const ok = await closePR(prNumber);
      if (ok) {
        addToast("success", "PR fechado", `#${prNumber} fechado`);
      }
    } catch {
      addToast("error", "Erro ao fechar", "Falha ao fechar o PR");
    }
  };

  // Not available state
  if (ghStatus && (!ghStatus.available || !ghStatus.authenticated)) {
    return (
      <div className="flex h-full flex-col">
        <div className="relative z-10 flex items-center gap-3 bg-white px-8 py-5 shadow-xs">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-light">
            <GitPullRequest className="h-5 w-5 text-green" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold text-text-primary">Pull Requests</h1>
            <p className="text-[12px] text-text-tertiary">GitHub integration</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <AlertCircle className="h-12 w-12 text-text-placeholder" />
          <div className="text-center">
            <p className="text-[14px] font-semibold text-text-primary">GitHub CLI nao disponivel</p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              {ghStatus?.reason ?? "Instale e autentique o gh CLI para usar Pull Requests"}
            </p>
            <p className="mt-3 rounded-lg bg-page px-4 py-2 font-mono text-[11px] text-text-secondary">
              brew install gh && gh auth login
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No GitHub remote
  if (ghStatus && !ghStatus.repoSlug) {
    return (
      <div className="flex h-full flex-col">
        <div className="relative z-10 flex items-center gap-3 bg-white px-8 py-5 shadow-xs">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-light">
            <GitPullRequest className="h-5 w-5 text-green" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold text-text-primary">Pull Requests</h1>
            <p className="text-[12px] text-text-tertiary">GitHub integration</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <GitPullRequest className="h-12 w-12 text-text-placeholder" />
          <div className="text-center">
            <p className="text-[14px] font-semibold text-text-primary">Nenhum remote GitHub encontrado</p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              Configure um remote GitHub nas configuracoes do projeto para usar Pull Requests.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const filterOptions = [
    { value: "open" as const, label: "Open" },
    { value: "closed" as const, label: "Closed" },
    { value: "merged" as const, label: "Merged" },
    { value: "all" as const, label: "All" },
  ];

  const openCount = prs.filter((pr) => pr.state === "open").length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between bg-white px-8 py-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-light">
            <GitPullRequest className="h-5 w-5 text-green" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold text-text-primary">Pull Requests</h1>
            <p className="text-[12px] text-text-tertiary">
              {ghStatus?.repoSlug}
              {filter === "open" && prs.length > 0 && ` — ${openCount} open`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-page hover:text-text-primary"
            title="Atualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-1.5 rounded-lg bg-green px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-green/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo PR
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 bg-white px-8 py-3">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors",
              filter === opt.value
                ? "bg-text-primary text-white"
                : "text-text-tertiary hover:bg-page hover:text-text-primary"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* PR List */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-5 w-5 animate-spin text-text-placeholder" />
          </div>
        ) : prs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <GitPullRequest className="h-10 w-10 text-text-placeholder" />
            <p className="mt-3 text-[14px] font-semibold text-text-secondary">
              Nenhum PR {filter === "open" ? "aberto" : filter === "closed" ? "fechado" : filter === "merged" ? "merged" : ""}
            </p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              {filter === "open"
                ? "Crie um novo PR para comecar"
                : "Mude o filtro para ver outros PRs"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {prs.map((pr) => (
              <PRCard
                key={pr.number}
                pr={pr}
                onMerge={handleMerge}
                onClose={handleClose}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create PR Dialog */}
      {showCreateDialog && (
        <CreatePRDialog
          branches={{
            current: status?.branch ?? "main",
            default: "main",
          }}
          defaultBranch="main"
          onClose={() => setShowCreateDialog(false)}
          onSubmit={handleCreatePR}
        />
      )}
    </div>
  );
}
