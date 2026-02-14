import { CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { useNotificationStore, type NotificationType } from "../../stores/notification-store";
import { formatRelativeTime, cn } from "../../lib/utils";

const ICON_MAP: Record<NotificationType, { icon: typeof CheckCircle2; color: string }> = {
  success: { icon: CheckCircle2, color: "text-green" },
  error: { icon: AlertCircle, color: "text-red" },
  info: { icon: Info, color: "text-blue" },
  warning: { icon: AlertTriangle, color: "text-yellow" },
};

export function NotificationPanel() {
  const { notifications, markAsRead, markAllAsRead } = useNotificationStore();

  if (notifications.length === 0) {
    return (
      <div className="absolute right-0 top-full mt-2 w-[360px] rounded-2xl bg-white shadow-card-hover border border-edge-light overflow-hidden">
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-hover mb-3">
            <Info className="h-6 w-6 text-text-placeholder" />
          </div>
          <p className="text-[13px] text-text-tertiary">Nenhuma notificação</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute right-0 top-full mt-2 w-[360px] rounded-2xl bg-white shadow-card-hover border border-edge-light overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge-light px-4 py-3">
        <span className="text-[13px] font-semibold text-text-primary">Notificações</span>
        <button
          onClick={markAllAsRead}
          className="text-[11px] font-medium text-primary hover:text-primary-hover transition-colors"
        >
          Marcar todas como lidas
        </button>
      </div>

      {/* List */}
      <div className="max-h-[400px] overflow-y-auto">
        {notifications.map((notif) => {
          const config = ICON_MAP[notif.type];
          const Icon = config.icon;

          return (
            <button
              key={notif.id}
              onClick={() => markAsRead(notif.id)}
              className={cn(
                "flex w-full items-start gap-3 border-b border-edge-light px-4 py-3 text-left transition-colors hover:bg-surface-hover",
                !notif.read && "bg-primary-light",
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.color)} />
              <div className="min-w-0 flex-1">
                <p className={cn("text-[12px]", notif.read ? "text-text-secondary" : "font-semibold text-text-primary")}>
                  {notif.title}
                </p>
                {notif.message && (
                  <p className="mt-0.5 text-[11px] text-text-tertiary line-clamp-2">
                    {notif.message}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-text-placeholder">
                  {formatRelativeTime(new Date(notif.timestamp))}
                </p>
              </div>
              {!notif.read && (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
