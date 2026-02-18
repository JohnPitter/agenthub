import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Brain, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { AVATAR_PRESETS, getAgentAvatarUrl } from "../../lib/agent-avatar";
import { useUsageStore } from "../../stores/usage-store";
import type { Agent, AgentModel, AgentRole, PermissionMode } from "@agenthub/shared";
import { DEFAULT_SOULS, OPENAI_MODELS } from "@agenthub/shared";

interface AgentConfigDialogProps {
  agent: Agent;
  onSave: (agentId: string, updates: Partial<Agent>) => void;
  onClose: () => void;
}

const FALLBACK_MODELS: { value: string; label: string }[] = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

const OPENAI_MODEL_OPTIONS: { value: string; label: string }[] = OPENAI_MODELS.map((m) => ({
  value: m.id,
  label: m.label,
}));

// SDK returns shorthand aliases — map to actual model IDs
const SDK_ALIAS_TO_MODEL: Record<string, { value: string; label: string }> = {
  default: { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  opus: { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  sonnet: { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  haiku: { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
};

const PERMISSION_MODE_VALUES: PermissionMode[] = ["default", "acceptEdits", "bypassPermissions"];

const LEVEL_VALUES: Agent["level"][] = ["junior", "pleno", "senior", "especialista", "arquiteto"];

const ALL_TOOLS = ["Read", "Glob", "Grep", "Bash", "Write", "Edit", "Task", "WebSearch", "WebFetch"];

export function AgentConfigDialog({ agent, onSave, onClose }: AgentConfigDialogProps) {
  const { t } = useTranslation();
  const { models: sdkModels, fetchModels } = useUsageStore();
  const [openaiConnected, setOpenaiConnected] = useState(false);

  useEffect(() => {
    fetchModels();
    // Check OpenAI connection status
    fetch("/api/openai/status", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setOpenaiConnected(data.connected === true))
      .catch(() => {});
  }, [fetchModels]);

  const modelOptions = (() => {
    // Build Claude models list
    let claudeModels: { value: string; label: string }[];
    if (sdkModels.length === 0) {
      claudeModels = FALLBACK_MODELS;
    } else {
      const seen = new Set<string>();
      const mapped: { value: string; label: string }[] = [];
      for (const m of sdkModels) {
        const alias = SDK_ALIAS_TO_MODEL[m.value];
        const entry = alias ?? { value: m.value, label: m.displayName };
        if (!seen.has(entry.value)) {
          seen.add(entry.value);
          mapped.push(entry);
        }
      }
      claudeModels = mapped.length > 0 ? mapped : FALLBACK_MODELS;
    }

    // Add OpenAI models if connected
    if (openaiConnected) {
      return [...claudeModels, ...OPENAI_MODEL_OPTIONS];
    }
    return claudeModels;
  })();

  const parsedTools: string[] = typeof agent.allowedTools === "string"
    ? JSON.parse(agent.allowedTools)
    : agent.allowedTools ?? [];

  const [model, setModel] = useState<AgentModel>(agent.model);
  const [thinkingTokens, setThinkingTokens] = useState(agent.maxThinkingTokens ?? 0);
  const [tools, setTools] = useState<string[]>(parsedTools);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? "");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(agent.permissionMode ?? "default");
  const [level, setLevel] = useState<Agent["level"]>(agent.level ?? "senior");
  const [avatar, setAvatar] = useState(agent.avatar ?? "");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [soul, setSoul] = useState(agent.soul ?? "");

  const handleToggleTool = (tool: string) => {
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  };

  const handleSave = () => {
    onSave(agent.id, {
      model,
      level,
      avatar: avatar || undefined,
      maxThinkingTokens: thinkingTokens > 0 ? thinkingTokens : null,
      allowedTools: tools,
      systemPrompt: systemPrompt.trim() || undefined,
      permissionMode,
      soul: soul.trim() || null,
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
            {getAgentAvatarUrl(avatar) ? (
              <img
                src={getAgentAvatarUrl(avatar, 40)!}
                alt={agent.name}
                className="h-10 w-10 rounded-md bg-neutral-bg2"
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-md text-[14px] font-semibold text-white"
                style={{ backgroundColor: agent.color ?? "#0866FF" }}
              >
                {agent.name.charAt(0)}
              </div>
            )}
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
          {/* Avatar Picker */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("settings.avatar")}
            </label>

            {/* First category always visible */}
            <div className="grid grid-cols-8 gap-2">
              {AVATAR_PRESETS[0].avatars.map((preset) => {
                const isSelected = avatar === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setAvatar(isSelected ? "" : preset.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg p-1.5 transition-all",
                      isSelected
                        ? "bg-brand-light ring-2 ring-brand"
                        : "hover:bg-neutral-bg-hover",
                    )}
                    title={preset.label}
                  >
                    <img
                      src={getAgentAvatarUrl(preset.value, 48)!}
                      alt={preset.label}
                      className="h-10 w-10 rounded-md"
                      loading="lazy"
                    />
                    <span className="text-[9px] font-medium text-neutral-fg3 truncate w-full text-center">
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Expand to show all categories */}
            <button
              type="button"
              onClick={() => setAvatarOpen(!avatarOpen)}
              className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-brand hover:text-brand-hover transition-colors"
            >
              {avatarOpen ? t("settings.lessAvatars") : `${t("settings.moreAvatars")} (${AVATAR_PRESETS.reduce((a, g) => a + g.avatars.length, 0)})`}
              {avatarOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {avatarOpen && (
              <div className="mt-2 space-y-4 rounded-lg border border-stroke bg-neutral-bg2 p-4 animate-fade-up">
                {AVATAR_PRESETS.slice(1).map((group) => (
                  <div key={group.category}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                      {group.category}
                    </p>
                    <div className="grid grid-cols-8 gap-2">
                      {group.avatars.map((preset) => {
                        const isSelected = avatar === preset.value;
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => setAvatar(isSelected ? "" : preset.value)}
                            className={cn(
                              "flex flex-col items-center gap-1 rounded-lg p-1.5 transition-all",
                              isSelected
                                ? "bg-brand-light ring-2 ring-brand"
                                : "hover:bg-neutral-bg-hover",
                            )}
                            title={preset.label}
                          >
                            <img
                              src={getAgentAvatarUrl(preset.value, 48)!}
                              alt={preset.label}
                              className="h-10 w-10 rounded-md"
                              loading="lazy"
                            />
                            <span className="text-[9px] font-medium text-neutral-fg3 truncate w-full text-center">
                              {preset.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {avatar && (
              <button
                type="button"
                onClick={() => setAvatar("")}
                className="mt-2 text-[11px] font-medium text-danger hover:underline"
              >
                {t("settings.removeAvatar")}
              </button>
            )}
          </div>

          {/* Model */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("agents.model")}
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as AgentModel)}
              className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            >
              <optgroup label="Claude (Anthropic)">
                {modelOptions.filter((m) => m.value.startsWith("claude-")).map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </optgroup>
              {openaiConnected && (
                <optgroup label="OpenAI">
                  {OPENAI_MODEL_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Permission Mode */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("agents.permissions")}
            </label>
            <select
              value={permissionMode}
              onChange={(e) => setPermissionMode(e.target.value as PermissionMode)}
              className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            >
              {PERMISSION_MODE_VALUES.map((pm) => (
                <option key={pm} value={pm}>{t(`permissions.${pm}`)}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-neutral-fg3">
              {t(`permissions.${permissionMode}Desc`)}
            </p>
          </div>

          {/* Level */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("agents.level")}
            </label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as Agent["level"])}
              className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            >
              {LEVEL_VALUES.map((l) => (
                <option key={l} value={l}>{t(`levels.${l}`)}</option>
              ))}
            </select>
          </div>

          {/* Extended Thinking */}
          <div className="rounded-lg border border-stroke bg-neutral-bg2 p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple" />
                <label className="text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
                  Extended Thinking
                </label>
              </div>
              <button
                type="button"
                onClick={() => setThinkingTokens(thinkingTokens > 0 ? 0 : 16000)}
                className={cn(
                  "relative h-5 w-9 rounded-full transition-all duration-200",
                  thinkingTokens > 0 ? "bg-gradient-to-r from-brand to-purple shadow-brand" : "bg-stroke",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200",
                    thinkingTokens > 0 && "left-[18px]",
                  )}
                />
              </button>
            </div>
            <p className="text-[11px] text-neutral-fg3 mb-3">
              {t("agents.thinkingTokens")}
            </p>

            {thinkingTokens > 0 && (
              <div className="pt-3 border-t border-stroke">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-neutral-fg3">Budget de tokens</span>
                  <span className="text-[12px] font-semibold text-purple tabular-nums">
                    {thinkingTokens.toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  min={1024}
                  max={128000}
                  step={1024}
                  value={thinkingTokens}
                  onChange={(e) => setThinkingTokens(Number(e.target.value))}
                  className="w-full accent-purple"
                />
                <div className="mt-1 flex justify-between text-[10px] text-neutral-fg-disabled">
                  <span>1k</span>
                  <span>32k</span>
                  <span>64k</span>
                  <span>96k</span>
                  <span>128k</span>
                </div>
              </div>
            )}
          </div>

          {/* Tools */}
          <div>
            <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("agents.tools")}
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

          {/* Soul (Personality) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple" />
                <label className="text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
                  {t("agents.soul")}
                </label>
              </div>
              <button
                type="button"
                onClick={() => setSoul(DEFAULT_SOULS[agent.role as AgentRole] ?? "")}
                className="text-[11px] font-medium text-brand hover:text-brand-hover transition-colors"
              >
                Usar template
              </button>
            </div>
            <p className="mb-2 text-[11px] text-neutral-fg3">
              Define a personalidade, valores e estilo do agente. Injetado antes do prompt base.
            </p>
            <textarea
              value={soul}
              onChange={(e) => setSoul(e.target.value)}
              placeholder="# Soul: Agent Name&#10;&#10;## Personality&#10;...&#10;&#10;## Values&#10;...&#10;&#10;## Style&#10;..."
              rows={6}
              className="w-full resize-none rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[13px] text-neutral-fg1 placeholder-neutral-fg-disabled font-mono outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("agents.systemPrompt")}
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
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSave}
              className="rounded-md bg-brand px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-brand-hover"
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
