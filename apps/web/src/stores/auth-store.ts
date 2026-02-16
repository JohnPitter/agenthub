import { create } from "zustand";
import { api } from "../lib/utils";

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
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  fetchUser: async () => {
    try {
      set({ loading: true, error: null });
      const user = await api<AuthUser>("/auth/me");
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  logout: async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      set({ user: null });
      window.location.href = "/login";
    }
  },
}));
