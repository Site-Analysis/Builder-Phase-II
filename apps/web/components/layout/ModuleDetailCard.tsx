"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { ModuleChart } from "@/components/layout/ModuleChart";
import { QualitativeChips } from "@/components/layout/QualitativeChips";
import type {
  ModuleId, Severity, Indicator, ModuleChart as ModuleChartSpec,
  QualitativeStat, MetricGroup,
} from "@/lib/stores/analysis";

const SEVERITY_COLOR: Record<Severity, string> = {
  high:     "#DC2626",
  moderate: "#D97706",
  low:      "#16A34A",
  none:     "#2563EB",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  high:     "High Risk",
  moderate: "Moderate Risk",
  low:      "Low Risk",
  none:     "Optimal",
};

const REGULATORY: Partial<Record<ModuleId, { title: string; text: string }>> = {
  flood:       { title: "NBC 2016 · Part 4 §4.2.3",  text: "Zone B sites require plinth ≥ 300 mm above road level. Drainage design per §8.3.1." },
  sunpath:     { title: "NBC 2016 · Part 8 §3.5",    text: "Minimum 2 hrs direct sunlight on habitable rooms at winter solstice." },
  temperature: { title: "NBC 2016 · Part 8 §4.1.2",  text: "Thermal comfort: U-value for walls ≤ 0.4 W/m²K in hot-dry climate zones." },
  wind:        { title: "NBC 2016 · Part 4 §6.2",    text: "Basic wind speed Zone III: 44 m/s. Structures must withstand 1.5× basic wind pressure." },
  rainfall:    { title: "NBC 2016 · Part 9 §3.4.1",  text: "Roof drainage: design for 60 mm/hr intensity. Minimum slope 1:50 towards outlets." },
};

const SOURCES: Partial<Record<ModuleId, { icon: string; name: string; detail: string }[]>> = {
  flood: [
    { icon: "🛰", name: "ALOS PALSAR DEM",        detail: "12.5 m resolution · JAXA 2024"           },
    { icon: "📊", name: "CHIRPS v2.0",            detail: "Daily rainfall 1981–2024"                 },
    { icon: "🗺", name: "BDA Zonal Regulations",  detail: "2023 revision"                            },
  ],
  sunpath: [
    { icon: "☀️", name: "pvlib Solar Model",       detail: "NREL · Hourly irradiance 1991–2020"     },
    { icon: "🛰", name: "ERA5 Reanalysis",         detail: "ECMWF · 31 km resolution"               },
  ],
  temperature: [
    { icon: "🌡", name: "IMD Gridded Data",        detail: "1° × 1° resolution · 1951–2023"         },
    { icon: "🌐", name: "Open-Meteo",              detail: "Hourly forecast · 11 km resolution"     },
  ],
  wind: [
    { icon: "💨", name: "ERA5 Wind Atlas",         detail: "ECMWF · 100 m hub height"               },
    { icon: "🌐", name: "Open-Meteo Wind",         detail: "10 m & 100 m heights"                   },
  ],
  rainfall: [
    { icon: "🌧", name: "CHIRPS v2.0",             detail: "Daily rainfall 1981–2024"                },
    { icon: "🛰", name: "GPM IMERG",               detail: "NASA · 0.1° resolution"                 },
  ],
};

export interface ModuleDetailCardProps {
  moduleId:       ModuleId;
  moduleName:     string;
  moduleColor:    string;
  severity:       Severity;
  score:          number;
  indicators?:    Indicator[];
  charts?:        ModuleChartSpec[];
  qualitative?:   QualitativeStat[];
  detailMetrics?: MetricGroup[];
  recommendations?: string[];
  summary?:       string;
  onDismiss:      () => void;
}

