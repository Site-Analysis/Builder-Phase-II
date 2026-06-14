"use client";

import { forwardRef } from "react";
import { ModuleChart } from "@/components/layout/ModuleChart";
import type { ModuleId, ModuleResult, Severity, SiteScore, QualitativeTone } from "@/lib/stores/analysis";
import type { Project } from "@/lib/stores/project";
import type { ExportSettings } from "@/components/layout/ExportDrawer";

// ── Palette (plain hex — html2canvas-safe, no oklch/var) ────────────────────
const C = {
  primary: "#657166",
  surface: "#FDFCFB",
  bg: "#F2EDE8",
  border: "#CFD6C4",
  text: "#3A3F3B",
  muted: "#7B8F83",
  faint: "#B8C4BB",
  cream: "#FDE8D3",
  salmon: "#F3C3B2",
  mint: "#DAEBE3",
  sky: "#99CDD8",
};

export const REPORT_MODULE_META: { id: ModuleId; name: string; color: string }[] = [
  { id: "sunpath",     name: "Sun Path",    color: "#F59E0B" },
  { id: "flood",       name: "Flood",       color: "#2563EB" },
  { id: "temperature", name: "Temperature", color: "#EF4444" },
  { id: "wind",        name: "Wind",        color: "#06B6D4" },
  { id: "rainfall",    name: "Rainfall",    color: "#7C3AED" },
];

const SEVERITY_STYLE: Record<Severity, { bg: string; fg: string; label: string }> = {
  high:     { bg: "#F5E4E4", fg: "#C46A6A", label: "High risk"     },
  moderate: { bg: "#F8EDE0", fg: "#C4865A", label: "Moderate risk" },
  low:      { bg: "#E4F0E8", fg: "#5A8F6A", label: "Low risk"      },
  none:     { bg: "#E4F0E8", fg: "#5A8F6A", label: "Optimal"       },
};

const TONE_STYLE: Record<QualitativeTone, { bg: string; fg: string }> = {
  good:    { bg: "#E4F0E8", fg: "#5A8F6A" },
  warn:    { bg: "#F8EDE0", fg: "#C4865A" },
  bad:     { bg: "#F5E4E4", fg: "#C46A6A" },
  neutral: { bg: C.mint,    fg: C.primary },
};

function paperWidth(paperSize: string): number {
  // px at ~96dpi
  if (paperSize === "A4 Landscape") return 1123;
  if (paperSize === "A3") return 1000;
  return 794; // A4 portrait
}

interface ReportDocumentProps {
  project: Project | null;
  modules: Partial<Record<ModuleId, ModuleResult>>;
  siteScore: SiteScore | null;
  includedIds: ModuleId[];
  settings: ExportSettings;
}

