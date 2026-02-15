import { useState } from "react";
import {
  AlertCircle,
  Brain,
  ChevronDown,
  Copy,
  Check,
  FileText,
  Terminal,
  Search,
  FolderSearch,
  Pencil,
  Wrench,
  Info,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { MarkdownContent } from "../../lib/markdown";
import type { Message } from "@agenthub/shared";

// --- Code Block ---
function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-md bg-neutral-fg1 p-3 font-mono text-[12px] text-white">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded-md bg-white/10 p-1.5 transition-colors hover:bg-white/20"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
      <pre className="overflow-x-auto whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

// --- Thinking Block ---
function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-brand/20 bg-brand-light p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-brand" />
          <span className="text-[12px] font-medium text-brand">Pensando...</span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-brand transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <p className="mt-2 whitespace-pre-wrap text-[12px] text-neutral-fg2">
          {content}
        </p>
      )}
    </div>
  );
}

// --- Tool Use Card ---
function ToolUseCard({ metadata }: { metadata: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = metadata ? JSON.parse(metadata) : {};
  const tool: string = parsed.tool ?? "Tool";
  const input: unknown = parsed.input;

  const toolIcons: Record<string, typeof Wrench> = {
    Read: FileText,
    Write: Pencil,
    Edit: Pencil,
    Bash: Terminal,
    Grep: Search,
    Glob: FolderSearch,
  };

  const Icon = toolIcons[tool] || Wrench;

  return (
    <div className="rounded-md border border-info/20 bg-info-light p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-info" />
        <span className="text-[12px] font-medium text-info">{tool}</span>
        {input != null && (
          <button onClick={() => setExpanded(!expanded)}>
            <ChevronDown
              className={cn(
                "h-3 w-3 text-info transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>

      {expanded && input != null && (
        <pre className="mt-2 overflow-x-auto text-[11px] text-neutral-fg3">
          {typeof input === "string" ? input : JSON.stringify(input as object, null, 2)}
        </pre>
      )}
    </div>
  );
}

// --- Main Renderer ---
export function MessageContent({ message }: { message: Message }) {
  switch (message.contentType) {
    case "code":
      return <CodeBlock code={message.content} />;

    case "thinking":
      return <ThinkingBlock content={message.content} />;

    case "tool_use":
      return <ToolUseCard metadata={message.metadata} />;

    case "error":
      return (
        <div className="flex items-start gap-2 text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-[13px]">{message.content}</p>
        </div>
      );

    case "markdown":
      return <MarkdownContent content={message.content} />;

    case "system":
      return (
        <div className="flex items-center justify-center my-2">
          <div className="flex items-center gap-2 rounded-full bg-neutral-bg-hover px-3 py-1.5">
            <Info className="h-3 w-3 text-neutral-fg3" />
            <p className="text-[11px] text-neutral-fg3">{message.content}</p>
          </div>
        </div>
      );

    default:
      return <p className="whitespace-pre-wrap text-[13px]">{message.content}</p>;
  }
}
