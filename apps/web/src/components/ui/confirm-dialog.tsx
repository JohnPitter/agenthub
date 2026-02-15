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
        className="w-full max-w-md rounded-lg bg-neutral-bg1 p-6 shadow-16 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                variant === "danger" ? "bg-danger-light" : "bg-brand-light",
              )}
            >
              <AlertTriangle
                className={cn("h-5 w-5", variant === "danger" ? "text-danger" : "text-brand")}
              />
            </div>
            <h2 className="text-[16px] font-semibold text-neutral-fg1">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            className="rounded-md p-2 text-neutral-fg3 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-[14px] text-neutral-fg2 leading-relaxed mb-6">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-md px-5 py-2.5 text-[14px] font-medium text-neutral-fg2 transition-colors hover:bg-neutral-bg-hover"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "rounded-md px-5 py-2.5 text-[14px] font-medium text-white transition-all hover:opacity-90",
              variant === "danger" ? "bg-danger" : "bg-brand",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
