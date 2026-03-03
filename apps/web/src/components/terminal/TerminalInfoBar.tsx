import { ALL_MODELS } from "@agenthub/shared";
import type { Agent } from "@agenthub/shared";

interface TerminalInfoBarProps {
  agent: Agent;
  contextUsage: string | null;
}

function getModelLabel(modelId: string): string {
  const model = ALL_MODELS.find((m) => m.id === modelId);
  return model?.label ?? modelId;
}

function getProviderColor(modelId: string): string {
  if (modelId.startsWith("gpt-") || modelId.startsWith("o3") || modelId.startsWith("o4") || modelId.startsWith("codex")) {
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
  }
  if (modelId.startsWith("gemini-")) {
    return "bg-blue-500/15 text-blue-400 border-blue-500/20";
  }
  return "bg-orange-500/15 text-orange-400 border-orange-500/20";
}

export function TerminalInfoBar({ agent, contextUsage }: TerminalInfoBarProps) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-white/5 bg-[#0d0d14] px-4">
      {/* Left: agent name + model */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
        <span className="text-[13px] font-medium text-white/80 truncate">
          {agent.name}
        </span>
        <span className="text-white/15">&middot;</span>
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${getProviderColor(agent.model)}`}
        >
          {getModelLabel(agent.model)}
        </span>
      </div>

      {/* Right: context usage */}
      {contextUsage && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-white/30">context</span>
          <span className="text-[11px] font-mono text-white/50">{contextUsage}</span>
        </div>
      )}
    </div>
  );
}
