import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { SkeletonPRList } from "../components/ui/skeleton";
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
  const { t } = useTranslation();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg card-glow p-8 animate-scale-in">
        <h2 className="mb-6 text-heading text-neutral-fg1">{t("prs.createPR")}</h2>

        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-label">{t("prs.headBranch")}</label>
              <input
                type="text"
                value={headBranch}
                onChange={(e) => setHeadBranch(e.target.value)}
                className="w-full input-fluent text-[12px]"
              />
            </div>
            <div className="flex items-end pb-3 text-[12px] text-neutral-fg3">&rarr;</div>
            <div className="flex-1">
              <label className="mb-1.5 block text-label">{t("prs.baseBranch")}</label>
              <input
                type="text"
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                className="w-full input-fluent text-[12px]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-label">{t("prs.title")}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("prs.titlePlaceholder")}
              className="w-full input-fluent text-[13px]"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-label">{t("prs.description")}</label>
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
            {t("prs.createAsDraft")}
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="btn-ghost rounded-lg px-5 py-2.5 text-[12px] font-semibold"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || submitting}
            className="btn-primary rounded-lg px-5 py-2.5 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            {submitting ? t("prs.creating") : t("prs.createPRShort")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectPRs() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const addToast = useNotificationStore((s) => s.addToast);
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
        addToast("success", t("prs.prCreated"), `#${pr.number} — ${pr.title}`);
        setShowCreateDialog(false);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("prs.createFailed");
      addToast("error", t("common.error"), msg);
    }
  };

  const handleMerge = async (prNumber: number) => {
    try {
      const ok = await mergePR(prNumber);
      if (ok) {
        addToast("success", t("prs.prMerged"), `#${prNumber}`);
      }
    } catch {
      addToast("error", t("common.error"), t("prs.mergeFailed"));
    }
  };

  const handleClose = async (prNumber: number) => {
    try {
      const ok = await closePR(prNumber);
      if (ok) {
        addToast("success", t("prs.prClosed"), `#${prNumber}`);
      }
    } catch {
      addToast("error", t("common.error"), t("prs.closeFailed"));
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
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-bg2 border border-stroke">
            <AlertCircle className="h-8 w-8 text-neutral-fg-disabled" />
          </div>
          <div className="text-center">
            <p className="text-[14px] font-semibold text-neutral-fg1">{t("prs.ghNotAvailable")}</p>
            <p className="mt-1 text-[12px] text-neutral-fg3">
              {ghStatus?.reason ?? t("prs.ghInstallHint")}
            </p>
            <p className="mt-3 rounded-lg bg-neutral-bg2 border border-stroke px-4 py-2.5 font-mono text-[11px] text-neutral-fg2">
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
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-bg2 border border-stroke">
            <GitPullRequest className="h-8 w-8 text-neutral-fg-disabled" />
          </div>
          <div className="text-center">
            <p className="text-[14px] font-semibold text-neutral-fg1">{t("prs.noRemote")}</p>
            <p className="mt-1 text-[12px] text-neutral-fg3">
              {t("prs.noRemoteDesc")}
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
              title={t("prs.refresh")}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("prs.newPR")}
            </button>
          </div>
        }
      >
        <Tablist
          tabs={[
            { key: "open", label: t("prs.open"), count: openCount },
            { key: "closed", label: t("prs.closed"), count: closedCount },
            { key: "merged", label: t("prs.merged"), count: mergedCount },
            { key: "all", label: t("common.all"), count: prs.length },
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

      {/* PR List */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <SkeletonPRList />
        ) : prs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-bg2 border border-stroke mb-4">
              <GitPullRequest className="h-8 w-8 text-neutral-fg-disabled" />
            </div>
            <p className="text-[14px] font-semibold text-neutral-fg2">
              {t("prs.noPRs")}
            </p>
            <p className="mt-1 text-[12px] text-neutral-fg3">
              {filter === "open"
                ? t("prs.createToStart")
                : t("prs.changeFilter")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {prs.map((pr) => (
              <div key={pr.number} className="card-interactive group flex items-center gap-4 px-5 py-4">
                <PRStateIcon state={pr.state} draft={pr.draft} />
                <span className="text-[12px] font-mono text-neutral-fg3 w-10">#{pr.number}</span>
                <div className="flex-1 min-w-0">
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-medium text-neutral-fg1 hover:text-brand transition-colors truncate block"
                  >
                    {pr.title}
                  </a>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="rounded-md bg-purple-light px-1.5 py-0.5 font-mono text-[10px] text-purple">
                      {pr.headBranch}
                    </span>
                    <span className="text-[11px]">
                      <span className="text-success">+{pr.additions}</span>
                      {" / "}
                      <span className="text-danger">-{pr.deletions}</span>
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-neutral-fg3">
                      <FileCode2 className="h-3 w-3" />
                      {pr.changedFiles}
                    </span>
                    <span className="text-[11px] text-neutral-fg-disabled">
                      {formatRelativeTime(pr.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {pr.state === "open" && !pr.draft && (
                    <>
                      <button
                        onClick={() => handleMerge(pr.number)}
                        className="flex items-center gap-1 rounded-lg bg-purple-light px-2.5 py-1.5 text-[10px] font-semibold text-purple hover:bg-purple hover:text-white transition-colors"
                      >
                        <GitMerge className="h-3 w-3" />
                        Merge
                      </button>
                      <button
                        onClick={() => handleClose(pr.number)}
                        className="flex items-center gap-1 rounded-lg bg-danger-light px-2.5 py-1.5 text-[10px] font-semibold text-danger hover:bg-danger hover:text-white transition-colors"
                      >
                        <XCircle className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg1"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
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
