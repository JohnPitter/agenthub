import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, AlertCircle } from "lucide-react";
import { cn, formatRelativeTime } from "../../lib/utils";
import type { Task, Agent } from "@agenthub/shared";

interface KanbanCardProps {
  task: Task;
  agent?: Agent;
}

const PRIORITY_COLORS = {
  low: "bg-neutral-fg3/20 text-neutral-fg2",
  medium: "bg-info-light text-info",
  high: "bg-warning-light text-warning",
  urgent: "bg-danger-light text-danger",
} as const;

const PRIORITY_LABELS = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
} as const;

export function KanbanCard({ task, agent }: KanbanCardProps) {
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
      className={cn(
        "group cursor-grab card-interactive p-4 active:cursor-grabbing",
        isDragging && "opacity-40 shadow-glow ring-2 ring-brand/20"
      )}
    >
      {/* Priority badge */}
      {task.priority && (
        <div className="mb-2.5 flex items-center justify-between">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              PRIORITY_COLORS[task.priority]
            )}
          >
            {PRIORITY_LABELS[task.priority]}
          </span>
          {task.status === "blocked" && (
            <AlertCircle className="h-3.5 w-3.5 text-danger" />
          )}
        </div>
      )}

      {/* Task title */}
      <h4 className="mb-3 text-[14px] font-semibold text-neutral-fg1 line-clamp-2 leading-tight group-hover:text-brand transition-colors">
        {task.title}
      </h4>

      {/* Bottom row: agent + time */}
      <div className="flex items-center justify-between gap-2">
        {/* Agent avatar */}
        {agent ? (
          <div className="flex items-center gap-2">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-white shadow-xs"
              style={{ backgroundColor: agent.color || "#6366F1" }}
            >
              {agent.name.charAt(0)}
            </div>
            <span className="text-[11px] text-neutral-fg2 truncate">{agent.name}</span>
          </div>
        ) : (
          <span className="text-[11px] text-neutral-fg-disabled">Não atribuída</span>
        )}

        {/* Time elapsed */}
        {task.updatedAt && (
          <div className="flex items-center gap-1 text-[10px] text-neutral-fg-disabled">
            <Clock className="h-3 w-3" />
            <span>{formatRelativeTime(task.updatedAt)}</span>
          </div>
        )}
      </div>

      {/* Category tag if present */}
      {task.category && (
        <div className="mt-2.5 pt-2.5 border-t border-stroke2">
          <span className="badge badge-neutral text-[10px]">{task.category}</span>
        </div>
      )}
    </div>
  );
}
