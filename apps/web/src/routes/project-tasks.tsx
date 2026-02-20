import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useTasks } from "../hooks/use-tasks";
import { useSocket } from "../hooks/use-socket";
import { TaskCard } from "../components/tasks/task-card";
import { TaskForm, type TaskFormData } from "../components/tasks/task-form";
import { TaskFilters } from "../components/tasks/task-filters";
import { TaskCommitDialog } from "../components/tasks/task-commit-dialog";
import { TaskChangesDialog } from "../components/tasks/task-changes-dialog";
import { CommandBar } from "../components/layout/command-bar";
import { SkeletonKanban } from "../components/ui/skeleton";
import { Tablist } from "../components/ui/tablist";
import { cn, formatRelativeTime } from "../lib/utils";
import type { Task, TaskStatus, TaskPriority } from "@agenthub/shared";

const KANBAN_COLUMNS: { status: TaskStatus; labelKey: string; dotColor: string }[] = [
  { status: "created", labelKey: "taskStatus.backlog", dotColor: "bg-info" },
  { status: "assigned", labelKey: "taskStatus.assigned", dotColor: "bg-brand" },
  { status: "in_progress", labelKey: "taskStatus.in_progress", dotColor: "bg-warning" },
  { status: "review", labelKey: "taskStatus.review", dotColor: "bg-purple" },
  { status: "done", labelKey: "taskStatus.done", dotColor: "bg-success" },
  { status: "cancelled", labelKey: "taskStatus.cancelled", dotColor: "bg-neutral-fg3" },
];

const STATUS_BADGE_CLS: Record<string, string> = {
  created: "bg-info-light text-info",
  assigned: "bg-brand-light text-brand",
  in_progress: "bg-warning-light text-warning",
  review: "bg-purple-light text-purple",
  done: "bg-success-light text-success",
  cancelled: "bg-neutral-bg2 text-neutral-fg3",
  failed: "bg-danger-light text-danger",
};

