import { useState } from "react";
import { X, ListTodo, MessageSquare, Send, FolderOpen, Plus } from "lucide-react";
import { cn } from "../../lib/utils";
import { getSocket } from "../../lib/socket";
import { api } from "../../lib/utils";
import type { Agent, Project, Task, TaskPriority, TaskCategory } from "@agenthub/shared";

interface NewTaskDialogProps {
  projects: Project[];
  agents: Agent[];
  onCreated: (task: Task) => void;
  onClose: () => void;
}

type Mode = "manual" | "techlead";

const PRIORITIES: { value: TaskPriority; label: string; dot: string }[] = [
  { value: "low", label: "Baixa", dot: "bg-info" },
  { value: "medium", label: "Média", dot: "bg-warning" },
  { value: "high", label: "Alta", dot: "bg-danger" },
  { value: "urgent", label: "Urgente", dot: "bg-danger" },
];

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: "feature", label: "Feature" },
  { value: "bug", label: "Bug" },
  { value: "refactor", label: "Refactor" },
  { value: "test", label: "Test" },
  { value: "docs", label: "Docs" },
];

export function NewTaskDialog({ projects, agents, onCreated, onClose }: NewTaskDialogProps) {
  const [mode, setMode] = useState<Mode>("manual");

  // Manual mode state
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [category, setCategory] = useState<TaskCategory | "">("");
  const [submitting, setSubmitting] = useState(false);

  // Tech Lead mode state
  const [prompt, setPrompt] = useState("");
  const [tlProjectId, setTlProjectId] = useState(projects[0]?.id ?? "");
  const [sent, setSent] = useState(false);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
      };
      if (category) body.category = category;
      const { task } = await api<{ task: Task }>("/tasks", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onCreated(task);
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  const handleTechLeadSend = () => {
    if (!prompt.trim() || !tlProjectId) return;
    const socket = getSocket();
    socket.emit("user:message", { projectId: tlProjectId, content: prompt.trim() });
    setSent(true);
    setTimeout(() => onClose(), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl bg-neutral-bg1 shadow-16 animate-fade-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stroke2 px-6 py-4">
          <h2 className="text-[17px] font-semibold text-neutral-fg1">Nova Task</h2>
          <button onClick={onClose} className="rounded-md p-2 text-neutral-fg3 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-stroke2">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 px-4 py-3 text-[13px] font-medium transition-all",
              mode === "manual"
                ? "border-b-2 border-brand text-brand bg-brand-light/30"
                : "text-neutral-fg3 hover:text-neutral-fg2 hover:bg-neutral-bg-hover",
            )}
          >
            <ListTodo className="h-4 w-4" />
            Manual
          </button>
          <button
            type="button"
            onClick={() => setMode("techlead")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 px-4 py-3 text-[13px] font-medium transition-all",
              mode === "techlead"
                ? "border-b-2 border-purple text-purple bg-purple-light/30"
                : "text-neutral-fg3 hover:text-neutral-fg2 hover:bg-neutral-bg-hover",
            )}
          >
            <MessageSquare className="h-4 w-4" />
            Tech Leader
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {mode === "manual" ? (
            <form onSubmit={handleManualSubmit} className="flex flex-col gap-4">
              {/* Project */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
                  Projeto
                </label>
                {projects.length > 0 ? (
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-stroke2 px-4 py-3 text-[13px] text-neutral-fg-disabled">
                    <FolderOpen className="h-4 w-4" />
                    Nenhum projeto encontrado. Crie um projeto primeiro.
                  </div>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
                  Titulo
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Implementar autenticacao JWT"
                  className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 placeholder-neutral-fg-disabled outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
                  Descricao
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detalhe o que precisa ser feito..."
                  rows={3}
                  className="w-full resize-none rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 placeholder-neutral-fg-disabled outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                />
              </div>

              {/* Priority + Category */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
                    Prioridade
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
                    Categoria
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TaskCategory | "")}
                    className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                  >
                    <option value="">Nenhuma</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
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
                  type="submit"
                  disabled={!title.trim() || !projectId || submitting}
                  className="flex items-center gap-2 rounded-md bg-brand px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-brand-hover disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                  Criar Task
                </button>
              </div>
            </form>
          ) : (
            /* Tech Lead mode */
            <div className="flex flex-col gap-4">
              <div className="rounded-lg bg-purple-light/30 border border-purple/20 px-4 py-3">
                <p className="text-[12px] text-purple leading-relaxed">
                  Descreva o que precisa ser feito em linguagem natural. O Tech Leader vai analisar, criar a task, escolher o agente ideal e executar automaticamente.
                </p>
              </div>

              {/* Project selector */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
                  Projeto
                </label>
                <select
                  value={tlProjectId}
                  onChange={(e) => setTlProjectId(e.target.value)}
                  className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Free-form prompt */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
                  O que precisa ser feito?
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ex: Adicionar dark mode no app, corrigir bug no login, refatorar o módulo de pagamento..."
                  rows={4}
                  className="w-full resize-none rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 placeholder-neutral-fg-disabled outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleTechLeadSend();
                    }
                  }}
                />
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
                  type="button"
                  onClick={handleTechLeadSend}
                  disabled={!prompt.trim() || !tlProjectId || sent}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-6 py-2.5 text-[14px] font-medium text-white transition-all disabled:opacity-40",
                    sent
                      ? "bg-success"
                      : "bg-gradient-to-r from-brand to-purple hover:opacity-90",
                  )}
                >
                  <Send className="h-4 w-4" />
                  {sent ? "Enviado ao Tech Leader!" : "Enviar ao Tech Leader"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
