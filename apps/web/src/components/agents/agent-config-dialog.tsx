import { useState } from "react";
import { X } from "lucide-react";
import type { Agent, AgentModel, PermissionMode } from "@agenthub/shared";

interface AgentConfigDialogProps {
  agent: Agent;
  onSave: (agentId: string, updates: Partial<Agent>) => void;
  onClose: () => void;
}

const MODELS: { value: AgentModel; label: string }[] = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
];

const PERMISSION_MODES: { value: PermissionMode; label: string; description: string }[] = [
  { value: "default", label: "Padrão", description: "Requer aprovação para ações arriscadas" },
  { value: "acceptEdits", label: "Auto-aceitar edições", description: "Aprova automaticamente edições de arquivos" },
  { value: "bypassPermissions", label: "Bypass total", description: "Sem verificação de permissões (use com cautela)" },
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
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(agent.permissionMode ?? "default");

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
      permissionMode,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-lg bg-neutral-bg1 p-6 shadow-16 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-md text-[14px] font-semibold text-white"
              style={{ backgroundColor: agent.color ?? "#0866FF" }}
            >
              {agent.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-neutral-fg1">{agent.name}</h2>
              <p className="text-[12px] text-neutral-fg3">{agent.role}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-neutral-fg3 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Model */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              Modelo
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as AgentModel)}
              className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Permission Mode */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              Modo de Permissão
            </label>
            <select
              value={permissionMode}
              onChange={(e) => setPermissionMode(e.target.value as PermissionMode)}
              className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            >
              {PERMISSION_MODES.map((pm) => (
                <option key={pm.value} value={pm.value}>{pm.label}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-neutral-fg3">
              {PERMISSION_MODES.find((pm) => pm.value === permissionMode)?.description}
            </p>
          </div>

          {/* Thinking Tokens */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              Max Thinking Tokens — {thinkingTokens > 0 ? thinkingTokens.toLocaleString() : "Desabilitado"}
            </label>
            <input
              type="range"
              min={0}
              max={32000}
              step={1000}
              value={thinkingTokens}
              onChange={(e) => setThinkingTokens(Number(e.target.value))}
              className="w-full accent-brand"
            />
            <div className="mt-1 flex justify-between text-[10px] text-neutral-fg-disabled">
              <span>Off</span>
              <span>8k</span>
              <span>16k</span>
              <span>24k</span>
              <span>32k</span>
            </div>
          </div>

          {/* Tools */}
          <div>
            <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              Ferramentas Permitidas
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_TOOLS.map((tool) => {
                const isActive = tools.includes(tool);
                return (
                  <button
                    key={tool}
                    onClick={() => handleToggleTool(tool)}
                    className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                      isActive
                        ? "bg-brand text-white"
                        : "bg-neutral-bg2 text-neutral-fg3 hover:bg-stroke2 hover:text-neutral-fg2"
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
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              System Prompt (Opcional)
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Instrucoes adicionais para o agent..."
              rows={4}
              className="w-full resize-none rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[13px] text-neutral-fg1 placeholder-neutral-fg-disabled font-mono outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-md px-5 py-2.5 text-[14px] font-medium text-neutral-fg2 transition-colors hover:bg-neutral-bg-hover"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="rounded-md bg-brand px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-brand-hover"
            >
              Salvar Configuracao
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
