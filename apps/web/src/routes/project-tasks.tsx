import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Plus, ListTodo, Loader2 } from "lucide-react";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useTasks } from "../hooks/use-tasks";
import { useSocket } from "../hooks/use-socket";
import { TaskCard } from "../components/tasks/task-card";
import { TaskForm, type TaskFormData } from "../components/tasks/task-form";
import { TaskFilters } from "../components/tasks/task-filters";
import { TaskCommitDialog } from "../components/tasks/task-commit-dialog";
import { cn } from "../lib/utils";
import type { Task, TaskStatus, TaskPriority } from "@agenthub/shared";

const KANBAN_COLUMNS: { status: TaskStatus; label: string; dotColor: string }[] = [
  { status: "created", label: "Criadas", dotColor: "bg-blue" },
  { status: "in_progress", label: "Em Progresso", dotColor: "bg-yellow" },
  { status: "review", label: "Em Review", dotColor: "bg-purple" },
  { status: "done", label: "Concluídas", dotColor: "bg-green" },
];

export function ProjectTasks() {
  const { id } = useParams<{ id: string }>();
  const { projects, agents } = useWorkspaceStore();
  const project = projects.find((p) => p.id === id);
  const { tasks, loading, createTask, updateTask, deleteTask, getTasksByStatus, refetch } = useTasks(id);

  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "">("");
  const [agentFilter, setAgentFilter] = useState("");
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [readyToCommitTasks, setReadyToCommitTasks] = useState<Map<string, string[]>>(new Map());
  const [commitDialogTask, setCommitDialogTask] = useState<{ taskId: string; changedFiles: string[]; title: string } | null>(null);

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

  if (!project) {
    return <div className="p-8 text-text-secondary">Projeto não encontrado.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between bg-white px-8 py-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light">
            <ListTodo className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-text-primary">Tasks</h1>
            <p className="text-[11px] text-text-tertiary">{tasks.length} tarefas no projeto</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <TaskFilters
            priorityFilter={priorityFilter}
            agentFilter={agentFilter}
            agents={agents}
            onPriorityChange={setPriorityFilter}
            onAgentChange={setAgentFilter}
          />
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            Nova Task
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto px-8 pb-6 pt-4">
          <div className="grid h-full grid-cols-4 gap-5">
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
                    "flex flex-col rounded-lg transition-colors",
                    isOver && "bg-primary-light ring-1 ring-primary/20",
                  )}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full", column.dotColor)} />
                      <span className="text-[13px] font-semibold text-text-primary">{column.label}</span>
                    </div>
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-page px-1.5 text-[11px] font-bold text-text-tertiary">
                      {columnTasks.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-1 pb-2">
                    {columnTasks.length > 0 ? (
                      columnTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          agents={agents}
                          onEdit={setEditingTask}
                          onDelete={handleDelete}
                          onExecute={(taskId, agentId) => executeTask(taskId, agentId)}
                          onApprove={(taskId) => approveTask(taskId)}
                          onReject={(taskId, feedback) => rejectTask(taskId, feedback)}
                          draggable
                          onDragStart={handleDragStart}
                        />
                      ))
                    ) : (
                      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-edge py-8">
                        <p className="text-[12px] text-text-placeholder">Nenhuma task</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showForm && id && (
        <TaskForm
          projectId={id}
          agents={agents}
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Edit Modal */}
      {editingTask && id && (
        <TaskForm
          projectId={id}
          agents={agents}
          task={editingTask}
          onSubmit={handleEdit}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* Commit Dialog */}
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
    </div>
  );
}
