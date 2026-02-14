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
  urgent: "bg-red",
  high: "bg-red",
  medium: "bg-yellow",
  low: "bg-blue",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light">
              <Play className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-[18px] font-semibold text-text-primary">Executar Task</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-page hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Select Task */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
              Task
            </label>
            {availableTasks.length > 0 ? (
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="w-full rounded-lg border border-edge bg-page px-4 py-3 text-[14px] text-text-primary outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-muted"
              >
                <option value="">Selecione uma task...</option>
                {availableTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    [{task.priority?.toUpperCase()}] {task.title}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-lg border border-edge bg-page px-4 py-3 text-[13px] text-text-placeholder">
                Nenhuma task disponível para execução
              </div>
            )}

            {/* Selected task preview */}
            {selectedTaskId && (() => {
              const task = availableTasks.find((t) => t.id === selectedTaskId);
              if (!task) return null;
              return (
                <div className="mt-2 rounded-lg bg-page p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[task.priority] ?? "bg-yellow")} />
                    <span className="text-[11px] font-semibold uppercase text-text-tertiary">{task.priority}</span>
                    {task.category && (
                      <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-text-tertiary">{task.category}</span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-[12px] text-text-secondary line-clamp-2">{task.description}</p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Select Agent */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
              Agente
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full rounded-lg border border-edge bg-page px-4 py-3 text-[14px] text-text-primary outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-muted"
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
              className="rounded-lg px-5 py-2.5 text-[14px] font-medium text-text-secondary transition-colors hover:bg-page"
            >
              Cancelar
            </button>
            <button
              onClick={handleExecute}
              disabled={!canExecute}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-primary-hover disabled:opacity-40"
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
