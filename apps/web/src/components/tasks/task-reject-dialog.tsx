import { useState } from "react";
import { X, AlertCircle } from "lucide-react";
import type { Task } from "@agenthub/shared";

interface TaskRejectDialogProps {
  task: Task;
  onReject: (feedback: string) => void;
  onClose: () => void;
}

export function TaskRejectDialog({ task, onReject, onClose }: TaskRejectDialogProps) {
  const [feedback, setFeedback] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-neutral-bg1 p-6 shadow-16 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-danger-light">
              <AlertCircle className="h-5 w-5 text-danger" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-neutral-fg1">Rejeitar Task</h2>
              <p className="text-[12px] text-neutral-fg3 line-clamp-1">{task.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-neutral-fg3 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              Por que esta task precisa de ajustes?
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Descreva o que precisa ser corrigido..."
              rows={4}
              className="w-full resize-none rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 placeholder-neutral-fg-disabled outline-none transition-all focus:border-danger focus:ring-2 focus:ring-danger/20"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-md px-5 py-2.5 text-[14px] font-medium text-neutral-fg2 transition-colors hover:bg-neutral-bg-hover"
            >
              Cancelar
            </button>
            <button
              onClick={() => onReject(feedback)}
              disabled={!feedback.trim()}
              className="rounded-md bg-danger px-5 py-2.5 text-[14px] font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
            >
              Rejeitar e Re-atribuir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
