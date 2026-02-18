import { useState } from "react";
import { Activity, ChevronDown, ChevronUp, Code2, FileEdit, Terminal, Brain, TestTube, Search } from "lucide-react";
import { cn } from "../../lib/utils";
import { useChatStore } from "../../stores/chat-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { AgentAvatar } from "../agents/agent-avatar";

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Brain; color: string }> = {
  idle: { label: "Idle", icon: Brain, color: "text-neutral-fg-disabled" },
  running: { label: "Trabalhando", icon: Code2, color: "text-success" },
  thinking: { label: "Pensando", icon: Brain, color: "text-info" },
  paused: { label: "Pausado", icon: Activity, color: "text-warning" },
  error: { label: "Erro", icon: Activity, color: "text-danger" },
  busy: { label: "Ocupado", icon: Terminal, color: "text-warning" },
  working: { label: "Trabalhando", icon: Code2, color: "text-success" },
};

const ACTIVITY_ICONS: Record<string, typeof Brain> = {
  Read: FileEdit,
  Write: FileEdit,
  Edit: FileEdit,
  Bash: Terminal,
  Grep: Search,
  Glob: Search,
  Task: Activity,
  WebSearch: Search,
  WebFetch: Search,
  test: TestTube,
};

function getActivityIcon(currentTask?: string): typeof Brain {
  if (!currentTask) return Brain;
  for (const [key, icon] of Object.entries(ACTIVITY_ICONS)) {
    if (currentTask.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return Code2;
}

export function AgentActivityOverlay() {
  const [collapsed, setCollapsed] = useState(false);
  const agentActivity = useChatStore((s) => s.agentActivity);
  const agents = useWorkspaceStore((s) => s.agents);

  // Filter agents that have activity data
  const activeAgents = agents.filter((agent) => {
    const activity = agentActivity.get(agent.id);
    return activity && activity.status !== "idle";
  });

  if (activeAgents.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-30 w-[300px]">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between rounded-t-lg border border-stroke bg-neutral-bg2/95 backdrop-blur-xl px-4 py-2.5 transition-colors hover:bg-neutral-bg-hover"
      >
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand" />
          <span className="text-[12px] font-semibold text-neutral-fg1">
            Atividade dos Agentes
          </span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-success-light px-1.5 text-[10px] font-semibold text-success">
            {activeAgents.length}
          </span>
        </div>
        {collapsed ? (
          <ChevronUp className="h-3.5 w-3.5 text-neutral-fg3" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-neutral-fg3" />
        )}
      </button>

      {/* Agent list */}
      {!collapsed && (
        <div className="flex flex-col rounded-b-lg border border-t-0 border-stroke bg-neutral-bg2/95 backdrop-blur-xl">
          {activeAgents.map((agent) => {
            const activity = agentActivity.get(agent.id);
            if (!activity) return null;

            const statusInfo = STATUS_CONFIG[activity.status] ?? STATUS_CONFIG.idle;
            const StatusIcon = statusInfo.icon;
            const ActivityIcon = getActivityIcon(activity.currentTask);

            return (
              <div
                key={agent.id}
                className="flex items-center gap-3 border-b border-stroke2 last:border-0 px-4 py-3"
              >
                {/* Agent avatar */}
                <AgentAvatar
                  name={agent.name}
                  avatar={agent.avatar}
                  color={agent.color}
                  size="sm"
                  className="!h-7 !w-7 !text-[10px]"
                />

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-neutral-fg1 truncate">
                      {agent.name}
                    </span>
                    <span className={cn("flex items-center gap-1 text-[10px] font-medium", statusInfo.color)}>
                      <StatusIcon className="h-3 w-3" />
                      {statusInfo.label}
                    </span>
                  </div>

                  {/* Current activity */}
                  {activity.currentTask && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <ActivityIcon className="h-3 w-3 text-neutral-fg3" />
                      <span className="text-[10px] text-neutral-fg3 truncate">
                        {activity.currentTask}
                      </span>
                    </div>
                  )}

                  {/* Current file */}
                  {activity.currentFile && (
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <FileEdit className="h-3 w-3 text-neutral-fg-disabled" />
                      <span className="text-[10px] text-neutral-fg-disabled truncate font-mono">
                        {activity.currentFile.split("/").pop()}
                      </span>
                    </div>
                  )}

                  {/* Progress bar */}
                  {activity.progress > 0 && activity.progress < 100 && (
                    <div className="mt-1.5 h-1 w-full rounded-full bg-neutral-bg1">
                      <div
                        className="h-1 rounded-full bg-brand transition-all duration-300"
                        style={{ width: `${activity.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