export function ProjectTasks() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const projects = useWorkspaceStore((s) => s.projects);
  const agents = useWorkspaceStore((s) => s.agents);
  const project = projects.find((p) => p.id === id);
  const { tasks, loading, createTask, updateTask, deleteTask, getTasksByStatus, refetch } = useTasks(id);

  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "">("");
  const [agentFilter, setAgentFilter] = useState("");
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [readyToCommitTasks, setReadyToCommitTasks] = useState<Map<string, string[]>>(new Map());
  const [commitDialogTask, setCommitDialogTask] = useState<{ taskId: string; changedFiles: string[]; title: string } | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "tabela">("kanban");
  const [changesTaskId, setChangesTaskId] = useState<string | null>(null);

  const handleTaskGitBranch = useCallback((data: { taskId: string; branchName: string }) => {
    updateTask(data.taskId, { branch: data.branchName }).catch(() => {
      refetch();
    });
  }, [updateTask, refetch]);

  const handleTaskGitCommit = useCallback((data: { taskId: string; commitSha: string }) => {
    updateTask(data.taskId, { result: `Committed as ${data.commitSha}` }).catch(() => {
      refetch();
    });

    setReadyToCommitTasks((prev) => {
      const next = new Map(prev);
      next.delete(data.taskId);
      return next;
    });

    if (commitDialogTask?.taskId === data.taskId) {
      setCommitDialogTask(null);
    }
  }, [updateTask, refetch, commitDialogTask]);

  const handleTaskReadyToCommit = useCallback((data: { taskId: string; changedFiles: string[] }) => {
    setReadyToCommitTasks((prev) => new Map(prev).set(data.taskId, data.changedFiles));
  }, []);

  const { executeTask, approveTask, rejectTask, commitTask } = useSocket(id, {
    onTaskGitBranch: handleTaskGitBranch,
    onTaskGitCommit: handleTaskGitCommit,
    onTaskReadyToCommit: handleTaskReadyToCommit,
  });

  const handleCreate = useCallback(async (data: TaskFormData) => {
    if (!id) return;
    await createTask({
      projectId: id,
      title: data.title,
      description: data.description || undefined,
      priority: data.priority,
      category: data.category || undefined,
      assignedAgentId: data.assignedAgentId || undefined,
    });
    setShowForm(false);
  }, [id, createTask]);

  const handleEdit = useCallback(async (data: TaskFormData) => {
    if (!editingTask) return;
    await updateTask(editingTask.id, {
      title: data.title,
      description: data.description || null,
      priority: data.priority,
      category: data.category || null,
      assignedAgentId: data.assignedAgentId || null,
    });
    setEditingTask(null);
  }, [editingTask, updateTask]);

  const handleDelete = useCallback(async (taskId: string) => {
    await deleteTask(taskId);
  }, [deleteTask]);

  const handleDragStart = useCallback((e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData("taskId", task.id);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(status);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, newStatus: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData("taskId");
    if (!taskId) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    await updateTask(taskId, { status: newStatus });
  }, [tasks, updateTask]);

  const getFilteredTasks = useCallback((status: TaskStatus): Task[] => {
    let columnTasks = getTasksByStatus(status);
    if (priorityFilter) columnTasks = columnTasks.filter((t) => t.priority === priorityFilter);
    if (agentFilter) columnTasks = columnTasks.filter((t) => t.assignedAgentId === agentFilter);
    return columnTasks;
  }, [getTasksByStatus, priorityFilter, agentFilter]);

  const getAllFilteredTasks = useCallback((): Task[] => {
    let filtered = [...tasks];
    if (priorityFilter) filtered = filtered.filter((t) => t.priority === priorityFilter);
    if (agentFilter) filtered = filtered.filter((t) => t.assignedAgentId === agentFilter);
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tasks, priorityFilter, agentFilter]);

  if (!project) {
    return <div className="p-8 text-neutral-fg2">{t("project.notFound")}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Command Bar */}
      <CommandBar
        actions={
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("tasks.newTask")}
          </button>
        }
      >
        <Tablist
          tabs={[
            { key: "kanban", label: "Kanban" },
            { key: "tabela", label: "Tabela" },
          ]}
          activeTab={viewMode}
          onChange={(key) => setViewMode(key as "kanban" | "tabela")}
        />
        <span className="mx-2 h-5 w-px bg-stroke" />
        <TaskFilters
          priorityFilter={priorityFilter}
          agentFilter={agentFilter}
          agents={agents}
          onPriorityChange={setPriorityFilter}
          onAgentChange={setAgentFilter}
        />
      </CommandBar>

      {/* Content */}
      {loading ? (
        <div className="flex-1 overflow-x-auto px-8 pb-8 pt-4">
          <SkeletonKanban columns={6} />
        </div>
      ) : viewMode === "kanban" ? (
        /* Kanban View */
        <div className="flex-1 overflow-x-auto px-8 pb-8 pt-4">
          <div className="grid h-full grid-cols-6 gap-5">
            {KANBAN_COLUMNS.map((column) => {
              const columnTasks = getFilteredTasks(column.status);
              const isOver = dragOverColumn === column.status;

              return (
                <div
                  key={column.status}
                  onDragOver={(e) => handleDragOver(e, column.status)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, column.status)}
                  className={cn(
                    "flex flex-col rounded-xl glass transition-all duration-200",
                    isOver && "ring-2 ring-brand/30 bg-brand-light/5",
                  )}
                >
                  <div className="rounded-t-xl px-4 py-3 border-b border-stroke2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", column.dotColor)} />
                        <span className="text-[13px] font-semibold text-neutral-fg1">{t(column.labelKey)}</span>
                      </div>
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-light px-1.5 text-[10px] font-semibold text-brand">
                        {columnTasks.length}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
                    {columnTasks.length > 0 ? (
                      columnTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          agents={agents}
                          onEdit={setEditingTask}
                          onDelete={handleDelete}
                          onViewChanges={setChangesTaskId}
                          onApprove={(taskId) => approveTask(taskId)}
                          onReject={(taskId, feedback) => rejectTask(taskId, feedback)}
                          draggable
                          onDragStart={handleDragStart}
                        />
                      ))
                    ) : (
                      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-stroke py-10">
                        <p className="text-[12px] text-neutral-fg-disabled">{t("common.empty")}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Table View */
        <div className="flex-1 overflow-y-auto p-8">
          <div className="card-glow rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stroke2 text-left">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("tasks.status")}</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("tasks.priority")}</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("tasks.title")}</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("chat.agent")}</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">{t("tasks.description")}</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3 text-right">{t("tasks.createdAt")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke2">
                {getAllFilteredTasks().map((task) => {
                  const badgeCls = STATUS_BADGE_CLS[task.status] ?? "bg-neutral-bg2 text-neutral-fg2";
                  const agent = agents.find((a) => a.id === task.assignedAgentId);
                  return (
                    <tr
                      key={task.id}
                      onClick={() => setEditingTask(task)}
                      className="table-row cursor-pointer"
                    >
                      <td className="px-5 py-3.5">
                        <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold", badgeCls)}>
                          {t(`taskStatus.${task.status}`)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-neutral-fg3">
                        {t(`taskPriority.${task.priority}`)}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] font-medium text-neutral-fg1 truncate max-w-[300px]">
                        <span>{task.title}</span>
                        {(task.subtaskCount ?? 0) > 0 && (
                          <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-neutral-bg2 border border-stroke px-1.5 py-0.5 text-[10px] font-semibold text-neutral-fg3">
                            {task.completedSubtaskCount ?? 0}/{task.subtaskCount}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-neutral-fg2">
                        {agent?.name ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-neutral-fg3">
                        {task.category ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 text-[11px] text-neutral-fg-disabled text-right whitespace-nowrap">
                        {formatRelativeTime(task.createdAt)}
                      </td>
                    </tr>
                  );
                })}
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-[13px] text-neutral-fg-disabled">
                      {t("tasks.noTasks")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && id && (
        <TaskForm
          projectId={id}
          agents={agents}
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}

      {editingTask && id && (
        <TaskForm
          projectId={id}
          agents={agents}
          task={editingTask}
          onSubmit={handleEdit}
          onClose={() => setEditingTask(null)}
        />
      )}

      {commitDialogTask && (
        <TaskCommitDialog
          taskId={commitDialogTask.taskId}
          changedFiles={commitDialogTask.changedFiles}
          defaultMessage={`feat(task): ${commitDialogTask.title}`}
          onCommit={(taskId, message) => {
            commitTask(taskId, message);
            setCommitDialogTask(null);
          }}
          onCancel={() => setCommitDialogTask(null)}
        />
      )}

      {changesTaskId && (
        <TaskChangesDialog
          taskId={changesTaskId}
          onClose={() => setChangesTaskId(null)}
        />
      )}
    </div>
  );
}
