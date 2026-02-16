import { useState, useEffect } from "react";
import { X, FileDiff, FileCode, Loader2 } from "lucide-react";
import { cn, api } from "../../lib/utils";
import { DiffViewer } from "../files/diff-viewer";

interface FileChange {
  path: string;
  original: string;
  modified: string;
  language: string;
}

interface TaskChangesDialogProps {
  taskId: string;
  onClose: () => void;
}

export function TaskChangesDialog({ taskId, onClose }: TaskChangesDialogProps) {
  const [files, setFiles] = useState<FileChange[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    api<{ files: FileChange[] }>(`/tasks/${taskId}/changes`)
      .then((data) => {
        setFiles(data.files);
        setSelectedIndex(0);
      })
      .catch((err) => {
        setError(err.message ?? "Falha ao carregar alterações");
      })
      .finally(() => setLoading(false));
  }, [taskId]);

  const selected = files[selectedIndex];

  // Get just the filename from the path
  const fileName = (path: string) => path.split("/").pop() ?? path;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-5xl flex-col rounded-lg bg-neutral-bg1 shadow-16" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stroke2 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-light">
              <FileDiff className="h-4 w-4 text-brand" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-neutral-fg1">Alterações</h2>
              <p className="text-[12px] text-neutral-fg3">
                {loading ? "Carregando..." : `${files.length} arquivo${files.length !== 1 ? "s" : ""} modificado${files.length !== 1 ? "s" : ""}`}
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
          ) : files.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-[13px] text-neutral-fg-disabled">Nenhuma alteração encontrada</p>
            </div>
          ) : (
            <>
              {/* Sidebar — File list */}
              <div className="w-64 shrink-0 overflow-y-auto border-r border-stroke2 py-2">
                {files.map((file, i) => (
                  <button
                    key={file.path}
                    onClick={() => setSelectedIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors",
                      i === selectedIndex
                        ? "bg-brand-light/10 text-brand"
                        : "text-neutral-fg2 hover:bg-neutral-bg-hover"
                    )}
                  >
                    <FileCode className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold">{fileName(file.path)}</p>
                      <p className="truncate text-[10px] text-neutral-fg3">{file.path}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Main — Diff viewer */}
              <div className="flex-1 overflow-hidden">
                {selected && (
                  <DiffViewer
                    original={selected.original}
                    modified={selected.modified}
                    language={selected.language}
                    originalLabel="Original (HEAD)"
                    modifiedLabel="Modificado"
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
