import { cn } from "../../lib/utils";

interface BadgeProps {
  variant?: "primary" | "success" | "warning" | "danger" | "info" | "neutral";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

const VARIANT_STYLES = {
  primary: "bg-brand-light text-brand",
  success: "bg-success-light text-success-dark",
  warning: "bg-warning-light text-warning-dark",
  danger: "bg-danger-light text-danger-dark",
  info: "bg-info-light text-info-dark",
  neutral: "bg-neutral-bg2 text-neutral-fg2 border border-stroke",
};

const SIZE_STYLES = {
  sm: "px-2 py-1 text-[10px] gap-1",
  md: "px-3 py-1.5 text-[11px] gap-1.5",
  lg: "px-4 py-2 text-[12px] gap-2",
};

const DOT_COLORS = {
  primary: "bg-brand",
  success: "bg-success-dark",
  warning: "bg-warning-dark",
  danger: "bg-danger-dark",
  info: "bg-info-dark",
  neutral: "bg-neutral-fg3",
};

export function Badge({ variant = "neutral", size = "md", children, className, dot = false }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-semibold uppercase tracking-wider",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOT_COLORS[variant])} />}
      {children}
    </span>
  );
}
