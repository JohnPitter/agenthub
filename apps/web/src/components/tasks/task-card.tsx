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
        "group relative overflow-hidden cursor-pointer rounded-2xl bg-white p-5 shadow-card card-hover",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.02] gradient-primary transition-opacity duration-300" />

      {/* Header: Priority + Grip */}
      <div className="relative flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full shadow-sm", priority.dot)} style={{ animation: "pulse-dot 3s ease-in-out infinite" }} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            {priority.label}
          </span>
          {task.category && (
            <span className="rounded-lg bg-gradient-to-r from-page to-surface-hover px-2 py-1 text-[10px] font-semibold text-text-secondary border border-edge-light">
              {CATEGORY_LABELS[task.category] ?? task.category}
            </span>
          )}
        </div>
        {draggable && (
          <GripVertical className="h-4 w-4 text-text-placeholder opacity-0 transition-all group-hover:opacity-100 group-hover:scale-110" />
        )}
      </div>

      {/* Title */}
      <p className="relative text-[14px] font-bold text-text-primary leading-snug line-clamp-2 mb-2">
        {task.title}
      </p>

      {task.description && (
        <p className="relative mt-1 text-[12px] text-text-secondary leading-relaxed line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Git Branch Badge */}
      {task.branch && (
        <div className="relative mt-3 flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-light to-purple-muted px-3 py-1.5 w-fit shadow-sm">
          <GitBranch className="h-3.5 w-3.5 text-purple-dark" />
          <span className="text-[11px] font-bold text-purple-dark">{task.branch}</span>
        </div>
      )}

      {/* Git Commit Badge */}
      {task.result && task.result.includes("Committed as") && (
        <div className="relative mt-3 flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-light to-green-muted px-3 py-1.5 w-fit shadow-sm">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-dark" />
          <span className="text-[11px] font-bold text-green-dark">
            Committed {task.result.match(/Committed as ([a-f0-9]+)/)?.[1]?.slice(0, 7)}
          </span>
        </div>
      )}

      {/* Review Actions */}
      {task.status === "review" && onApprove && onReject && (
        <TaskReviewActions task={task} onApprove={onApprove} onReject={onReject} />
      )}

      {/* Footer: Agent + Timestamp + Delete */}
      <div className="relative mt-4 flex items-center justify-between pt-3 border-t border-edge-light/50">
        <div className="flex items-center gap-2">
          {agent ? (
            <div className="flex items-center gap-2">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-lg text-[9px] font-bold text-white shadow-sm"
                style={{ backgroundColor: agent.color ?? "#6366F1" }}
              >
                {agent.name.charAt(0)}
              </div>
              <span className="text-[11px] font-semibold text-text-secondary">{agent.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-text-placeholder">
              <User className="h-4 w-4" />
              <span className="text-[11px] font-medium">Sem agente</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-text-placeholder bg-page px-2 py-1 rounded-lg">
            <Clock className="h-3 w-3" />
            <span className="text-[10px] font-medium">{formatDate(task.createdAt)}</span>
          </div>
          {onExecute && task.assignedAgentId && (task.status === "created" || task.status === "changes_requested") && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExecute(task.id, task.assignedAgentId!);
              }}
              className="rounded-lg p-2 text-green opacity-0 transition-all hover:bg-green-light hover:shadow-sm group-hover:opacity-100 hover:scale-110"
              title="Executar"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            className="rounded-lg p-2 text-text-placeholder opacity-0 transition-all hover:bg-red-light hover:text-red hover:shadow-sm group-hover:opacity-100 hover:scale-110"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
