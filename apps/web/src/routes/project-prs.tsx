import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  GitPullRequest,
  GitMerge,
  ExternalLink,
  Plus,
  XCircle,
  FileCode2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { usePullRequests, type PullRequest } from "../hooks/use-pull-requests";
import { useGitStatus } from "../hooks/use-git-status";
import { useSocket } from "../hooks/use-socket";
import { useNotificationStore } from "../stores/notification-store";
import { CommandBar } from "../components/layout/command-bar";
import { Tablist } from "../components/ui/tablist";
import { cn, formatRelativeTime } from "../lib/utils";

function PRStateIcon({ state, draft }: { state: string; draft: boolean }) {
  if (draft) return <GitPullRequest className="h-3.5 w-3.5 text-neutral-fg3" />;
  if (state === "merged") return <GitMerge className="h-3.5 w-3.5 text-purple" />;
  if (state === "closed") return <XCircle className="h-3.5 w-3.5 text-danger" />;
  return <GitPullRequest className="h-3.5 w-3.5 text-success" />;
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
      <div className="w-full max-w-lg rounded-lg bg-neutral-bg1 p-6 shadow-16">
        <h2 className="mb-4 text-[16px] font-semibold text-neutral-fg1">Criar Pull Request</h2>

        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[12px] text-neutral-fg2">Head Branch</label>
              <input
                type="text"
                value={headBranch}
                onChange={(e) => setHeadBranch(e.target.value)}
                className="w-full input-fluent text-[12px]"
              />
            </div>
            <div className="flex items-end pb-2 text-[12px] text-neutral-fg3">&rarr;</div>
            <div className="flex-1">
              <label className="mb-1 block text-[12px] text-neutral-fg2">Base Branch</label>
              <input
                type="text"
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                className="w-full input-fluent text-[12px]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] text-neutral-fg2">Titulo</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="feat: add new feature"
              className="w-full input-fluent text-[13px]"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] text-neutral-fg2">Descricao</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="## Summary&#10;&#10;- What changed&#10;- Why"
              rows={5}
              className="w-full resize-none input-fluent text-[12px] font-mono"
            />
          </div>

          <label className="flex items-center gap-2 text-[12px] text-neutral-fg2">
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
            className="rounded-md px-4 py-2 text-[12px] font-semibold text-neutral-fg2 hover:bg-neutral-bg2"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || submitting}
            className="btn-primary rounded-md px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Criando..." : "Criar PR"}
          </button>
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
        <CommandBar>
          <span className="text-[13px] font-semibold text-neutral-fg1">Pull Requests</span>
        </CommandBar>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <AlertCircle className="h-12 w-12 text-neutral-fg-disabled" />
          <div className="text-center">
            <p className="text-[14px] font-semibold text-neutral-fg1">GitHub CLI nao disponivel</p>
            <p className="mt-1 text-[12px] text-neutral-fg3">
              {ghStatus?.reason ?? "Instale e autentique o gh CLI para usar Pull Requests"}
            </p>
            <p className="mt-3 rounded-md bg-neutral-bg2 px-4 py-2 font-mono text-[11px] text-neutral-fg2">
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
        <CommandBar>
          <span className="text-[13px] font-semibold text-neutral-fg1">Pull Requests</span>
        </CommandBar>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <GitPullRequest className="h-12 w-12 text-neutral-fg-disabled" />
          <div className="text-center">
            <p className="text-[14px] font-semibold text-neutral-fg1">Nenhum remote GitHub encontrado</p>
            <p className="mt-1 text-[12px] text-neutral-fg3">
              Configure um remote GitHub nas configuracoes do projeto para usar Pull Requests.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const openCount = prs.filter((pr) => pr.state === "open").length;
  const closedCount = prs.filter((pr) => pr.state === "closed").length;
  const mergedCount = prs.filter((pr) => pr.state === "merged").length;

  return (
    <div className="flex h-full flex-col">
      {/* Command Bar */}
      <CommandBar
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-fg3 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1"
              title="Atualizar"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo PR
            </button>
          </div>
        }
      >
        <Tablist
          tabs={[
            { key: "open", label: "Abertos", count: openCount },
            { key: "closed", label: "Fechados", count: closedCount },
            { key: "merged", label: "Merged", count: mergedCount },
            { key: "all", label: "Todos", count: prs.length },
          ]}
          activeTab={filter}
          onChange={(key) => setFilter(key as typeof filter)}
        />
        {ghStatus?.repoSlug && (
          <>
            <span className="mx-2 h-5 w-px bg-stroke" />
            <span className="text-[12px] font-mono text-neutral-fg3">{ghStatus.repoSlug}</span>
          </>
        )}
      </CommandBar>

      {/* PR Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-5 w-5 animate-spin text-neutral-fg-disabled" />
          </div>
        ) : prs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <GitPullRequest className="h-10 w-10 text-neutral-fg-disabled" />
            <p className="mt-3 text-[14px] font-semibold text-neutral-fg2">
              Nenhum PR {filter === "open" ? "aberto" : filter === "closed" ? "fechado" : filter === "merged" ? "merged" : ""}
            </p>
            <p className="mt-1 text-[12px] text-neutral-fg3">
              {filter === "open"
                ? "Crie um novo PR para comecar"
                : "Mude o filtro para ver outros PRs"}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-stroke bg-neutral-bg1 shadow-2">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stroke text-left">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 w-12"></th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 w-16">#</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Título</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">Branch</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">+/−</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">Arquivos</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">Idade</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke">
                {prs.map((pr) => (
                  <tr key={pr.number} className="group hover:bg-neutral-bg-hover transition-colors h-12">
                    <td className="px-4 py-2">
                      <PRStateIcon state={pr.state} draft={pr.draft} />
                    </td>
                    <td className="px-4 py-2 text-[12px] font-mono text-neutral-fg3">{pr.number}</td>
                    <td className="px-4 py-2">
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] font-medium text-neutral-fg1 hover:text-brand transition-colors truncate block max-w-[300px]"
                      >
                        {pr.title}
                      </a>
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-purple-light px-1.5 py-0.5 font-mono text-[10px] text-purple">
                        {pr.headBranch}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-[11px]">
                      <span className="text-success">+{pr.additions}</span>
                      {" / "}
                      <span className="text-danger">−{pr.deletions}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="flex items-center justify-end gap-1 text-[11px] text-neutral-fg3">
                        <FileCode2 className="h-3 w-3" />
                        {pr.changedFiles}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-[11px] text-neutral-fg-disabled whitespace-nowrap">
                      {formatRelativeTime(pr.createdAt)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {pr.state === "open" && !pr.draft && (
                          <>
                            <button
                              onClick={() => handleMerge(pr.number)}
                              className="flex items-center gap-1 rounded-md bg-purple-light px-2 py-1 text-[10px] font-semibold text-purple hover:bg-purple hover:text-white transition-colors"
                            >
                              <GitMerge className="h-3 w-3" />
                              Merge
                            </button>
                            <button
                              onClick={() => handleClose(pr.number)}
                              className="flex items-center gap-1 rounded-md bg-danger-light px-2 py-1 text-[10px] font-semibold text-danger hover:bg-danger hover:text-white transition-colors"
                            >
                              <XCircle className="h-3 w-3" />
                            </button>
                          </>
                        )}
                        <a
                          href={pr.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg1"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
