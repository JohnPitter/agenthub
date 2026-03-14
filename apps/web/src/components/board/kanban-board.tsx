import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragStartEvent,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { api } from "../../lib/utils";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import type { Task, Agent, TaskStatus } from "@agenthub/shared";

interface KanbanBoardProps {
  projectId: string;
  tasks: Task[];
  agents: Agent[];
  recentlyMoved?: Set<string>;
  onTaskUpdate?: (taskId: string, status: TaskStatus) => void;
  onViewChanges?: (taskId: string) => void;
  onTaskClick?: (task: Task) => void;
  onError?: (error: string) => void;
}

function getColumns(t: (key: string) => string): Array<{ id: TaskStatus; title: string; color: string }> {
  return [
    { id: "created", title: t("board.backlog"), color: "var(--rt-neutral-fg3)" },
    { id: "assigned", title: t("taskStatus.assigned"), color: "var(--rt-orange)" },
    { id: "in_progress", title: t("board.inProgress"), color: "var(--rt-warning)" },
    { id: "review", title: t("board.review"), color: "var(--rt-purple)" },
    { id: "done", title: t("board.done"), color: "var(--rt-success)" },
    { id: "failed", title: t("taskStatus.failed"), color: "var(--rt-danger)" },
    { id: "cancelled", title: t("taskStatus.cancelled"), color: "var(--rt-neutral-fg3)" },
  ];
}

export function KanbanBoard({ projectId, tasks, agents, recentlyMoved, onTaskUpdate, onViewChanges, onTaskClick, onError }: KanbanBoardProps) {
  const { t } = useTranslation();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find(t => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;
    const task = tasks.find(t => t.id === taskId);

    if (!task || task.status === newStatus) return;

    // Optimistic update via callback
    onTaskUpdate?.(taskId, newStatus);

    // Update on backend
    try {
      await api(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (error) {
      console.error("Failed to update task status:", error);
      // Rollback: re-set to original status
      onTaskUpdate?.(taskId, task.status as TaskStatus);
      if (error instanceof Error) {
        onError?.(error.message);
      }
    }
  };

  const columns = useMemo(() => getColumns(t), [t]);

  const tasksByStatus = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const col of columns) map.set(col.id, []);
    for (const task of tasks) {
      // Filter out subtasks — they should not appear as independent cards
      if (task.parentTaskId) continue;
      const list = map.get(task.status as TaskStatus);
      if (list) list.push(task);
    }
    return map;
  }, [tasks, columns]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full gap-5 overflow-x-auto pb-4">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            id={column.id}
            title={column.title}
            tasks={tasksByStatus.get(column.id) || []}
            agents={agents}
            color={column.color}
            recentlyMoved={recentlyMoved}
            onViewChanges={onViewChanges}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>

      {/* Drag overlay — floating Harry Potter style */}
      <DragOverlay dropAnimation={{
        duration: 500,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      }}>
        {activeTask ? (
          <div className="animate-task-float-idle animate-task-glow rounded-xl">
            <KanbanCard
              task={activeTask}
              agent={agents.find(a => a.id === activeTask.assignedAgentId)}
              recentlyMoved={false}
              className="rotate-1 scale-[1.04] shadow-2xl"
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
