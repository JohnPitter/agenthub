import { DiffEditor } from "@monaco-editor/react";
import { useThemeStore } from "../../stores/theme-store";

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
  const { theme } = useThemeStore();
  const monacoTheme = theme === "light" ? "vs" : "vs-dark";

  return (
    <DiffEditor
      height="100%"
      language={language}
      original={original}
      modified={modified}
      theme={monacoTheme}
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
        <div className="flex h-full items-center justify-center bg-neutral-bg2">
          <div className="text-[13px] text-neutral-fg3">Loading diff...</div>
        </div>
      }
    />
  );
}
