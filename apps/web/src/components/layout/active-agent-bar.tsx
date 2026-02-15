import { Cpu, Pause, Square } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useChatStore } from "../../stores/chat-store";
import { useSocket } from "../../hooks/use-socket";

export function ActiveAgentBar() {
  const { agents, projects, activeProjectId } = useWorkspaceStore();
  const { agentActivity } = useChatStore();
  const { cancelTask } = useSocket(activeProjectId ?? undefined);

  // Find first agent that is actually running (real-time status)
  const runningAgent = agents.find((a) => {
    const activity = agentActivity.get(a.id);
    return activity?.status === "running";
  });

  const activeProject = projects.find((p) => p.id === activeProjectId);

  if (!runningAgent) return null;

  const activity = agentActivity.get(runningAgent.id);
  const progress = activity?.progress ?? 0;

  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-t border-stroke bg-neutral-bg1 px-6">
      {/* Left: Agent info */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md text-[12px] font-semibold text-white"
          style={{ backgroundColor: runningAgent.color ?? "#FF5C35" }}
        >
          {runningAgent.name.charAt(0)}
        </div>
        <div>
          <p className="text-[13px] font-semibold text-neutral-fg1">{runningAgent.name}</p>
          <p className="text-[11px] text-neutral-fg3">
            {activity?.currentTask
              ? activity.currentTask.slice(0, 50)
              : activeProject
                ? activeProject.name
                : "Nenhum projeto"}
          </p>
        </div>
      </div>

      {/* Center: Status + Progress */}
      <div className="flex flex-1 flex-col items-center gap-1 px-8">
        <div className="flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5 text-brand" />
          <span className="text-[11px] font-medium text-success">Executando</span>
        </div>
        <div className="h-1.5 w-full max-w-[400px] overflow-hidden rounded-full bg-stroke">
          <div
            className="progress-bar h-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-fg3 opacity-40 cursor-not-allowed"
          title="Em breve"
          disabled
        >
          <Pause className="h-4 w-4" />
        </button>
        <button
          onClick={() => activity?.taskId && cancelTask(activity.taskId)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-fg3 transition-colors hover:bg-danger-light hover:text-danger disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!activity?.taskId}
          title={activity?.taskId ? "Parar execução" : "Nenhuma task em execução"}
        >
          <Square className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
