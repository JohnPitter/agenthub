import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { FolderOpen, Loader2 } from "lucide-react";
import { FileTree, type FileNode } from "../components/files/file-tree";
import { FileViewer } from "../components/files/file-viewer";
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="relative z-10 bg-white px-8 py-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-light">
            <FolderOpen className="h-5 w-5 text-purple" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold text-text-primary">Arquivos</h1>
            <p className="text-[12px] text-text-tertiary">
              Navegue pelos arquivos do projeto
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Tree Sidebar */}
        <div className="w-80 border-r border-edge bg-white overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-purple" />
            </div>
          ) : (
            <div className="p-3">
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
