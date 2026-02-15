import { useState, useEffect } from "react";
import { Settings, Activity, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { api, formatRelativeTime } from "../../lib/utils";
import type { Agent, TaskLog } from "@agenthub/shared";

interface AgentConfigPanelProps {
  agent: Agent;
  onOpenConfig: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  architect: "Arquiteto",
  tech_lead: "Tech Lead",
  frontend_dev: "Frontend Dev",
  backend_dev: "Backend Dev",
  qa: "QA Engineer",
};

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-6": "Opus 4.6",
  "claude-sonnet-4-5-20250929": "Sonnet 4.5",
};

const PERMISSION_LABELS: Record<string, string> = {
  default: "Padrão",
  acceptEdits: "Auto-aceitar edições",
  bypassPermissions: "Bypass total",
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
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-[20px] font-semibold text-white"
          style={{ backgroundColor: agent.color ?? "#0866FF" }}
        >
          {agent.name.charAt(0)}
        </div>
        <div className="flex-1">
          <h2 className="text-[18px] font-semibold text-neutral-fg1">{agent.name}</h2>
          <p className="text-[13px] text-neutral-fg3">{ROLE_LABELS[agent.role] ?? agent.role}</p>
        </div>
        <button
          onClick={onOpenConfig}
          className="flex items-center gap-1.5 rounded-md border border-stroke px-3 py-1.5 text-[12px] font-semibold text-neutral-fg2 hover:bg-neutral-bg-hover transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Configurar
        </button>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg border border-stroke bg-neutral-bg2 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-2">Modelo</dt>
          <dd className="text-[13px] text-neutral-fg1 font-mono">
            {MODEL_LABELS[agent.model] ?? agent.model}
          </dd>
        </div>

        <div className="rounded-lg border border-stroke bg-neutral-bg2 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-2">Status</dt>
          <dd>
            {agent.isActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-light px-2.5 py-1 text-[11px] font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Ativo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-bg1 px-2.5 py-1 text-[11px] font-semibold text-neutral-fg3">
                Inativo
              </span>
            )}
          </dd>
        </div>

        <div className="rounded-lg border border-stroke bg-neutral-bg2 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-2">Permissões</dt>
          <dd className="text-[13px] text-neutral-fg1">
            {PERMISSION_LABELS[agent.permissionMode] ?? agent.permissionMode}
          </dd>
        </div>

        <div className="rounded-lg border border-stroke bg-neutral-bg2 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 mb-2">Thinking Tokens</dt>
          <dd className="text-[13px] text-neutral-fg1">
            {agent.maxThinkingTokens ? agent.maxThinkingTokens.toLocaleString() : "Desabilitado"}
          </dd>
        </div>
      </div>

      {/* Tools */}
      {Array.isArray(agent.allowedTools) && agent.allowedTools.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2 mb-3">
            Ferramentas Ativas ({agent.allowedTools.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {agent.allowedTools.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center rounded-md bg-brand-light px-2.5 py-1 text-[11px] font-medium text-brand"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* System Prompt */}
      {agent.systemPrompt && (
        <div className="mb-6">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2 mb-2">
            System Prompt
          </h3>
          <div className="rounded-lg border border-stroke bg-neutral-bg2 px-4 py-3">
            <p className="text-[12px] text-neutral-fg2 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto font-mono">
              {agent.systemPrompt}
            </p>
          </div>
        </div>
      )}

      {/* Activity History Toggle */}
      <div className="border-t border-stroke pt-6">
        <button
          onClick={() => setShowActivity(!showActivity)}
          className="flex w-full items-center justify-between rounded-lg border border-stroke bg-neutral-bg1 px-4 py-3 text-left transition-colors hover:bg-neutral-bg-hover"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-brand" />
            <span className="text-[13px] font-semibold text-neutral-fg1">Histórico de Atividades</span>
          </div>
          <span className="text-[11px] text-neutral-fg3">
            {showActivity ? "Ocultar" : "Mostrar"}
          </span>
        </button>

        {/* Activity Logs */}
        {showActivity && (
          <div className="mt-4 rounded-lg border border-stroke bg-neutral-bg2 divide-y divide-stroke max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="h-8 w-8 text-neutral-fg-disabled mb-2" />
                <p className="text-[13px] text-neutral-fg3">Nenhuma atividade registrada</p>
              </div>
            ) : (
              activityLogs.map((log) => {
                const ActionIcon = ACTION_ICONS[log.action] ?? Activity;
                return (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-bg1">
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
