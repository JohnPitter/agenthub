import { useState, useEffect, useCallback } from "react";

export function useHelpDrawer() {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Shift+? toggles
      if (e.shiftKey && e.key === "?") {
        e.preventDefault();
        toggle();
        return;
      }

      // Escape closes
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, toggle, close]);

  return { open, setOpen, toggle, close };
}
