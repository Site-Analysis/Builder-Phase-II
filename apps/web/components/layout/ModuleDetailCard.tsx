"use client";

import { useState } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { ModuleChart } from "@/components/layout/ModuleChart";
import { QualitativeChips } from "@/components/layout/QualitativeChips";
import type {
  ModuleId, Severity, Indicator, ModuleChart as ModuleChartSpec,
  QualitativeStat, MetricGroup,
} from "@/lib/stores/analysis";

const SEVERITY_COLOR: Record<Severity, string> = {
  high:     "#C46A6A",
  moderate: "#C4865A",
  low:      "#5A8F6A",
  none:     "#2563EB",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  high:     "High Risk",
  moderate: "Moderate Risk",
  low:      "Low Risk",
  none:     "Optimal",
};

const REGULATORY: Partial<Record<ModuleId, { title: string; text: string }>> = {
  flood:            { title: "NBC 2016 · Part 4 §4.2.3",                    text: "Zone B sites require plinth ≥ 300 mm above road level. Drainage design per §8.3.1." },
  sunpath:          { title: "NBC 2016 · Part 8 §3.5",                      text: "Minimum 2 hrs direct sunlight on habitable rooms at winter solstice." },
  temperature:      { title: "NBC 2016 · Part 8 §4.1.2",                    text: "Thermal comfort: U-value for walls ≤ 0.4 W/m²K in hot-dry climate zones." },
  wind:             { title: "IS 875 Part 3 : 2015",                        text: "Basic wind speed Zone III (Bengaluru): 33 m/s. Design wind speed = Vb × k₁ × k₂ × k₃. Structures must be designed for 1.5× basic wind pressure." },
  rainfall:         { title: "NBC 2016 · Part 9 §3.4.1",                    text: "Roof drainage: design for 60 mm/hr intensity. Minimum slope 1:50 towards outlets." },
  zone:             { title: "BDA CDP 2031 · Zoning Regulations",           text: "Zone classification determines permissible use, FAR, ground coverage, height, and setbacks. Obtain the official BDA/BBMP zoning extract before design or investment." },
  planning:         { title: "NBC 2016 · Part 3 §4.2 + DGCA ANO Series X", text: "FAR per NBC Table 15 subject to BDA/BBMP amendments. Airport height clearance per DGCA ANO Series X — file NOC with AAI if site falls within Obstacle Limitation Surface." },
  zoning:           { title: "BDA CDP 2031 · NBC 2016 · DGCA ANO Series X · Karnataka Revenue Act", text: "Zone compliance, FAR, setbacks, and height per NBC 2016 Table 15 and BDA CDP 2031. NA order required if land revenue classification is agricultural. DGCA NOC mandatory if site falls within airport OLS. All findings must be verified with BDA/BBMP, Revenue Department, and AAI before investment or design." },
  infrastructure:   { title: "NBC 2016 · Part 9 §2.1",                     text: "Potable water supply, drainage, sewage, and road access conforming to local authority requirements are mandatory before occupancy certificate." },
  soil:             { title: "IS 1892 : 2021 · Code for Site Investigation",text: "Geotechnical investigation is mandatory per IS 1892. Soil bearing capacity must be determined by a licensed geotechnical engineer before foundation design." },
  waterConstraints: { title: "NGT OA 593/2017 · Karnataka HC WP 817/2008", text: "100 m buffer around rivers, 75 m around lakes/tanks, 100 m around rajakaluves. No construction within FTL boundary. Violating buffer attracts demolition under KSPCB/BBMP." },
  land:             { title: "Registration Act 1908 · Transfer of Property Act 1882", text: "Ensure clear title, EC for minimum 30 years, nil-encumbrance certificate, and latest RTC before purchase or development agreement." },
  amenities:        { title: "OSM · Amenity coverage within 5km radius",    text: "Amenity proximity data from OpenStreetMap. Coverage quality varies — verify key facilities on-site before design decisions." },
};

const MODULES_WITH_MAP_LAYERS = new Set<ModuleId>(["flood", "wind", "rainfall", "temperature", "sunpath"]);

const MODULE_SUFFIX: Partial<Record<ModuleId, string>> = {
  flood:            "Risk",
  wind:             "Risk",
  rainfall:         "Risk",
  temperature:      "Analysis",
  sunpath:          "Analysis",
  zone:             "Classification",
  planning:         "Analysis",
  zoning:           "Compliance",
  infrastructure:   "Analysis",
  soil:             "Profile",
  waterConstraints: "Constraints",
  growth:           "Overview",
  land:             "Check",
  amenities:        "Overview",
};

