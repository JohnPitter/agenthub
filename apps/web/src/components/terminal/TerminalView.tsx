import { useEffect, useRef, useCallback, useState } from "react";
import { Wrench } from "lucide-react";
import { getSocket } from "../../lib/socket";
import { cn } from "../../lib/utils";
import type {
  AgentMessageEvent,
  AgentToolUseEvent,
  AgentResultEvent,
  AgentErrorEvent,
  AgentStreamEvent,
} from "@agenthub/shared";

interface TerminalLine {
  id: string;
  type: "message" | "tool_use" | "result" | "error" | "stream" | "system";
  content: string;
  timestamp: number;
  agentId: string;
}

interface TerminalViewProps {
  agentId: string;
  onContextUsage?: (usage: string | null) => void;
}

const CONTEXT_REGEX = /context:\s*([\d.]+k?)\s*\/\s*([\d.]+k?)/i;

const LINE_COLORS: Record<TerminalLine["type"], string> = {
  message: "text-white/80",
  tool_use: "text-cyan-400/80",
  result: "text-emerald-400/80",
  error: "text-red-400/80",
  stream: "text-white/40",
  system: "text-yellow-400/60",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function TerminalView({ agentId, onContextUsage }: TerminalViewProps) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const addLine = useCallback((line: Omit<TerminalLine, "id">) => {
    setLines((prev) => {
      const next = [...prev, { ...line, id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }];
      // Keep max 500 lines
      if (next.length > 500) return next.slice(-500);
      return next;
    });
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  }, []);

  // Subscribe to socket events for this agent
  useEffect(() => {
    const socket = getSocket();

    setLines([{
      id: "init",
      type: "system",
      content: `Connected to agent session`,
      timestamp: Date.now(),
      agentId,
    }]);

    const onMessage = (data: AgentMessageEvent) => {
      if (data.agentId !== agentId) return;
      addLine({
        type: "message",
        content: data.content,
        timestamp: Date.now(),
        agentId: data.agentId,
      });

      // Parse context usage
      if (onContextUsage) {
        const match = data.content.match(CONTEXT_REGEX);
        if (match) {
          onContextUsage(`${match[1]} / ${match[2]}`);
        }
      }
    };

    const onToolUse = (data: AgentToolUseEvent) => {
      if (data.agentId !== agentId) return;
      const inputStr = typeof data.input === "string"
        ? data.input
        : JSON.stringify(data.input, null, 0).slice(0, 200);
      addLine({
        type: "tool_use",
        content: `[tool] ${data.tool}: ${inputStr}`,
        timestamp: Date.now(),
        agentId: data.agentId,
      });
    };

    const onResult = (data: AgentResultEvent) => {
      if (data.agentId !== agentId) return;
      setIsStreaming(false);
      const costStr = data.cost > 0 ? ` ($${data.cost.toFixed(4)})` : "";
      const durationStr = data.duration > 0 ? ` [${(data.duration / 1000).toFixed(1)}s]` : "";
      addLine({
        type: data.isError ? "error" : "result",
        content: data.isError
          ? `[error] ${data.errors?.join(", ") ?? "Unknown error"}`
          : `[done]${costStr}${durationStr} ${data.result?.slice(0, 300) ?? ""}`,
        timestamp: Date.now(),
        agentId: data.agentId,
      });
    };

    const onError = (data: AgentErrorEvent) => {
      if (data.agentId !== agentId) return;
      setIsStreaming(false);
      addLine({
        type: "error",
        content: `[error] ${data.error}`,
        timestamp: Date.now(),
        agentId: data.agentId,
      });
    };

    const onStream = (data: AgentStreamEvent) => {
      if (data.agentId !== agentId) return;
      setIsStreaming(true);
    };

    socket.on("agent:message", onMessage);
    socket.on("agent:tool_use", onToolUse);
    socket.on("agent:result", onResult);
    socket.on("agent:error", onError);
    socket.on("agent:stream", onStream);

    return () => {
      socket.off("agent:message", onMessage);
      socket.off("agent:tool_use", onToolUse);
      socket.off("agent:result", onResult);
      socket.off("agent:error", onError);
      socket.off("agent:stream", onStream);
    };
  }, [agentId, addLine, onContextUsage]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto bg-[#0a0a12] font-mono text-[13px] leading-relaxed p-4"
    >
      {lines.map((line) => (
        <div key={line.id} className="flex gap-3 py-0.5 hover:bg-white/[0.02]">
          <span className="shrink-0 text-white/15 text-[11px] tabular-nums select-none">
            {formatTime(line.timestamp)}
          </span>
          {line.type === "tool_use" && (
            <Wrench className="h-3.5 w-3.5 shrink-0 mt-0.5 text-cyan-400/50" />
          )}
          <span className={cn("whitespace-pre-wrap break-all", LINE_COLORS[line.type])}>
            {line.content}
          </span>
        </div>
      ))}

      {isStreaming && (
        <div className="flex items-center gap-2 py-1">
          <span className="text-white/15 text-[11px]">{formatTime(Date.now())}</span>
          <span className="inline-flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
            <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse [animation-delay:300ms]" />
          </span>
          <span className="text-[11px] text-white/20">thinking...</span>
        </div>
      )}

      {lines.length <= 1 && !isStreaming && (
        <div className="flex items-center justify-center h-full min-h-[200px]">
          <p className="text-white/15 text-[13px]">Waiting for agent output...</p>
        </div>
      )}
    </div>
  );
}
