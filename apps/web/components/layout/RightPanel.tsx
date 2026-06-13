import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/stores/analysis";

// Fixed module order and colours — matches analysis store ModuleId order
const MODULE_PROGRESS_COLORS = [
  "#F59E0B", // sunpath
  "#2563EB", // flood
  "#EF4444", // temperature
  "#06B6D4", // wind
  "#7C3AED", // rainfall
];

export interface ActiveModuleInfo {
  name: string;
  label: string;
  color: string;
  score: number;
  verdict: string;
  desc?: string;
}

export interface RightPanelProps {
  state: "loading" | "populated";
  overallScore?: number;
  overallSeverity?: Severity;
  verdictText?: string;
  descText?: string;
  moduleProgress?: { complete: number; total: number };
  activeModule?: ActiveModuleInfo;
  children?: React.ReactNode;
  className?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded bg-neutral-border animate-pulse", className)} />;
}

function ScoreDonut({ score }: { score: number }) {
  const deg = Math.round(Math.min(Math.max(score, 0), 100) / 100 * 360);
  return (
    <div
      style={{
        width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
        background: `conic-gradient(#2E7D6F ${deg}deg, #E2E8F0 0deg)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: "50%", background: "#F8F9FA",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 8, color: "#64748B", fontWeight: 500, textTransform: "uppercase", marginTop: 1 }}>SITE</span>
      </div>
    </div>
  );
}

function ModuleScoreRing({ score, color, label }: { score: number; color: string; label: string }) {
  const r = 27;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.min(Math.max(score, 0), 100) / 100) * circumference;
  const gap = circumference - filled;
  return (
    <div style={{ width: 68, height: 68, position: "relative", flexShrink: 0 }}>
      <svg viewBox="0 0 68 68" width={68} height={68} style={{ transform: "rotate(-90deg)" }}>
        <circle cx="34" cy="34" r={r} fill="none" stroke="#E2E8F0" strokeWidth="5" />
        <circle
          cx="34" cy="34" r={r} fill="none"
          stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${filled.toFixed(1)} ${gap.toFixed(1)}`}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 7, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.3px", marginTop: 1 }}>
          {label}
        </span>
      </div>
    </div>
  );
}

export function RightPanel({
  state,
  overallScore = 0,
  verdictText,
  descText,
  moduleProgress,
  activeModule,
  children,
  className,
}: RightPanelProps) {
  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-neutral-surface border-l border-neutral-border overflow-hidden",
        "w-[360px] shrink-0",
        className
      )}
      role="complementary"
      aria-label="Site analysis results"
    >
      {state === "loading" && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3 p-4 rounded-[10px] border border-neutral-border bg-neutral-bg">
            <Skeleton className="h-16 w-16 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
              <Skeleton className="h-[3px] w-full mt-2" />
            </div>
          </div>
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-[10px]" />
          ))}
        </div>
      )}

      {state === "populated" && (
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
        >
          {/* ── Score card — module-tinted when a module is expanded ── */}
          {activeModule ? (() => {
            const [r, g, b] = hexToRgb(activeModule.color);
            return (
              <div style={{
                background: `linear-gradient(135deg, rgba(${r},${g},${b},0.08) 0%, rgba(${r},${g},${b},0.04) 100%)`,
                border: `1px solid rgba(${r},${g},${b},0.2)`,
                borderRadius: 10, padding: 16,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <ModuleScoreRing score={activeModule.score} color={activeModule.color} label={activeModule.label} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                      {activeModule.verdict}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                      {moduleProgress
                        ? `${moduleProgress.complete} of ${moduleProgress.total} modules · Site score ${overallScore}`
                        : `Site score ${overallScore}`}
                    </div>
                    <div style={{ display: "flex", gap: 3, marginTop: 8 }}>
                      {MODULE_PROGRESS_COLORS.map((c) => (
                        <div key={c} style={{ height: 3, flex: 1, borderRadius: 2, background: c }} />
                      ))}
                    </div>
                  </div>
                </div>
                {activeModule.desc && (
                  <div style={{
                    marginTop: 10, paddingTop: 10,
                    borderTop: `1px solid rgba(${r},${g},${b},0.15)`,
                    fontSize: 11, color: "#64748B", lineHeight: 1.55,
                  }}>
                    {activeModule.desc}
                  </div>
                )}
              </div>
            );
          })() : (
            <div style={{ background: "#F8F9FA", border: "1px solid #E2E8F0", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <ScoreDonut score={overallScore} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                    {verdictText ?? "Analysing site…"}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                    {moduleProgress
                      ? `${moduleProgress.complete} / ${moduleProgress.total} modules complete`
                      : "Loading…"}
                  </div>
                  <div style={{ display: "flex", gap: 3, marginTop: 8 }}>
                    {MODULE_PROGRESS_COLORS.map((c) => (
                      <div key={c} style={{ height: 3, flex: 1, borderRadius: 2, background: c }} />
                    ))}
                  </div>
                </div>
              </div>
              {descText && (
                <div style={{
                  marginTop: 10, paddingTop: 10, borderTop: "1px solid #E2E8F0",
                  fontSize: 11, color: "#64748B", lineHeight: 1.55,
                }}>
                  {descText}
                </div>
              )}
            </div>
          )}

          {/* ── Module sections ─────────────────────────────────────── */}
          {children}

          <p style={{ fontSize: 10, color: "#9CA3AF", fontStyle: "italic", padding: "2px 0" }}>
            Click any module header to expand or collapse
          </p>
        </div>
      )}
    </aside>
  );
}
