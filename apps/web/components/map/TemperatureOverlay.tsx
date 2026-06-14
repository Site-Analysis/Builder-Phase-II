"use client";

import type { ModuleResult } from "@/lib/stores/analysis";

interface TemperatureOverlayProps {
  result: ModuleResult;
}

function indStr(result: ModuleResult, label: string): string {
  return result.indicators?.find((i) => i.label === label)?.value ?? "—";
}
function qualStr(result: ModuleResult, label: string): string {
  return result.qualitative?.find((q) => q.label === label)?.value ?? "—";
}

const SCALE = [
  { color: "#2563EB", label: "Cool · < 18 °C" },
  { color: "#60A5FA", label: "Mild · 18–22 °C" },
  { color: "#FCD34D", label: "Warm · 22–30 °C" },
  { color: "#DC2626", label: "Hot · > 30 °C" },
];

export function TemperatureOverlay({ result }: TemperatureOverlayProps) {
  const peak    = indStr(result, "Peak temperature");
  const mean    = indStr(result, "Annual mean");
  const winter  = indStr(result, "Winter minimum");
  const comfort = qualStr(result, "Comfort status");

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 400 }}>

      {/* ── Peak temperature badge — top-left ────────────────────────────── */}
      <div style={{
        position: "absolute", top: 14, left: 14,
        background: "rgba(253,252,251,0.97)", borderRadius: 9, padding: "9px 13px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.14)",
      }}>
        <div style={{
          fontSize: 9, color: "#7B8F83", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2,
        }}>
          Peak Temperature
        </div>
        <div style={{
          fontSize: 26, fontWeight: 700, lineHeight: 1, color: "#B91C1C",
          fontFamily: "var(--font-geist-mono), monospace",
        }}>
          {peak}
          <span style={{ fontSize: 11, fontWeight: 400, color: "#B8C4BB" }}> °C</span>
        </div>
        <div style={{ fontSize: 9, color: "#7B8F83", marginTop: 3, fontWeight: 500 }}>
          {mean} °C mean · {winter} °C winter min
        </div>
        {comfort !== "—" && (
          <div style={{ fontSize: 9, color: "#EF4444", marginTop: 2, fontWeight: 600 }}>
            {comfort}
          </div>
        )}
      </div>

      {/* ── Temperature scale — bottom-right ─────────────────────────────── */}
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
          Annual Mean Temp
        </div>
        {SCALE.map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ width: 14, height: 10, borderRadius: 2, background: color, flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: 10, color: "#3A3F3B", fontWeight: 500 }}>{label}</span>
          </div>
        ))}
        <div style={{
          marginTop: 7, paddingTop: 7, borderTop: "1px solid #CFD6C4",
          fontSize: 9, color: "#7B8F83", lineHeight: 1.4,
        }}>
          Each cell = annual mean temperature
        </div>
      </div>

      {/* ── Data source note — bottom-left ───────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 12, left: 14,
        fontSize: 8.5, color: "#B8C4BB", fontStyle: "italic", lineHeight: 1.4,
        background: "rgba(253,252,251,0.80)", borderRadius: 4, padding: "3px 7px",
        maxWidth: 220,
      }}>
        Thermal grid · ERA5 / IMD reanalysis (≈25 km native) — near-uniform at site scale
      </div>
    </div>
  );
}
