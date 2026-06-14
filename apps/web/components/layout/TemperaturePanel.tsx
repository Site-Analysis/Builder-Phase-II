"use client";

import type { ModuleResult, Severity } from "@/lib/stores/analysis";

interface TemperaturePanelProps {
  result?: ModuleResult;
  severity: Severity;
}

// Temperature (°C) → cold-to-hot ramp (kept local so this panel never imports
// the react-leaflet module, which touches `window` at import time and breaks SSR).
function tempColor(c: number): string {
  if (c < 12) return "#1E3A8A";
  if (c < 18) return "#2563EB";
  if (c < 22) return "#60A5FA";
  if (c < 26) return "#FCD34D";
  if (c < 30) return "#FB923C";
  if (c < 35) return "#F97316";
  return "#DC2626";
}

function indStr(result: ModuleResult | undefined, label: string, unit = ""): string {
  const ind = result?.indicators?.find((i) => i.label === label);
  if (!ind) return "—";
  return `${ind.value}${unit ? " " + unit : ""}`;
}
function indNum(result: ModuleResult | undefined, label: string): number {
  const v = result?.indicators?.find((i) => i.label === label)?.value;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
function qualStr(result: ModuleResult | undefined, label: string): string {
  return result?.qualitative?.find((q) => q.label === label)?.value ?? "—";
}
function metStr(result: ModuleResult | undefined, group: string, label: string): string {
  return result?.detailMetrics?.find((g) => g.group === group)?.rows.find((r) => r.label === label)?.value ?? "—";
}

interface MonthTemp { label: string; max: number; min: number }
function monthlyTemps(result: ModuleResult | undefined): MonthTemp[] {
  const pts = result?.charts?.find((c) => c.title === "Monthly temperature range")?.points;
  return pts?.map((p) => ({
    label: String(p.label),
    max: Number(p.max) || 0,
    min: Number(p.min) || 0,
  })) ?? [];
}

export function TemperaturePanel({ result, severity }: TemperaturePanelProps) {
  const peak    = indStr(result, "Peak temperature", "°C");
  const mean    = indStr(result, "Annual mean", "°C");
  const winter  = indStr(result, "Winter minimum", "°C");
  const comfort = qualStr(result, "Comfort status");
  const zone    = qualStr(result, "Climate zone");

  const months   = monthlyTemps(result);
  const diurnal  = months.length
    ? (months.reduce((a, m) => a + (m.max - m.min), 0) / months.length).toFixed(1) + " °C"
    : "—";

  const hot = severity === "high" || severity === "moderate";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 2 }}>

      {/* ── Thermal banner ─────────────────────────────────────── */}
      <div style={{
        background: "rgba(239,68,68,0.07)", border: "1.5px solid rgba(239,68,68,0.22)",
        borderRadius: 9, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: "rgba(239,68,68,0.08)", border: "2px solid rgba(239,68,68,0.22)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z" fill="#EF4444" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C", lineHeight: 1.3 }}>
            Peak {peak}
          </div>
          <div style={{ fontSize: 10, color: "#7B8F83", marginTop: 2, lineHeight: 1.4 }}>
            {comfort !== "—" ? comfort : `${mean} mean`}
          </div>
        </div>
      </div>

      {/* ── Metrics grid 2×3 ───────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {[
          { label: "Peak temp",     value: peak,    icon: "▲" },
          { label: "Annual mean",   value: mean,    icon: "x̄" },
          { label: "Winter min",    value: winter,  icon: "▼" },
          { label: "Diurnal range", value: diurnal, icon: "↕" },
          { label: "Comfort",       value: comfort, icon: "☼" },
          { label: "Climate zone",  value: zone,    icon: "◑" },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{ background: "#F2EDE8", borderRadius: 7, padding: "8px 10px" }}>
            <div style={{
              fontSize: 11, fontFamily: "var(--font-geist-mono), monospace",
              fontWeight: 700, color: "#3A3F3B", lineHeight: 1.2,
              display: "flex", alignItems: "baseline", gap: 4,
            }}>
              <span style={{ fontSize: 9, color: "#7B8F83" }}>{icon}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
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

      {/* ── Monthly temperature heatmap ────────────────────────── */}
      {months.length > 0 && (
        <div style={{ background: "#F2EDE8", borderRadius: 9, padding: "10px 12px" }}>
          <div style={{
            fontSize: 9, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.5px", color: "#7B8F83", marginBottom: 9,
          }}>
            Monthly Mean Temperature
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {months.map((m) => {
              const meanC = (m.max + m.min) / 2;
              return (
                <div key={m.label} style={{ flex: 1, textAlign: "center" }}>
                  <div
                    title={`${m.label}: ${meanC.toFixed(1)} °C`}
                    style={{ height: 26, borderRadius: 3, background: tempColor(meanC), marginBottom: 3 }}
                  />
                  <div style={{ fontSize: 7.5, color: "#7B8F83" }}>{m.label.slice(0, 1)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 9, color: "#7B8F83", marginTop: 6, lineHeight: 1.4 }}>
            Mean of monthly avg max / min · blue cool → red hot
          </div>
        </div>
      )}

      {/* ── Material / insulation strategy note ────────────────── */}
      <div style={{
        background: hot ? "rgba(196,133,90,0.10)" : "rgba(90,143,106,0.08)",
        border: `1px solid ${hot ? "rgba(196,133,90,0.30)" : "rgba(90,143,106,0.25)"}`,
        borderRadius: 8, padding: "9px 11px", display: "flex", alignItems: "flex-start", gap: 8,
      }}>
        <span style={{ fontSize: 13, marginTop: 1, flexShrink: 0, color: hot ? "#C4865A" : "#5A8F6A" }}>
          {hot ? "⚠" : "✓"}
        </span>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: hot ? "#C4865A" : "#5A8F6A", marginBottom: 2 }}>
            ECBC 2017 — Envelope Strategy
          </div>
          <div style={{ fontSize: 10, color: "#7B8F83", lineHeight: 1.5, marginBottom: 4 }}>
            {metStr(result, "Strategy", "Material approach")}
          </div>
          <div style={{ fontSize: 10, color: "#7B8F83", lineHeight: 1.5 }}>
            <span style={{ fontWeight: 600, color: "#3A3F3B" }}>Insulation: </span>
            {metStr(result, "Strategy", "Insulation")}
          </div>
        </div>
      </div>
    </div>
  );
}
