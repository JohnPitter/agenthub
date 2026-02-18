import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Settings, Activity, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { api, formatRelativeTime } from "../../lib/utils";
import type { Agent, TaskLog } from "@agenthub/shared";

interface AgentConfigPanelProps {
  agent: Agent;
  onOpenConfig: () => void;
}

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-6": "Opus 4.6",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-sonnet-4-5-20250929": "Sonnet 4.5",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "gpt-5.3-codex": "GPT-5.3 Codex",
  "gpt-5.2-codex": "GPT-5.2 Codex",
  "gpt-5.1-codex": "GPT-5.1 Codex",
  "gpt-5-codex-mini": "GPT-5 Codex Mini",
  "gpt-4.1": "GPT-4.1",
  "gpt-4.1-mini": "GPT-4.1 Mini",
  "gpt-4.1-nano": "GPT-4.1 Nano",
  "o3": "o3",
  "o4-mini": "o4-mini",
  "codex-mini": "Codex Mini",
};

const ACTION_ICONS: Record<string, React.ComponentType<any>> = {
  create: CheckCircle2,
  update: Activity,
  assign: Activity,
  complete: CheckCircle2,
  fail: XCircle,
  error: AlertCircle,
};

export function AgentConfigPanel({ agent, onOpenConfig }: AgentConfigPanelProps) {
  const { t } = useTranslation();
  const [activityLogs, setActivityLogs] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showActivity, setShowActivity] = useState(false);

  useEffect(() => {
    if (showActivity) {
      fetchActivityLogs();
    }
  }, [showActivity, agent.id]);

  const fetchActivityLogs = async () => {
    setLoading(true);
    try {
      const logs = await api<TaskLog[]>(`/agents/${agent.id}/activity?limit=20`);
      setActivityLogs(logs);
    } catch (error) {
      console.error("Failed to fetch activity logs:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl animate-fade-up">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-[22px] font-semibold text-white shadow-brand"
          style={{ backgroundColor: agent.color ?? "#6366F1" }}
        >
          {agent.name.charAt(0)}
        </div>
        <div className="flex-1">
          <h2 className="text-heading text-neutral-fg1">{agent.name}</h2>
          <p className="text-subtitle">{t(`roles.${agent.role}`, agent.role)}</p>
        </div>
        <button
          onClick={onOpenConfig}
          className="btn-secondary flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px]"
        >
          <Settings className="h-3.5 w-3.5" />
          {t("agents.configure")}
        </button>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="card-glow p-5">
          <dt className="text-label mb-2">{t("agents.model")}</dt>
          <dd className="text-[13px] text-neutral-fg1 font-mono">
            {MODEL_LABELS[agent.model] ?? agent.model}
          </dd>
        </div>

        <div className="card-glow p-5">
          <dt className="text-label mb-2">{t("tasks.status")}</dt>
          <dd>
            {agent.isActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-light px-3 py-1 text-[11px] font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
                {t("common.active")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-bg1 px-3 py-1 text-[11px] font-semibold text-neutral-fg3">
                {t("common.inactive")}
              </span>
            )}
          </dd>
        </div>

        <div className="card-glow p-5">
          <dt className="text-label mb-2">{t("agents.permissions")}</dt>
          <dd className="text-[13px] text-neutral-fg1">
            {t(`permissions.${agent.permissionMode}`, agent.permissionMode)}
          </dd>
        </div>

        <div className="card-glow p-5">
          <dt className="text-label mb-2">{t("agents.thinkingTokens")}</dt>
          <dd className="text-[13px] text-neutral-fg1">
            {agent.maxThinkingTokens ? agent.maxThinkingTokens.toLocaleString() : t("common.inactive")}
          </dd>
        </div>
      </div>

      {/* Tools */}
      {Array.isArray(agent.allowedTools) && agent.allowedTools.length > 0 && (
        <div className="mb-8">
          <h3 className="text-label mb-3">
            {t("agents.tools")} ({agent.allowedTools.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {agent.allowedTools.map((tool) => (
              <span
                key={tool}
                className="badge badge-primary"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* System Prompt */}
      {agent.systemPrompt && (
        <div className="mb-8">
          <h3 className="text-label mb-3">
            System Prompt
          </h3>
          <div className="card-glow px-5 py-4">
            <p className="text-[12px] text-neutral-fg2 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto font-mono">
              {agent.systemPrompt}
            </p>
          </div>
        </div>
      )}

      {/* Activity History Toggle */}
      <div className="section-divider" />
      <div className="pt-2">
        <button
          onClick={() => setShowActivity(!showActivity)}
          className="flex w-full items-center justify-between card-interactive px-5 py-4 text-left"
        >
          <div className="flex items-center gap-2.5">
            <Activity className="h-4 w-4 text-brand" />
            <span className="text-[13px] font-semibold text-neutral-fg1">{t("dashboard.recentActivity")}</span>
          </div>
          <span className="text-[11px] text-neutral-fg3">
            {showActivity ? t("common.less") : t("common.more")}
          </span>
        </button>

        {/* Activity Logs */}
        {showActivity && (
          <div className="mt-4 card-glow divide-y divide-stroke2 max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="h-8 w-8 text-neutral-fg-disabled mb-2" />
                <p className="text-[13px] text-neutral-fg3">{t("dashboard.noActivities")}</p>
              </div>
            ) : (
              activityLogs.map((log) => {
                const ActionIcon = ACTION_ICONS[log.action] ?? Activity;
                return (
                  <div key={log.id} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-bg3">
                      <ActionIcon className="h-4 w-4 text-brand" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-medium text-neutral-fg1 capitalize">{log.action}</span>
                        {log.fromStatus && log.toStatus && (
                          <span className="text-[11px] text-neutral-fg3">
                            {log.fromStatus} → {log.toStatus}
                          </span>
                        )}
                      </div>
                      {log.detail && (
                        <p className="text-[12px] text-neutral-fg2 mb-1">{log.detail}</p>
                      )}
                      {log.filePath && (
                        <p className="text-[11px] text-neutral-fg3 font-mono truncate">{log.filePath}</p>
                      )}
                      <p className="text-[10px] text-neutral-fg-disabled mt-1">
                        {formatRelativeTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
