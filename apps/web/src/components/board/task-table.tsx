import { useState } from "react";
import { CheckSquare, Square, Circle, AlertCircle, Clock, XCircle } from "lucide-react";
import { cn, api, formatRelativeTime } from "../../lib/utils";
import { EditableCell, EditableSelect } from "./editable-cell";
import type { Task, Agent, TaskStatus, TaskPriority } from "@agenthub/shared";

interface TaskTableProps {
  projectId: string;
  tasks: Task[];
  agents: Agent[];
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
}

const STATUS_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: "created", label: "Backlog", color: "var(--rt-neutral-fg3)" },
  { value: "assigned", label: "Disponível", color: "var(--rt-orange)" },
  { value: "in_progress", label: "Em Progresso", color: "var(--rt-warning)" },
  { value: "review", label: "Review", color: "var(--rt-purple)" },
  { value: "done", label: "Concluída", color: "var(--rt-success)" },
  { value: "cancelled", label: "Cancelada", color: "var(--rt-neutral-fg3)" },
  { value: "blocked", label: "Blocked", color: "var(--rt-danger)" },
  { value: "failed", label: "Failed", color: "var(--rt-danger)" },
];

const PRIORITY_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: "low", label: "Low", color: "var(--rt-neutral-fg3)" },
  { value: "medium", label: "Medium", color: "var(--rt-info)" },
  { value: "high", label: "High", color: "var(--rt-warning)" },
  { value: "urgent", label: "Urgent", color: "var(--rt-danger)" },
];

const STATUS_ICONS: Record<TaskStatus, React.ComponentType<any>> = {
  created: Circle,
  assigned: Circle,
  in_progress: Clock,
  review: AlertCircle,
  changes_requested: AlertCircle,
  done: CheckSquare,
  cancelled: XCircle,
  blocked: AlertCircle,
  failed: XCircle,
};

export function TaskTable({ projectId, tasks, agents, onTaskUpdate }: TaskTableProps) {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const handleTaskUpdate = async (taskId: string, field: string, value: string | null) => {
    // Optimistic update
    onTaskUpdate?.(taskId, { [field]: value });

    // API call
    try {
      await api(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: value }),
      });
    } catch (error) {
      console.error("Failed to update task:", error);
      // Rollback would happen here if needed
    }
  };

  const toggleRowSelection = (taskId: string) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(taskId)) {
      newSelection.delete(taskId);
    } else {
      newSelection.add(taskId);
    }
    setSelectedRows(newSelection);
  };

  const toggleAllRows = () => {
    if (selectedRows.size === tasks.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(tasks.map(t => t.id)));
    }
  };

  const getStatusOption = (status: TaskStatus) => {
    return STATUS_OPTIONS.find(opt => opt.value === status) || STATUS_OPTIONS[0];
  };

  const getPriorityOption = (priority: TaskPriority) => {
    return PRIORITY_OPTIONS.find(opt => opt.value === priority) || PRIORITY_OPTIONS[0];
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-stroke glass">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-stroke2 px-4 py-3">
        <button
          onClick={toggleAllRows}
          className="flex h-5 w-5 items-center justify-center rounded border border-stroke text-neutral-fg3 hover:border-brand hover:text-brand"
        >
          {selectedRows.size === tasks.length && tasks.length > 0 ? (
            <CheckSquare className="h-4 w-4" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>
        <span className="text-[12px] font-semibold text-neutral-fg2">
          {selectedRows.size > 0 ? `${selectedRows.size} selected` : `${tasks.length} tasks`}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-neutral-bg2 border-b border-stroke2">
            <tr>
              <th className="w-10 px-4 py-3 text-left">
                <span className="sr-only">Select</span>
              </th>
              <th className="w-12 px-2 py-3 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                  Status
                </span>
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                  Title
                </span>
              </th>
              <th className="w-40 px-4 py-3 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                  Agent
                </span>
              </th>
              <th className="w-32 px-4 py-3 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                  Priority
                </span>
              </th>
              <th className="w-32 px-4 py-3 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                  Category
                </span>
              </th>
              <th className="w-32 px-4 py-3 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                  Branch
                </span>
              </th>
              <th className="w-32 px-4 py-3 text-right">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                  Updated
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke2">
            {tasks.map((task) => {
              const isSelected = selectedRows.has(task.id);
              const StatusIcon = STATUS_ICONS[task.status];
              const statusOption = getStatusOption(task.status);
              const agent = agents.find(a => a.id === task.assignedAgentId);

              const agentOptions = [
                { value: "", label: "Unassigned", color: "var(--rt-neutral-fg3)" },
                ...agents.map(a => ({
                  value: a.id,
                  label: a.name,
                  color: a.color || "#6366F1",
                })),
              ];

              return (
                <tr
                  key={task.id}
                  className={cn(
                    "group transition-colors hover:bg-neutral-bg-hover",
                    isSelected && "bg-brand-light/10"
                  )}
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleRowSelection(task.id)}
                      className="flex h-5 w-5 items-center justify-center rounded border border-stroke text-neutral-fg3 hover:border-brand hover:text-brand"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </td>

                  {/* Status */}
                  <td className="px-2 py-3">
                    <EditableSelect
                      value={task.status}
                      options={STATUS_OPTIONS}
                      onSave={(value) => handleTaskUpdate(task.id, "status", value)}
                      className="flex items-center justify-center"
                    />
                  </td>

                  {/* Title */}
                  <td className="px-4 py-3">
                    <EditableCell
                      value={task.title}
                      onSave={(value) => handleTaskUpdate(task.id, "title", value)}
                      placeholder="Task title..."
                      className="font-medium"
                    />
                  </td>

                  {/* Agent */}
                  <td className="px-4 py-3">
                    <EditableSelect
                      value={task.assignedAgentId || ""}
                      options={agentOptions}
                      onSave={(value) => handleTaskUpdate(task.id, "assignedAgentId", value || null)}
                    />
                  </td>

                  {/* Priority */}
                  <td className="px-4 py-3">
                    <EditableSelect
                      value={task.priority || "medium"}
                      options={PRIORITY_OPTIONS}
                      onSave={(value) => handleTaskUpdate(task.id, "priority", value)}
                    />
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3">
                    <span className="text-[13px] text-neutral-fg2">
                      {task.category || "—"}
                    </span>
                  </td>

                  {/* Branch */}
                  <td className="px-4 py-3">
                    <span className="text-[13px] text-neutral-fg2 truncate">
                      {task.branch || "—"}
                    </span>
                  </td>

                  {/* Updated */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-[11px] text-neutral-fg-disabled">
                      {task.updatedAt ? formatRelativeTime(task.updatedAt) : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {tasks.length === 0 && (
          <div className="flex h-64 items-center justify-center">
            <p className="text-[13px] text-neutral-fg-disabled">No tasks found</p>
          </div>
        )}
      </div>
    </div>
  );
}
