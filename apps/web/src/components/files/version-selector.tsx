import { useState, useEffect } from "react";
import { GitCommit, Clock, ChevronDown } from "lucide-react";
import { api, formatRelativeTime, cn } from "../../lib/utils";

interface GitCommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
}

interface VersionSelectorProps {
  projectId: string;
  filePath: string;
  selectedVersion: string;
  onVersionSelect: (sha: string) => void;
  label?: string;
}

export function VersionSelector({
  projectId,
  filePath,
  selectedVersion,
  onVersionSelect,
  label = "Select version",
}: VersionSelectorProps) {
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const relativePath = filePath.split(/[\\/]/).slice(-10).join("/");
        const data = await api(
          `/projects/${projectId}/files/history?path=${encodeURIComponent(relativePath)}&limit=20`
        ) as { history: GitCommitInfo[] };

        setCommits(data.history);
      } catch (error) {
        console.error("Failed to fetch file history:", error);
      } finally {
        setLoading(false);
      }
    };

    if (filePath) {
      fetchHistory();
    }
  }, [projectId, filePath]);

  const selectedCommit = commits.find((c) => c.sha === selectedVersion);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-md bg-neutral-bg2 px-3 py-1.5 text-[11px] font-semibold text-neutral-fg2 hover:bg-neutral-bg-hover transition-colors min-w-[200px]"
      >
        <GitCommit className="h-3 w-3" />
        <span className="flex-1 text-left truncate">
          {selectedCommit
            ? `${selectedCommit.sha.slice(0, 7)} - ${selectedCommit.message.slice(0, 30)}${selectedCommit.message.length > 30 ? "..." : ""}`
            : selectedVersion === "working"
            ? "Árvore de trabalho"
            : label}
        </span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-1 w-[400px] bg-neutral-bg1 border border-stroke rounded-lg shadow-16 z-20 max-h-[400px] overflow-auto">
            {/* Working tree option */}
            <button
              onClick={() => {
                onVersionSelect("working");
                setIsOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-bg-hover transition-colors border-b border-stroke",
                selectedVersion === "working" && "bg-brand-light"
              )}
            >
              <div className="flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-success" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-neutral-fg1">Árvore de trabalho</div>
                <div className="text-[10px] text-neutral-fg3">Alterações não salvas</div>
              </div>
            </button>

            {loading ? (
              <div className="px-3 py-4 text-center text-[11px] text-neutral-fg3">
                Carregando commits...
              </div>
            ) : commits.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-neutral-fg3">
                Nenhum commit encontrado
              </div>
            ) : (
              commits.map((commit) => (
                <button
                  key={commit.sha}
                  onClick={() => {
                    onVersionSelect(commit.sha);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-bg-hover transition-colors",
                    selectedVersion === commit.sha && "bg-brand-light"
                  )}
                >
                  <div className="flex-shrink-0">
                    <Clock className="h-3 w-3 text-neutral-fg3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-mono text-purple">{commit.sha.slice(0, 7)}</span>
                      <span className="text-[10px] text-neutral-fg3">
                        {formatRelativeTime(new Date(commit.date))}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-fg1 truncate">{commit.message}</div>
                    <div className="text-[10px] text-neutral-fg3">{commit.author}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
