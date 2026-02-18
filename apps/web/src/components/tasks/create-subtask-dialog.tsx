import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../../lib/utils";
import type { Task, TaskPriority, TaskCategory } from "@agenthub/shared";

interface CreateSubtaskDialogProps {
  parentTaskId: string;
  projectId: string;
  onCreated: (task: Task) => void;
  onClose: () => void;
}

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Media" },
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

export function CreateSubtaskDialog({ parentTaskId, projectId, onCreated, onClose }: CreateSubtaskDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [category, setCategory] = useState<TaskCategory | "">("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;

    setSubmitting(true);
    try {
      const { task } = await api<{ task: Task }>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          parentTaskId,
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          category: category || undefined,
        }),
      });
      onCreated(task);
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-neutral-bg1 p-6 shadow-16 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-semibold text-neutral-fg1">Nova Subtask</h2>
          <button onClick={onClose} className="rounded-md p-2 text-neutral-fg3 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg2">
              Titulo
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Criar componente de header"
              className="w-full rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[13px] text-neutral-fg1 placeholder-neutral-fg-disabled outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg2">
              Descricao
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional..."
              rows={2}
              className="w-full resize-none rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[13px] text-neutral-fg1 placeholder-neutral-fg-disabled outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg2">
                Prioridade
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[13px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg2">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory | "")}
                className="w-full rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[13px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
              >
                <option value="">Nenhuma</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-1 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-[13px] font-medium text-neutral-fg2 transition-colors hover:bg-neutral-bg-hover"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim() || submitting}
              className="rounded-md bg-brand px-5 py-2 text-[13px] font-medium text-white transition-all hover:bg-brand-hover disabled:opacity-40"
            >
              {submitting ? "Criando..." : "Criar Subtask"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
