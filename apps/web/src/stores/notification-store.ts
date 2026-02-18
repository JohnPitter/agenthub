import { create } from "zustand";
import { api } from "../lib/utils";

export type NotificationType =
  | "success"
  | "error"
  | "info"
  | "warning"
  | "task_completed"
  | "review_needed"
  | "agent_error";

export interface Notification {
  id: string;
  projectId?: string;
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  timestamp: number;
  read: boolean;
}

export interface Toast extends Notification {
  duration: number;
}

interface NotificationState {
  notifications: Notification[];
  toasts: Toast[];
  panelOpen: boolean;
  loading: boolean;
  unreadCount: number;

  // API-backed methods
  fetchNotifications: (projectId?: string) => Promise<void>;
  fetchUnreadCount: (projectId?: string) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: (projectId?: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;

  // Real-time
  addNotificationFromSocket: (notification: Notification) => void;

  // In-memory fallback
  addNotification: (type: NotificationType, title: string, message?: string) => void;

  // Toast system (ephemeral)
  addToast: (type: NotificationType, title: string, message?: string, duration?: number) => void;
  removeToast: (id: string) => void;
  togglePanel: () => void;
}

interface ApiNotification {
  id: string;
  projectId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  read: boolean | number;
  createdAt: string;
}

function mapApiNotification(n: ApiNotification): Notification {
  return {
    id: n.id,
    projectId: n.projectId ?? undefined,
    type: n.type as NotificationType,
    title: n.title,
    message: n.body ?? undefined,
    link: n.link ?? undefined,
    timestamp: new Date(n.createdAt).getTime(),
    read: Boolean(n.read),
  };
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  toasts: [],
  panelOpen: false,
  loading: false,
  unreadCount: 0,

  fetchNotifications: async (projectId?: string) => {
    set({ loading: true });
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (projectId) params.set("projectId", projectId);
      const data = await api<{ notifications: ApiNotification[] }>(
        `/notifications?${params.toString()}`,
      );
      set({
        notifications: data.notifications.map(mapApiNotification),
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  fetchUnreadCount: async (projectId?: string) => {
    try {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      const qs = params.toString();
      const data = await api<{ count: number }>(
        `/notifications/unread-count${qs ? `?${qs}` : ""}`,
      );
      set({ unreadCount: data.count });
    } catch {
      // silently fail
    }
  },

  markAsRead: async (id: string) => {
    // Optimistic update
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
      unreadCount: Math.max(0, state.unreadCount - (state.notifications.find((n) => n.id === id && !n.read) ? 1 : 0)),
    }));
    try {
      await api(`/notifications/${id}/read`, { method: "PUT" });
    } catch {
      // Revert on error — refetch
      get().fetchUnreadCount();
    }
  },

  markAllAsRead: async (projectId?: string) => {
    // Optimistic update
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
    try {
      await api("/notifications/read-all", {
        method: "PUT",
        body: JSON.stringify(projectId ? { projectId } : {}),
      });
    } catch {
      get().fetchUnreadCount();
    }
  },

  deleteNotification: async (id: string) => {
    const prev = get().notifications;
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
      unreadCount: Math.max(0, state.unreadCount - (prev.find((n) => n.id === id && !n.read) ? 1 : 0)),
    }));
    try {
      await api(`/notifications/${id}`, { method: "DELETE" });
    } catch {
      // Revert on error
      set({ notifications: prev });
      get().fetchUnreadCount();
    }
  },

  addNotificationFromSocket: (notification: Notification) => {
    set((state) => {
      // Avoid duplicates
      if (state.notifications.some((n) => n.id === notification.id)) return state;
      return {
        notifications: [notification, ...state.notifications].slice(0, 50),
        unreadCount: state.unreadCount + (notification.read ? 0 : 1),
      };
    });
  },

  addNotification: (type, title, message) =>
    set((state) => {
      const notification: Notification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type,
        title,
        message,
        timestamp: Date.now(),
        read: false,
      };
      const updated = [notification, ...state.notifications].slice(0, 50);
      return {
        notifications: updated,
        unreadCount: state.unreadCount + 1,
      };
    }),

  addToast: (type, title, message, duration = 4000) =>
    set((state) => {
      const toast: Toast = {
        id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type,
        title,
        message,
        timestamp: Date.now(),
        read: false,
        duration,
      };
      return { toasts: [...state.toasts, toast] };
    }),

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
}));

// Derived selector for unread count
export const useUnreadCount = () =>
  useNotificationStore((state) => state.unreadCount);
