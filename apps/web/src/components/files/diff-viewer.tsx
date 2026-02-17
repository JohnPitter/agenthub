import { useRef, useEffect } from "react";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
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
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);

  const handleMount: DiffOnMount = (editor) => {
    editorRef.current = editor;
  };

  // Dispose editor models before component unmounts to prevent
  // "TextModel got disposed before DiffEditorWidget model got reset" error
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        try {
          const original = editorRef.current.getModel()?.original;
          const modified = editorRef.current.getModel()?.modified;
          editorRef.current.dispose();
          original?.dispose();
          modified?.dispose();
        } catch {
          /* already disposed */
        }
        editorRef.current = null;
      }
    };
  }, []);

  return (
    <DiffEditor
      height="100%"
      language={language}
      original={original}
      modified={modified}
      theme={monacoTheme}
      onMount={handleMount}
      keepCurrentOriginalModel={false}
      keepCurrentModifiedModel={false}
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
