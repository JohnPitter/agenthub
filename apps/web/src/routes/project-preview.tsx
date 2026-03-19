import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Play, Square, RefreshCw, Loader2, Terminal, AlertCircle, ArrowLeft } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { CommandBar } from "../components/layout/command-bar";
import { api, cn } from "../lib/utils";
import { WebContainer, type FileSystemTree } from "@webcontainer/api";

type PreviewStatus = "idle" | "loading" | "installing" | "building" | "running" | "error";

interface LogLine {
  line: string;
  stream: "stdout" | "stderr";
  timestamp: number;
}

const MAX_LOG_LINES = 500;

// Singleton WebContainer instance (only one per page allowed)
let webcontainerInstance: WebContainer | null = null;

export function ProjectPreview() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const projects = useWorkspaceStore((s) => s.projects);
  const project = projects.find((p) => p.id === id);

  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const terminalRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((line: string, stream: "stdout" | "stderr" = "stdout") => {
    setLogs((prev) => {
      const next = [...prev, { line, stream, timestamp: Date.now() }];
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
    });
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const loadProjectFiles = useCallback(async (): Promise<FileSystemTree | null> => {
    if (!id) return null;

    interface FileNode {
      name: string;
      path: string;
      type: "file" | "directory";
      children?: FileNode[];
    }

    try {
      // Fetch file tree from existing files API (returns { files: FileNode[] })
      const data = await api<{ files: FileNode[] }>(`/projects/${id}/files`);
      const files = data.files;

      if (!files || !Array.isArray(files) || files.length === 0) {
        addLog("No files returned from API", "stderr");
        return null;
      }

      addLog(`File tree loaded: ${files.length} top-level entries`);

      // Convert file tree to WebContainer filesystem format
      // Only load key files to avoid overwhelming the API (package.json, src/*, etc.)
      const convertTree = async (items: FileNode[]): Promise<FileSystemTree> => {
        const fsTree: FileSystemTree = {};
        for (const item of items) {
          if (item.type === "file") {
            // Skip binary/large files
            const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
            const skipExts = new Set(["png", "jpg", "jpeg", "gif", "ico", "svg", "woff", "woff2", "ttf", "eot", "mp4", "mp3", "zip", "tar", "gz"]);
            if (skipExts.has(ext)) {
              fsTree[item.name] = { file: { contents: "" } };
              continue;
            }

            try {
              const { content } = await api<{ content: string }>(
                `/projects/${id}/files/content?path=${encodeURIComponent(item.path)}`
              );
              fsTree[item.name] = { file: { contents: content ?? "" } };
            } catch {
              fsTree[item.name] = { file: { contents: "" } };
            }
          } else if (item.type === "directory" && item.children && item.children.length > 0) {
            const children = await convertTree(item.children);
            fsTree[item.name] = { directory: children };
          }
        }
        return fsTree;
      };

      return await convertTree(files);
    } catch (err) {
      addLog(`Failed to load project files: ${err}`, "stderr");
      return null;
    }
  }, [id, addLog]);

  const handleStart = useCallback(async () => {
    if (!id || !project) return;

    setStatus("loading");
    setError(null);
    setLogs([]);
    setPreviewUrl(null);
    addLog("Initializing WebContainer...");

    try {
      // Boot WebContainer (singleton — only one per page)
      if (!webcontainerInstance) {
        webcontainerInstance = await WebContainer.boot();
      }
      const wc = webcontainerInstance;

      // Load project files
      setStatus("loading");
      addLog("Loading project files...");
      const files = await loadProjectFiles();

      if (!files || Object.keys(files).length === 0) {
        throw new Error("No files found in project");
      }

      addLog(`Loaded ${Object.keys(files).length} top-level entries`);
      await wc.mount(files);

      // Install dependencies
      setStatus("installing");
      addLog("Installing dependencies (npm install)...");

      const installProcess = await wc.spawn("npm", ["install"]);
      installProcess.output.pipeTo(new WritableStream({
        write(data) { addLog(data); },
      }));
      const installExitCode = await installProcess.exit;

      if (installExitCode !== 0) {
        throw new Error(`npm install failed with exit code ${installExitCode}`);
      }
      addLog("Dependencies installed successfully!");

      // Start dev server
      setStatus("building");
      addLog("Starting dev server...");

      // Detect start script
      let startCmd = "start";
      try {
        const pkg = await wc.fs.readFile("package.json", "utf-8");
        const pkgJson = JSON.parse(pkg);
        if (pkgJson.scripts?.dev) startCmd = "dev";
        else if (pkgJson.scripts?.start) startCmd = "start";
        else if (pkgJson.scripts?.serve) startCmd = "serve";
      } catch { /* use default */ }

      const serverProcess = await wc.spawn("npm", ["run", startCmd]);
      serverProcess.output.pipeTo(new WritableStream({
        write(data) { addLog(data); },
      }));

      // Listen for server-ready event
      wc.on("server-ready", (_port, url) => {
        addLog(`Server ready at ${url}`);
        setPreviewUrl(url);
        setStatus("running");
      });

      // Handle process exit
      serverProcess.exit.then((code) => {
        if (code !== 0) {
          addLog(`Dev server exited with code ${code}`, "stderr");
          setStatus("error");
          setError(`Dev server exited with code ${code}`);
        }
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Error: ${msg}`, "stderr");
      setError(msg);
      setStatus("error");
    }
  }, [id, project, addLog, loadProjectFiles]);

  const handleStop = useCallback(async () => {
    if (webcontainerInstance) {
      webcontainerInstance.teardown();
      webcontainerInstance = null;
    }
    setStatus("idle");
    setPreviewUrl(null);
    setLogs([]);
  }, []);

  const handleRefresh = () => setIframeKey((k) => k + 1);

  if (!project) {
    return <div className="p-6 text-neutral-fg2">{t("project.notFound")}</div>;
  }

  const STATUS_LABELS: Record<PreviewStatus, { label: string; cls: string }> = {
    idle: { label: "Parado", cls: "bg-neutral-fg-disabled" },
    loading: { label: "Carregando arquivos...", cls: "bg-info animate-pulse" },
    installing: { label: "Instalando dependências...", cls: "bg-warning animate-pulse" },
    building: { label: "Iniciando servidor...", cls: "bg-warning animate-pulse" },
    running: { label: "Preview ativo", cls: "bg-success" },
    error: { label: "Erro", cls: "bg-danger" },
  };

  const indicator = STATUS_LABELS[status];
  const isIdle = status === "idle";
  const isRunning = status === "running";
  const isLoading = ["loading", "installing", "building"].includes(status);
  const isError = status === "error";

  return (
    <div className="flex h-full flex-col">
      <CommandBar
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", indicator.cls)} />
              <span className="text-[12px] font-medium text-neutral-fg3">{indicator.label}</span>
            </div>

            <div className="h-5 w-px bg-stroke2" />

            {isIdle || isError ? (
              <button
                onClick={handleStart}
                disabled={isLoading}
                className="flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-[13px] font-semibold text-white transition-all hover:bg-success/90 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                Preview
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-[13px] font-semibold text-white transition-all hover:bg-danger/90"
              >
                <Square className="h-4 w-4" />
                Parar
              </button>
            )}

            {isRunning && previewUrl && (
              <button
                onClick={handleRefresh}
                className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg1 transition-colors"
                title="Recarregar"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </div>
        }
      >
        <Link
          to={`/project/${id}`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg1 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="h-5 w-px bg-stroke2" />
        <Terminal className="h-4 w-4 text-neutral-fg3" />
        <span className="text-[14px] font-semibold text-neutral-fg1">Preview</span>
      </CommandBar>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Idle state */}
        {isIdle && logs.length === 0 && !error && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center max-w-md">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-light">
                <Play className="h-8 w-8 text-brand" />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-neutral-fg1">Preview do Projeto</h3>
                <p className="mt-2 text-[13px] text-neutral-fg3 leading-relaxed">
                  Executa o projeto diretamente no browser usando WebContainer.
                  Instala dependências, inicia o dev server, e mostra o preview em tempo real.
                </p>
              </div>
              <button
                onClick={handleStart}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand to-purple px-6 py-3 text-[14px] font-semibold text-white shadow-brand transition-all hover:shadow-lg"
              >
                <Play className="h-5 w-5" />
                Iniciar Preview
              </button>
            </div>
          </div>
        )}

        {/* Active state: iframe + terminal */}
        {(!isIdle || logs.length > 0 || error) && (
          <>
            <div className="flex-1 bg-neutral-bg1 relative">
              {isRunning && previewUrl ? (
                <iframe
                  key={iframeKey}
                  src={previewUrl}
                  className="h-full w-full border-0"
                  title="Project Preview"
                />
              ) : isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 text-brand animate-spin" />
                    <p className="text-[13px] text-neutral-fg3">{indicator.label}</p>
                  </div>
                </div>
              ) : isError ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <AlertCircle className="h-8 w-8 text-danger" />
                    <p className="text-[13px] text-danger font-medium">{error}</p>
                    <button onClick={handleStart} className="btn-secondary text-[12px] mt-2">
                      Tentar novamente
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Terminal output */}
            <div className="shrink-0 border-t border-stroke2 bg-neutral-bg-subtle">
              <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2">
                <Terminal className="h-3.5 w-3.5 text-neutral-fg-disabled" />
                <span className="text-[11px] font-semibold text-neutral-fg-disabled uppercase tracking-wider">
                  Terminal
                </span>
                <span className="ml-auto text-[10px] text-neutral-fg-disabled tabular-nums">
                  {logs.length} linhas
                </span>
              </div>
              <div
                ref={terminalRef}
                className="h-48 overflow-y-auto px-4 py-2 font-mono text-[12px] leading-5"
              >
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className={cn(
                      "whitespace-pre-wrap break-all",
                      log.stream === "stderr" ? "text-red-400" : "text-neutral-300",
                    )}
                  >
                    {log.line}
                  </div>
                ))}
                {logs.length === 0 && (
                  <span className="text-neutral-500">Aguardando início...</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
