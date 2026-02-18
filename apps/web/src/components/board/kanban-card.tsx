import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import { Clock, AlertCircle } from "lucide-react";
import { cn, formatRelativeTime } from "../../lib/utils";
import { AgentAvatar } from "../agents/agent-avatar";
import type { Task, Agent } from "@agenthub/shared";

interface KanbanCardProps {
  task: Task;
  agent?: Agent;
  onViewChanges?: (taskId: string) => void;
  onTaskClick?: (task: Task) => void;
}

const PRIORITY_COLORS = {
  low: "bg-neutral-fg3/20 text-neutral-fg2",
  medium: "bg-info-light text-info",
  high: "bg-warning-light text-warning",
  urgent: "bg-danger-light text-danger",
} as const;

const PRIORITY_KEYS = {
  low: "taskPriority.low",
  medium: "taskPriority.medium",
  high: "taskPriority.high",
  urgent: "taskPriority.urgent",
} as const;

export function KanbanCard({ task, agent, onViewChanges, onTaskClick }: KanbanCardProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onTaskClick?.(task)}
      className={cn(
        "group cursor-grab card-interactive p-3 active:cursor-grabbing",
        isDragging && "opacity-40 shadow-glow ring-2 ring-brand/20"
      )}
    >
      {/* Priority + blocked */}
      <div className="mb-2 flex items-center justify-between">
        {task.priority && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
              PRIORITY_COLORS[task.priority]
            )}
          >
            {t(PRIORITY_KEYS[task.priority])}
          </span>
        )}
        {task.status === "blocked" && (
          <AlertCircle className="h-3 w-3 text-danger" />
        )}
        {task.category && (
          <span className="badge badge-neutral text-[9px] ml-auto">{task.category}</span>
        )}
      </div>

      {/* Task title */}
      <h4 className="mb-2 text-[13px] font-semibold text-neutral-fg1 line-clamp-2 leading-snug group-hover:text-brand transition-colors">
        {task.title}
      </h4>

      {/* Subtask chip */}
      {(task.subtaskCount ?? 0) > 0 && (
        <div className="mb-2 flex items-center">
          <span className="inline-flex items-center gap-1 rounded-md bg-neutral-bg3 px-2 py-0.5 text-[9px] font-semibold text-neutral-fg2">
            <span className="text-success">{task.completedSubtaskCount ?? 0}</span>
            <span className="text-neutral-fg-disabled">/</span>
            <span>{task.subtaskCount}</span>
            <span className="text-neutral-fg3 ml-0.5">subtasks</span>
          </span>
        </div>
      )}

      {/* Bottom row: agent + time */}
      <div className="flex items-center justify-between gap-2">
        {agent ? (
          <div className="flex items-center gap-1.5">
            <AgentAvatar name={agent.name} avatar={agent.avatar} color={agent.color} size="sm" className="!h-5 !w-5 !text-[9px] !rounded" />
            <span className="text-[10px] text-neutral-fg2 truncate max-w-[80px]">{agent.name}</span>
          </div>
        ) : (
          <span className="text-[10px] text-neutral-fg-disabled">{t("tasks.noneAssigned")}</span>
        )}
        {task.updatedAt && (
          <div className="flex items-center gap-1 text-[9px] text-neutral-fg-disabled">
            <Clock className="h-2.5 w-2.5" />
            <span>{formatRelativeTime(task.updatedAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
