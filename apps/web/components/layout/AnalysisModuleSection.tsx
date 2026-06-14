"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModuleChart } from "@/components/layout/ModuleChart";
import { QualitativeChips } from "@/components/layout/QualitativeChips";
import type {
  Severity, Indicator, ChartDataPoint, ModuleChart as ModuleChartSpec, QualitativeStat,
} from "@/lib/stores/analysis";

const BADGE: Record<Severity, { bg: string; color: string; label: string }> = {
  high:     { bg: "#F5E4E4", color: "#C46A6A", label: "High Risk"  },
  moderate: { bg: "#F8EDE0", color: "#C4865A", label: "Moderate"   },
  low:      { bg: "#E4F0E8", color: "#5A8F6A", label: "Low Risk"   },
  none:     { bg: "#DAEBE3", color: "#2563EB", label: "Optimal"    },
};

export interface AnalysisModuleSectionProps {
  moduleName: string;
  moduleColor: string;
  severity: Severity;
  score: number;
  loading?: boolean;
  error?: string | null;
  indicators?: Indicator[];
  chartData?: ChartDataPoint[];
  charts?: ModuleChartSpec[];
  qualitative?: QualitativeStat[];
  dataSource?: string;
  summary?: string;
  moduleSpecificContent?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  onDetailClick?: () => void;
  className?: string;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const { bg, color, label } = BADGE[severity];
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
      letterSpacing: "0.2px", background: bg, color,
    }}>
      {label}
    </span>
  );
}

export function AnalysisModuleSection({
  moduleName,
  moduleColor,
  severity,
  score,
  loading = false,
  error = null,
  indicators = [],
  charts = [],
  qualitative = [],
  dataSource,
  summary,
  moduleSpecificContent,
  expanded,
  onToggle,
  onDetailClick,
  className,
}: AnalysisModuleSectionProps) {
  const dotColor = error ? "#CFD6C4" : loading ? "#CFD6C4" : moduleColor;

  return (
    <div
      className={cn("border border-neutral-border rounded-[10px] overflow-hidden", className)}
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`module-body-${moduleName}`}
        className={cn(
          "w-full flex items-center gap-[10px] px-[14px] py-3 text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-secondary",
          expanded ? "bg-neutral-surface" : "bg-neutral-bg hover:bg-neutral-surface"
        )}
      >
        {/* Coloured dot */}
        <span
          style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "inline-block" }}
          aria-hidden
        />

        {/* Module name */}
        <span className="text-[13px] font-semibold text-text-primary flex-1">{moduleName}</span>

        {/* Badge */}
        {loading ? (
          <div className="h-[18px] w-16 rounded-full bg-neutral-border animate-pulse" />
        ) : error ? (
          <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: "#F5E4E4", color: "#C46A6A" }}>
            Retry
          </span>
        ) : (
          <SeverityBadge severity={severity} />
        )}

        {/* Score */}
        {loading ? (
          <div className="h-3 w-6 rounded bg-neutral-border animate-pulse" />
        ) : error ? (
          <span className="text-[13px] font-bold text-text-disabled w-6 text-right">—</span>
        ) : (
          <span className="text-[13px] font-bold text-text-primary w-6 text-right tabular-nums">{score}</span>
        )}

        {/* Chevron / retry icon */}
        {error ? (
          <span className="text-[13px] text-text-secondary ml-1" aria-hidden>↺</span>
        ) : (
          <ChevronDown
            size={12}
            className={cn(
              "text-text-secondary shrink-0 transition-transform duration-200 ml-1",
              expanded && "rotate-180"
            )}
            aria-hidden
          />
        )}
      </button>

      {/* ── Expandable body ──────────────────────────────────────── */}
      <div
        id={`module-body-${moduleName}`}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          expanded && !error && !loading ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div style={{ padding: "0 14px 14px", borderTop: "1px solid #CFD6C4", background: "#FDFCFB" }}>

            {/* Data source */}
            {dataSource && (
              <div style={{ fontSize: 10, color: "#7B8F83", marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: moduleColor, flexShrink: 0, display: "inline-block" }} />
                {dataSource}
              </div>
            )}

            {/* Module-specific content (e.g. solar arc diagram for sunpath) */}
            {moduleSpecificContent && (
              <div style={{ marginTop: 12 }}>{moduleSpecificContent}</div>
            )}

            {/* Summary */}
            {summary && (
              <div style={{ fontSize: 11, color: "#7B8F83", lineHeight: 1.55, marginTop: 8 }}>
                {summary}
              </div>
            )}

            {/* Qualitative chips */}
            {qualitative.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <QualitativeChips stats={qualitative} />
              </div>
            )}

            {/* Charts */}
            {charts.map((c) => (
              <div key={c.title} style={{ marginTop: 14 }}>
                <ModuleChart chart={c} />
              </div>
            ))}

            {/* Indicators */}
            {indicators.length > 0 && (
              <>
                <div style={{
                  fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.5px", color: "#7B8F83", marginTop: 14, marginBottom: 8,
                }}>
                  Indicators — {indicators.length}
                </div>
                {indicators.map((ind) => (
                  <div key={ind.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "#7B8F83", width: 140, flexShrink: 0 }}>
                      {ind.label}
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: "#3A3F3B",
                      width: 48, textAlign: "right", flexShrink: 0,
                      fontFamily: "var(--font-geist-mono), monospace",
                    }}>
                      {ind.value}
                    </span>
                    <div style={{ flex: 1, height: 4, background: "#CFD6C4", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: 4, borderRadius: 2, background: moduleColor,
                        width: `${Math.min(ind.barFraction * 100, 100)}%`,
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: "#7B8F83", width: 28, flexShrink: 0 }}>
                      {ind.unit}
                    </span>
                  </div>
                ))}
              </>
            )}

            {onDetailClick && (
              <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={onDetailClick}
                  style={{
                    fontSize: 11, color: "#5A8F6A", cursor: "pointer",
                    background: "none", border: "none", fontFamily: "inherit",
                    fontWeight: 600, padding: 0,
                  }}
                >
                  Full detail →
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
