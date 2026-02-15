import { useEffect, useState } from "react";
import { File, Loader2, AlertCircle, Edit3, Save, X, Eye, GitCompare } from "lucide-react";
import { api, formatRelativeTime, cn } from "../../lib/utils";
import { CodeEditor, getLanguageFromFilename } from "./code-editor";
import { DiffViewer } from "./diff-viewer";
import { VersionSelector } from "./version-selector";
import { useNotificationStore } from "../../stores/notification-store";

interface FileViewerProps {
  projectId: string;
  filePath: string | null;
}

interface FileContent {
  content: string;
  size: number;
  modified: string;
}

type ViewMode = "view" | "edit" | "diff";

export function FileViewer({ projectId, filePath }: FileViewerProps) {
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("view");
  const [editedContent, setEditedContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Diff mode state
  const [originalVersion, setOriginalVersion] = useState<string>("working");
  const [modifiedVersion, setModifiedVersion] = useState<string>("working");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [modifiedContent, setModifiedContent] = useState<string>("");
  const [loadingDiff, setLoadingDiff] = useState(false);

  const { addToast } = useNotificationStore();

  useEffect(() => {
    if (!filePath) {
      setFileContent(null);
      setMode("view");
      return;
    }

    const fetchFileContent = async () => {
      setLoading(true);
      setError(null);
      setMode("view");

      try {
        const relativePath = filePath.split(/[\\/]/).slice(-10).join("/");
        const data = await api(
          `/projects/${projectId}/files/content?path=${encodeURIComponent(relativePath)}`
        ) as FileContent;

        setFileContent(data);
        setEditedContent(data.content);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load file");
      } finally {
        setLoading(false);
      }
    };

    fetchFileContent();
  }, [projectId, filePath]);

  // Fetch content for diff mode
  useEffect(() => {
    if (mode !== "diff" || !filePath || !fileContent) return;

    const fetchDiffContent = async () => {
      setLoadingDiff(true);
      try {
        const relativePath = filePath.split(/[\\/]/).slice(-10).join("/");

        // Fetch original version
        let originalData: string;
        if (originalVersion === "working") {
          originalData = fileContent.content;
        } else {
          const result = await api(
            `/projects/${projectId}/files/at-commit?path=${encodeURIComponent(relativePath)}&commit=${originalVersion}`
          ) as { content: string };
          originalData = result.content;
        }

        // Fetch modified version
        let modifiedData: string;
        if (modifiedVersion === "working") {
          modifiedData = fileContent.content;
        } else {
          const result = await api(
            `/projects/${projectId}/files/at-commit?path=${encodeURIComponent(relativePath)}&commit=${modifiedVersion}`
          ) as { content: string };
          modifiedData = result.content;
        }

        setOriginalContent(originalData);
        setModifiedContent(modifiedData);
      } catch (err) {
        addToast("error", "Erro ao carregar diff", err instanceof Error ? err.message : "Falha ao carregar versões");
      } finally {
        setLoadingDiff(false);
      }
    };

    fetchDiffContent();
  }, [mode, originalVersion, modifiedVersion, filePath, fileContent, projectId, addToast]);

  const handleSave = async () => {
    if (!filePath || !fileContent) return;

    setSaving(true);
    try {
      const relativePath = filePath.split(/[\\/]/).slice(-10).join("/");
      const result = await api(
        `/projects/${projectId}/files/content?path=${encodeURIComponent(relativePath)}`,
        {
          method: "PUT",
          body: JSON.stringify({ content: editedContent }),
        }
      ) as { success: boolean; size: number; modified: string };

      if (result.success) {
        setFileContent({
          content: editedContent,
          size: result.size,
          modified: result.modified,
        });
        setMode("view");
        addToast("success", "Arquivo salvo", "As alterações foram salvas com sucesso");
      }
    } catch (err) {
      addToast("error", "Erro ao salvar", err instanceof Error ? err.message : "Não foi possível salvar o arquivo");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (fileContent) {
      setEditedContent(fileContent.content);
    }
    setMode("view");
  };

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <div>
          <File className="mx-auto h-12 w-12 text-neutral-fg3 mb-3" />
          <p className="text-[13px] text-neutral-fg3">Selecione um arquivo para visualizar</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <div>
          <AlertCircle className="mx-auto h-12 w-12 text-danger mb-3" />
          <p className="text-[13px] text-danger">{error}</p>
        </div>
      </div>
    );
  }

  if (!fileContent) {
    return null;
  }

  const fileName = filePath.split(/[\\/]/).pop() || "";
  const language = getLanguageFromFilename(fileName);
  const hasChanges = editedContent !== fileContent.content;

  return (
    <div className="flex h-full flex-col bg-neutral-bg1">
      {/* File header */}
      <div className="border-b border-stroke px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-neutral-fg1">{fileName}</h3>
            <p className="text-[11px] text-neutral-fg3 mt-0.5">
              {formatFileSize(fileContent.size)} · Modificado:{" "}
              {formatRelativeTime(new Date(fileContent.modified))}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex items-center gap-1 bg-neutral-bg2 rounded-md p-1">
              <button
                onClick={() => setMode("view")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  mode === "view"
                    ? "bg-neutral-bg1 text-brand shadow-2"
                    : "text-neutral-fg3 hover:text-neutral-fg2"
                )}
              >
                <Eye className="h-3 w-3" />
                Visualizar
              </button>
              <button
                onClick={() => setMode("edit")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  mode === "edit"
                    ? "bg-neutral-bg1 text-brand shadow-2"
                    : "text-neutral-fg3 hover:text-neutral-fg2"
                )}
              >
                <Edit3 className="h-3 w-3" />
                Editar
              </button>
              <button
                onClick={() => setMode("diff")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  mode === "diff"
                    ? "bg-neutral-bg1 text-brand shadow-2"
                    : "text-neutral-fg3 hover:text-neutral-fg2"
                )}
              >
                <GitCompare className="h-3 w-3" />
                Diff
              </button>
            </div>

            {/* Action buttons */}
            {mode === "edit" && (
              <>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-md bg-neutral-bg2 px-3 py-1.5 text-[11px] font-semibold text-neutral-fg2 hover:bg-neutral-bg-hover transition-colors disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors",
                    hasChanges
                      ? "bg-brand text-white hover:bg-brand-hover"
                      : "bg-brand-light text-brand cursor-not-allowed"
                  )}
                >
                  <Save className={cn("h-3 w-3", saving && "animate-pulse")} />
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Version selectors for diff mode */}
        {mode === "diff" && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-stroke2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-neutral-fg3 uppercase">Original:</span>
              <VersionSelector
                projectId={projectId}
                filePath={filePath}
                selectedVersion={originalVersion}
                onVersionSelect={setOriginalVersion}
                label="Select original version"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-neutral-fg3 uppercase">Modificado:</span>
              <VersionSelector
                projectId={projectId}
                filePath={filePath}
                selectedVersion={modifiedVersion}
                onVersionSelect={setModifiedVersion}
                label="Select modified version"
              />
            </div>
          </div>
        )}
      </div>

      {/* File content */}
      <div className="flex-1 overflow-hidden">
        {mode === "diff" ? (
          loadingDiff ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : (
            <DiffViewer
              original={originalContent}
              modified={modifiedContent}
              language={language}
              originalLabel={originalVersion === "working" ? "Árvore de trabalho" : originalVersion.slice(0, 7)}
              modifiedLabel={modifiedVersion === "working" ? "Árvore de trabalho" : modifiedVersion.slice(0, 7)}
            />
          )
        ) : (
          <CodeEditor
            value={mode === "edit" ? editedContent : fileContent.content}
            language={language}
            readOnly={mode === "view"}
            onChange={(value) => setEditedContent(value || "")}
            onSave={mode === "edit" && hasChanges ? handleSave : undefined}
          />
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
