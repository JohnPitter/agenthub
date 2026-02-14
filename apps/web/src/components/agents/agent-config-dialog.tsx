import { useState } from "react";
import { X } from "lucide-react";
import type { Agent, AgentModel } from "@agenthub/shared";

interface AgentConfigDialogProps {
  agent: Agent;
  onSave: (agentId: string, updates: Partial<Agent>) => void;
  onClose: () => void;
}

const MODELS: { value: AgentModel; label: string }[] = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
];

const ALL_TOOLS = ["Read", "Glob", "Grep", "Bash", "Write", "Edit", "Task", "WebSearch", "WebFetch"];

export function AgentConfigDialog({ agent, onSave, onClose }: AgentConfigDialogProps) {
  const parsedTools: string[] = typeof agent.allowedTools === "string"
    ? JSON.parse(agent.allowedTools)
    : agent.allowedTools ?? [];

  const [model, setModel] = useState<AgentModel>(agent.model);
  const [thinkingTokens, setThinkingTokens] = useState(agent.maxThinkingTokens ?? 0);
  const [tools, setTools] = useState<string[]>(parsedTools);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? "");

  const handleToggleTool = (tool: string) => {
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  };

  const handleSave = () => {
    onSave(agent.id, {
      model,
      maxThinkingTokens: thinkingTokens > 0 ? thinkingTokens : null,
      allowedTools: tools,
      systemPrompt: systemPrompt.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-lg animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[14px] font-bold text-white"
              style={{ backgroundColor: agent.color ?? "#FF5C35" }}
            >
              {agent.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-text-primary">{agent.name}</h2>
              <p className="text-[12px] text-text-tertiary">{agent.role}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-text-tertiary transition-colors hover:bg-page hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Model */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
              Modelo
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as AgentModel)}
              className="w-full rounded-xl border border-edge bg-page px-4 py-3 text-[14px] text-text-primary outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-muted"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Thinking Tokens */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
              Max Thinking Tokens — {thinkingTokens > 0 ? thinkingTokens.toLocaleString() : "Desabilitado"}
            </label>
            <input
              type="range"
              min={0}
              max={32000}
              step={1000}
              value={thinkingTokens}
              onChange={(e) => setThinkingTokens(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-[10px] text-text-placeholder">
              <span>Off</span>
              <span>8k</span>
              <span>16k</span>
              <span>24k</span>
              <span>32k</span>
            </div>
          </div>

          {/* Tools */}
          <div>
            <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
              Ferramentas Permitidas
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_TOOLS.map((tool) => {
                const isActive = tools.includes(tool);
                return (
                  <button
                    key={tool}
                    onClick={() => handleToggleTool(tool)}
                    className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${
                      isActive
                        ? "bg-primary text-white shadow-sm"
                        : "bg-page text-text-tertiary hover:bg-edge-light hover:text-text-secondary"
                    }`}
                  >
                    {tool}
                  </button>
                );
              })}
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
              System Prompt (Opcional)
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Instruções adicionais para o agent..."
              rows={4}
              className="w-full resize-none rounded-xl border border-edge bg-page px-4 py-3 text-[13px] text-text-primary placeholder-text-placeholder font-mono outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-muted"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-xl px-5 py-2.5 text-[14px] font-medium text-text-secondary transition-colors hover:bg-page"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="rounded-xl bg-primary px-6 py-2.5 text-[14px] font-medium text-white shadow-sm transition-all hover:bg-primary-hover active:scale-[0.98]"
            >
              Salvar Configuração
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
