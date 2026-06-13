import { cn } from "@/lib/utils";

type Severity = "high" | "moderate" | "low" | "none";
type Size = "sm" | "md" | "lg";

const STROKE_COLOR: Record<Severity, string> = {
  high:     "var(--color-semantic-error)",
  moderate: "var(--color-semantic-warning)",
  low:      "var(--color-semantic-success)",
  none:     "var(--color-neutral-border)",
};

const SIZE_CONFIG = {
  sm: { px: 32,  strokeW: 3,  textSize: "text-[10px]" },
  md: { px: 48,  strokeW: 4,  textSize: "text-xs"     },
  lg: { px: 96,  strokeW: 6,  textSize: "text-xl"     },
};

export interface ScoreCircleProps {
  score: number;
  size?: Size;
  severity?: Severity;
  className?: string;
}

export function ScoreCircle({
  score,
  size = "md",
  severity = "none",
  className,
}: ScoreCircleProps) {
  const { px, strokeW, textSize } = SIZE_CONFIG[size];
  const r = (px - strokeW * 2) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.min(Math.max(score, 0), 100);
  const dashOffset = circumference * (1 - progress / 100);
  const cx = px / 2;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: px, height: px }}
      role="img"
      aria-label={`Score: ${score} out of 100, severity: ${severity}`}
    >
      <svg width={px} height={px} className="-rotate-90" aria-hidden>
        {/* Track */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="var(--color-neutral-border)"
          strokeWidth={strokeW}
        />
        {/* Progress */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={STROKE_COLOR[severity]}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span
        className={cn(
          "absolute font-semibold tabular-nums text-text-primary",
          textSize
        )}
      >
        {score}
      </span>
    </div>
  );
}
