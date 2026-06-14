"use client";

import type { ModuleResult } from "@/lib/stores/analysis";

interface RainfallOverlayProps {
  result: ModuleResult;
}

function indStr(result: ModuleResult, label: string): string {
  return result.indicators?.find((i) => i.label === label)?.value ?? "—";
}

const INTENSITY = [
  { color: "#BFDBFE", label: "Dry month" },
  { color: "#60A5FA", label: "Moderate" },
  { color: "#1D4ED8", label: "Wet" },
  { color: "#1E3A8A", label: "Peak monsoon" },
];

export function RainfallOverlay({ result }: RainfallOverlayProps) {
  const annual    = indStr(result, "Annual total");
  const rainyDays = indStr(result, "Rainy days");
  const maxDaily  = indStr(result, "Max daily");

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 400 }}>

      {/* ── Annual rainfall badge — top-left ─────────────────────────────── */}
      <div style={{
        position: "absolute", top: 14, left: 14,
        background: "rgba(253,252,251,0.97)", borderRadius: 9, padding: "9px 13px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.14)",
      }}>
        <div style={{
          fontSize: 9, color: "#7B8F83", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2,
        }}>
          Annual Rainfall
        </div>
        <div style={{
          fontSize: 26, fontWeight: 700, lineHeight: 1, color: "#5B21B6",
          fontFamily: "var(--font-geist-mono), monospace",
        }}>
          {annual}
          <span style={{ fontSize: 11, fontWeight: 400, color: "#B8C4BB" }}> mm</span>
        </div>
        <div style={{ fontSize: 9, color: "#7B8F83", marginTop: 3, fontWeight: 500 }}>
          {rainyDays} rainy days · {maxDaily} mm peak
        </div>
      </div>

      {/* ── Monthly intensity legend — bottom-right ──────────────────────── */}
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
          Monthly Rainfall
        </div>
        {INTENSITY.map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ width: 14, height: 10, borderRadius: 2, background: color, flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: 10, color: "#3A3F3B", fontWeight: 500 }}>{label}</span>
          </div>
        ))}
        <div style={{
          marginTop: 7, paddingTop: 7, borderTop: "1px solid #CFD6C4",
          fontSize: 9, color: "#7B8F83", lineHeight: 1.4,
        }}>
          Petal = monthly total · Jan top, clockwise
        </div>
      </div>

      {/* ── Data source note — bottom-left ───────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 12, left: 14,
        fontSize: 8.5, color: "#B8C4BB", fontStyle: "italic", lineHeight: 1.4,
        background: "rgba(253,252,251,0.80)", borderRadius: 4, padding: "3px 7px",
        maxWidth: 220,
      }}>
        {result.data_source ?? "CHIRPS Daily (UCSB-CHG)"}
      </div>
    </div>
  );
}
