import { useState } from "react";
import { X } from "lucide-react";
import type { Task, Agent, TaskPriority, TaskCategory } from "@agenthub/shared";

interface TaskFormProps {
  projectId: string;
  agents: Agent[];
  task?: Task | null;
  onSubmit: (data: TaskFormData) => void;
  onClose: () => void;
}

export interface TaskFormData {
  title: string;
  description: string;
  priority: TaskPriority;
  category: TaskCategory | "";
  assignedAgentId: string;
}

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: "feature", label: "Feature" },
  { value: "bug", label: "Bug" },
  { value: "refactor", label: "Refactor" },
  { value: "test", label: "Test" },
  { value: "docs", label: "Docs" },
];

export function TaskForm({ agents, task, onSubmit, onClose }: TaskFormProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [category, setCategory] = useState<TaskCategory | "">(task?.category ?? "");
  const [assignedAgentId, setAssignedAgentId] = useState(task?.assignedAgentId ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), description: description.trim(), priority, category, assignedAgentId });
  };

  const activeAgents = agents.filter((a) => a.isActive);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[18px] font-semibold text-text-primary">
            {task ? "Editar Task" : "Nova Task"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-page hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Title */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
              Título
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Implementar autenticação JWT"
              className="w-full rounded-lg border border-edge bg-page px-4 py-3 text-[14px] text-text-primary placeholder-text-placeholder outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-muted"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhe o que precisa ser feito..."
              rows={3}
              className="w-full resize-none rounded-lg border border-edge bg-page px-4 py-3 text-[14px] text-text-primary placeholder-text-placeholder outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-muted"
            />
          </div>

          {/* Priority + Category row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
                Prioridade
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-edge bg-page px-4 py-3 text-[14px] text-text-primary outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-muted"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory | "")}
                className="w-full rounded-lg border border-edge bg-page px-4 py-3 text-[14px] text-text-primary outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-muted"
              >
                <option value="">Nenhuma</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Assign Agent */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
              Agente Responsável
            </label>
            <select
              value={assignedAgentId}
              onChange={(e) => setAssignedAgentId(e.target.value)}
              className="w-full rounded-lg border border-edge bg-page px-4 py-3 text-[14px] text-text-primary outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-muted"
            >
              <option value="">Auto (Tech Lead decide)</option>
              {activeAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name} — {agent.role}</option>
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
              type="submit"
              disabled={!title.trim()}
              className="rounded-lg bg-primary px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-primary-hover disabled:opacity-40"
            >
              {task ? "Salvar" : "Criar Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
