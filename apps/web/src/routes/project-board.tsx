import { useState, useEffect, lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { LayoutGrid, Table2, Loader2 } from "lucide-react";
import { useSocket } from "../hooks/use-socket";
import { useAgents } from "../hooks/use-agents";
import { useTasks } from "../hooks/use-tasks";
import { KanbanBoard } from "../components/board/kanban-board";
import { AgentActivityOverlay } from "../components/board/agent-activity-overlay";
import { CommandBar } from "../components/layout/command-bar";
import { cn } from "../lib/utils";
import type { Task, TaskStatus } from "@agenthub/shared";

const TaskTable = lazy(() =>
  import("../components/board/task-table").then((m) => ({ default: m.TaskTable }))
);

type BoardView = "kanban" | "table";

export function ProjectBoard() {
  const { id } = useParams<{ id: string }>();
  const { agents } = useAgents();
  const { tasks: initialTasks } = useTasks(id);
  const [tasks, setTasks] = useState(initialTasks);
  const [view, setView] = useState<BoardView>("kanban");

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useSocket(id, {
    onTaskStatus: (data) => {
      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task.id === data.taskId
            ? { ...task, status: data.status as TaskStatus, updatedAt: new Date() }
            : task
        )
      );
    },
  });

  const handleTaskUpdate = (taskId: string, updates: Partial<Task> | TaskStatus) => {
    const taskUpdates = typeof updates === "string" ? { status: updates } : updates;
    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task.id === taskId ? { ...task, ...taskUpdates, updatedAt: new Date() } : task
      )
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Command Bar */}
      <CommandBar>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {view === "kanban" ? (
              <LayoutGrid className="h-4 w-4 text-brand" />
            ) : (
              <Table2 className="h-4 w-4 text-brand" />
            )}
            <span className="text-[13px] font-semibold text-neutral-fg1">
              {view === "kanban" ? "Kanban Board" : "Task Table"}
            </span>
            <span className="text-[13px] text-neutral-fg3">
              {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Pill view toggle */}
          <div className="flex items-center rounded-full bg-neutral-bg2 p-1 border border-stroke">
            <button
              onClick={() => setView("kanban")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-medium transition-all duration-200",
                view === "kanban"
                  ? "bg-gradient-to-r from-brand to-brand-dark text-white shadow-brand"
                  : "text-neutral-fg3 hover:text-neutral-fg1"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              onClick={() => setView("table")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-medium transition-all duration-200",
                view === "table"
                  ? "bg-gradient-to-r from-brand to-brand-dark text-white shadow-brand"
                  : "text-neutral-fg3 hover:text-neutral-fg1"
              )}
            >
              <Table2 className="h-3.5 w-3.5" />
              Tabela
            </button>
          </div>
        </div>
      </CommandBar>

      {/* Board content */}
      <div className="flex-1 overflow-hidden p-8">
        {view === "kanban" ? (
          <KanbanBoard
            projectId={id || ""}
            tasks={tasks}
            agents={agents}
            onTaskUpdate={handleTaskUpdate}
          />
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand" />
              </div>
            }
          >
            <TaskTable
              projectId={id || ""}
              tasks={tasks}
              agents={agents}
              onTaskUpdate={handleTaskUpdate}
            />
          </Suspense>
        )}
      </div>

      {/* Agent activity overlay */}
      <AgentActivityOverlay />
    </div>
  );
}
