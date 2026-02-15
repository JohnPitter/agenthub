import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "../../lib/utils";
import { KanbanCard } from "./kanban-card";
import type { Task, Agent, TaskStatus } from "@agenthub/shared";

interface KanbanColumnProps {
  id: TaskStatus;
  title: string;
  tasks: Task[];
  agents: Agent[];
  color: string;
}

export function KanbanColumn({ id, title, tasks, agents, color }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex h-full min-w-[280px] flex-col">
      {/* Column header */}
      <div className="mb-4 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-fg2">
            {title}
          </h3>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-bg3 px-1.5 text-[11px] font-semibold text-neutral-fg1">
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Droppable area */}
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex-1 space-y-3 rounded-xl border-2 border-dashed p-4 transition-all duration-200",
            isOver
              ? "border-brand bg-brand-light/10 shadow-glow"
              : "border-transparent glass"
          )}
        >
          {tasks.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-[12px] text-neutral-fg-disabled">Nenhuma task</p>
            </div>
          ) : (
            tasks.map((task) => {
              const agent = agents.find(a => a.id === task.assignedAgentId);
              return <KanbanCard key={task.id} task={task} agent={agent} />;
            })
          )}
        </div>
      </SortableContext>
    </div>
  );
}
