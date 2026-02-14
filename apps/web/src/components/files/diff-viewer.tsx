import { DiffEditor } from "@monaco-editor/react";

interface DiffViewerProps {
  original: string;
  modified: string;
  language: string;
  originalLabel?: string;
  modifiedLabel?: string;
}

export function DiffViewer({
  original,
  modified,
  language,
  originalLabel = "Original",
  modifiedLabel = "Modified",
}: DiffViewerProps) {
  return (
    <DiffEditor
      height="100%"
      language={language}
      original={original}
      modified={modified}
      theme="vs-dark"
      options={{
        readOnly: true,
        renderSideBySide: true,
        enableSplitViewResizing: true,
        originalEditable: false,
        minimap: { enabled: true },
        fontSize: 12,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        renderOverviewRuler: true,
        scrollbar: {
          vertical: "visible",
          horizontal: "visible",
        },
        diffWordWrap: "on",
        diffAlgorithm: "advanced",
      }}
      loading={
        <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
          <div className="text-[13px] text-white/50">Loading diff...</div>
        </div>
      }
    />
  );
}
