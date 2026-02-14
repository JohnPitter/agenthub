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
      <div className="glass relative z-10 flex items-center justify-between px-8 py-5 shadow-sm border-b border-edge-light/50">
        <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-primary" />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-light to-yellow-muted shadow-md">
            <ListTodo className="h-5 w-5 text-yellow-dark" strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-[16px] font-bold text-text-primary">Task Board</h1>
            <p className="text-[12px] text-text-tertiary font-medium">{tasks.length} tarefas ativas</p>
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
            className="btn-primary flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white shadow-md transition-all hover:shadow-lg hover:scale-105"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Nova Task
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-[13px] text-text-tertiary font-medium">Carregando tasks...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto px-8 pb-6 pt-6">
          <div className="grid h-full grid-cols-4 gap-6">
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
                    "flex flex-col rounded-2xl bg-white/60 backdrop-blur-sm transition-all duration-300",
                    isOver && "bg-gradient-to-br from-primary-light to-purple-light ring-2 ring-primary/30 shadow-lg scale-[1.02]",
                  )}
                >
                  {/* Column Header */}
                  <div className="relative overflow-hidden rounded-t-2xl bg-white/80 px-4 py-3.5 shadow-sm">
                    <div className="absolute inset-0 opacity-[0.03] gradient-primary" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className={cn("h-2.5 w-2.5 rounded-full shadow-sm", column.dotColor)} style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
                        <span className="text-[14px] font-bold text-text-primary">{column.label}</span>
                      </div>
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-lg bg-gradient-to-br from-primary-light to-purple-light px-2 text-[11px] font-bold text-primary shadow-sm">
                        {columnTasks.length}
                      </span>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
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
                      <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-edge-light/50 bg-page/30 py-12">
                        <p className="text-[12px] font-medium text-text-placeholder">Vazio</p>
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
