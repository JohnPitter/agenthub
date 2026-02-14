import {
  Activity,
  CheckCircle2,
  Play,
  AlertCircle,
  FileEdit,
  Wrench,
  GitBranch,
  GitCommit,
  Upload,
} from "lucide-react";
import type { Agent } from "@agenthub/shared";

interface ActivityItemProps {
  activity: {
    agentId: string;
    action: string;
    detail: string;
    timestamp: number;
  };
  agent?: Agent;
}

const ACTION_ICONS: Record<string, typeof Activity> = {
  tool_use: Wrench,
  task_start: Play,
  task_complete: CheckCircle2,
  error: AlertCircle,
  file_edit: FileEdit,
  git_branch_created: GitBranch,
  git_commit: GitCommit,
  git_push: Upload,
};

const ACTION_COLORS: Record<string, string> = {
  git_branch_created: "#9b59b6", // purple
  git_commit: "#10b981", // green
  git_push: "#3b82f6", // blue
};

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "agora";
  if (seconds < 60) return `${seconds}s atrás`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h atrás`;
}

export function ActivityItem({ activity, agent }: ActivityItemProps) {
  const Icon = ACTION_ICONS[activity.action] || Activity;
  const backgroundColor = ACTION_COLORS[activity.action] || agent?.color || "#FF5C35";

  return (
    <div className="flex items-start gap-3 rounded-lg border border-edge p-3 animate-fade-up">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
        style={{ backgroundColor }}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-text-primary">
          <span className="font-semibold">{agent?.name ?? "Agent"}</span>
          {" \u2022 "}
          {activity.detail}
        </p>
        <p className="mt-1 text-[10px] text-text-placeholder">
          {formatTimeAgo(activity.timestamp)}
        </p>
      </div>
    </div>
  );
}
