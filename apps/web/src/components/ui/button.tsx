import { cn } from "../../lib/utils";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const VARIANT_STYLES = {
  primary: "btn-primary text-white",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "bg-danger text-white hover:bg-danger-dark",
};

const SIZE_STYLES = {
  sm: "px-4 py-2 text-[12px] rounded-md",
  md: "px-6 py-3 text-[14px] rounded-md",
  lg: "px-8 py-4 text-[16px] rounded-md",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2.5 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
