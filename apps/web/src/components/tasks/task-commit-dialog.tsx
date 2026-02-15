import { useState } from "react";
import { X, GitCommit, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../lib/utils";

interface TaskCommitDialogProps {
  taskId: string;
  changedFiles: string[];
  defaultMessage: string;
  onCommit: (taskId: string, message: string) => void;
  onCancel: () => void;
}

export function TaskCommitDialog({
  taskId,
  changedFiles,
  defaultMessage,
  onCommit,
  onCancel,
}: TaskCommitDialogProps) {
  const [message, setMessage] = useState(defaultMessage);
  const [showFiles, setShowFiles] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    onCommit(taskId, message);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-neutral-bg1 shadow-16">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stroke2 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-success-light">
              <GitCommit className="h-4 w-4 text-success" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-neutral-fg1">Commitar Alterações</h2>
              <p className="text-[12px] text-neutral-fg3">{changedFiles.length} arquivos modificados</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-md p-1.5 text-neutral-fg-disabled transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Commit Message */}
          <div className="mb-4">
            <label className="mb-2 block text-[12px] font-semibold text-neutral-fg2">
              Mensagem do Commit
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descreva suas alterações..."
              rows={3}
              className="w-full rounded-md border border-stroke bg-neutral-bg1 px-4 py-3 text-[13px] text-neutral-fg1 placeholder-neutral-fg-disabled focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              autoFocus
            />
          </div>

          {/* Changed Files Toggle */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowFiles(!showFiles)}
              className="flex w-full items-center justify-between rounded-md bg-neutral-bg2 px-4 py-3 text-left transition-colors hover:bg-neutral-bg2/80"
            >
              <span className="text-[12px] font-semibold text-neutral-fg2">
                Arquivos Alterados ({changedFiles.length})
              </span>
              {showFiles ? (
                <ChevronUp className="h-4 w-4 text-neutral-fg3" />
              ) : (
                <ChevronDown className="h-4 w-4 text-neutral-fg3" />
              )}
            </button>

            {showFiles && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-stroke bg-neutral-bg1 p-4">
                {changedFiles.length > 0 ? (
                  <ul className="space-y-1.5">
                    {changedFiles.map((file, index) => (
                      <li
                        key={index}
                        className="text-[11px] font-mono text-neutral-fg2"
                      >
                        {file}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-neutral-fg-disabled">Nenhum arquivo alterado</p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-stroke px-5 py-2.5 text-[13px] font-medium text-neutral-fg2 transition-colors hover:bg-neutral-bg-hover"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!message.trim()}
              className={cn(
                "flex items-center gap-2 rounded-md px-5 py-2.5 text-[13px] font-medium text-white shadow-sm transition-all",
                message.trim()
                  ? "bg-success hover:bg-success/90"
                  : "cursor-not-allowed bg-stroke text-neutral-fg-disabled"
              )}
            >
              <GitCommit className="h-4 w-4" />
              Commit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
