import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      severity: {
        complete:      "bg-semantic-success-bg text-semantic-success",
        "needs-review":"bg-semantic-warning-bg text-semantic-warning",
        high:          "bg-semantic-error-bg text-semantic-error",
        moderate:      "bg-semantic-warning-bg text-semantic-warning",
        low:           "bg-semantic-success-bg text-semantic-success",
        none:          "bg-neutral-bg text-text-secondary border border-neutral-border",
      },
    },
    defaultVariants: { severity: "none" },
  }
);

const LABELS: Record<string, string> = {
  complete: "Complete",
  "needs-review": "Needs review",
  high: "High",
  moderate: "Moderate",
  low: "Low",
  none: "None",
};

export interface StatusBadgeProps
  extends VariantProps<typeof badgeVariants> {
  label?: string;
  className?: string;
}

export function StatusBadge({ severity, label, className }: StatusBadgeProps) {
  const resolvedLabel = label ?? LABELS[severity ?? "none"] ?? String(severity);
  return (
    <span
      className={cn(badgeVariants({ severity }), className)}
      role="status"
      aria-label={`Severity: ${resolvedLabel}`}
    >
      {resolvedLabel}
    </span>
  );
}
