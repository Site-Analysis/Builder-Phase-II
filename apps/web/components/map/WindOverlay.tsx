"use client";

import type { ModuleResult } from "@/lib/stores/analysis";

interface WindOverlayProps {
  result: ModuleResult;
}

function indStr(result: ModuleResult, label: string): string {
  return result.indicators?.find((i) => i.label === label)?.value ?? "—";
}
function metStr(result: ModuleResult, group: string, label: string): string {
  return (
    result.detailMetrics?.find((g) => g.group === group)?.rows.find((r) => r.label === label)?.value ?? "—"
  );
}
function qualStr(result: ModuleResult, label: string): string {
  return result.qualitative?.find((q) => q.label === label)?.value ?? "—";
}

// Speed-bin legend — matches WindRose colour ramp
const SPEED_BINS = [
  { color: "#93C5FD", label: "Calm · < 4 m/s" },
  { color: "#2563EB", label: "Light · 4–8 m/s" },
  { color: "#F59E0B", label: "Fresh · 8–12 m/s" },
  { color: "#EF4444", label: "Strong · > 12 m/s" },
];

export function WindOverlay({ result }: WindOverlayProps) {
  const prevailing = metStr(result, "Wind profile", "Prevailing direction");
  const meanSpeed  = indStr(result, "Mean wind speed");
  const gust       = indStr(result, "Peak gust");
  const category   = qualStr(result, "Wind category");

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 400 }}>

      {/* ── Wind summary badge — top-left ────────────────────────────────── */}
      <div style={{
        position: "absolute", top: 14, left: 14,
        background: "rgba(253,252,251,0.97)", borderRadius: 9, padding: "9px 13px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.14)",
      }}>
        <div style={{
          fontSize: 9, color: "#7B8F83", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2,
        }}>
          Prevailing Wind
        </div>
        <div style={{
          fontSize: 26, fontWeight: 700, lineHeight: 1, color: "#0E7490",
          fontFamily: "var(--font-geist-mono), monospace",
        }}>
          {prevailing}
        </div>
        <div style={{ fontSize: 9, color: "#7B8F83", marginTop: 3, fontWeight: 500 }}>
          {meanSpeed} m/s mean · {gust} m/s gust
        </div>
        {category !== "—" && (
          <div style={{ fontSize: 9, color: "#06B6D4", marginTop: 2, fontWeight: 600 }}>
            {category}
          </div>
        )}
      </div>

      {/* ── Speed legend — bottom-right ──────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 20, right: 14,
        background: "rgba(253,252,251,0.97)", borderRadius: 10, padding: "11px 13px",
        boxShadow: "0 4px 18px rgba(0,0,0,0.12)",
        pointerEvents: "auto", minWidth: 158,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: "#3A3F3B",
          textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8,
        }}>
          Wind Speed
        </div>
        {SPEED_BINS.map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{
              width: 14, height: 10, borderRadius: 2,
              background: color, flexShrink: 0, display: "inline-block",
            }} />
            <span style={{ fontSize: 10, color: "#3A3F3B", fontWeight: 500 }}>{label}</span>
          </div>
        ))}
        <div style={{
          marginTop: 7, paddingTop: 7, borderTop: "1px solid #CFD6C4",
          fontSize: 9, color: "#7B8F83", lineHeight: 1.4,
        }}>
          Petal length = frequency · colour = speed
        </div>
      </div>

      {/* ── Placeholder notice — bottom-left ─────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 12, left: 14,
        fontSize: 8.5, color: "#B8C4BB", fontStyle: "italic", lineHeight: 1.4,
        background: "rgba(253,252,251,0.80)", borderRadius: 4, padding: "3px 7px",
        maxWidth: 220,
      }}>
        Rose modelled from prevailing direction — per-sector frequencies pending GH#53
      </div>
    </div>
  );
}
