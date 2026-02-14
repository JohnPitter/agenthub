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

const KANBAN_COLUMNS: { status: TaskStatus; label: string; color: string; dotColor: string }[] = [
  { status: "created", label: "Criadas", color: "bg-blue-light", dotColor: "bg-blue" },
  { status: "in_progress", label: "Em Progresso", color: "bg-yellow-light", dotColor: "bg-yellow" },
  { status: "review", label: "Em Review", color: "bg-purple-light", dotColor: "bg-purple" },
  { status: "done", label: "Concluídas", color: "bg-green-light", dotColor: "bg-green" },
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
    // Update task locally when git branch is created
    updateTask(data.taskId, { branch: data.branchName }).catch(() => {
      // If update fails, refetch to stay in sync
      refetch();
    });
  }, [updateTask, refetch]);

  const handleTaskGitCommit = useCallback((data: { taskId: string; commitSha: string }) => {
    // Update task result when commit is created
    updateTask(data.taskId, { result: `Committed as ${data.commitSha}` }).catch(() => {
      refetch();
    });

    // Remove from ready-to-commit map
    setReadyToCommitTasks((prev) => {
      const next = new Map(prev);
      next.delete(data.taskId);
      return next;
    });

    // Close dialog if open
    if (commitDialogTask?.taskId === data.taskId) {
      setCommitDialogTask(null);
    }
  }, [updateTask, refetch, commitDialogTask]);

  const handleTaskReadyToCommit = useCallback((data: { taskId: string; changedFiles: string[] }) => {
    // Track tasks ready to commit
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

  // Drag and drop
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
    return <div className="p-10 text-text-secondary">Projeto não encontrado.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge-light px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light">
            <ListTodo className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold text-text-primary">Tasks</h1>
            <p className="text-[12px] text-text-tertiary">{tasks.length} tarefas no projeto</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <TaskFilters
            priorityFilter={priorityFilter}
            agentFilter={agentFilter}
            agents={agents}
            onPriorityChange={setPriorityFilter}
            onAgentChange={setAgentFilter}
          />
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-primary-hover active:scale-[0.98]"
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
        <div className="flex-1 overflow-x-auto p-6">
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
                    "flex flex-col rounded-2xl transition-all duration-200",
                    isOver && "ring-2 ring-primary/30 bg-primary-light",
                  )}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className={cn("h-2.5 w-2.5 rounded-full", column.dotColor)} />
                      <span className="text-[13px] font-semibold text-text-primary">{column.label}</span>
                    </div>
                    <span className={cn(
                      "flex h-6 min-w-6 items-center justify-center rounded-lg px-1.5 text-[11px] font-bold",
                      column.color,
                    )}>
                      {columnTasks.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-1 pb-3">
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
                      <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-edge py-8">
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
