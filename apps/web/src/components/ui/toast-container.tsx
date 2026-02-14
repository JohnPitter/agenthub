import { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { useNotificationStore, type NotificationType } from "../../stores/notification-store";
import { cn } from "../../lib/utils";

const ICON_MAP: Record<NotificationType, { icon: typeof CheckCircle2; color: string; bg: string }> = {
  success: { icon: CheckCircle2, color: "text-green", bg: "bg-green-light" },
  error: { icon: AlertCircle, color: "text-red", bg: "bg-red-light" },
  info: { icon: Info, color: "text-blue", bg: "bg-blue-light" },
  warning: { icon: AlertTriangle, color: "text-yellow", bg: "bg-yellow-light" },
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
            className="flex max-w-[380px] items-start gap-3 rounded-lg bg-white p-4 shadow-lg border border-edge-light animate-slide-in-right"
          >
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", config.bg)}>
              <Icon className={cn("h-5 w-5", config.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-text-primary">{toast.title}</p>
              {toast.message && (
                <p className="mt-1 text-[12px] text-text-secondary line-clamp-2">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded-lg p-1 text-text-placeholder transition-colors hover:bg-surface-hover hover:text-text-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
