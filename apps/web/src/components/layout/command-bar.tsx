import type { ReactNode } from "react";

interface CommandBarProps {
  children: ReactNode;
  actions?: ReactNode;
}

export function CommandBar({ children, actions }: CommandBarProps) {
  return (
    <div className="glass flex shrink-0 items-center justify-between border-b border-stroke2 py-4 px-8">
      <div className="flex items-center gap-3 min-w-0 text-title">{children}</div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
