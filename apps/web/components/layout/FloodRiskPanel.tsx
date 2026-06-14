"use client";

import type { ModuleResult, Severity } from "@/lib/stores/analysis";

interface FloodRiskPanelProps {
  result?: ModuleResult;
  severity: Severity;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function indVal(result: ModuleResult | undefined, label: string, unit = ""): string {
  const ind = result?.indicators?.find((i) => i.label === label);
  if (!ind) return "—";
  return `${ind.value}${unit && ind.value !== "—" ? " " + unit : ""}`;
}

function metVal(result: ModuleResult | undefined, group: string, label: string): string {
  const row = result?.detailMetrics
    ?.find((g) => g.group === group)
    ?.rows.find((r) => r.label === label);
  if (!row) return "—";
  return row.unit ? `${row.value} ${row.unit}` : row.value;
}

// ── Zone config ────────────────────────────────────────────────────────────────

const ZONE_CFG: Record<Severity, {
  label: string; sub: string; textFg: string; chipBg: string; chipBorder: string;
}> = {
  high: {
    label: "Zone A · 100-Year Floodplain",
    sub: "Site lies within the 100-year flood extent",
    textFg: "#1E3A8A", chipBg: "rgba(30,58,138,0.08)", chipBorder: "rgba(30,58,138,0.22)",
  },
  moderate: {
    label: "Zone B · 500-Year Floodplain",
    sub: "Site lies within the 500-year flood extent",
    textFg: "#1D4ED8", chipBg: "rgba(29,78,216,0.07)", chipBorder: "rgba(29,78,216,0.20)",
  },
  low: {
    label: "Zone C · Low Risk",
    sub: "Site is outside major flood zones",
    textFg: "#5A8F6A", chipBg: "rgba(90,143,106,0.08)", chipBorder: "rgba(90,143,106,0.22)",
  },
  none: {
    label: "Outside All Flood Zones",
    sub: "No significant flood exposure detected",
    textFg: "#5A8F6A", chipBg: "rgba(90,143,106,0.08)", chipBorder: "rgba(90,143,106,0.22)",
  },
};

// ── Return-period table ────────────────────────────────────────────────────────

const RETURN_PERIODS: {
  label: string; years: number; prob: string; barFill: number;
  exposedWhen: Severity[];
}[] = [
  { label: "25-year",  years: 25,  prob: "4.0%", barFill: 1.00, exposedWhen: ["high"] },
  { label: "50-year",  years: 50,  prob: "2.0%", barFill: 0.50, exposedWhen: ["high"] },
  { label: "100-year", years: 100, prob: "1.0%", barFill: 0.25, exposedWhen: ["high"] },
  { label: "500-year", years: 500, prob: "0.2%", barFill: 0.05, exposedWhen: ["high", "moderate"] },
];

const MONSOON_MONTHS = [false, false, false, false, false, true, true, true, true, false, false, false];
const MONTH_LABELS   = ["J","F","M","A","M","J","J","A","S","O","N","D"];

// ── Component ──────────────────────────────────────────────────────────────────

export function FloodRiskPanel({ result, severity }: FloodRiskPanelProps) {
  const zone = ZONE_CFG[severity] ?? ZONE_CFG.none;

  // Key metrics from the analysis result
  const elevation    = metVal(result, "Terrain",   "Mean elevation");
  const riverDist    = indVal(result, "Nearest river distance", "m");
  const lowLying     = indVal(result, "Low-lying area", "%");
  const drainDensity = metVal(result, "Hydrology", "Drainage density");
  const histEvents   = metVal(result, "History",   "Historical events");
  const annualRain   = metVal(result, "History",   "Annual rainfall");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 2 }}>

      {/* ── Zone classification banner ─────────────────────────── */}
      <div style={{
        background: zone.chipBg, border: `1.5px solid ${zone.chipBorder}`,
        borderRadius: 9, padding: "10px 12px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: zone.chipBg, border: `2px solid ${zone.chipBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"
              fill={zone.textFg} />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: zone.textFg, lineHeight: 1.3 }}>
            {zone.label}
          </div>
          <div style={{ fontSize: 10, color: "#7B8F83", marginTop: 2, lineHeight: 1.4 }}>
            {zone.sub}
          </div>
        </div>
      </div>

      {/* ── Metrics grid — 2×3 ────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {[
          { label: "Elevation ASL",      value: elevation,    icon: "▲" },
          { label: "River distance",      value: riverDist,    icon: "≈" },
          { label: "Low-lying area",      value: lowLying,     icon: "%" },
          { label: "Drainage density",    value: drainDensity, icon: "~" },
          { label: "Historical events",   value: histEvents,   icon: "⏱" },
          { label: "Annual rainfall",     value: annualRain,   icon: "↓" },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{
            background: "#F2EDE8", borderRadius: 7, padding: "8px 10px",
          }}>
            <div style={{
              fontSize: 11, fontFamily: "var(--font-geist-mono), monospace",
              fontWeight: 700, color: "#3A3F3B", lineHeight: 1,
              display: "flex", alignItems: "baseline", gap: 4,
            }}>
              <span style={{ fontSize: 9, color: "#7B8F83" }}>{icon}</span>
              <span>{value}</span>
            </div>
            <div style={{
              fontSize: 9, color: "#7B8F83", marginTop: 4,
              fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.3px",
            }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Return period exposure ────────────────────────────── */}
      <div style={{
        background: "#F2EDE8", borderRadius: 9, padding: "10px 12px",
      }}>
        <div style={{
          fontSize: 9, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.5px", color: "#7B8F83", marginBottom: 9,
        }}>
          Return Period Exposure
        </div>

        {RETURN_PERIODS.map(({ label, prob, barFill, exposedWhen }) => {
          const exposed = exposedWhen.includes(severity);
          return (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 7,
            }}>
              {/* Period label */}
              <div style={{
                width: 50, fontSize: 10, fontWeight: 600,
                color: exposed ? "#1E3A8A" : "#B8C4BB",
                fontFamily: "var(--font-geist-mono), monospace", flexShrink: 0,
              }}>
                {label}
              </div>

              {/* Track + fill bar */}
              <div style={{
                flex: 1, height: 6, background: "#CFD6C4", borderRadius: 3, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", borderRadius: 3,
                  width: `${barFill * 100}%`,
                  background: exposed
                    ? (severity === "high" ? "#1E3A8A" : "#3B82F6")
                    : "#CFD6C4",
                  transition: "width 0.5s ease",
                }} />
              </div>

              {/* Probability */}
              <div style={{
                width: 34, fontSize: 10, textAlign: "right",
                color: exposed ? "#1E3A8A" : "#B8C4BB",
                fontFamily: "var(--font-geist-mono), monospace", flexShrink: 0,
              }}>
                {prob}
              </div>

              {/* Exposure chip */}
              <div style={{
                width: 42, fontSize: 8, fontWeight: 700, textAlign: "center",
                borderRadius: 4, padding: "2px 4px",
                background: exposed ? "rgba(30,58,138,0.12)" : "transparent",
                color: exposed ? "#1E3A8A" : "#B8C4BB",
                flexShrink: 0,
              }}>
                {exposed ? "IN ZONE" : "SAFE"}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Seasonal monsoon risk ─────────────────────────────── */}
      <div style={{
        background: "#F2EDE8", borderRadius: 9, padding: "10px 12px",
      }}>
        <div style={{
          fontSize: 9, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.5px", color: "#7B8F83", marginBottom: 8,
        }}>
          Seasonal Risk — Monsoon (Jun–Sep)
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {MONTH_LABELS.map((m, i) => {
            const monsoon = MONSOON_MONTHS[i];
            return (
              <div key={m + i} style={{ flex: 1, textAlign: "center" }}>
                <div style={{
                  height: 22, borderRadius: 3, marginBottom: 3,
                  background: monsoon
                    ? (severity === "high" ? "rgba(30,58,138,0.75)" : severity === "moderate" ? "rgba(59,130,246,0.65)" : "rgba(59,130,246,0.40)")
                    : "#CFD6C4",
                }} />
                <div style={{
                  fontSize: 7.5, fontWeight: monsoon ? 700 : 400,
                  color: monsoon ? "#3A3F3B" : "#B8C4BB",
                }}>
                  {m}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 9, color: "#7B8F83", marginTop: 6, lineHeight: 1.4 }}>
          Peak flood risk coincides with SW monsoon. Site should maintain emergency drainage clearance Jul–Sep.
        </div>
      </div>

      {/* ── NBC 2016 compliance strip ─────────────────────────── */}
      <div style={{
        background: severity === "none" || severity === "low"
          ? "rgba(90,143,106,0.08)"
          : "rgba(196,133,90,0.10)",
        border: `1px solid ${severity === "none" || severity === "low" ? "rgba(90,143,106,0.25)" : "rgba(196,133,90,0.30)"}`,
        borderRadius: 8, padding: "9px 11px",
        display: "flex", alignItems: "flex-start", gap: 8,
      }}>
        <span style={{
          fontSize: 13, marginTop: 1, flexShrink: 0,
          color: severity === "none" || severity === "low" ? "#5A8F6A" : "#C4865A",
        }}>
          {severity === "none" || severity === "low" ? "✓" : "⚠"}
        </span>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700,
            color: severity === "none" || severity === "low" ? "#5A8F6A" : "#C4865A",
            marginBottom: 2,
          }}>
            NBC 2016 · Part 4 §4.2.3
          </div>
          <div style={{ fontSize: 10, color: "#7B8F83", lineHeight: 1.5 }}>
            {severity === "high"
              ? "Zone A mandates plinth ≥ 300 mm above design flood level. Structural design for hydrostatic pressure required."
              : severity === "moderate"
              ? "Zone B sites: drainage design per §8.3.1. Plinth elevation review recommended."
              : "Site is outside NBC flood-risk zones. Standard plinth and drainage provisions apply."}
          </div>
        </div>
      </div>
    </div>
  );
}
