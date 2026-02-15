import type { ReactNode } from "react";

interface CommandBarProps {
  children: ReactNode;
  actions?: ReactNode;
}

export function CommandBar({ children, actions }: CommandBarProps) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-stroke2 bg-neutral-bg1 py-3 px-6">
      <div className="flex items-center gap-3 min-w-0">{children}</div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
