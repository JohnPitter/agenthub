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
          <File className="mx-auto h-12 w-12 text-text-tertiary mb-3" />
          <p className="text-[13px] text-text-tertiary">Select a file to view</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-purple" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <div>
          <AlertCircle className="mx-auto h-12 w-12 text-red mb-3" />
          <p className="text-[13px] text-red">{error}</p>
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
    <div className="flex h-full flex-col bg-white">
      {/* File header */}
      <div className="border-b border-edge px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-text-primary">{fileName}</h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              {formatFileSize(fileContent.size)} · Modified{" "}
              {formatRelativeTime(new Date(fileContent.modified))}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex items-center gap-1 bg-page rounded-lg p-1">
              <button
                onClick={() => setMode("view")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  mode === "view"
                    ? "bg-white text-purple shadow-sm"
                    : "text-text-tertiary hover:text-text-secondary"
                )}
              >
                <Eye className="h-3 w-3" />
                View
              </button>
              <button
                onClick={() => setMode("edit")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  mode === "edit"
                    ? "bg-white text-purple shadow-sm"
                    : "text-text-tertiary hover:text-text-secondary"
                )}
              >
                <Edit3 className="h-3 w-3" />
                Edit
              </button>
              <button
                onClick={() => setMode("diff")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  mode === "diff"
                    ? "bg-white text-purple shadow-sm"
                    : "text-text-tertiary hover:text-text-secondary"
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
                  className="flex items-center gap-1.5 rounded-lg bg-page px-3 py-1.5 text-[11px] font-semibold text-text-secondary hover:bg-edge transition-colors disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors",
                    hasChanges
                      ? "bg-purple text-white hover:bg-purple/90"
                      : "bg-purple-light text-purple cursor-not-allowed"
                  )}
                >
                  <Save className={cn("h-3 w-3", saving && "animate-pulse")} />
                  {saving ? "Saving..." : "Save"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Version selectors for diff mode */}
        {mode === "diff" && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-edge-light">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-text-tertiary uppercase">Original:</span>
              <VersionSelector
                projectId={projectId}
                filePath={filePath}
                selectedVersion={originalVersion}
                onVersionSelect={setOriginalVersion}
                label="Select original version"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-text-tertiary uppercase">Modified:</span>
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
              <Loader2 className="h-6 w-6 animate-spin text-purple" />
            </div>
          ) : (
            <DiffViewer
              original={originalContent}
              modified={modifiedContent}
              language={language}
              originalLabel={originalVersion === "working" ? "Working tree" : originalVersion.slice(0, 7)}
              modifiedLabel={modifiedVersion === "working" ? "Working tree" : modifiedVersion.slice(0, 7)}
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
