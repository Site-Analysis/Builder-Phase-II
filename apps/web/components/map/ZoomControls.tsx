"use client";

import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  className?: string;
}

export function ZoomControls({
  onZoomIn,
  onZoomOut,
  className,
}: ZoomControlsProps) {
  return (
    <div
      className={cn(
        "absolute top-4 left-4 z-[400] flex flex-col",
        "rounded border border-neutral-border bg-neutral-surface shadow-sm overflow-hidden",
        className
      )}
    >
      <button
        onClick={onZoomIn}
        aria-label="Zoom in"
        className="flex h-9 w-9 items-center justify-center text-text-primary hover:bg-neutral-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary"
      >
        <Plus size={16} aria-hidden />
      </button>
      <div className="h-px bg-neutral-border" />
      <button
        onClick={onZoomOut}
        aria-label="Zoom out"
        className="flex h-9 w-9 items-center justify-center text-text-primary hover:bg-neutral-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary"
      >
        <Minus size={16} aria-hidden />
      </button>
    </div>
  );
}
