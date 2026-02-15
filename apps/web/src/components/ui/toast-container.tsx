import { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { useNotificationStore, type NotificationType } from "../../stores/notification-store";
import { cn } from "../../lib/utils";

const ICON_MAP: Record<NotificationType, { icon: typeof CheckCircle2; color: string; bg: string }> = {
  success: { icon: CheckCircle2, color: "text-success", bg: "bg-success-light" },
  error: { icon: AlertCircle, color: "text-danger", bg: "bg-danger-light" },
  info: { icon: Info, color: "text-info", bg: "bg-info-light" },
  warning: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning-light" },
};

export function ToastContainer() {
  const { toasts, removeToast } = useNotificationStore();

  useEffect(() => {
    const timers = toasts.map((toast) =>
      setTimeout(() => removeToast(toast.id), toast.duration),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const config = ICON_MAP[toast.type];
        const Icon = config.icon;

        return (
          <div
            key={toast.id}
            className="glass-strong flex max-w-[380px] items-start gap-3 rounded-xl p-4 shadow-brand animate-slide-in-right"
          >
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", config.bg)}>
              <Icon className={cn("h-5 w-5", config.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-neutral-fg1">{toast.title}</p>
              {toast.message && (
                <p className="mt-1 text-[12px] text-neutral-fg2 line-clamp-2">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded-md p-1 text-neutral-fg-disabled transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
