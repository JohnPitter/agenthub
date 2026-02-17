import { useState, useEffect } from "react";
import {
  X, FileDiff, FileCode, Loader2,
  GitCommit, ChevronDown, ChevronRight, Clock, User,
} from "lucide-react";
import { cn, api, formatRelativeTime } from "../../lib/utils";
import { DiffViewer } from "../files/diff-viewer";

interface FileChange {
  path: string;
  original: string;
  modified: string;
  language: string;
}

interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author: string;
  files: FileChange[];
}

interface TaskChangesDialogProps {
  taskId: string;
  onClose: () => void;
}

export function TaskChangesDialog({ taskId, onClose }: TaskChangesDialogProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track expanded commits and selected file per commit
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ commitHash: string; fileIndex: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    api<{ commits: CommitInfo[]; files: FileChange[] }>(`/tasks/${taskId}/changes`)
      .then((data) => {
        setCommits(data.commits ?? []);
        // Auto-expand and select first commit + first file
        if (data.commits?.length > 0) {
          setExpandedCommit(data.commits[0].hash);
          if (data.commits[0].files.length > 0) {
            setSelectedFile({ commitHash: data.commits[0].hash, fileIndex: 0 });
          }
        }
      })
      .catch((err) => {
        setError(err.message ?? "Falha ao carregar alterações");
      })
      .finally(() => setLoading(false));
  }, [taskId]);

  const totalFiles = commits.reduce((sum, c) => sum + c.files.length, 0);

  // Get the currently selected file data
  const currentFile = selectedFile
    ? commits.find((c) => c.hash === selectedFile.commitHash)?.files[selectedFile.fileIndex]
    : null;
  const currentCommit = selectedFile
    ? commits.find((c) => c.hash === selectedFile.commitHash)
    : null;

  const fileName = (path: string) => path.split("/").pop() ?? path;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-6xl flex-col rounded-lg bg-neutral-bg1 shadow-16" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stroke2 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-light">
              <FileDiff className="h-4 w-4 text-brand" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-neutral-fg1">Alterações</h2>
              <p className="text-[12px] text-neutral-fg3">
                {loading
                  ? "Carregando..."
                  : `${commits.length} commit${commits.length !== 1 ? "s" : ""} · ${totalFiles} arquivo${totalFiles !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-fg-disabled transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-brand" />
                <p className="text-[13px] text-neutral-fg3 font-medium">Carregando alterações...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-[13px] text-danger">{error}</p>
            </div>
          ) : commits.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-center">
                <GitCommit className="h-8 w-8 text-neutral-fg-disabled" />
                <p className="text-[13px] text-neutral-fg-disabled">Nenhuma alteração encontrada</p>
                <p className="text-[11px] text-neutral-fg3">A task precisa ter uma branch com commits para exibir alterações.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Sidebar — Commit list with files */}
              <div className="w-72 shrink-0 overflow-y-auto border-r border-stroke2">
                {commits.map((commit) => {
                  const isExpanded = expandedCommit === commit.hash;
                  const isUncommitted = commit.hash === "uncommitted";

                  return (
                    <div key={commit.hash}>
                      {/* Commit header */}
                      <button
                        onClick={() => setExpandedCommit(isExpanded ? null : commit.hash)}
                        className={cn(
                          "flex w-full items-start gap-2 px-3.5 py-2.5 text-left transition-colors border-b border-stroke2/50",
                          isExpanded ? "bg-neutral-bg2" : "hover:bg-neutral-bg-hover"
                        )}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-neutral-fg3" />
                            : <ChevronRight className="h-3.5 w-3.5 text-neutral-fg3" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <GitCommit className={cn("h-3 w-3 shrink-0", isUncommitted ? "text-warning" : "text-purple")} />
                            <span className={cn(
                              "text-[10px] font-mono font-semibold",
                              isUncommitted ? "text-warning" : "text-purple"
                            )}>
                              {isUncommitted ? "WIP" : commit.shortHash}
                            </span>
                            <span className="text-[10px] text-neutral-fg3">
                              {commit.files.length} arquivo{commit.files.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <p className="text-[11px] font-medium text-neutral-fg1 leading-snug truncate">
                            {commit.message}
                          </p>
                          {!isUncommitted && commit.date && (
                            <div className="flex items-center gap-2 mt-1">
                              {commit.author && (
                                <span className="flex items-center gap-0.5 text-[9px] text-neutral-fg3">
                                  <User className="h-2.5 w-2.5" />
                                  {commit.author}
                                </span>
                              )}
                              <span className="flex items-center gap-0.5 text-[9px] text-neutral-fg3">
                                <Clock className="h-2.5 w-2.5" />
                                {formatRelativeTime(commit.date)}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Expanded file list */}
                      {isExpanded && (
                        <div className="bg-neutral-bg1">
                          {commit.files.map((file, i) => {
                            const isSelected =
                              selectedFile?.commitHash === commit.hash &&
                              selectedFile?.fileIndex === i;

                            return (
                              <button
                                key={`${commit.hash}-${file.path}`}
                                onClick={() => setSelectedFile({ commitHash: commit.hash, fileIndex: i })}
                                className={cn(
                                  "flex w-full items-center gap-2 pl-8 pr-3.5 py-2 text-left transition-colors",
                                  isSelected
                                    ? "bg-brand-light/10 text-brand"
                                    : "text-neutral-fg2 hover:bg-neutral-bg-hover"
                                )}
                              >
                                <FileCode className="h-3.5 w-3.5 shrink-0" />
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-semibold">{fileName(file.path)}</p>
                                  <p className="truncate text-[9px] text-neutral-fg3">{file.path}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Main — Diff viewer */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {currentFile && currentCommit ? (
                  <>
                    <div className="flex items-center gap-2 border-b border-stroke2 px-4 py-2 bg-neutral-bg2">
                      <FileCode className="h-3.5 w-3.5 text-neutral-fg3" />
                      <span className="text-[11px] font-mono text-neutral-fg2">{currentFile.path}</span>
                      <span className="text-[10px] text-neutral-fg3 ml-auto">
                        {currentCommit.shortHash === "uncommitted" ? "WIP" : currentCommit.shortHash}
                      </span>
                    </div>
                    <div className="flex-1">
                      <DiffViewer
                        original={currentFile.original}
                        modified={currentFile.modified}
                        language={currentFile.language}
                        originalLabel={currentCommit.hash === "uncommitted" ? "HEAD" : `${currentCommit.shortHash}^`}
                        modifiedLabel={currentCommit.hash === "uncommitted" ? "Working Tree" : currentCommit.shortHash}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center">
                    <p className="text-[12px] text-neutral-fg-disabled">Selecione um arquivo para ver o diff</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
