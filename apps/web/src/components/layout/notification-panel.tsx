import { CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { useNotificationStore, type NotificationType } from "../../stores/notification-store";
import { formatRelativeTime, cn } from "../../lib/utils";

const ICON_MAP: Record<NotificationType, { icon: typeof CheckCircle2; color: string }> = {
  success: { icon: CheckCircle2, color: "text-success" },
  error: { icon: AlertCircle, color: "text-danger" },
  info: { icon: Info, color: "text-info" },
  warning: { icon: AlertTriangle, color: "text-warning" },
};

export function NotificationPanel() {
  const { notifications, markAsRead, markAllAsRead } = useNotificationStore();

  if (notifications.length === 0) {
    return (
      <div className="absolute right-0 top-full mt-2 w-[340px] rounded-lg bg-neutral-bg1 shadow-16 border border-stroke overflow-hidden">
        <div className="flex flex-col items-center justify-center py-10 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-bg2 mb-3">
            <Info className="h-5 w-5 text-neutral-fg-disabled" />
          </div>
          <p className="text-[13px] text-neutral-fg3">Nenhuma notificação</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute right-0 top-full mt-2 w-[340px] rounded-lg bg-neutral-bg1 shadow-16 border border-stroke overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stroke px-4 py-3">
        <span className="text-[13px] font-semibold text-neutral-fg1">Notificações</span>
        <button
          onClick={markAllAsRead}
          className="text-[11px] font-medium text-brand hover:text-brand-hover transition-colors"
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
                "flex w-full items-start gap-3 border-b border-stroke px-4 py-3 text-left transition-colors hover:bg-neutral-bg-hover",
                !notif.read && "bg-brand-light",
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.color)} />
              <div className="min-w-0 flex-1">
                <p className={cn("text-[12px]", notif.read ? "text-neutral-fg2" : "font-semibold text-neutral-fg1")}>
                  {notif.title}
                </p>
                {notif.message && (
                  <p className="mt-0.5 text-[11px] text-neutral-fg3 line-clamp-2">
                    {notif.message}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-neutral-fg-disabled">
                  {formatRelativeTime(new Date(notif.timestamp))}
                </p>
              </div>
              {!notif.read && (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
