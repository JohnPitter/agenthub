import { useState, useRef } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import * as monaco from "monaco-editor";
import { useThemeStore } from "../../stores/theme-store";

interface CodeEditorProps {
  value: string;
  language: string;
  readOnly?: boolean;
  onChange?: (value: string | undefined) => void;
  onSave?: () => void;
  onEditorMount?: (editor: editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => void;
}

export function CodeEditor({ value, language, readOnly = false, onChange, onSave, onEditorMount }: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [isReady, setIsReady] = useState(false);
  const { resolved } = useThemeStore();
  const monacoTheme = resolved === "light" ? "vs" : "vs-dark";

  const handleEditorDidMount: OnMount = (editorInstance, monacoInstance) => {
    editorRef.current = editorInstance;
    setIsReady(true);

    // Add save keybinding (Ctrl+S / Cmd+S)
    if (!readOnly && onSave) {
      editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSave();
      });
    }

    onEditorMount?.(editorInstance, monacoInstance);
  };

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      theme={monacoTheme}
      options={{
        readOnly,
        minimap: { enabled: true },
        fontSize: 12,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: "on",
        wrappingIndent: "indent",
        renderWhitespace: "selection",
        bracketPairColorization: { enabled: true },
        smoothScrolling: true,
        cursorBlinking: "smooth",
        padding: { top: 8, bottom: 8 },
      }}
      onChange={onChange}
      onMount={handleEditorDidMount}
      loading={
        <div className="flex h-full items-center justify-center bg-neutral-bg2">
          <div className="text-[13px] text-neutral-fg3">Loading editor...</div>
        </div>
      }
    />
  );
}

/**
 * Get Monaco language ID from file extension
 */
export function getLanguageFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    mjs: "javascript",
    cjs: "javascript",

    // Web
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",

    // Data/Config
    json: "json",
    jsonc: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",

    // Markdown/Docs
    md: "markdown",
    mdx: "markdown",
    txt: "plaintext",

    // Programming Languages
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",

    // Shell/Scripts
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    fish: "shell",
    ps1: "powershell",

    // Database
    sql: "sql",

    // Other
    graphql: "graphql",
    proto: "protobuf",
    dockerfile: "dockerfile",
    prisma: "prisma",
  };

  return languageMap[ext || ""] || "plaintext";
}
