import { useState } from "react";
import { useParams } from "react-router-dom";
import { Activity } from "lucide-react";
import { useChatStore } from "../stores/chat-store";
import { useSocket } from "../hooks/use-socket";
import { useAgents } from "../hooks/use-agents";
import { useTasks } from "../hooks/use-tasks";
import { AgentStatusCard } from "../components/board/agent-status-card";
import { ActivityFeed } from "../components/board/activity-feed";
import { ToolTimeline } from "../components/board/tool-timeline";
import type { BoardActivityEvent, AgentToolUseEvent } from "@agenthub/shared";

export function ProjectBoard() {
  const { id } = useParams<{ id: string }>();
  const { agents } = useAgents();
  const { tasks } = useTasks(id);
  const { agentActivity, updateAgentActivity } = useChatStore();
  const [activities, setActivities] = useState<BoardActivityEvent[]>([]);
  const [toolUses, setToolUses] = useState<AgentToolUseEvent[]>([]);

  const { approveTask, rejectTask, cancelTask } = useSocket(id, {
    onBoardActivity: (data) => {
      setActivities((prev) => [data, ...prev].slice(0, 100));

      if (data.action === "tool_use") {
        setToolUses((prev) =>
          [
            {
              agentId: data.agentId,
              projectId: data.projectId,
              tool: data.detail.split(" using ").pop() ?? data.detail,
              input: null,
              response: null,
              sessionId: "",
            } as AgentToolUseEvent,
            ...prev,
          ].slice(0, 50),
        );
      }
    },
    onBoardAgentCursor: (data) => {
      if (data.filePath) {
        updateAgentActivity(data.agentId, { currentFile: data.filePath });
      }
    },
    onTaskGitBranch: (data) => {
      setActivities((prev) =>
        [
          {
            agentId: "",
            projectId: data.projectId,
            action: "git_branch_created",
            detail: `Branch criada: ${data.branchName}`,
            timestamp: Date.now(),
          },
          ...prev,
        ].slice(0, 100)
      );
    },
    onTaskGitCommit: (data) => {
      setActivities((prev) =>
        [
          {
            agentId: "",
            projectId: data.projectId,
            action: "git_commit",
            detail: `Commit: ${data.commitSha.slice(0, 7)} - ${data.commitMessage}`,
            timestamp: Date.now(),
          },
          ...prev,
        ].slice(0, 100)
      );
    },
  });

  const activeAgents = agents.filter((a) => a.isActive);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between bg-white px-8 py-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-text-primary">Live Board</h1>
            <p className="text-[11px] text-text-tertiary">
              Monitore agentes em tempo real
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green animate-pulse" />
          <span className="text-[12px] text-text-secondary">Ao vivo</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-8 overflow-y-auto p-8">
        {/* Agent Status Cards */}
        <div className="grid grid-cols-3 gap-4 stagger">
          {activeAgents.map((agent) => {
            const activity = agentActivity.get(agent.id);
            const task = activity?.taskId ? tasks.find((t) => t.id === activity.taskId) : undefined;
            return (
              <AgentStatusCard
                key={agent.id}
                agent={agent}
                activity={
                  activity
                    ? {
                        status: activity.status,
                        currentTask: activity.currentTask,
                        currentFile: activity.currentFile,
                        progress: activity.progress,
                      }
                    : undefined
                }
                task={task}
                onApprove={approveTask}
                onReject={rejectTask}
                onCancel={cancelTask}
              />
            );
          })}
        </div>

        {/* Activity + Timeline */}
        <div className="flex flex-1 gap-5 overflow-hidden">
          <ActivityFeed activities={activities} agents={agents} />
          <ToolTimeline toolUses={toolUses} agents={agents} />
        </div>
      </div>
    </div>
  );
}
