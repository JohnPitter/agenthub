import { useState, useEffect } from "react";
import {
  DndContext,
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
  onTaskUpdate?: (taskId: string, status: TaskStatus) => void;
  onViewChanges?: (taskId: string) => void;
}

const COLUMNS: Array<{ id: TaskStatus; title: string; color: string }> = [
  { id: "created", title: "Backlog", color: "#71717A" },
  { id: "assigned", title: "Disponível", color: "#F97316" },
  { id: "in_progress", title: "Em Progresso", color: "#F59E0B" },
  { id: "review", title: "Review", color: "#8B5CF6" },
  { id: "done", title: "Concluída", color: "#10B981" },
  { id: "cancelled", title: "Cancelada", color: "#A1A1AA" },
];

export function KanbanBoard({ projectId, tasks, agents, onTaskUpdate, onViewChanges }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: any) => {
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
    }
  };

  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter(t => t.status === status);
  };

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
            tasks={getTasksByStatus(column.id)}
            agents={agents}
            color={column.color}
            onViewChanges={onViewChanges}
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