export function ModuleDetailCard({
  moduleId,
  moduleName,
  moduleColor,
  severity,
  score,
  indicators = [],
  charts = [],
  qualitative = [],
  detailMetrics = [],
  recommendations = [],
  summary,
  onDismiss,
}: ModuleDetailCardProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "layers" | "sources">("overview");

  const circumference = 2 * Math.PI * 24; // r=24 → ≈150.8
  const dash          = (Math.min(Math.max(score, 0), 100) / 100) * circumference;
  const ringColor     = SEVERITY_COLOR[severity];
  const reg           = REGULATORY[moduleId];
  const sources       = SOURCES[moduleId] ?? [];

  const TABS: { key: "overview" | "layers" | "sources"; label: string }[] = [
    { key: "overview", label: "Overview"   },
    { key: "layers",   label: "Map Layers" },
    { key: "sources",  label: "Sources"    },
  ];

  return (
    <div
      style={{
        position: "absolute", right: 16, top: 16, bottom: 16, width: 344,
        background: "white", borderRadius: 14,
        boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
        display: "flex", flexDirection: "column", zIndex: 10, overflow: "hidden",
      }}
      role="dialog"
      aria-label={`${moduleName} detail`}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ padding: "16px 16px 0", borderBottom: "1px solid #E2E8F0", flexShrink: 0 }}>
        {/* Module label row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: moduleColor, flexShrink: 0, display: "inline-block" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: moduleColor, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {moduleName} Risk
          </span>
          <button
            onClick={onDismiss}
            aria-label="Close detail panel"
            style={{
              marginLeft: "auto", width: 24, height: 24, borderRadius: 6,
              border: "none", background: "none", cursor: "pointer",
              color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14,
            }}
            onMouseEnter={(e) => { (e.currentTarget).style.background = "#F8F9FA"; }}
            onMouseLeave={(e) => { (e.currentTarget).style.background = "none"; }}
          >
            <X size={14} aria-hidden />
          </button>
        </div>

        {/* Score summary */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          {/* SVG ring */}
          <div style={{ width: 56, height: 56, flexShrink: 0, position: "relative" }}>
            <svg
              viewBox="0 0 56 56"
              width={56}
              height={56}
              style={{ transform: "rotate(-90deg)" }}
              aria-hidden
            >
              <circle cx="28" cy="28" r="24" fill="none" stroke="#E2E8F0" strokeWidth="5" />
              <circle
                cx="28" cy="28" r="24" fill="none"
                stroke={ringColor}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${dash.toFixed(1)} ${circumference.toFixed(1)}`}
              />
            </svg>
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{
                fontSize: 14, fontWeight: 700, color: "#0F172A", lineHeight: 1,
                fontFamily: "var(--font-geist-mono), monospace",
              }}>
                {score}
              </span>
              <span style={{ fontSize: 8, color: "#CBD5E1" }}>/100</span>
            </div>
          </div>

          {/* Verdict */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: ringColor }}>
              {SEVERITY_LABEL[severity]}
            </div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2, lineHeight: 1.4 }}>
              {summary ?? "Zone B classification · 320 m to water body"}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex" }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, padding: "9px 0", textAlign: "center",
                fontSize: 12, fontWeight: activeTab === tab.key ? 600 : 500,
                color: activeTab === tab.key ? moduleColor : "#64748B",
                cursor: "pointer", border: "none", background: "none", fontFamily: "inherit",
                borderBottom: `2px solid ${activeTab === tab.key ? moduleColor : "transparent"}`,
                marginBottom: -1, transition: "color 0.1s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <>
            {/* Qualitative chips */}
            {qualitative.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <QualitativeChips stats={qualitative} />
              </div>
            )}

            {/* Indicators */}
            {indicators.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                {indicators.map((ind, i) => (
                  <div key={ind.label} style={{
                    display: "flex", alignItems: "center",
                    padding: "8px 0", borderBottom: i === indicators.length - 1 ? "none" : "1px solid #E2E8F0",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#64748B" }}>{ind.label}</div>
                      {ind.citation && <div style={{ fontSize: 10, color: "#CBD5E1", marginTop: 1 }}>{ind.citation}</div>}
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: "#0F172A",
                      fontFamily: "var(--font-geist-mono), monospace",
                    }}>
                      {ind.value}{ind.unit ? ` ${ind.unit}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Charts */}
            {charts.map((c) => (
              <div key={c.title} style={{ marginTop: 14 }}>
                <ModuleChart chart={c} height={150} />
              </div>
            ))}

            {/* Detail metric groups */}
            {detailMetrics.map((grp) => (
              <div key={grp.group} style={{ marginTop: 14 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.5px", color: "#64748B", marginBottom: 6,
                }}>
                  {grp.group}
                </div>
                {grp.rows.map((row, i) => (
                  <div key={row.label} style={{
                    display: "flex", alignItems: "baseline", gap: 8,
                    padding: "6px 0", borderBottom: i === grp.rows.length - 1 ? "none" : "1px solid #F1F5F9",
                  }}>
                    <span style={{ flex: 1, fontSize: 11.5, color: "#64748B" }}>{row.label}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: "#0F172A", textAlign: "right",
                      fontFamily: "var(--font-geist-mono), monospace",
                    }}>
                      {row.value}{row.unit ? ` ${row.unit}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ))}

            {/* Regulatory callout */}
            {reg && (
              <div style={{
                background: "#FFF7ED", borderLeft: "3px solid #D97706",
                borderRadius: "0 8px 8px 0", padding: "10px 12px", marginTop: 14,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#0F172A", marginBottom: 3 }}>
                  {reg.title}
                </div>
                <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5 }}>{reg.text}</div>
                <div style={{ fontSize: 10, color: "#2E7D6F", marginTop: 4, cursor: "pointer" }}>
                  View full clause →
                </div>
              </div>
            )}

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.5px", color: "#64748B", marginBottom: 6,
                }}>
                  Recommendations
                </div>
                {recommendations.map((rec) => (
                  <div key={rec} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <span style={{ color: moduleColor, flexShrink: 0, fontSize: 13, lineHeight: 1.5 }}>→</span>
                    <span style={{ fontSize: 11.5, color: "#475569", lineHeight: 1.5 }}>{rec}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* MAP LAYERS */}
        {activeTab === "layers" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Flood Zone B boundary",  checked: true  },
              { label: "Drainage network",        checked: true  },
              { label: "Water bodies (BDA)",      checked: true  },
              { label: "Topographic wetness",     checked: false },
              { label: "ALOS elevation contours", checked: false },
            ].map((layer) => (
              <label key={layer.label} style={{
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                padding: "8px 10px", background: "#F8F9FA", borderRadius: 8,
              }}>
                <input type="checkbox" defaultChecked={layer.checked} style={{ accentColor: moduleColor, width: 14, height: 14, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "#0F172A" }}>{layer.label}</span>
              </label>
            ))}
          </div>
        )}

        {/* SOURCES */}
        {activeTab === "sources" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sources.map((src) => (
              <div key={src.name} style={{
                display: "flex", gap: 8, padding: 10,
                background: "#F8F9FA", borderRadius: 8,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{src.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#0F172A" }}>{src.name}</div>
                  <div style={{ fontSize: 10, color: "#64748B", marginTop: 2, lineHeight: 1.4 }}>{src.detail}</div>
                  <div style={{ fontSize: 10, color: "#2E7D6F", marginTop: 3, cursor: "pointer" }}>
                    View dataset →
                  </div>
                </div>
              </div>
            ))}
            {sources.length === 0 && (
              <p style={{ fontSize: 12, color: "#64748B", textAlign: "center", marginTop: 24 }}>
                Source information not available.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
