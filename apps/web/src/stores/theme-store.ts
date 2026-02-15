import { create } from "zustand";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function applyTheme(theme: Theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  localStorage.setItem("agenthub:theme", theme);
}

export const useThemeStore = create<ThemeState>((set) => {
  const stored = (localStorage.getItem("agenthub:theme") as Theme) || "dark";

  return {
    theme: stored,
    setTheme: (theme) => {
      applyTheme(theme);
      set({ theme });
    },
    toggleTheme: () => {
      set((state) => {
        const next = state.theme === "dark" ? "light" : "dark";
        applyTheme(next);
        return { theme: next };
      });
    },
  };
});
