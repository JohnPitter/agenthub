import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Play, Square, RefreshCw, Loader2, Terminal, AlertCircle, ExternalLink, ArrowLeft } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useSocket } from "../hooks/use-socket";
import { CommandBar } from "../components/layout/command-bar";
import { api, cn } from "../lib/utils";
import type { DevServerOutputEvent, DevServerStatusEvent } from "@agenthub/shared";

type ServerStatus = "stopped" | "starting" | "running" | "error";

interface LogLine {
  line: string;
  stream: "stdout" | "stderr";
  timestamp: number;
}

const MAX_LOG_LINES = 500;

export function ProjectPreview() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const projects = useWorkspaceStore((s) => s.projects);
  const project = projects.find((p) => p.id === id);

  const [status, setStatus] = useState<ServerStatus>("stopped");
  const [port, setPort] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Socket handlers for real-time updates
  const handleDevServerOutput = useCallback((data: DevServerOutputEvent) => {
    if (data.projectId !== id) return;
    setLogs((prev) => {
      const next = [...prev, { line: data.line, stream: data.stream, timestamp: data.timestamp }];
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
    });
  }, [id]);

  const handleDevServerStatus = useCallback((data: DevServerStatusEvent) => {
    if (data.projectId !== id) return;
    setStatus(data.status);
    if (data.port) setPort(data.port);
    if (data.error) setError(data.error);
    if (data.status === "stopped") {
      setPort(null);
      setError(null);
    }
  }, [id]);

  useSocket(id, {
    onDevServerOutput: handleDevServerOutput,
    onDevServerStatus: handleDevServerStatus,
  });

  // Fetch initial status on mount
  useEffect(() => {
    if (!id) return;
    api<{ status: ServerStatus; port: number | null; logs: string[] }>(
      `/projects/${id}/dev-server/status`
    ).then((data) => {
      setStatus(data.status);
      if (data.port) setPort(data.port);
      if (data.logs.length > 0) {
        setLogs(data.logs.map((line) => ({ line, stream: "stdout" as const, timestamp: Date.now() })));
      }
    }).catch(() => {});
  }, [id]);

  // Auto-scroll terminal
  useEffect(() => {
    const el = terminalRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  const handleStart = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setLogs([]);
    try {
      await api(`/projects/${id}/dev-server/start`, { method: "POST" });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("project.previewError"));
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!id) return;
    setLoading(true);
    try {
      await api(`/projects/${id}/dev-server/stop`, { method: "POST" });
      setStatus("stopped");
      setPort(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("project.previewStopError"));
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setIframeKey((k) => k + 1);
  };

  if (!project) {
    return <div className="p-6 text-neutral-fg2">{t("project.notFound")}</div>;
  }

  const isStopped = status === "stopped";
  const isStarting = status === "starting";
  const isRunning = status === "running";
  const isError = status === "error";

  const STATUS_INDICATOR: Record<ServerStatus, { labelKey: string; cls: string }> = {
    stopped: { labelKey: "project.previewStopped", cls: "bg-neutral-fg-disabled" },
    starting: { labelKey: "project.previewStarting", cls: "bg-warning animate-pulse" },
    running: { labelKey: "project.previewRunning", cls: "bg-success" },
    error: { labelKey: "common.error", cls: "bg-danger" },
  };

  const indicator = STATUS_INDICATOR[status];

  return (
    <div className="flex h-full flex-col">
      {/* Command Bar with controls */}
      <CommandBar
        actions={
          <div className="flex items-center gap-3">
            {/* Status indicator */}
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", indicator.cls)} />
              <span className="text-[12px] font-medium text-neutral-fg3">{t(indicator.labelKey)}</span>
              {port && (
                <span className="text-[11px] font-mono text-neutral-fg-disabled">:{port}</span>
              )}
            </div>

            <div className="h-5 w-px bg-stroke2" />

            {/* Start / Stop buttons */}
            {isStopped || isError ? (
              <button
                onClick={handleStart}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-[13px] font-semibold text-white transition-all hover:bg-success/90 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {t("project.previewStart")}
              </button>
            ) : (
              <button
                onClick={handleStop}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-[13px] font-semibold text-white transition-all hover:bg-danger/90 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                {t("project.previewStop")}
              </button>
            )}

            {/* Refresh iframe button */}
            {isRunning && port && (
              <>
                <button
                  onClick={handleRefresh}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg1 transition-colors"
                  title={t("project.previewReload")}
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <a
                  href={`/api/projects/${id}/preview/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg1 transition-colors"
                  title={t("project.previewOpenTab")}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </>
            )}
          </div>
        }
      >
        <Link
          to={`/project/${id}`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg1 transition-colors"
          title={t("common.back")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="h-5 w-px bg-stroke2" />
        <Terminal className="h-4 w-4 text-neutral-fg3" />
        <span className="text-[14px] font-semibold text-neutral-fg1">Preview</span>
      </CommandBar>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Idle state */}
        {isStopped && logs.length === 0 && !error && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-light">
                <Play className="h-8 w-8 text-brand" />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-neutral-fg1">{t("project.previewStartServer")}</h3>
                <p className="mt-1 text-[13px] text-neutral-fg3">
                  {t("project.previewStartHint")}
                </p>
              </div>
              <button
                onClick={handleStart}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand to-purple px-6 py-3 text-[14px] font-semibold text-white shadow-brand transition-all hover:shadow-lg disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
                {t("project.previewStartServer")}
              </button>
            </div>
          </div>
        )}

        {/* Active state: iframe + terminal */}
        {(!isStopped || logs.length > 0 || error) && (
          <>
            {/* Iframe area */}
            <div className="flex-1 bg-neutral-bg1 relative">
              {isRunning ? (
                <iframe
                  key={iframeKey}
                  src={`/api/projects/${id}/preview/`}
                  className="h-full w-full border-0"
                  title="Project Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                />
              ) : isStarting ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 text-brand animate-spin" />
                    <p className="text-[13px] text-neutral-fg3">{t("project.previewWaiting")}</p>
                  </div>
                </div>
              ) : isError ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <AlertCircle className="h-8 w-8 text-danger" />
                    <p className="text-[13px] text-danger font-medium">{error ?? t("project.previewError")}</p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Terminal output */}
            <div className="shrink-0 border-t border-stroke2 bg-neutral-bg-subtle">
              <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2">
                <Terminal className="h-3.5 w-3.5 text-neutral-fg-disabled" />
                <span className="text-[11px] font-semibold text-neutral-fg-disabled uppercase tracking-wider">
                  Output
                </span>
                <span className="ml-auto text-[10px] text-neutral-fg-disabled tabular-nums">
                  {logs.length} {t("project.previewLines")}
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
                  <span className="text-neutral-500">{t("project.previewAwaitingOutput")}</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
