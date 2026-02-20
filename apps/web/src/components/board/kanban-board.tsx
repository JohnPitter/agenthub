import { useState, useMemo } from "react";
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

const COLUMNS: Array<{ id: TaskStatus; title: string; color: string }> = [
  { id: "created", title: "Backlog", color: "var(--rt-neutral-fg3)" },
  { id: "assigned", title: "Disponível", color: "var(--rt-orange)" },
  { id: "in_progress", title: "Em Progresso", color: "var(--rt-warning)" },
  { id: "review", title: "Review", color: "var(--rt-purple)" },
  { id: "done", title: "Concluída", color: "var(--rt-success)" },
  { id: "failed", title: "Falhou", color: "var(--rt-danger)" },
  { id: "cancelled", title: "Cancelada", color: "var(--rt-neutral-fg3)" },
];

export function KanbanBoard({ projectId, tasks, agents, recentlyMoved, onTaskUpdate, onViewChanges, onTaskClick, onError }: KanbanBoardProps) {
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

  const tasksByStatus = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const col of COLUMNS) map.set(col.id, []);
    for (const t of tasks) {
      // Filter out subtasks — they should not appear as independent cards
      if (t.parentTaskId) continue;
      const list = map.get(t.status as TaskStatus);
      if (list) list.push(t);
    }
    return map;
  }, [tasks]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full gap-5 overflow-x-auto pb-4">
        {COLUMNS.map((column) => (
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

      {/* Drag overlay */}
      <DragOverlay>
        {activeTask ? (
          <div className="rotate-2 scale-105 opacity-90">
            <KanbanCard
              task={activeTask}
              agent={agents.find(a => a.id === activeTask.assignedAgentId)}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
