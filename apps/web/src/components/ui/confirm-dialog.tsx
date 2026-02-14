import { AlertTriangle, X } from "lucide-react";
import { cn } from "../../lib/utils";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-lg animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl",
                variant === "danger" ? "bg-red-light" : "bg-primary-light",
              )}
            >
              <AlertTriangle
                className={cn("h-5 w-5", variant === "danger" ? "text-red" : "text-primary")}
              />
            </div>
            <h2 className="text-[16px] font-semibold text-text-primary">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            className="rounded-xl p-2 text-text-tertiary transition-colors hover:bg-page hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-[14px] text-text-secondary leading-relaxed mb-6">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl px-5 py-2.5 text-[14px] font-medium text-text-secondary transition-colors hover:bg-page"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "rounded-xl px-5 py-2.5 text-[14px] font-medium text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98]",
              variant === "danger" ? "bg-red" : "bg-primary",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
