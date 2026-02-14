import { GripVertical, Clock, Trash2, User, Play, GitBranch, CheckCircle2 } from "lucide-react";
import { cn, formatDate } from "../../lib/utils";
import { TaskReviewActions } from "./task-review-actions";
import type { Task, Agent } from "@agenthub/shared";

const PRIORITY_STYLES: Record<string, { dot: string; label: string }> = {
  urgent: { dot: "bg-red", label: "Urgente" },
  high: { dot: "bg-red", label: "Alta" },
  medium: { dot: "bg-yellow", label: "Média" },
  low: { dot: "bg-blue", label: "Baixa" },
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
  onApprove?: (taskId: string) => void;
  onReject?: (taskId: string, feedback: string) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, task: Task) => void;
}

export function TaskCard({ task, agents, onEdit, onDelete, onExecute, onApprove, onReject, draggable, onDragStart }: TaskCardProps) {
  const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium;
  const agent = task.assignedAgentId ? agents.find((a) => a.id === task.assignedAgentId) : null;

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, task)}
      onClick={() => onEdit(task)}
      className={cn(
        "group cursor-pointer rounded-xl bg-white p-4 shadow-card transition-all hover:shadow-card-hover",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      {/* Header: Priority + Grip */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", priority.dot)} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            {priority.label}
          </span>
          {task.category && (
            <span className="rounded bg-page px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary">
              {CATEGORY_LABELS[task.category] ?? task.category}
            </span>
          )}
        </div>
        {draggable && (
          <GripVertical className="h-3.5 w-3.5 text-text-placeholder opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>

      {/* Title */}
      <p className="text-[13px] font-semibold text-text-primary leading-snug line-clamp-2">
        {task.title}
      </p>

      {task.description && (
        <p className="mt-1 text-[11px] text-text-secondary leading-relaxed line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Git Branch Badge */}
      {task.branch && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-purple-light px-2 py-0.5 w-fit">
          <GitBranch className="h-3 w-3 text-purple" />
          <span className="text-[10px] font-semibold text-purple">{task.branch}</span>
        </div>
      )}

      {/* Git Commit Badge */}
      {task.result && task.result.includes("Committed as") && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-green-light px-2 py-0.5 w-fit">
          <CheckCircle2 className="h-3 w-3 text-green" />
          <span className="text-[10px] font-semibold text-green">
            Committed {task.result.match(/Committed as ([a-f0-9]+)/)?.[1]?.slice(0, 7)}
          </span>
        </div>
      )}

      {/* Review Actions */}
      {task.status === "review" && onApprove && onReject && (
        <TaskReviewActions task={task} onApprove={onApprove} onReject={onReject} />
      )}

      {/* Footer: Agent + Timestamp + Delete */}
      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {agent ? (
            <div className="flex items-center gap-1.5">
              <div
                className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white"
                style={{ backgroundColor: agent.color ?? "#0866FF" }}
              >
                {agent.name.charAt(0)}
              </div>
              <span className="text-[10px] font-medium text-text-secondary">{agent.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-text-placeholder">
              <User className="h-3.5 w-3.5" />
              <span className="text-[10px]">Sem agente</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-text-placeholder">
            <Clock className="h-3 w-3" />
            <span className="text-[10px]">{formatDate(task.createdAt)}</span>
          </div>
          {onExecute && task.assignedAgentId && (task.status === "created" || task.status === "changes_requested") && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExecute(task.id, task.assignedAgentId!);
              }}
              className="rounded-md p-1 text-green opacity-0 transition-all hover:bg-green-light group-hover:opacity-100"
              title="Executar"
            >
              <Play className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            className="rounded-md p-1 text-text-placeholder opacity-0 transition-all hover:bg-red-light hover:text-red group-hover:opacity-100"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
