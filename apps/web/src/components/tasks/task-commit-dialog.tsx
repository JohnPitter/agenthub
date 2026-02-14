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
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-modal">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge-light px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-light">
              <GitCommit className="h-4 w-4 text-green" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">Commit Changes</h2>
              <p className="text-[12px] text-text-tertiary">{changedFiles.length} files modified</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-text-placeholder transition-colors hover:bg-page hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Commit Message */}
          <div className="mb-4">
            <label className="mb-2 block text-[12px] font-semibold text-text-secondary">
              Commit Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your changes..."
              rows={3}
              className="w-full rounded-xl border border-edge bg-white px-4 py-3 text-[13px] text-text-primary placeholder-text-placeholder focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
          </div>

          {/* Changed Files Toggle */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowFiles(!showFiles)}
              className="flex w-full items-center justify-between rounded-xl bg-page px-4 py-3 text-left transition-colors hover:bg-page/80"
            >
              <span className="text-[12px] font-semibold text-text-secondary">
                Changed Files ({changedFiles.length})
              </span>
              {showFiles ? (
                <ChevronUp className="h-4 w-4 text-text-tertiary" />
              ) : (
                <ChevronDown className="h-4 w-4 text-text-tertiary" />
              )}
            </button>

            {showFiles && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-edge bg-white p-4">
                {changedFiles.length > 0 ? (
                  <ul className="space-y-1.5">
                    {changedFiles.map((file, index) => (
                      <li
                        key={index}
                        className="text-[11px] font-mono text-text-secondary"
                      >
                        {file}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-text-placeholder">No files changed</p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-edge px-5 py-2.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-page"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!message.trim()}
              className={cn(
                "flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-medium text-white shadow-sm transition-all",
                message.trim()
                  ? "bg-green hover:bg-green/90 active:scale-[0.98]"
                  : "cursor-not-allowed bg-edge text-text-placeholder"
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
