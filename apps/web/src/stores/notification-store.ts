import { create } from "zustand";

export type NotificationType = "success" | "error" | "info" | "warning";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
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

  addNotification: (type: NotificationType, title: string, message?: string) => void;
  addToast: (type: NotificationType, title: string, message?: string, duration?: number) => void;
  removeToast: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  togglePanel: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  toasts: [],
  panelOpen: false,

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
      // Keep max 50 notifications
      const updated = [notification, ...state.notifications].slice(0, 50);
      return { notifications: updated };
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

  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    })),

  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),

  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
}));

// Derived selector for unread count
export const useUnreadCount = () =>
  useNotificationStore((state) => state.notifications.filter((n) => !n.read).length);
