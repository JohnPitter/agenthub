import { create } from "zustand";
import { api } from "../lib/utils";

const REFRESH_INTERVAL = 20 * 60 * 1000; // 20 minutes (JWT expires in 30min)

interface AuthUser {
  id: string;
  githubId: number;
  login: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
  startTokenRefresh: () => void;
  stopTokenRefresh: () => void;
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function silentRefresh() {
  try {
    await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // Silently ignore — next API call will handle 401
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  error: null,

  fetchUser: async () => {
    try {
      set({ loading: true, error: null });
      const user = await api<AuthUser>("/auth/me");
      set({ user, loading: false });
      get().startTokenRefresh();
    } catch {
      set({ user: null, loading: false });
      get().stopTokenRefresh();
    }
  },

  logout: async () => {
    get().stopTokenRefresh();
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      set({ user: null });
      window.location.href = "/login";
    }
  },

  startTokenRefresh: () => {
    if (refreshTimer) return;
    refreshTimer = setInterval(silentRefresh, REFRESH_INTERVAL);
  },

  stopTokenRefresh: () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  },
}));
