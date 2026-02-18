import { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { cn, formatRelativeTime } from "../../lib/utils";
import type { Task, Agent } from "@agenthub/shared";

const STATUS_DOT: Record<string, string> = {
  created: "bg-info",
  assigned: "bg-brand",
  in_progress: "bg-warning",
  review: "bg-purple",
  done: "bg-success",
  cancelled: "bg-neutral-fg3",
  failed: "bg-danger",
  changes_requested: "bg-warning",
  blocked: "bg-danger",
};

interface SubtaskTreeProps {
  parentTask: Task;
  subtasks: Task[];
  agents: Agent[];
  onCreateSubtask: () => void;
  onClickTask: (task: Task) => void;
}

export function SubtaskTree({ parentTask, subtasks, agents, onCreateSubtask, onClickTask }: SubtaskTreeProps) {
  const [expanded, setExpanded] = useState(true);
  const completedCount = subtasks.filter((t) => t.status === "done" || t.status === "cancelled").length;
  const totalCount = subtasks.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="rounded-xl border border-stroke bg-neutral-bg2 p-4">
      {/* Header with progress */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-neutral-fg1 hover:text-brand transition-colors"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Subtasks
          <span className="text-[11px] font-medium text-neutral-fg3 ml-1">
            {completedCount}/{totalCount}
          </span>
        </button>
        <button
          onClick={onCreateSubtask}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-brand hover:bg-brand-light transition-colors"
        >
          <Plus className="h-3 w-3" />
          Subtask
        </button>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-3 h-1.5 w-full rounded-full bg-neutral-bg3 overflow-hidden">
          <div
            className="h-full rounded-full bg-success transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Subtask list */}
      {expanded && (
        <div className="space-y-1.5">
          {subtasks.length === 0 ? (
            <p className="text-[11px] text-neutral-fg-disabled py-2 text-center">
              Nenhuma subtask ainda
            </p>
          ) : (
            subtasks.map((subtask) => {
              const agent = subtask.assignedAgentId
                ? agents.find((a) => a.id === subtask.assignedAgentId)
                : null;
              const dotColor = STATUS_DOT[subtask.status] ?? STATUS_DOT.created;

              return (
                <button
                  key={subtask.id}
                  onClick={() => onClickTask(subtask)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-neutral-bg3"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)} />
                  <span className="flex-1 truncate text-[12px] font-medium text-neutral-fg1">
                    {subtask.title}
                  </span>
                  {agent && (
                    <span className="text-[10px] text-neutral-fg3 truncate max-w-[80px]">
                      {agent.name}
                    </span>
                  )}
                  {subtask.updatedAt && (
                    <span className="text-[10px] text-neutral-fg-disabled whitespace-nowrap">
                      {formatRelativeTime(subtask.updatedAt)}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
