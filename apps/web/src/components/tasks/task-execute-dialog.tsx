import { useState } from "react";
import { X, Play } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Task, Agent } from "@agenthub/shared";

interface TaskExecuteDialogProps {
  tasks: Task[];
  agents: Agent[];
  onExecute: (taskId: string, agentId: string) => void;
  onClose: () => void;
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-danger",
  high: "bg-danger",
  medium: "bg-warning",
  low: "bg-info",
};

export function TaskExecuteDialog({ tasks, agents, onExecute, onClose }: TaskExecuteDialogProps) {
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");

  const availableTasks = tasks.filter(
    (t) => t.status === "created" || t.status === "changes_requested",
  );
  const activeAgents = agents.filter((a) => a.isActive);

  const canExecute = selectedTaskId && selectedAgentId;

  const handleExecute = () => {
    if (!canExecute) return;
    onExecute(selectedTaskId, selectedAgentId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg bg-neutral-bg1 p-6 shadow-16 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-light">
              <Play className="h-5 w-5 text-brand" />
            </div>
            <h2 className="text-[18px] font-semibold text-neutral-fg1">Executar Task</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-neutral-fg3 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Select Task */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              Task
            </label>
            {availableTasks.length > 0 ? (
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
              >
                <option value="">Selecione uma task...</option>
                {availableTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    [{task.priority?.toUpperCase()}] {task.title}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[13px] text-neutral-fg-disabled">
                Nenhuma task disponivel para execucao
              </div>
            )}

            {/* Selected task preview */}
            {selectedTaskId && (() => {
              const task = availableTasks.find((t) => t.id === selectedTaskId);
              if (!task) return null;
              return (
                <div className="mt-2 rounded-md bg-neutral-bg2 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[task.priority] ?? "bg-warning")} />
                    <span className="text-[11px] font-semibold uppercase text-neutral-fg3">{task.priority}</span>
                    {task.category && (
                      <span className="rounded-md bg-neutral-bg1 px-2 py-0.5 text-[10px] font-medium text-neutral-fg3">{task.category}</span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-[12px] text-neutral-fg2 line-clamp-2">{task.description}</p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Select Agent */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              Agente
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            >
              <option value="">Selecione um agente...</option>
              {activeAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} — {agent.role}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-5 py-2.5 text-[14px] font-medium text-neutral-fg2 transition-colors hover:bg-neutral-bg-hover"
            >
              Cancelar
            </button>
            <button
              onClick={handleExecute}
              disabled={!canExecute}
              className="flex items-center gap-2 rounded-md bg-brand px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-brand-hover disabled:opacity-40"
            >
              <Play className="h-4 w-4" />
              Executar Agora
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
