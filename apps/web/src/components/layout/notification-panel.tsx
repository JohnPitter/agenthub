import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  useNotificationStore,
  type NotificationType,
} from "../../stores/notification-store";
import { formatRelativeTime, cn } from "../../lib/utils";

const ICON_MAP: Record<
  NotificationType,
  { icon: typeof CheckCircle2; color: string }
> = {
  success: { icon: CheckCircle2, color: "text-success" },
  error: { icon: AlertCircle, color: "text-danger" },
  info: { icon: Info, color: "text-info" },
  warning: { icon: AlertTriangle, color: "text-warning" },
  task_completed: { icon: CheckCircle2, color: "text-success" },
  review_needed: { icon: AlertCircle, color: "text-warning" },
  agent_error: { icon: AlertTriangle, color: "text-danger" },
};

export function NotificationPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notifications = useNotificationStore((s) => s.notifications);
  const loading = useNotificationStore((s) => s.loading);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const deleteNotification = useNotificationStore((s) => s.deleteNotification);
  const togglePanel = useNotificationStore((s) => s.togglePanel);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="absolute right-0 top-full mt-2 w-[360px] rounded-xl glass-strong shadow-8 overflow-hidden animate-scale-in">
        <div className="flex flex-col items-center justify-center py-10 px-6">
          <Loader2 className="h-5 w-5 text-neutral-fg-disabled animate-spin mb-3" />
          <p className="text-[13px] text-neutral-fg3">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="absolute right-0 top-full mt-2 w-[360px] rounded-xl glass-strong shadow-8 overflow-hidden animate-scale-in">
        <div className="flex flex-col items-center justify-center py-10 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-bg2 mb-3">
            <Info className="h-5 w-5 text-neutral-fg-disabled" />
          </div>
          <p className="text-[13px] text-neutral-fg3">
            {t("notifications.empty")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute right-0 top-full mt-2 w-[360px] rounded-xl glass-strong shadow-8 overflow-hidden animate-scale-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stroke px-4 py-3">
        <span className="text-[13px] font-semibold text-neutral-fg1">
          {t("notifications.title")}
        </span>
        <button
          onClick={() => markAllAsRead()}
          className="text-[11px] font-medium text-brand hover:text-brand-hover transition-colors"
        >
          {t("notifications.markAllRead")}
        </button>
      </div>

      {/* List */}
      <div className="max-h-[400px] overflow-y-auto">
        {notifications.map((notif, i) => {
          const config = ICON_MAP[notif.type] ?? ICON_MAP.info;
          const Icon = config.icon;

          return (
            <div
              key={notif.id}
              onMouseEnter={() => setHoveredId(notif.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={cn(
                "relative flex w-full items-start gap-3 border-b border-stroke px-4 py-3 text-left transition-all duration-200 hover:bg-neutral-bg-hover animate-fade-up",
                !notif.read && "bg-brand-light",
                i === 0 && "stagger-1",
                i === 1 && "stagger-2",
                i === 2 && "stagger-3",
              )}
            >
              <button
                className="flex flex-1 items-start gap-3 text-left"
                onClick={() => {
                  if (!notif.read) markAsRead(notif.id);
                  if (notif.link) {
                    togglePanel();
                    navigate(notif.link);
                  }
                }}
              >
                <Icon
                  className={cn("mt-0.5 h-4 w-4 shrink-0", config.color)}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-[12px]",
                      notif.read
                        ? "text-neutral-fg2"
                        : "font-semibold text-neutral-fg1",
                    )}
                  >
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
              </button>

              {/* Unread dot or delete button */}
              <div className="flex shrink-0 items-center gap-1 mt-1.5">
                {hoveredId === notif.id ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(notif.id);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-fg3 hover:text-danger hover:bg-danger-light transition-colors"
                    title={t("notifications.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  !notif.read && (
                    <span className="h-2 w-2 rounded-full bg-brand animate-pulse" />
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
