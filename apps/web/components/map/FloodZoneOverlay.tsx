"use client";

import type { ModuleResult, Severity } from "@/lib/stores/analysis";

interface FloodZoneOverlayProps {
  result: ModuleResult;
}

const ZONE_META: Record<Severity, { label: string; color: string }> = {
  high:     { label: "Zone A · 100-Year Floodplain", color: "#1E3A8A" },
  moderate: { label: "Zone B · 500-Year Floodplain", color: "#1D4ED8" },
  low:      { label: "Zone C · Low Risk",            color: "#3B82F6" },
  none:     { label: "Outside All Flood Zones",      color: "#5A8F6A" },
};

const SCORE_COLOR: Record<Severity, string> = {
  high: "#1E3A8A", moderate: "#1D4ED8", low: "#3B82F6", none: "#5A8F6A",
};

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function indFrac(result: ModuleResult, label: string): number {
  return result.indicators?.find((i) => i.label === label)?.barFraction ?? 0;
}

export function FloodZoneOverlay({ result }: FloodZoneOverlayProps) {
  const severity = result.severity ?? "none";
  const score    = result.score ?? 50;
  const meta     = ZONE_META[severity] ?? ZONE_META.none;

  // Risk intensities — drives legend swatch opacities only (rings live in FloodZoneRings)
  const overallRisk     = clamp(1 - score / 100, 0, 1);
  const riverProximity  = clamp(indFrac(result, "Nearest river distance"), 0, 1);
  const waterOccurrence = clamp(indFrac(result, "Water occurrence"), 0, 1);
  const lowLyingRisk    = clamp(indFrac(result, "Low-lying area"), 0, 1);

  const a1 = clamp(overallRisk     * 0.72, 0.10, 0.60);
  const a2 = clamp(lowLyingRisk    * 0.58, 0.06, 0.48);
  const a3 = clamp(waterOccurrence * 0.48, 0.05, 0.38);
  const a4 = clamp(riverProximity  * 0.36, 0.04, 0.26);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 400 }}>

      {/* ── Flood score badge — top-left ─────────────────────────────────── */}
      <div style={{
        position: "absolute", top: 14, left: 14,
        background: "rgba(253,252,251,0.97)", borderRadius: 9, padding: "9px 13px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.14)",
      }}>
        <div style={{
          fontSize: 9, color: "#7B8F83", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2,
        }}>
          Flood Risk Score
        </div>
        <div style={{
          fontSize: 26, fontWeight: 700, lineHeight: 1,
          color: SCORE_COLOR[severity],
          fontFamily: "var(--font-geist-mono), monospace",
        }}>
          {score}
          <span style={{ fontSize: 11, fontWeight: 400, color: "#B8C4BB" }}>/100</span>
        </div>
        <div style={{ fontSize: 9, color: "#7B8F83", marginTop: 3, fontWeight: 500 }}>
          {meta.label}
        </div>
      </div>

      {/* ── Legend — bottom-right ────────────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 20, right: 14,
        background: "rgba(253,252,251,0.97)", borderRadius: 10, padding: "11px 13px",
        boxShadow: "0 4px 18px rgba(0,0,0,0.12)",
        pointerEvents: "auto", minWidth: 172,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: "#3A3F3B",
          textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8,
        }}>
          Flood Risk Intensity
        </div>
        {([
          { bg: `rgba(30,58,138,${clamp(a1, 0.40, 0.70)})`,   label: "High — immediate zone"    },
          { bg: `rgba(37,99,235,${clamp(a2, 0.35, 0.60)})`,   label: "Elevated — low-lying area" },
          { bg: `rgba(59,130,246,${clamp(a3, 0.30, 0.50)})`,  label: "Moderate — water exposure" },
          { bg: `rgba(147,197,253,${clamp(a4, 0.40, 0.60)})`, label: "Low — river proximity"     },
        ] as { bg: string; label: string }[]).map(({ bg, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{
              width: 14, height: 10, borderRadius: 2,
              background: bg, flexShrink: 0, display: "inline-block",
            }} />
            <span style={{ fontSize: 10, color: "#3A3F3B", fontWeight: 500 }}>{label}</span>
          </div>
        ))}
        <div style={{
          marginTop: 7, paddingTop: 7, borderTop: "1px solid #CFD6C4",
          display: "flex", alignItems: "center", gap: 7,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
            border: "1.5px dashed #DC2626", background: "rgba(220,38,38,0.08)",
            display: "inline-block",
          }} />
          <span style={{ fontSize: 10, color: "#7B8F83", fontWeight: 500 }}>Site boundary</span>
        </div>
      </div>

      {/* ── Placeholder notice ───────────────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 12, left: 14,
        fontSize: 8.5, color: "#B8C4BB", fontStyle: "italic", lineHeight: 1.4,
        background: "rgba(253,252,251,0.80)", borderRadius: 4, padding: "3px 7px",
        maxWidth: 210,
      }}>
        Intensity from GEE risk factors — real flood polygons pending GH#53
      </div>
    </div>
  );
}
