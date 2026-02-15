import { cn } from "../../lib/utils";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  variant?: "default" | "compact" | "inline";
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "default",
  className,
}: EmptyStateProps) {
  const isCompact = variant === "compact";
  const isInline = variant === "inline";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        isInline && "flex-row gap-4 text-left",
        !isInline && isCompact ? "gap-3 py-8" : "gap-6 py-16",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-lg bg-neutral-bg2",
          isCompact || isInline ? "h-12 w-12" : "h-16 w-16",
        )}
      >
        <Icon
          className={cn("text-neutral-fg3", isCompact || isInline ? "h-6 w-6" : "h-8 w-8")}
          strokeWidth={1.5}
        />
      </div>

      <div className={cn("flex flex-col", isInline ? "flex-1 gap-1" : "gap-2")}>
        <h3
          className={cn(
            "font-semibold text-neutral-fg1",
            isCompact || isInline ? "text-[14px]" : "text-[16px]",
          )}
        >
          {title}
        </h3>
        {description && (
          <p
            className={cn(
              "text-neutral-fg3 leading-relaxed",
              isCompact || isInline ? "text-[12px]" : "text-[13px]",
              !isInline && "max-w-sm",
            )}
          >
            {description}
          </p>
        )}
      </div>

      {action && !isInline && (
        <button
          onClick={action.onClick}
          className="btn-primary flex items-center gap-2 rounded-md px-5 py-2.5 text-[14px] font-medium text-white"
        >
          {action.icon && <action.icon className="h-4 w-4" strokeWidth={2.5} />}
          {action.label}
        </button>
      )}
    </div>
  );
}
