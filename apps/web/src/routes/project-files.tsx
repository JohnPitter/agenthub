import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Loader2, ChevronRight } from "lucide-react";
import { FileTree, type FileNode } from "../components/files/file-tree";
import { FileViewer } from "../components/files/file-viewer";
import { CommandBar } from "../components/layout/command-bar";
import { api } from "../lib/utils";

export function ProjectFiles() {
  const { id } = useParams<{ id: string }>();
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchFiles = async () => {
      try {
        const data = await api(`/projects/${id}/files`) as { files: FileNode[] };
        setFiles(data.files);
      } catch (error) {
        console.error("Failed to fetch files:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, [id]);

  const pathSegments = selectedFile ? selectedFile.split(/[/\\]/).filter(Boolean) : [];

  return (
    <div className="flex h-full flex-col">
      {/* Command Bar with breadcrumb */}
      <CommandBar>
        {selectedFile ? (
          <div className="flex items-center gap-1 text-[13px] min-w-0">
            {pathSegments.map((segment, i) => {
              const isLast = i === pathSegments.length - 1;
              return (
                <span key={i} className="flex items-center gap-1 min-w-0">
                  {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-neutral-fg-disabled" />}
                  <span
                    className={
                      isLast
                        ? "font-semibold text-neutral-fg1 truncate"
                        : "text-neutral-fg3 truncate"
                    }
                  >
                    {segment}
                  </span>
                </span>
              );
            })}
          </div>
        ) : (
          <span className="text-[13px] text-neutral-fg3">Selecione um arquivo</span>
        )}
      </CommandBar>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Tree Sidebar */}
        <div className="w-64 shrink-0 border-r border-stroke2 bg-neutral-bg1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-purple" />
            </div>
          ) : (
            <div className="p-4">
              <FileTree
                files={files}
                onFileSelect={setSelectedFile}
                selectedPath={selectedFile ?? undefined}
              />
            </div>
          )}
        </div>

        {/* File Viewer */}
        <div className="flex-1 overflow-hidden">
          {id && <FileViewer projectId={id} filePath={selectedFile} />}
        </div>
      </div>
    </div>
  );
}
