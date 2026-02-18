import { useTranslation } from "react-i18next";
import { GripVertical, Clock, Trash2, User, Play, GitBranch, CheckCircle2, FileDiff } from "lucide-react";
import { cn, formatDate } from "../../lib/utils";
import { AgentAvatar } from "../agents/agent-avatar";
import { TaskReviewActions } from "./task-review-actions";
import type { Task, Agent } from "@agenthub/shared";

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-danger",
  high: "bg-danger",
  medium: "bg-warning",
  low: "bg-info",
};

const CATEGORY_LABELS: Record<string, string> = {
  feature: "Feature",
  bug: "Bug",
  refactor: "Refactor",
  test: "Test",
  docs: "Docs",
};

interface TaskCardProps {
  task: Task;
  agents: Agent[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onExecute?: (taskId: string, agentId: string) => void;
  onViewChanges?: (taskId: string) => void;
  onApprove?: (taskId: string) => void;
  onReject?: (taskId: string, feedback: string) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, task: Task) => void;
}

export function TaskCard({ task, agents, onEdit, onDelete, onExecute, onViewChanges, onApprove, onReject, draggable, onDragStart }: TaskCardProps) {
  const { t } = useTranslation();
  const priorityDot = PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.medium;
  const agent = task.assignedAgentId ? agents.find((a) => a.id === task.assignedAgentId) : null;

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, task)}
      onClick={() => onEdit(task)}
      className={cn(
        "group relative cursor-pointer rounded-lg bg-neutral-bg1 p-4 shadow-2 border border-stroke transition-shadow hover:shadow-4",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      {/* Header: Priority + Grip */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", priorityDot)} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-fg3">
            {t(`taskPriority.${task.priority}`)}
          </span>
          {task.category && (
            <span className="rounded-md bg-neutral-bg2 px-2 py-1 text-[10px] font-semibold text-neutral-fg2 border border-stroke">
              {CATEGORY_LABELS[task.category] ?? task.category}
            </span>
          )}
        </div>
        {draggable && (
          <GripVertical className="h-4 w-4 text-neutral-fg-disabled opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>

      {/* Title */}
      <p className="text-[14px] font-semibold text-neutral-fg1 leading-snug line-clamp-2 mb-2">
        {task.title}
      </p>

      {task.description && (
        <p className="mt-1 text-[12px] text-neutral-fg2 leading-relaxed line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Subtask count chip */}
      {(task.subtaskCount ?? 0) > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-neutral-fg2">
          <div className="flex h-5 items-center gap-1 rounded-md bg-neutral-bg2 border border-stroke px-2">
            <span className="text-success">{task.completedSubtaskCount ?? 0}</span>
            <span className="text-neutral-fg-disabled">/</span>
            <span>{task.subtaskCount}</span>
            <span className="text-neutral-fg3 font-medium ml-0.5">subtasks</span>
          </div>
        </div>
      )}

      {/* Git Branch Badge */}
      {task.branch && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-purple-light px-3 py-1.5 w-fit">
          <GitBranch className="h-3.5 w-3.5 text-purple-dark" />
          <span className="text-[11px] font-semibold text-purple-dark">{task.branch}</span>
        </div>
      )}

      {/* Git Commit Badge */}
      {task.result && task.result.includes("Committed as") && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-success-light px-3 py-1.5 w-fit">
          <CheckCircle2 className="h-3.5 w-3.5 text-success-dark" />
          <span className="text-[11px] font-semibold text-success-dark">
            Committed {task.result.match(/Committed as ([a-f0-9]+)/)?.[1]?.slice(0, 7)}
          </span>
        </div>
      )}

      {/* Review Actions */}
      {task.status === "review" && onApprove && onReject && (
        <TaskReviewActions task={task} onApprove={onApprove} onReject={onReject} />
      )}

      {/* Footer: Agent + Timestamp + Delete */}
      <div className="mt-4 flex items-center justify-between pt-3 border-t border-stroke">
        <div className="flex items-center gap-2">
          {agent ? (
            <div className="flex items-center gap-2">
              <AgentAvatar name={agent.name} avatar={agent.avatar} color={agent.color} size="sm" className="!h-6 !w-6 !text-[9px]" />
              <span className="text-[11px] font-semibold text-neutral-fg2">{agent.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-neutral-fg-disabled">
              <User className="h-4 w-4" />
              <span className="text-[11px] font-medium">{t("board.unassigned")}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-neutral-fg-disabled bg-neutral-bg2 px-2 py-1 rounded-md">
            <Clock className="h-3 w-3" />
            <span className="text-[10px] font-medium">{formatDate(task.createdAt)}</span>
          </div>
          {onViewChanges && (task.status === "in_progress" || task.status === "review" || task.status === "done" || task.status === "changes_requested") && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewChanges(task.id);
              }}
              className="rounded-md p-2 text-brand opacity-0 transition-colors hover:bg-brand-light group-hover:opacity-100"
              title={t("tasks.viewChanges")}
            >
              <FileDiff className="h-3.5 w-3.5" />
            </button>
          )}
          {onExecute && task.assignedAgentId && (task.status === "created" || task.status === "changes_requested") && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExecute(task.id, task.assignedAgentId!);
              }}
              className="rounded-md p-2 text-success opacity-0 transition-colors hover:bg-success-light group-hover:opacity-100"
              title={t("tasks.run")}
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            className="rounded-md p-2 text-neutral-fg-disabled opacity-0 transition-colors hover:bg-danger-light hover:text-danger group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
