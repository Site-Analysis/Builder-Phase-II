"use client";

import type { ModuleResult, Severity } from "@/lib/stores/analysis";

interface RainfallPanelProps {
  result?: ModuleResult;
  severity: Severity;
}

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONSOON = [false, false, false, false, false, true, true, true, true, false, false, false];

function indNum(result: ModuleResult | undefined, label: string): number {
  const v = result?.indicators?.find((i) => i.label === label)?.value;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
function indStr(result: ModuleResult | undefined, label: string, unit = ""): string {
  const ind = result?.indicators?.find((i) => i.label === label);
  if (!ind) return "—";
  return `${ind.value}${unit ? " " + unit : ""}`;
}
function metStr(result: ModuleResult | undefined, group: string, label: string): string {
  return result?.detailMetrics?.find((g) => g.group === group)?.rows.find((r) => r.label === label)?.value ?? "—";
}
function monthly(result: ModuleResult | undefined): number[] {
  const pts = result?.charts?.find((c) => c.title === "Monthly rainfall")?.points;
  return pts?.map((p) => Number(p.value) || 0) ?? [];
}

export function RainfallPanel({ result, severity }: RainfallPanelProps) {
  const annual    = indStr(result, "Annual total", "mm");
  const meanDaily = indStr(result, "Mean daily", "mm");
  const maxDaily  = indStr(result, "Max daily", "mm");
  const rainyDays = indNum(result, "Rainy days");
  const dryDays   = parseFloat(metStr(result, "Totals", "Dry days")) || 0;
  const ratio     = dryDays > 0 ? (rainyDays / dryDays).toFixed(2) : "—";

  const months  = monthly(result);
  const maxMo   = Math.max(1, ...months);
  const total   = months.reduce((a, b) => a + b, 0);
  const monsoonTotal = months.reduce((a, b, i) => a + (MONSOON[i] ? b : 0), 0);
  const monsoonShare = total > 0 ? Math.round((monsoonTotal / total) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 2 }}>

      {/* ── Annual banner ──────────────────────────────────────── */}
      <div style={{
        background: "rgba(124,58,237,0.07)", border: "1.5px solid rgba(124,58,237,0.22)",
        borderRadius: 9, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: "rgba(124,58,237,0.08)", border: "2px solid rgba(124,58,237,0.22)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 2.5C12 2.5 5 10 5 15a7 7 0 0 0 14 0c0-5-7-12.5-7-12.5z" fill="#7C3AED" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#5B21B6", lineHeight: 1.3 }}>
            {annual} annual
          </div>
          <div style={{ fontSize: 10, color: "#7B8F83", marginTop: 2, lineHeight: 1.4 }}>
            {rainyDays} rainy days · {monsoonShare}% in monsoon
          </div>
        </div>
      </div>

      {/* ── Metrics grid 2×3 ───────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {[
          { label: "Annual total",  value: annual,    icon: "Σ" },
          { label: "Mean daily",    value: meanDaily, icon: "x̄" },
          { label: "Max daily",     value: maxDaily,  icon: "↑" },
          { label: "Rainy days",    value: String(rainyDays), icon: "☂" },
          { label: "Dry days",      value: dryDays ? String(dryDays) : "—", icon: "○" },
          { label: "Wet : dry",     value: ratio,     icon: "÷" },
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

      {/* ── Monthly distribution ───────────────────────────────── */}
      {months.length === 12 && (
        <div style={{ background: "#F2EDE8", borderRadius: 9, padding: "10px 12px" }}>
          <div style={{
            fontSize: 9, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.5px", color: "#7B8F83", marginBottom: 9,
          }}>
            Monthly Distribution
          </div>
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 56 }}>
            {months.map((v, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div style={{
                  width: "100%", borderRadius: "2px 2px 0 0",
                  height: `${Math.max((v / maxMo) * 46, 2)}px`,
                  background: MONSOON[i] ? "#1D4ED8" : "#93C5FD",
                }} />
                <div style={{ fontSize: 7.5, fontWeight: MONSOON[i] ? 700 : 400, color: MONSOON[i] ? "#3A3F3B" : "#B8C4BB", marginTop: 3 }}>
                  {MONTH_LABELS[i]}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Drainage / NBC note ────────────────────────────────── */}
      <div style={{
        background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.22)",
        borderRadius: 8, padding: "9px 11px", display: "flex", alignItems: "flex-start", gap: 8,
      }}>
        <span style={{ fontSize: 13, marginTop: 1, flexShrink: 0, color: "#7C3AED" }}>☔</span>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#5B21B6", marginBottom: 2 }}>
            NBC 2016 · Part 9 — Stormwater
          </div>
          <div style={{ fontSize: 10, color: "#7B8F83", lineHeight: 1.5 }}>
            Peak daily intensity of {maxDaily} drives site drainage capacity. Size storm-water
            conveyance for the monsoon window (Jun–Sep, {monsoonShare}% of annual fall).
          </div>
        </div>
      </div>
    </div>
  );
}
