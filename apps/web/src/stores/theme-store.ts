import { create } from "zustand";

type Theme = "dark" | "light" | "system";

interface ThemeState {
  theme: Theme;
  resolved: "dark" | "light";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolveTheme(theme: Theme): "dark" | "light" {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyResolved(resolved: "dark" | "light") {
  if (resolved === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme);
  applyResolved(resolved);
  localStorage.setItem("agenthub:theme", theme);
  return resolved;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const stored = (localStorage.getItem("agenthub:theme") as Theme | null) ?? "system";
  const resolved = resolveTheme(stored);

  // Listen for OS theme changes when using "system"
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", () => {
    if (get().theme === "system") {
      const next = getSystemTheme();
      applyResolved(next);
      set({ resolved: next });
    }
  });

  return {
    theme: stored,
    resolved,
    setTheme: (theme) => {
      const r = applyTheme(theme);
      set({ theme, resolved: r });
    },
    toggleTheme: () => {
      set((state) => {
        const next = state.resolved === "dark" ? "light" : "dark";
        const r = applyTheme(next);
        return { theme: next, resolved: r };
      });
    },
  };
});
