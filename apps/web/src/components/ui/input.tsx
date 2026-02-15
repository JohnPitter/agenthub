import { cn } from "../../lib/utils";
import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, icon, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label className="text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-fg-disabled">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              "input-fluent w-full",
              icon && "pl-12",
              error && "border-danger focus:border-danger focus:ring-danger/20",
              className,
            )}
            {...props}
          />
        </div>
        {error && <p className="text-[11px] font-medium text-danger-dark">{error}</p>}
        {helperText && !error && <p className="text-[11px] font-medium text-neutral-fg3">{helperText}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