const SOURCES: Partial<Record<ModuleId, { icon: string; name: string; detail: string }[]>> = {
  flood: [
    { icon: "🌍", name: "Open-Meteo · SRTM Elevation",    detail: "NASA SRTM v3 · ~90 m resolution · Single-point elevation" },
    { icon: "🌧", name: "Open-Meteo Archive · ERA5",       detail: "ECMWF ERA5 reanalysis · Daily precipitation · 5-year record · ~25 km" },
    { icon: "🗺", name: "OSM Overpass · Water Proximity",  detail: "Nearest river/canal/lake from OpenStreetMap · real measured distance" },
    { icon: "⚠️", name: "No MERIT DEM / JRC GSW yet",     detail: "Slope and historical flood extent pending GEE integration. Commission site-specific flood study before development decisions." },
  ],
  sunpath: [
    { icon: "☀️", name: "pvlib (NREL Solar Position Algorithm)", detail: "Ephemeris-accurate hourly sun positions · No approximation" },
    { icon: "📍", name: "Site coordinates",                      detail: "Computed for exact project lat/lon — not regionalised" },
  ],
  temperature: [
    { icon: "🌡", name: "IMD Gridded Normals",   detail: "India Meteorological Department · 1° × 1° · 1951–2023" },
    { icon: "🌐", name: "Open-Meteo ERA5",        detail: "ECMWF ERA5 reanalysis · ~25 km resolution" },
  ],
  wind: [
    { icon: "💨", name: "Open-Meteo Archive · ERA5",         detail: "ECMWF ERA5 reanalysis · Daily max wind speed + gust at 10 m AGL · 5-year record · ~25 km" },
    { icon: "🧭", name: "Dominant direction from daily data", detail: "Prevailing direction from 5-year daily dominant direction — statistically robust" },
    { icon: "⚠️", name: "10 m AGL — not at building height", detail: "ERA5 wind at 10 m height. Structural design requires site-specific assessment per IS 875 Part 3:2015." },
  ],
  rainfall: [
    { icon: "🌧", name: "CHIRPS Daily v2.0",     detail: "Climate Hazards Group / UCSB · 0.05° (~5.5 km) · 1981–present" },
    { icon: "🌐", name: "Open-Meteo Archive",    detail: "ERA5 precipitation reanalysis via Open-Meteo" },
  ],
  zone: [
    { icon: "🗺", name: "OpenStreetMap (Overpass API)",          detail: "Live crowd-sourced land use data — updated continuously" },
    { icon: "🛰", name: "ISRO NRSC Bhuvan LULC",                detail: "National land cover at 1:50K scale · 2022-23 dataset (falls back to 2019-20). Official ISRO survey data." },
    { icon: "⚠️", name: "Zone class NOT authoritative",          detail: "Zone class inferred from OSM tags. Obtain official BDA/BBMP zoning extract before any development or investment decision." },
  ],
  zoning: [
    { icon: "🛰", name: "ISRO NRSC Bhuvan LULC",                detail: "National land cover at 1:50K scale · 2022-23 (falls back to 2019-20). Official ISRO satellite survey — most reliable indicator of NA order requirement." },
    { icon: "🗺", name: "OpenStreetMap (Overpass API)",          detail: "Zone class, road width, and nearby land features — crowd-sourced, well-mapped in Indian urban areas." },
    { icon: "📋", name: "NBC 2016 Table 15",                    detail: "National Building Code of India 2016 · FAR, ground coverage, setbacks, and height rules by zone class and road width." },
    { icon: "🏛", name: "BDA CDP 2031 + TOD 2020",             detail: "Bengaluru Development Authority Comprehensive Development Plan 2031 · TOD Notification 2020 (FAR 4.0 within 500m of metro station)." },
    { icon: "✈️", name: "ICAO Annex 14 + AAI Database",        detail: "Airport Obstacle Limitation Surfaces — approximate. DGCA is the competent authority for final NOC clearance." },
    { icon: "⚠️", name: "Verify before investment",             detail: "LULC data may be up to 3 years old. Zone class from OSM is not official. Always verify with BDA, Revenue Department, and AAI before purchase or design." },
  ],
  planning: [
    { icon: "📋", name: "NBC 2016 Table 15",             detail: "National Building Code of India 2016 · FAR, setback, height rules" },
    { icon: "✈️", name: "ICAO Annex 14 (2022) + AAI DB", detail: "Airport Obstacle Limitation Surfaces — approximate. DGCA is the competent authority for final clearance." },
    { icon: "🏛", name: "BDA CDP 2031 + TOD 2020",       detail: "Bengaluru Development Authority Comprehensive Development Plan 2031 · FAR amendments · TOD Notification 2020 (FAR 4.0 within 500m metro)" },
  ],
  infrastructure: [
    { icon: "🗺", name: "OpenStreetMap (Overpass API)",   detail: "Transit, roads, power lines — coverage varies by city and area" },
    { icon: "🏗", name: "Road surface tags (OSM)",        detail: "Surface quality (paved/unpaved) from OSM highway:surface tags — ~40% tagged in Indian cities" },
    { icon: "⚡", name: "Power line tags (OSM)",          detail: "HT line proximity from OSM power:line tags — ~30% tagged. Absence does not confirm absence." },
    { icon: "⚠️", name: "Utility data is incomplete",    detail: "Water, sewage, and telecom not scored — OSM coverage <20% in India. Always verify with BWSSB, BESCOM, BBMP." },
  ],
  soil: [
    { icon: "🌍", name: "SoilGrids REST API v2.0",       detail: "ISRIC World Soil Information · 250 m resolution · Global coverage · Updated 2023" },
    { icon: "⚠️", name: "250 m resolution — coarse",     detail: "Regional soil data only. Always commission a site geotechnical investigation per IS 1892 before foundation design." },
  ],
  waterConstraints: [
    { icon: "🗺", name: "OpenStreetMap (Overpass API)",          detail: "Water bodies and drains — OSM coverage may be incomplete for smaller channels" },
    { icon: "⚖️", name: "Karnataka / NGT regulations",           detail: "Rivers: 100 m (NGT OA 593/2017) · Lakes: 75 m (BBMP 2020) · Drains/Rajakaluves: 100 m (HC WP 817/2008)" },
    { icon: "⚠️", name: "Verify FTL boundary with local authority", detail: "Full Tank Level boundary must be confirmed with BBMP / revenue authority. OSM geometry is not an FTL survey." },
  ],
  growth: [
    { icon: "📋", name: "Curated public data · 2024-Q4",  detail: "Compiled from BMRCL, BDA, NHAI, KIADB public announcements. Project alignments are approximate centroids." },
    { icon: "⚠️", name: "Static — verify at source",      detail: "Project statuses and timelines may have changed. Verify with the respective authority before investment decisions." },
  ],
  land: [
    { icon: "🏛", name: "Bhoomi (Karnataka Land Records)", detail: "landrecords.karnataka.gov.in — RTC, mutation, ownership" },
    { icon: "📜", name: "KAVERI",                          detail: "kaverionline.karnataka.gov.in — Encumbrance Certificate" },
    { icon: "⚖️", name: "eCourts API",                    detail: "services.ecourts.gov.in — Court case search" },
    { icon: "🏦", name: "CERSAI",                          detail: "cersai.org.in — Mortgage / charge search" },
    { icon: "⚠️", name: "Direct portal access required",  detail: "No records are fetched automatically. SAT generates direct links — you must verify all records on government portals." },
  ],
  amenities: [
    { icon: "🗺", name: "OpenStreetMap (Overpass API) · 5km radius", detail: "Live OSM data — hospitals, schools, markets, banks, parks, places of worship, transit stops" },
    { icon: "⚠️", name: "OSM coverage varies",                       detail: "OSM amenity data in Indian cities is good for large facilities (hospitals, malls, stations) but may miss smaller local shops. Verify key facilities on-site." },
  ],
};

