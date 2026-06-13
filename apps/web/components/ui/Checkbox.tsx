"use client";

import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function Checkbox({
  checked,
  indeterminate,
  disabled,
  label,
  onChange,
  className,
}: CheckboxProps) {
  const ariaChecked = indeterminate ? "mixed" : checked;

  return (
    <label
      className={cn(
        "flex items-center gap-3 cursor-pointer select-none",
        disabled && "opacity-40 cursor-not-allowed",
        className
      )}
    >
      <button
        role="checkbox"
        aria-checked={ariaChecked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary focus-visible:ring-offset-2",
          checked || indeterminate
            ? "bg-brand-secondary border-brand-secondary"
            : "bg-neutral-surface border-neutral-border"
        )}
      >
        {indeterminate ? (
          <Minus size={12} className="text-neutral-surface" aria-hidden />
        ) : checked ? (
          <Check size={12} className="text-neutral-surface" aria-hidden />
        ) : null}
      </button>
      <span className="text-sm text-text-primary">{label}</span>
    </label>
  );
}
