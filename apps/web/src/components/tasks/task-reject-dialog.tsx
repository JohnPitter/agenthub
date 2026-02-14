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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-light">
              <AlertCircle className="h-5 w-5 text-red" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-text-primary">Rejeitar Task</h2>
              <p className="text-[12px] text-text-tertiary line-clamp-1">{task.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-page hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
              Por que esta task precisa de ajustes?
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Descreva o que precisa ser corrigido..."
              rows={4}
              className="w-full resize-none rounded-lg border border-edge bg-page px-4 py-3 text-[14px] text-text-primary placeholder-text-placeholder outline-none transition-all focus:border-red focus:ring-2 focus:ring-red/20"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-lg px-5 py-2.5 text-[14px] font-medium text-text-secondary transition-colors hover:bg-page"
            >
              Cancelar
            </button>
            <button
              onClick={() => onReject(feedback)}
              disabled={!feedback.trim()}
              className="rounded-lg bg-red px-5 py-2.5 text-[14px] font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
            >
              Rejeitar e Re-atribuir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