// ── Sub-score definitions for Infrastructure ────────────────────────────────
const INFRA_SUB_SCORES = [
  { key: "road",    label: "Road Access",    max: 50, color: "#5A8F6A" },
  { key: "transit", label: "Transit",        max: 30, color: "#5B93C9" },
  { key: "power",   label: "Power Supply",   max: 20, color: "#C4865A" },
] as const;

const INFRA_UTIL_ROWS = [
  { key: "water_supply_nearby",    label: "Water supply (BWSSB)" },
  { key: "storm_drainage_nearby",  label: "Storm drainage (BBMP)" },
  { key: "sewage_works_nearby",    label: "Sewage works (BWSSB)" },
  { key: "telecom_tower_nearby",   label: "Telecom tower" },
] as const;

// ── Indicator bar ────────────────────────────────────────────────────────────
function IndicatorBar({
  ind, color,
}: {
  ind: Indicator;
  color: string;
}) {
  const pct = Math.min(Math.max(ind.barFraction ?? 0, 0), 1) * 100;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 12, color: "#3A3F3B", fontWeight: 500 }}>{ind.label}</span>
          {ind.citation && (
            <span style={{ fontSize: 10, color: "#B8C4BB", marginLeft: 6 }}>{ind.citation}</span>
          )}
        </div>
        <span style={{
          fontSize: 12, fontWeight: 700, color: "#3A3F3B",
          fontFamily: "var(--font-geist-mono), monospace", flexShrink: 0,
        }}>
          {ind.value}{ind.unit ? ` ${ind.unit}` : ""}
        </span>
      </div>
      <div style={{ height: 4, background: "#E8ECE6", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 2,
          background: color,
          transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }} />
      </div>
    </div>
  );
}

