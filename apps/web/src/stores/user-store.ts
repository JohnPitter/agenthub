import { create } from "zustand";

interface UserProfile {
  name: string;
  avatar: string;
  color: string;
}

interface UserState extends UserProfile {
  setName: (name: string) => void;
  setAvatar: (avatar: string) => void;
  setColor: (color: string) => void;
  setProfile: (profile: Partial<UserProfile>) => void;
}

const STORAGE_KEY = "agenthub:userProfile";

const DEFAULTS: UserProfile = {
  name: "João Pedro",
  avatar: "",
  color: "#6366F1",
};

function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function persist(profile: UserProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export const useUserStore = create<UserState>((set, get) => {
  const initial = loadProfile();

  return {
    ...initial,
    setName: (name) => {
      set({ name });
      persist({ name, avatar: get().avatar, color: get().color });
    },
    setAvatar: (avatar) => {
      set({ avatar });
      persist({ name: get().name, avatar, color: get().color });
    },
    setColor: (color) => {
      set({ color });
      persist({ name: get().name, avatar: get().avatar, color });
    },
    setProfile: (updates) => {
      set(updates);
      const state = get();
      persist({ name: state.name, avatar: state.avatar, color: state.color });
    },
  };
});
