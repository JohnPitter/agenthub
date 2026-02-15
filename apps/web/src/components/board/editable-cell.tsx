import { useState, useRef, useEffect } from "react";
import { Check, X } from "lucide-react";
import { cn } from "../../lib/utils";

interface EditableCellProps {
  value: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  className?: string;
}

export function EditableCell({ value, onSave, placeholder = "", className }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save:", error);
      setEditValue(value); // Revert on error
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    } else if (e.key === "Tab") {
      handleSave();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className={cn(
            "flex-1 rounded border border-brand bg-neutral-bg1 px-2 py-1 text-[13px] text-neutral-fg1 outline-none",
            isSaving && "opacity-50",
            className
          )}
          placeholder={placeholder}
        />
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex h-6 w-6 items-center justify-center rounded text-success hover:bg-success-light"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleCancel}
          disabled={isSaving}
          className="flex h-6 w-6 items-center justify-center rounded text-danger hover:bg-danger-light"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={cn(
        "cursor-text rounded px-2 py-1 text-[13px] text-neutral-fg1 hover:bg-neutral-bg-hover",
        !value && "text-neutral-fg-disabled italic",
        className
      )}
    >
      {value || placeholder}
    </div>
  );
}

interface EditableSelectProps {
  value: string;
  options: Array<{ value: string; label: string; color?: string }>;
  onSave: (value: string) => Promise<void>;
  className?: string;
}

export function EditableSelect({ value, options, onSave, className }: EditableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = async (newValue: string) => {
    if (newValue === value) {
      setIsOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(newValue);
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => !isSaving && setIsOpen(!isOpen)}
        className={cn(
          "cursor-pointer rounded px-2 py-1 text-[13px] hover:bg-neutral-bg-hover",
          isSaving && "opacity-50",
          className
        )}
      >
        <span className="text-neutral-fg1">{selectedOption?.label || value}</span>
      </div>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-full rounded-lg border border-stroke bg-neutral-bg2 shadow-8">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-neutral-bg-hover",
                option.value === value && "bg-brand-light text-brand font-semibold"
              )}
            >
              {option.color && (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: option.color }}
                />
              )}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
