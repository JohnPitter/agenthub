import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-react";
import { cn } from "../../lib/utils";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileNode[];
}

interface FileTreeProps {
  files: FileNode[];
  onFileSelect?: (path: string) => void;
  selectedPath?: string;
}

export function FileTree({ files, onFileSelect, selectedPath }: FileTreeProps) {
  return (
    <div className="text-[12px]">
      {files.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          level={0}
          onFileSelect={onFileSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

interface FileTreeNodeProps {
  node: FileNode;
  level: number;
  onFileSelect?: (path: string) => void;
  selectedPath?: string;
}

function FileTreeNode({ node, level, onFileSelect, selectedPath }: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level === 0);

  const isDirectory = node.type === "directory";
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (isDirectory) {
      setIsExpanded(!isExpanded);
    } else {
      onFileSelect?.(node.path);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 cursor-pointer rounded-lg transition-colors",
          isSelected && "bg-purple-light",
          !isSelected && "hover:bg-page"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {isDirectory && (
          <span className="text-text-tertiary">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
        )}

        {isDirectory ? (
          isExpanded ? (
            <FolderOpen className="h-3.5 w-3.5 text-purple" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-purple" />
          )
        ) : (
          <File className="h-3.5 w-3.5 text-text-tertiary" />
        )}

        <span className={cn("flex-1", isSelected && "font-semibold text-purple")}>
          {node.name}
        </span>

        {!isDirectory && node.size && (
          <span className="text-[10px] text-text-tertiary">
            {formatFileSize(node.size)}
          </span>
        )}
      </div>

      {isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