function SectionBand({ title, accent = C.cream }: { title: string; accent?: string }) {
  return (
    <div style={{
      background: accent, borderRadius: 6, padding: "7px 12px", marginBottom: 14,
      borderLeft: `4px solid ${C.primary}`,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.6px" }}>
        {title}
      </span>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  background: C.surface, padding: "32px 36px", boxSizing: "border-box",
  fontFamily: "var(--font-geist-sans), Arial, sans-serif",
};

export const ReportDocument = forwardRef<HTMLDivElement, ReportDocumentProps>(
  function ReportDocument({ project, modules, siteScore, includedIds, settings }, ref) {
    const width = paperWidth(settings.paperSize);
    const meta = REPORT_MODULE_META.filter((m) => includedIds.includes(m.id));
    const withResult = meta.filter((m) => {
      const r = modules[m.id];
      return r && !r.loading && !r.error;
    });

    const generated = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const coords = project?.coordinates || "—";

    // Collect all charts across included modules for the dedicated graphs section.
    const chartBlocks = withResult.flatMap((m) => {
      const r = modules[m.id]!;
      return (r.charts ?? []).map((chart, i) => ({ moduleName: m.name, color: m.color, chart, key: `${m.id}-${i}` }));
    });

    return (
      <div ref={ref} style={{ width, background: C.surface, color: C.text }}>

        {/* ── Page 1 — Cover + overall score + summary ───────────────── */}
        <div data-export-page style={{ ...pageStyle, paddingTop: 0 }}>
          {/* Brand header band */}
          <div style={{ background: C.primary, padding: "26px 32px", margin: "0 -36px 24px", color: "#fff" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>
              Site Analysis Tool
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
              {project?.name || "Untitled Project"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 3 }}>Site Analysis Report</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 32px", marginTop: 16 }}>
              {[
                ["Location", project?.location || "—"],
                ["Coordinates", coords],
                ["Generated", generated],
                ["Report Type", settings.template === "detailed" ? "Detailed" : "Overview"],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", fontWeight: 500, marginTop: 2 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Overall score strip */}
          <SectionBand title="Overall Site Score" accent={C.mint} />
          <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
            {withResult.map((m) => (
              <div key={m.id} style={{ flex: 1, background: m.color, borderRadius: 6, padding: "12px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "var(--font-geist-mono), monospace" }}>
                  {modules[m.id]?.score ?? "—"}
                </div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.85)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>{m.name}</div>
              </div>
            ))}
            <div style={{ flex: 1, background: C.primary, borderRadius: 6, padding: "12px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "var(--font-geist-mono), monospace" }}>
                {siteScore?.overall_score ?? "—"}
              </div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.85)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>Overall</div>
            </div>
          </div>
          {siteScore?.verdict_text && (
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginBottom: 24 }}>
              {siteScore.verdict_text}{siteScore.desc_text ? ` — ${siteScore.desc_text}` : ""}
            </div>
          )}

          {/* Module summary list */}
          <SectionBand title="Module Summary" />
          <div>
            {withResult.map((m) => {
              const r = modules[m.id]!;
              const sev = SEVERITY_STYLE[r.severity ?? "none"];
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.bg}` }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text, width: 96, flexShrink: 0 }}>{m.name}</span>
                  <span style={{ fontSize: 11, color: C.muted, flex: 1, lineHeight: 1.4 }}>{r.summary || "Analysis complete"}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: sev.fg, background: sev.bg, borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>{sev.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text, width: 28, textAlign: "right", fontFamily: "var(--font-geist-mono), monospace", flexShrink: 0 }}>
                    {r.score ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Per-module detail pages ────────────────────────────────── */}
        {withResult.map((m) => {
          const r = modules[m.id]!;
          const sev = SEVERITY_STYLE[r.severity ?? "none"];
          return (
            <div data-export-page key={m.id} style={pageStyle}>
              {/* Module header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: m.color, flexShrink: 0 }} />
                <span style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{m.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: sev.fg, background: sev.bg, borderRadius: 5, padding: "3px 9px" }}>{sev.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 24, fontWeight: 700, color: m.color, fontFamily: "var(--font-geist-mono), monospace" }}>
                  {r.score ?? "—"}<span style={{ fontSize: 12, color: C.faint }}>/100</span>
                </span>
              </div>

              {r.summary && (
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55, marginBottom: 20, background: C.bg, borderRadius: 6, padding: "11px 14px" }}>
                  {r.summary}
                </div>
              )}

              {/* Indicators as labelled bars */}
              {r.indicators && r.indicators.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionBand title="Key Indicators" accent={C.mint} />
                  {r.indicators.map((ind, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>{ind.label}</span>
                        <span style={{ fontSize: 11, color: C.text, fontWeight: 700, fontFamily: "var(--font-geist-mono), monospace" }}>
                          {ind.value}{ind.unit ? ` ${ind.unit}` : ""}
                        </span>
                      </div>
                      <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(0, Math.min(1, ind.barFraction)) * 100}%`, height: "100%", background: m.color, borderRadius: 3 }} />
                      </div>
                      {settings.citations && ind.citation && (
                        <div style={{ fontSize: 8.5, color: C.faint, marginTop: 2 }}>{ind.citation}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Qualitative chips */}
              {r.qualitative && r.qualitative.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionBand title="At a Glance" accent={C.salmon} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {r.qualitative.map((q, i) => {
                      const t = TONE_STYLE[q.tone ?? "neutral"];
                      return (
                        <div key={i} style={{ background: t.bg, borderRadius: 6, padding: "7px 11px", minWidth: 120 }}>
                          <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.3px" }}>{q.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: t.fg, marginTop: 2 }}>{q.value}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Detail metric tables */}
              {settings.template === "detailed" && r.detailMetrics?.map((g, gi) => (
                <div key={gi} style={{ marginBottom: 18 }}>
                  <SectionBand title={g.group} />
                  <div>
                    {g.rows.map((row, ri) => (
                      <div key={ri} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.bg}` }}>
                        <span style={{ fontSize: 11, color: C.muted }}>{row.label}</span>
                        <span style={{ fontSize: 11, color: C.text, fontWeight: 600, fontFamily: "var(--font-geist-mono), monospace" }}>
                          {row.value}{row.unit ? ` ${row.unit}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Recommendations */}
              {r.recommendations && r.recommendations.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <SectionBand title="Recommendations" accent={C.cream} />
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {r.recommendations.map((rec, i) => (
                      <li key={i} style={{ fontSize: 12, color: C.text, lineHeight: 1.5, marginBottom: 5 }}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {settings.citations && r.data_source && (
                <div style={{ fontSize: 9, color: C.faint, marginTop: 12, borderTop: `1px solid ${C.bg}`, paddingTop: 8 }}>
                  Data source: {r.data_source}
                </div>
              )}
            </div>
          );
        })}

        {/* ── Dedicated Graphs & Visualisations section ──────────────── */}
        {settings.charts && chartBlocks.length > 0 && (
          <div data-export-page style={pageStyle}>
            <SectionBand title="Graphs & Visualisations" accent={C.salmon} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 20px" }}>
              {chartBlocks.map((cb) => (
                <div key={cb.key} data-chart={`${cb.moduleName} — ${cb.chart.title}`} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: cb.color }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.4px" }}>{cb.moduleName}</span>
                  </div>
                  <ModuleChart chart={cb.chart} height={150} animate={false} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);
