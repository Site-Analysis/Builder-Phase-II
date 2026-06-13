"use client";

import { cn } from "@/lib/utils";

export type InputState = "default" | "focus" | "error" | "disabled";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "md" | "lg";
  state?: InputState;
  label?: string;
  errorMessage?: string;
  leadingIcon?: React.ReactNode;
}

export function Input({
  size = "md",
  state = "default",
  label,
  errorMessage,
  leadingIcon,
  className,
  id,
  disabled,
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  const isError = state === "error" || !!errorMessage;
  const isDisabled = disabled || state === "disabled";

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-text-primary"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leadingIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-secondary">
            {leadingIcon}
          </span>
        )}
        <input
          id={inputId}
          disabled={isDisabled}
          aria-invalid={isError}
          aria-describedby={isError && errorMessage ? `${inputId}-error` : undefined}
          className={cn(
            "w-full rounded border bg-neutral-surface text-text-primary placeholder:text-text-disabled transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-brand-secondary focus:border-brand-secondary",
            size === "md" && "h-10 px-3 text-sm",
            size === "lg" && "h-12 px-4 text-base",
            leadingIcon && "pl-10",
            isError
              ? "border-semantic-error focus:ring-semantic-error"
              : "border-neutral-border",
            isDisabled && "bg-neutral-bg text-text-disabled cursor-not-allowed",
            className
          )}
          {...props}
        />
      </div>
      {isError && errorMessage && (
        <p
          id={`${inputId}-error`}
          className="text-xs text-semantic-error"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