// ── Sub-score bar row ────────────────────────────────────────────────────────
function SubScoreBar({
  label, value, max, color,
}: {
  label: string; value: number; max: number; color: string;
}) {
  const pct = Math.min(Math.max(value / max, 0), 1) * 100;
  const fraction = value / max;
  const barColor = fraction >= 0.65 ? "#5A8F6A" : fraction >= 0.40 ? "#C4865A" : "#C46A6A";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
        <span style={{ flex: 1, fontSize: 11.5, color: "#7B8F83" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#3A3F3B", fontFamily: "var(--font-geist-mono), monospace" }}>
          {value.toFixed(0)}<span style={{ fontWeight: 400, color: "#B8C4BB" }}>/{max}</span>
        </span>
      </div>
      <div style={{ height: 3, background: "#E8ECE6", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 2,
          background: barColor,
          transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }} />
      </div>
    </div>
  );
}

export interface ModuleDetailCardProps {
  moduleId:         ModuleId;
  moduleName:       string;
  moduleColor:      string;
  severity:         Severity;
  score:            number;
  indicators?:      Indicator[];
  charts?:          ModuleChartSpec[];
  qualitative?:     QualitativeStat[];
  detailMetrics?:   MetricGroup[];
  recommendations?: string[];
  summary?:         string;
  onDismiss:        () => void;
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
  const [activeTab, setActiveTab]   = useState<"overview" | "layers" | "sources">("overview");
  const [recsOpen, setRecsOpen]     = useState(true);

  const circumference = 2 * Math.PI * 24;
  const dash          = (Math.min(Math.max(score, 0), 100) / 100) * circumference;
  const ringColor     = SEVERITY_COLOR[severity];
  const reg           = REGULATORY[moduleId];
  const sources       = SOURCES[moduleId] ?? [];
  const headerSuffix  = MODULE_SUFFIX[moduleId] ?? "Analysis";
  const hasMapLayers  = MODULES_WITH_MAP_LAYERS.has(moduleId);

  const TABS: { key: "overview" | "layers" | "sources"; label: string }[] = [
    { key: "overview", label: "Overview" },
    ...(hasMapLayers ? [{ key: "layers" as const, label: "Map Layers" }] : []),
    { key: "sources",  label: "Sources" },
  ];

  // Split qualitative into alerts (bad | long warn) vs chips
  const alertStats = qualitative.filter(
    (s) => s.tone === "bad" || (s.tone === "warn" && (s.value?.length ?? 0) > 60)
  );
  const hasAlerts = alertStats.length > 0;

  // For infrastructure: pull sub-scores + utilities from dedicated groups
  const subScoreGroup = moduleId === "infrastructure"
    ? detailMetrics.find((g) => g.group === "Sub-scores")
    : undefined;

  const utilGroup = moduleId === "infrastructure"
    ? detailMetrics.find((g) => g.group.startsWith("Utilities"))
    : undefined;

  // Remaining groups rendered in normal table layout
  const remainingGroups = moduleId === "infrastructure"
    ? detailMetrics.filter((g) => g !== subScoreGroup && g !== utilGroup)
    : detailMetrics;

  return (
    <div
      style={{
        position: "absolute", right: 16, top: 16, bottom: 16, width: 344,
        background: "#FDFCFB", borderRadius: 14,
        boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
        display: "flex", flexDirection: "column", zIndex: 10, overflow: "hidden",
      }}
      role="dialog"
      aria-label={`${moduleName} detail`}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ padding: "16px 16px 0", borderBottom: "1px solid #CFD6C4", flexShrink: 0 }}>

        {/* Module label row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: moduleColor, flexShrink: 0, display: "inline-block",
          }} />
          <span style={{
            fontSize: 12, fontWeight: 600, color: moduleColor,
            textTransform: "uppercase", letterSpacing: "0.5px",
          }}>
            {moduleName} {headerSuffix}
          </span>

          {/* Alert count badge */}
          {hasAlerts && (
            <span style={{
              marginLeft: 2, padding: "2px 7px", borderRadius: 10,
              background: "#F5E4E4", color: "#C46A6A",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.3px",
            }}>
              {alertStats.length} alert{alertStats.length > 1 ? "s" : ""}
            </span>
          )}

          <button
            onClick={onDismiss}
            aria-label="Close detail panel"
            style={{
              marginLeft: "auto", width: 24, height: 24, borderRadius: 6,
              border: "none", background: "none", cursor: "pointer",
              color: "#7B8F83", display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={(e) => { (e.currentTarget).style.background = "#F2EDE8"; }}
            onMouseLeave={(e) => { (e.currentTarget).style.background = "none"; }}
          >
            <X size={14} aria-hidden />
          </button>
        </div>

        {/* Score row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          {/* SVG ring */}
          <div style={{ width: 56, height: 56, flexShrink: 0, position: "relative" }}>
            <svg viewBox="0 0 56 56" width={56} height={56} style={{ transform: "rotate(-90deg)" }} aria-hidden>
              <circle cx="28" cy="28" r="24" fill="none" stroke="#CFD6C4" strokeWidth="5" />
              <circle
                cx="28" cy="28" r="24" fill="none"
                stroke={ringColor} strokeWidth="5" strokeLinecap="round"
                strokeDasharray={`${dash.toFixed(1)} ${circumference.toFixed(1)}`}
              />
            </svg>
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{
                fontSize: 14, fontWeight: 700, color: "#3A3F3B", lineHeight: 1,
                fontFamily: "var(--font-geist-mono), monospace",
              }}>
                {score}
              </span>
              <span style={{ fontSize: 8, color: "#B8C4BB" }}>/100</span>
            </div>
          </div>

          {/* Verdict */}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: ringColor }}>
                {SEVERITY_LABEL[severity]}
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#7B8F83", lineHeight: 1.4 }}>
              {summary ?? "—"}
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
                color: activeTab === tab.key ? moduleColor : "#7B8F83",
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

      {/* ── Tab content ────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <>
            {/* Qualitative chips + alert banners */}
            {qualitative.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <QualitativeChips stats={qualitative} />
              </div>
            )}

            {/* Indicators with bars */}
            {indicators.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                {indicators.map((ind) => (
                  <IndicatorBar key={ind.label} ind={ind} color={moduleColor} />
                ))}
              </div>
            )}

            {/* Infrastructure sub-score breakdown */}
            {moduleId === "infrastructure" && (
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.5px", color: "#7B8F83", marginBottom: 8,
                }}>
                  Score Breakdown
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {INFRA_SUB_SCORES.map(({ key, label, max, color }) => {
                    // "Sub-scores" group has rows: { label: "road"|"transit"|"power", value: "23.0" }
                    const row = subScoreGroup?.rows.find((r) => r.label === key);
                    const parsed = row ? (parseFloat(row.value) || 0) : 0;
                    return (
                      <SubScoreBar
                        key={key}
                        label={label}
                        value={Math.min(parsed, max)}
                        max={max}
                        color={color}
                      />
                    );
                  })}
                </div>

                {/* Utility presence — informational only */}
                <div style={{
                  marginTop: 12, padding: "8px 10px",
                  background: "#F2EDE8", borderRadius: 8,
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.5px", color: "#7B8F83", marginBottom: 6,
                  }}>
                    Utilities — Informational (not scored)
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
                    {utilGroup?.rows.map((row) => {
                      const present = row.value.includes("✓");
                      return (
                        <div key={row.label} style={{
                          display: "flex", alignItems: "center", gap: 5,
                          fontSize: 11, color: present ? "#5A8F6A" : "#B8C4BB",
                          minWidth: "44%",
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 700 }}>
                            {present ? "✓" : "—"}
                          </span>
                          <span style={{ color: "#7B8F83" }}>{row.label}</span>
                        </div>
                      );
                    }) ?? INFRA_UTIL_ROWS.map(({ key, label }) => (
                      <div key={key} style={{
                        display: "flex", alignItems: "center", gap: 5,
                        fontSize: 11, color: "#B8C4BB", minWidth: "44%",
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700 }}>—</span>
                        <span style={{ color: "#7B8F83" }}>{label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 9.5, color: "#B8C4BB", marginTop: 6, lineHeight: 1.4 }}>
                    OSM utility coverage &lt;20% in India — absence ≠ absent on-site
                  </div>
                </div>
              </div>
            )}

            {/* Charts */}
            {charts.map((c) => (
              <div key={c.title} style={{ marginTop: 14 }}>
                <ModuleChart chart={c} height={150} />
              </div>
            ))}

            {/* Remaining detail metric groups */}
            {remainingGroups.map((grp) => (
              <div key={grp.group} style={{ marginTop: 14 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.5px", color: "#7B8F83", marginBottom: 6,
                }}>
                  {grp.group}
                </div>
                {grp.rows.map((row, i) => (
                  <div key={`${row.label}-${i}`} style={{
                    display: "flex", alignItems: "baseline", gap: 8,
                    padding: "6px 0",
                    borderBottom: i === grp.rows.length - 1 ? "none" : "1px solid #CFD6C4",
                  }}>
                    <span style={{ flex: 1, fontSize: 11.5, color: "#7B8F83" }}>{row.label}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: "#3A3F3B", textAlign: "right",
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
                background: "#F8EDE0", borderLeft: "3px solid #C4865A",
                borderRadius: "0 8px 8px 0", padding: "10px 12px", marginTop: 14,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#3A3F3B", marginBottom: 3 }}>
                  {reg.title}
                </div>
                <div style={{ fontSize: 11, color: "#7B8F83", lineHeight: 1.5 }}>{reg.text}</div>
                <div style={{ fontSize: 10, color: "#5A8F6A", marginTop: 4, cursor: "pointer" }}>
                  View full clause →
                </div>
              </div>
            )}

            {/* Recommendations — collapsible */}
            {recommendations.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <button
                  onClick={() => setRecsOpen(!recsOpen)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, width: "100%",
                    border: "none", background: "none", cursor: "pointer", padding: 0,
                    marginBottom: recsOpen ? 6 : 0,
                  }}
                >
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.5px", color: "#7B8F83",
                  }}>
                    Recommendations
                  </span>
                  <span style={{ color: "#B8C4BB", marginLeft: "auto", display: "flex" }}>
                    {recsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </span>
                </button>
                {recsOpen && recommendations.map((rec) => (
                  <div key={rec} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <span style={{ color: moduleColor, flexShrink: 0, fontSize: 13, lineHeight: 1.5 }}>→</span>
                    <span style={{ fontSize: 11.5, color: "#7B8F83", lineHeight: 1.5 }}>{rec}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* MAP LAYERS */}
        {activeTab === "layers" && hasMapLayers && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(moduleId === "flood" ? [
              { label: "Flood zone rings",    checked: true  },
              { label: "Drainage network",     checked: true  },
            ] : moduleId === "wind" ? [
              { label: "Wind rose overlay",    checked: true  },
            ] : moduleId === "rainfall" ? [
              { label: "Rainfall rose",        checked: true  },
            ] : moduleId === "temperature" ? [
              { label: "Thermal field grid",   checked: true  },
            ] : moduleId === "sunpath" ? [
              { label: "Sun path arc",         checked: true  },
              { label: "Shadow angle overlay", checked: false },
            ] : []).map((layer) => (
              <label key={layer.label} style={{
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                padding: "8px 10px", background: "#F2EDE8", borderRadius: 8,
              }}>
                <input
                  type="checkbox"
                  defaultChecked={layer.checked}
                  style={{ accentColor: moduleColor, width: 14, height: 14, flexShrink: 0 }}
                />
                <span style={{ fontSize: 12, color: "#3A3F3B" }}>{layer.label}</span>
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
                background: "#F2EDE8", borderRadius: 8,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{src.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#3A3F3B" }}>{src.name}</div>
                  <div style={{ fontSize: 10, color: "#7B8F83", marginTop: 2, lineHeight: 1.4 }}>{src.detail}</div>
                  <div style={{ fontSize: 10, color: "#5A8F6A", marginTop: 3, cursor: "pointer" }}>
                    View dataset →
                  </div>
                </div>
              </div>
            ))}
            {sources.length === 0 && (
              <p style={{ fontSize: 12, color: "#7B8F83", textAlign: "center", marginTop: 24 }}>
                Source information not available.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
