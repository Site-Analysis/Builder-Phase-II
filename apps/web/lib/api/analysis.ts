// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

// Frontend ↔ analysis service wiring.
// Endpoints + response shapes verified against the real FastAPI routers and
// Pydantic models in services/<svc>/app/ (not the contracts, which can drift).
//
// Every service gates its routes behind a feature flag read from the FLAGS env
// var at request time — run each service with its flag enabled or calls 403:
//   temperature (8000): feature.temperature.thermal-profile
//   sunpath     (8001): feature.sunpath.diagram
//   flood       (8002): feature.flood.risk-analysis
//   wind        (8003): feature.wind.analysis
//   rainfall    (8004): feature.rainfall.summary

import type {
  ModuleId, ModuleResult, SiteScore, Severity, QualitativeTone,
} from "../stores/analysis";

// Per-module accent colours (match the rest of the UI).
const COLOR = {
  flood: "#2563EB", sunpath: "#F59E0B", temperature: "#EF4444",
  wind: "#06B6D4", rainfall: "#1D4ED8",
} as const;

function comfortTone(v: string): QualitativeTone {
  if (v === "Excellent" || v === "Good") return "good";
  if (v === "Fair") return "warn";
  if (v === "Poor") return "bad";
  return "neutral";
}

function riskTone(v: string): QualitativeTone {
  if (v === "Low" || v === "Very Low") return "good";
  if (v === "Moderate") return "warn";
  if (v === "High" || v === "Very High") return "bad";
  return "neutral";
}

const SVC = {
  flood:          process.env.NEXT_PUBLIC_FLOOD_API_URL          ?? "http://localhost:8002",
  sunpath:        process.env.NEXT_PUBLIC_SUNPATH_API_URL        ?? "http://localhost:8001",
  wind:           process.env.NEXT_PUBLIC_WIND_API_URL           ?? "http://localhost:8003",
  temperature:    process.env.NEXT_PUBLIC_TEMPERATURE_API_URL    ?? "http://localhost:8000",
  rainfall:       process.env.NEXT_PUBLIC_RAINFALL_API_URL       ?? "http://localhost:8004",
  zone:           process.env.NEXT_PUBLIC_GEO_API_URL            ?? "http://localhost:8005",
  planning:       process.env.NEXT_PUBLIC_PLANNING_API_URL       ?? "http://localhost:8006",
  infrastructure: process.env.NEXT_PUBLIC_INFRA_API_URL          ?? "http://localhost:8007",
  growth:         process.env.NEXT_PUBLIC_FUTURE_INFRA_API_URL   ?? "http://localhost:8008",
  land:           process.env.NEXT_PUBLIC_LAND_RECORDS_API_URL   ?? "http://localhost:8009",
  amenities:      process.env.NEXT_PUBLIC_GEO_API_URL            ?? "http://localhost:8005",
} as const;

async function svcFetch<T>(base: string, path: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { "Content-Type": "application/json", ...init?.headers },
      ...init,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        if (body?.detail) detail = String(body.detail);
      } catch { /* non-JSON error body */ }
      throw new Error(detail);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Service timed out — upstream may be rate-limited. Try again shortly.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Trailing 12 months for date-range endpoints (rainfall, temperature archive).
function dateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export interface AnalysisCoords {
  lat: number;
  lng: number;
  projectId?: string;
  bufferM?: number;
  startDate?: string;
  endDate?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function severityFromScore(score: number): Severity {
  if (score >= 70) return "low";
  if (score >= 40) return "moderate";
  if (score > 0)   return "high";
  return "none";
}

// ─── Flood — POST /flood/analyze → FloodReport ────────────────────────────────

interface FloodReport {
  overall_score: number; // 0-100 risk magnitude (higher = more risk)
  risk_category: "Very Low" | "Low" | "Moderate" | "High" | "Very High";
  component_scores: {
    elevation_risk: number;
    hydrology_risk: number;
    historical_risk: number;
    llai_risk: number;
  };
  elevation: {
    mean_m: number; min_m: number; max_m: number; range_m: number;
    slope_degrees: number; low_lying_area_pct: number; terrain_classification: string;
  };
  hydrology: {
    flow_accumulation: number;
    nearest_river_distance_m: number;
    water_occurrence_pct: number;
    drainage_density: number;
    river_proximity_risk: string;
  };
  flood_history: {
    historical_events_count: number;
    annual_rainfall_mm: number;
    flood_history_score: number;
  };
  llai: { mean: number; min: number; max: number; primary_risk_category: string };
  recommendations: string[];
  metadata: { data_source: string };
}

function severityFromRiskCategory(cat: FloodReport["risk_category"]): Severity {
  switch (cat) {
    case "Very High":
    case "High":      return "high";
    case "Moderate":  return "moderate";
    case "Low":
    case "Very Low":  return "low";
    default:          return "none";
  }
}

export async function getFloodAnalysis(coords: AnalysisCoords): Promise<ModuleResult> {
  const raw = await svcFetch<FloodReport>(SVC.flood, "/flood/analyze", {
    method: "POST",
    body: JSON.stringify({ latitude: coords.lat, longitude: coords.lng, radius_meters: coords.bufferM ?? 1000 }),
  });
  // Frontend score is a goodness score (higher = better / lower risk).
  const score = clampScore(100 - num(raw.overall_score));
  const riverDist = num(raw.hydrology?.nearest_river_distance_m);
  const cs = raw.component_scores ?? {} as FloodReport["component_scores"];
  const elev = raw.elevation ?? {} as FloodReport["elevation"];
  const hyd = raw.hydrology ?? {} as FloodReport["hydrology"];
  const hist = raw.flood_history ?? {} as FloodReport["flood_history"];
  const llai = raw.llai ?? {} as FloodReport["llai"];
  return {
    score,
    severity: severityFromRiskCategory(raw.risk_category),
    summary: raw.recommendations?.[0] ?? "Flood risk assessed for the site.",
    data_source: raw.metadata?.data_source ?? "Open-Meteo (SRTM + ERA5 precipitation) · OSM Overpass",
    indicators: [
      { label: "Flow accumulation",      value: num(hyd.flow_accumulation).toFixed(2),  unit: "",  barFraction: clamp01(num(hyd.flow_accumulation) / 10),  citation: "MERIT Hydro (GEE)" },
      { label: "Nearest river distance", value: riverDist.toFixed(0),                    unit: "m", barFraction: clamp01(1 - riverDist / 2000),             citation: "MERIT Hydro" },
      { label: "Water occurrence",       value: num(hyd.water_occurrence_pct).toFixed(1), unit: "%", barFraction: clamp01(num(hyd.water_occurrence_pct) / 100), citation: "JRC GSW (GEE)" },
      { label: "Low-lying area",         value: num(elev.low_lying_area_pct).toFixed(1),  unit: "%", barFraction: clamp01(num(elev.low_lying_area_pct) / 100),   citation: "MERIT DEM" },
    ],
    chart_data: [],
    charts: [
      {
        title: "Risk components", kind: "bar", unit: "risk 0-100",
        series: [{ key: "value", label: "Risk", color: COLOR.flood }],
        points: [
          { label: "Elevation",  value: Math.round(num(cs.elevation_risk))  },
          { label: "Hydrology",  value: Math.round(num(cs.hydrology_risk))  },
          { label: "Historical", value: Math.round(num(cs.historical_risk)) },
          { label: "LLAI",       value: Math.round(num(cs.llai_risk))       },
        ],
      },
      {
        title: "Elevation profile", kind: "bar", unit: "m above sea level",
        series: [{ key: "value", label: "Elevation", color: "#1D4ED8" }],
        points: [
          { label: "Min",  value: Math.round(num(elev.min_m))  },
          { label: "Mean", value: Math.round(num(elev.mean_m)) },
          { label: "Max",  value: Math.round(num(elev.max_m))  },
        ],
      },
    ],
    qualitative: [
      { label: "Risk category",   value: String(raw.risk_category ?? "—"),          tone: riskTone(String(raw.risk_category)) },
      { label: "Terrain",         value: String(elev.terrain_classification ?? "—"), tone: "neutral" },
      { label: "River proximity", value: String(hyd.river_proximity_risk ?? "—"),    tone: riskTone(String(hyd.river_proximity_risk)) },
      { label: "Low-lying index", value: String(llai.primary_risk_category ?? "—"),  tone: riskTone(String(llai.primary_risk_category)) },
    ],
    detailMetrics: [
      {
        group: "Terrain",
        rows: [
          { label: "Mean elevation",  value: num(elev.mean_m).toFixed(1),  unit: "m" },
          { label: "Elevation range", value: num(elev.range_m).toFixed(1), unit: "m" },
          { label: "Mean slope",      value: num(elev.slope_degrees).toFixed(1), unit: "°" },
        ],
      },
      {
        group: "Hydrology",
        rows: [
          { label: "Drainage density",  value: num(hyd.drainage_density).toFixed(2), unit: "km/km²" },
          { label: "Nearest river",     value: riverDist.toFixed(0),                 unit: "m" },
        ],
      },
      {
        group: "History",
        rows: [
          { label: "Historical events", value: String(num(hist.historical_events_count)) },
          { label: "Annual rainfall",   value: num(hist.annual_rainfall_mm).toFixed(0), unit: "mm" },
          { label: "Low-lying area idx", value: num(llai.mean).toFixed(1) },
        ],
      },
    ],
    recommendations: raw.recommendations ?? [],
    loading: false,
    error: null,
  };
}

// ─── Wind — POST /wind/analyze → WindAnalysis ─────────────────────────────────

interface WindAnalysis {
  average_wind_speed: number;
  max_wind_speed: number;
  prevailing_direction: string;
  wind_category: string;
  gust_risk: string;
  seasonal_analysis: { summer: number; monsoon: number; winter: number };
  comfort_analysis: {
    pedestrian_comfort: string;
    natural_ventilation_potential: string;
    outdoor_usability: string;
  };
  building_impact: {
    cross_ventilation_score: number;
    wind_load_risk: string;
    recommended_orientation: string;
  };
  recommendations: string[];
  metadata: { data_source: string };
}

export async function getWindAnalysis(coords: AnalysisCoords): Promise<ModuleResult> {
  const raw = await svcFetch<WindAnalysis>(SVC.wind, "/wind/analyze", {
    method: "POST",
    body: JSON.stringify({ latitude: coords.lat, longitude: coords.lng, radius_meters: coords.bufferM ?? 1000 }),
  });
  const speed = num(raw.average_wind_speed);
  const comfort = raw.comfort_analysis ?? {} as WindAnalysis["comfort_analysis"];
  const impact = raw.building_impact ?? {} as WindAnalysis["building_impact"];
  // Comfort-oriented goodness score — lower sustained wind reads as more buildable.
  const score = clampScore(100 - (speed / 15) * 100);
  return {
    score,
    severity: severityFromScore(score),
    summary: raw.recommendations?.[0] ?? `Prevailing wind ${speed.toFixed(1)} m/s from the ${raw.prevailing_direction}.`,
    data_source: raw.metadata?.data_source ?? "Open-Meteo Archive · ERA5 reanalysis · 10m wind · 5-year daily",
    indicators: [
      { label: "Mean wind speed",       value: speed.toFixed(1),                       unit: "m/s", barFraction: clamp01(speed / 15),              citation: "Open-Meteo ERA5" },
      { label: "Peak gust",             value: num(raw.max_wind_speed).toFixed(1),     unit: "m/s", barFraction: clamp01(num(raw.max_wind_speed) / 25), citation: "IS 875 Part 3: 2015" },
      { label: "Cross-ventilation",     value: num(impact.cross_ventilation_score).toFixed(0), unit: "/100", barFraction: clamp01(num(impact.cross_ventilation_score) / 100), citation: "Ventilation model" },
      { label: "Recommended orientation", value: String(impact.recommended_orientation ?? "—"), unit: "", barFraction: 0.7, citation: "Cross-ventilation model" },
    ],
    chart_data: [],
    charts: [
      {
        title: "Seasonal wind speed", kind: "bar", unit: "m/s",
        series: [{ key: "value", label: "Wind speed", color: COLOR.wind }],
        points: [
          { label: "Summer",  value: num(raw.seasonal_analysis?.summer)  },
          { label: "Monsoon", value: num(raw.seasonal_analysis?.monsoon) },
          { label: "Winter",  value: num(raw.seasonal_analysis?.winter)  },
        ],
      },
    ],
    qualitative: [
      { label: "Wind category",      value: String(raw.wind_category ?? "—"),                tone: riskTone(String(raw.wind_category)) },
      { label: "Gust risk",          value: String(raw.gust_risk ?? "—"),                    tone: riskTone(String(raw.gust_risk)) },
      { label: "Pedestrian comfort", value: String(comfort.pedestrian_comfort ?? "—"),       tone: comfortTone(String(comfort.pedestrian_comfort)) },
      { label: "Natural ventilation", value: String(comfort.natural_ventilation_potential ?? "—"), tone: comfortTone(String(comfort.natural_ventilation_potential)) },
      { label: "Outdoor usability",  value: String(comfort.outdoor_usability ?? "—"),        tone: comfortTone(String(comfort.outdoor_usability)) },
      { label: "Wind-load risk",     value: String(impact.wind_load_risk ?? "—"),            tone: riskTone(String(impact.wind_load_risk)) },
    ],
    detailMetrics: [
      {
        group: "Wind profile",
        rows: [
          { label: "Prevailing direction",  value: String(raw.prevailing_direction ?? "—") },
          { label: "Mean speed",            value: speed.toFixed(1),                   unit: "m/s" },
          { label: "Max gust",              value: num(raw.max_wind_speed).toFixed(1), unit: "m/s" },
          { label: "Cross-ventilation",     value: num(impact.cross_ventilation_score).toFixed(0), unit: "/100" },
        ],
      },
    ],
    recommendations: raw.recommendations ?? [],
    loading: false,
    error: null,
  };
}

// ─── Temperature — GET /weather/thermal-profile → ClimateReport ───────────────
// NOT /weather/climate-archive — that is a raw Open-Meteo proxy requiring a
// `daily=` param and returning unstructured arrays.

interface ClimateReport {
  monthly_data: { month: number; avg_tmax: number; avg_tmin: number }[];
  summary: { annual_avg_temp: number; peak_max_temp: number; lowest_min_temp: number };
  recommendations: {
    material_suggestion: string;
    insulation_strategy: string;
    thermal_comfort_status: string;
    climate_zone: string | null;
    cdd_hdd_ratio: number | null;
  };
}

export async function getTemperatureAnalysis(coords: AnalysisCoords): Promise<ModuleResult> {
  const yearParam = coords.endDate
    ? `&year=${new Date(coords.endDate).getFullYear()}`
    : "";
  const raw = await svcFetch<ClimateReport>(
    SVC.temperature,
    `/weather/thermal-profile?lat=${coords.lat}&lon=${coords.lng}${yearParam}`
  );
  const sum = raw.summary ?? {} as ClimateReport["summary"];
  const rec = raw.recommendations ?? {} as ClimateReport["recommendations"];
  const peak = num(sum.peak_max_temp, 41);
  const months = raw.monthly_data ?? [];
  // Goodness score — moderate peaks read as more comfortable / buildable.
  const score = clampScore(100 - ((peak - 20) / 25) * 100);
  const fallbackSummary = `${rec.thermal_comfort_status ?? "Thermal profile assessed"} — peak ${peak.toFixed(1)} °C.`;
  const rawSummary = rec.material_suggestion ?? fallbackSummary;
  const summary = (rawSummary.length > 120 || /Client Error|Bad Request|http/i.test(rawSummary))
    ? fallbackSummary
    : rawSummary;
  return {
    score,
    severity: severityFromScore(score),
    summary,
    data_source: "IMD gridded normals + Open-Meteo ERA5",
    indicators: [
      { label: "Peak temperature", value: peak.toFixed(1),                          unit: "°C", barFraction: clamp01((peak - 10) / 45),  citation: "IMD Climatological Normals 1991–2020" },
      { label: "Annual mean",      value: num(sum.annual_avg_temp).toFixed(1),      unit: "°C", barFraction: clamp01(num(sum.annual_avg_temp) / 40), citation: "Open-Meteo ERA5 archive" },
      { label: "Winter minimum",   value: num(sum.lowest_min_temp).toFixed(1),      unit: "°C", barFraction: clamp01(num(sum.lowest_min_temp) / 40), citation: "IMD station data" },
    ],
    chart_data: [],
    charts: [
      {
        title: "Monthly temperature range", kind: "multiLine", unit: "°C",
        series: [
          { key: "max", label: "Avg max", color: "#EF4444" },
          { key: "min", label: "Avg min", color: "#F59E0B" },
        ],
        points: months.map((m) => ({
          label: MONTHS[(m.month - 1) % 12] ?? `M${m.month}`,
          max: Math.round(num(m.avg_tmax) * 10) / 10,
          min: Math.round(num(m.avg_tmin) * 10) / 10,
        })),
      },
    ],
    qualitative: [
      { label: "Comfort status", value: String(rec.thermal_comfort_status ?? "—"), tone: comfortTone(String(rec.thermal_comfort_status)) },
      ...(rec.climate_zone ? [{ label: "Climate zone", value: String(rec.climate_zone), tone: "neutral" as QualitativeTone }] : []),
    ],
    detailMetrics: [
      {
        group: "Strategy",
        rows: [
          { label: "Material approach", value: summary },
          { label: "Insulation",        value: rec.insulation_strategy ?? "—" },
        ],
      },
    ],
    recommendations: [summary, rec.insulation_strategy].filter(Boolean) as string[],
    loading: false,
    error: null,
  };
}

// ─── Temperature spatial grid — POST /weather/thermal-grid → GeoJSON ──────────
// Real annual-mean temperature per grid cell over a polygon around the site.
// Source is climate reanalysis (ERA5/IMD, ~25 km native): meaningful gradients
// appear over city/regional extents; a tight site polygon may read near-uniform.

interface ThermalGridResponse {
  features: {
    geometry: { coordinates: number[][][] };
    properties: { annual_avg_temp: number };
  }[];
  min_temp: number;
  max_temp: number;
  year: number;
}

export interface ThermalGridCell {
  ring: [number, number][]; // [lat, lng] ring for Leaflet
  temp: number;
}
export interface ThermalGridData {
  cells: ThermalGridCell[];
  minTemp: number;
  maxTemp: number;
  year: number;
}

export async function getThermalGrid(
  coords: AnalysisCoords,
  halfDeg = 0.02,
  gridSize = 8,
  explicitBounds?: [[number, number], [number, number]], // [[lat,lng],[lat,lng]] diagonal corners
): Promise<ThermalGridData | null> {
  const { lat, lng } = coords;
  let geometry: object;
  if (explicitBounds) {
    const minLat = Math.min(explicitBounds[0][0], explicitBounds[1][0]);
    const maxLat = Math.max(explicitBounds[0][0], explicitBounds[1][0]);
    const minLng = Math.min(explicitBounds[0][1], explicitBounds[1][1]);
    const maxLng = Math.max(explicitBounds[0][1], explicitBounds[1][1]);
    geometry = {
      type: "Polygon",
      coordinates: [[
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ]],
    };
  } else {
    geometry = {
      type: "Polygon",
      coordinates: [[
        [lng - halfDeg, lat - halfDeg],
        [lng + halfDeg, lat - halfDeg],
        [lng + halfDeg, lat + halfDeg],
        [lng - halfDeg, lat + halfDeg],
        [lng - halfDeg, lat - halfDeg],
      ]],
    };
  }
  try {
    const raw = await svcFetch<ThermalGridResponse>(SVC.temperature, "/weather/thermal-grid", {
      method: "POST",
      body: JSON.stringify({ geometry, grid_size: gridSize }),
    });
    const cells: ThermalGridCell[] = (raw.features ?? []).map((f) => ({
      ring: (f.geometry.coordinates[0] ?? []).map(([x, y]) => [y, x] as [number, number]),
      temp: num(f.properties?.annual_avg_temp),
    }));
    return { cells, minTemp: num(raw.min_temp), maxTemp: num(raw.max_temp), year: num(raw.year) };
  } catch {
    return null; // grid optional — overlay falls back to a site marker
  }
}

// ─── Rainfall — POST /rainfall/summary → RainfallSummaryResponse ──────────────

interface RainfallSummaryResponse {
  total_rainfall_mm: number;
  mean_daily_rainfall_mm: number;
  max_daily_rainfall_mm: number;
  rainy_days: number;
  dry_days: number;
  source: string;
}

interface RainfallArchiveResponse {
  daily: { time: string[]; precipitation_sum: number[] };
  source: string;
}

// Fetch the daily archive once; return both 12 month-of-year buckets (mm) and
// the full daily precipitation series for the daily-bar chart.
async function rainfallArchive(coords: AnalysisCoords, start: string, end: string) {
  try {
    const arc = await svcFetch<RainfallArchiveResponse>(
      SVC.rainfall,
      `/rainfall/archive?latitude=${coords.lat}&longitude=${coords.lng}&start_date=${start}&end_date=${end}`
    );
    const buckets = new Array(12).fill(0);
    const times = arc.daily?.time ?? [];
    const vals = arc.daily?.precipitation_sum ?? [];
    const daily: { label: string; value: number }[] = [];
    for (let i = 0; i < times.length; i++) {
      const m = Number(times[i].slice(5, 7)) - 1;
      if (m >= 0 && m < 12) buckets[m] += num(vals[i]);
      daily.push({ label: times[i], value: Math.round(num(vals[i]) * 10) / 10 });
    }
    const monthly = buckets.map((v, i) => ({ label: MONTHS[i], value: Math.round(v) }));
    return { monthly, daily };
  } catch {
    return null; // archive optional — fall back to summary-only charts
  }
}

export async function getRainfallAnalysis(coords: AnalysisCoords): Promise<ModuleResult> {
  const dr = dateRange();
  const start = coords.startDate ?? dr.start;
  const end   = coords.endDate   ?? dr.end;
  const raw = await svcFetch<RainfallSummaryResponse>(SVC.rainfall, "/rainfall/summary", {
    method: "POST",
    body: JSON.stringify({ latitude: coords.lat, longitude: coords.lng, start_date: start, end_date: end }),
  });
  const annual = num(raw.total_rainfall_mm);
  const score = clampScore((annual / 1500) * 100);
  const archive = await rainfallArchive(coords, start, end);

  const charts: ModuleResult["charts"] = [];
  if (archive) {
    charts.push({
      title: "Monthly rainfall", kind: "bar", unit: "mm",
      series: [{ key: "value", label: "Rainfall", color: COLOR.rainfall }],
      points: archive.monthly,
    });
    charts.push({
      title: "Daily precipitation", kind: "dailyBar", unit: "mm",
      series: [{ key: "value", label: "Precipitation", color: COLOR.rainfall }],
      points: archive.daily,
    });
  }
  charts.push({
    title: "Wet vs dry days", kind: "bar", unit: "days",
    series: [{ key: "value", label: "Days", color: "#1D4ED8" }],
    points: [
      { label: "Rainy", value: num(raw.rainy_days) },
      { label: "Dry",   value: num(raw.dry_days)   },
    ],
  });

  return {
    score,
    severity: severityFromScore(score),
    summary: `${annual.toFixed(0)} mm across ${num(raw.rainy_days)} rainy days in the trailing year.`,
    data_source: raw.source ? `CHIRPS / Open-Meteo (${raw.source})` : "CHIRPS Daily (UCSB-CHG) via GEE",
    indicators: [
      { label: "Annual total", value: annual.toFixed(0),                         unit: "mm",   barFraction: clamp01(annual / 2000),                       citation: "CHIRPS / Open-Meteo" },
      { label: "Mean daily",   value: num(raw.mean_daily_rainfall_mm).toFixed(2), unit: "mm",  barFraction: clamp01(num(raw.mean_daily_rainfall_mm) / 20), citation: "Range mean" },
      { label: "Max daily",    value: num(raw.max_daily_rainfall_mm).toFixed(1),  unit: "mm",  barFraction: clamp01(num(raw.max_daily_rainfall_mm) / 200), citation: "Daily precipitation_sum" },
      { label: "Rainy days",   value: num(raw.rainy_days).toFixed(0),             unit: "days", barFraction: clamp01(num(raw.rainy_days) / 366),          citation: "Days with rain > 1 mm" },
    ],
    chart_data: [],
    charts,
    detailMetrics: [
      {
        group: "Totals",
        rows: [
          { label: "Annual total", value: annual.toFixed(0),                          unit: "mm" },
          { label: "Rainy days",   value: String(num(raw.rainy_days)) },
          { label: "Dry days",     value: String(num(raw.dry_days)) },
        ],
      },
    ],
    loading: false,
    error: null,
  };
}

// ─── Sunpath — GET /sunpath/annual → hourly positions ─────────────────────────
// Returns hourly {hour, azimuth, elevation} concatenated for three days in
// order: summer solstice (24), equinox (24), winter solstice (24). Summary
// metrics are derived from the slices.

interface SunpathResponse {
  timezone: string | null;
  hourly_data: { hour: number; azimuth: number; elevation: number }[];
}

interface OrientationResponse {
  optimal_facade_orientation: string;
  optimal_facade_azimuth_deg: number;
  summer_noon_altitude_deg: number;
  winter_noon_altitude_deg: number;
  overhang_projection_factor: number;
  notes: string;
}

function maxElevation(slice: SunpathResponse["hourly_data"]): number {
  return slice.reduce((mx, p) => Math.max(mx, num(p.elevation)), 0);
}

function daylightHours(slice: SunpathResponse["hourly_data"]): number {
  return slice.filter((p) => num(p.elevation) > 0).length;
}

export async function getSunpathAnalysis(coords: AnalysisCoords): Promise<ModuleResult> {
  const [annualSettled, orientSettled] = await Promise.allSettled([
    svcFetch<SunpathResponse>(SVC.sunpath, `/sunpath/annual?lat=${coords.lat}&lon=${coords.lng}`),
    svcFetch<OrientationResponse>(SVC.sunpath, `/sunpath/orientation?lat=${coords.lat}&lon=${coords.lng}`),
  ]);
  const raw = annualSettled.status === "fulfilled" ? annualSettled.value : { hourly_data: [], timezone: null };
  const orient = orientSettled.status === "fulfilled" ? orientSettled.value : null;
  const data = raw.hourly_data ?? [];
  const summer = data.slice(0, 24);
  const winter = data.slice(48, 72);
  const summerAlt = maxElevation(summer);
  const winterAlt = maxElevation(winter);
  const summerDaylight = daylightHours(summer);
  const winterDaylight = daylightHours(winter);
  // Goodness score — strong winter solar access is the binding factor in India.
  const equinox = data.slice(24, 48);
  const score = clampScore((winterAlt / 60) * 100);

  // Elevation-by-hour for all three reference days (daytime hours only).
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const elevPoints = hours
    .map((h) => ({
      label: `${h}h`,
      summer:  Math.round(Math.max(0, num(summer[h]?.elevation))),
      equinox: Math.round(Math.max(0, num(equinox[h]?.elevation))),
      winter:  Math.round(Math.max(0, num(winter[h]?.elevation))),
    }))
    .filter((p) => p.summer > 0 || p.equinox > 0 || p.winter > 0);

  // Build orientation-conditional arrays imperatively — avoids conditional spreads
  // inside typed object literals which can OOM the TypeScript worker in Next.js
  // webpack mode when doing inference on large files.
  const qualitative = [
    { label: "Summer noon", value: `${summerAlt.toFixed(0)}°`, tone: "good" as QualitativeTone },
    { label: "Winter noon", value: `${winterAlt.toFixed(0)}°`, tone: (winterAlt > 40 ? "good" : "warn") as QualitativeTone },
  ];
  const detailMetrics = [{
    group: "Solar geometry",
    rows: [
      { label: "Summer daylight", value: String(summerDaylight), unit: "h" },
      { label: "Winter daylight", value: String(winterDaylight), unit: "h" },
      { label: "Timezone (IANA)", value: String(raw.timezone ?? "—") },
    ],
  }];
  if (orient) {
    const facingLabel = orient.optimal_facade_orientation.charAt(0).toUpperCase() +
      orient.optimal_facade_orientation.slice(1);
    qualitative.push(
      { label: "Optimal facade",  value: `${facingLabel}-facing (${orient.optimal_facade_azimuth_deg.toFixed(0)}°)`, tone: "good" as QualitativeTone },
      { label: "Overhang factor", value: orient.overhang_projection_factor.toFixed(2), tone: "neutral" as QualitativeTone },
    );
    detailMetrics.push({
      group: "Orientation",
      rows: [
        { label: "Optimal facade azimuth", value: orient.optimal_facade_azimuth_deg.toFixed(0), unit: "°" },
        { label: "Overhang projection",    value: orient.overhang_projection_factor.toFixed(2) },
        { label: "Note",                   value: orient.notes },
      ],
    });
  }

  return {
    score,
    severity: severityFromScore(score),
    summary: `Summer noon altitude ${summerAlt.toFixed(1)}°, winter ${winterAlt.toFixed(1)}° — ${winterDaylight} h winter daylight.`,
    data_source: "pvlib (NREL SPA)",
    indicators: [
      { label: "Max solar altitude (Jun)",  value: summerAlt.toFixed(1),        unit: "°", barFraction: clamp01(summerAlt / 90),        citation: "pvlib SPA" },
      { label: "Noon altitude (Dec)",        value: winterAlt.toFixed(1),        unit: "°", barFraction: clamp01(winterAlt / 90),        citation: "pvlib SPA" },
      { label: "Daylight hours (Jun)",       value: summerDaylight.toFixed(0),   unit: "h", barFraction: clamp01(summerDaylight / 14),   citation: "Elevation > 0°" },
      { label: "Daylight hours (Dec)",       value: winterDaylight.toFixed(0),   unit: "h", barFraction: clamp01(winterDaylight / 14),   citation: "Elevation > 0°" },
    ],
    chart_data: [],
    charts: [
      {
        title: "Sun elevation by hour", kind: "multiLine", unit: "° altitude",
        series: [
          { key: "summer",  label: "Jun 21", color: "#F59E0B" },
          { key: "equinox", label: "Equinox", color: "#D97706" },
          { key: "winter",  label: "Dec 21", color: "#92400E" },
        ],
        points: elevPoints,
      },
    ],
    qualitative,
    detailMetrics,
    solar: {
      summer:  summer.map((p)  => ({ hour: num(p.hour), az: num(p.azimuth), el: num(p.elevation) })),
      equinox: equinox.map((p) => ({ hour: num(p.hour), az: num(p.azimuth), el: num(p.elevation) })),
      winter:  winter.map((p)  => ({ hour: num(p.hour), az: num(p.azimuth), el: num(p.elevation) })),
      lat: coords.lat,
      lng: coords.lng,
    },
    loading: false,
    error: null,
  };
}

// ─── Accurate per-date sun path — GET /sunpath/solar-day ─────────────────────
// Drives the 3D sun-path study: exact hourly azimuth/elevation + sun events for
// the selected date and site (pvlib NREL SPA). Gated by feature.sunpath.solar-day.

interface SolarDayRaw {
  latitude: number; longitude: number; date: string; timezone: string;
  hourly_data: { hour: number; azimuth: number; elevation: number }[];
  events: { sunrise: string | null; solar_noon: string | null; sunset: string | null };
  day_length_hours: number | null;
}

export interface SolarDay {
  date: string;
  timezone: string;
  points: import("../stores/analysis").SolarPoint[];
  events: { sunrise: string | null; solar_noon: string | null; sunset: string | null };
  dayLengthHours: number | null;
}

export async function getSolarDay(lat: number, lon: number, date: string): Promise<SolarDay> {
  const d = await svcFetch<SolarDayRaw>(SVC.sunpath, `/sunpath/solar-day?lat=${lat}&lon=${lon}&date=${date}`);
  return {
    date: d.date,
    timezone: d.timezone,
    points: (d.hourly_data ?? []).map((h) => ({ hour: h.hour, az: h.azimuth, el: h.elevation })),
    events: d.events ?? { sunrise: null, solar_noon: null, sunset: null },
    dayLengthHours: d.day_length_hours,
  };
}

// ─── Zone & Land Use — GET /geo/zone ─────────────────────────────────────────

export async function getZoneAnalysis(lat: number, lon: number): Promise<ModuleResult> {
  const d = await svcFetch<Record<string, unknown>>(SVC.zone, `/geo/zone?lat=${lat}&lon=${lon}&radius_m=500`);
  const nearbyFeatures = (d.nearby_features ?? []) as Array<{ value: string; distance_m: number }>;
  const permittedUses = (d.permitted_uses ?? []) as string[];
  const nearbyAll = (d.nearby_features ?? []) as Array<{ type: string; value: string; name?: string; distance_m: number }>;
  const lulcClass = d.lulc_class as string | null | undefined;
  const lulcVintage = d.lulc_vintage as string | null | undefined;
  const naRequired = Boolean(d.na_order_required);
  const forestRequired = Boolean(d.forest_clearance_required);
  const sourceConf = d.source_confidence as string | undefined;

  // LULC-based alerts — the most actionable data on this module
  const lulcQual: import("../stores/analysis").QualitativeStat[] = [];
  if (lulcClass) {
    lulcQual.push({
      label: `Land Cover (ISRO NRSC ${lulcVintage ?? ""})`,
      value: String(lulcClass),
      tone: naRequired || forestRequired ? "warn" : "good",
    });
  }
  if (naRequired) {
    lulcQual.push({
      label: "⚠ NA Order Required",
      value: `Land cover is ${lulcClass ?? "agricultural/grassland"} — Non-Agricultural conversion order from DC/BDA mandatory before any construction. Verify current status with revenue records (RTC/mutation).`,
      tone: "bad",
    });
  }
  if (forestRequired) {
    lulcQual.push({
      label: "⚠ Forest Clearance Required",
      value: `Land cover is ${lulcClass ?? "forest"} — MoEFCC Stage-I and Stage-II clearance required. Confirm boundary with Forest Department.`,
      tone: "bad",
    });
  }
  if (!lulcClass) {
    lulcQual.push({
      label: "Land Cover (ISRO NRSC Bhuvan)",
      value: "Unavailable — Bhuvan WMS did not return data for this location. Zone based on OSM only.",
      tone: "neutral",
    });
  }
  if (lulcVintage) {
    lulcQual.push({
      label: "LULC Data Vintage",
      value: `${lulcVintage} — land cover may have changed since this survey. Verify current status with revenue records before relying on NA order flag.`,
      tone: "warn",
    });
  }

  return {
    score: num(d.score, 50),
    severity: (d.severity ?? "moderate") as ModuleResult["severity"],
    summary: naRequired
      ? `${d.zone_class ?? "Unknown"} zone — ⚠ NA order likely required (LULC: ${lulcClass ?? "agricultural"})`
      : forestRequired
      ? `${d.zone_class ?? "Unknown"} zone — ⚠ Forest clearance required`
      : `${d.zone_class ?? "Unknown"} zone — ${d.primary_landuse ?? "unclassified"}`,
    data_source: String(d.data_source ?? "OpenStreetMap"),
    indicators: [
      { label: "Zone Class", value: String(d.zone_class ?? "—"), unit: "", barFraction: 1, citation: "OSM" },
      { label: "Land Cover (ISRO)", value: lulcClass ? String(lulcClass).split(" (")[0] : "—", unit: "", barFraction: 1, citation: `ISRO NRSC Bhuvan LULC ${lulcVintage ?? ""}` },
      { label: "Base FAR", value: d.base_far != null ? String(d.base_far) : "—", unit: "", barFraction: clamp01(num(d.base_far) / 4), citation: "BDA CDP 2031" },
      { label: "Ground Coverage", value: d.permissible_ground_coverage != null ? `${Math.round(num(d.permissible_ground_coverage) * 100)}%` : "—", unit: "", barFraction: clamp01(num(d.permissible_ground_coverage)), citation: "NBC 2016" },
    ],
    chart_data: nearbyFeatures.map((f) => ({ label: f.value, value: f.distance_m })),
    qualitative: [
      ...lulcQual,
      { label: "Data Confidence", value: sourceConf === "authoritative" ? "Authoritative (BDA RMP-2015)" : "Inferred (OSM/Bhuvan) — UNVERIFIED, confirm the RMP zone (see /geo/zone-resolve)", tone: sourceConf === "authoritative" ? "good" : "warn" },
      { label: "Zone Code", value: String(d.zone_code ?? "Verify locally"), tone: "neutral" },
      {
        label: "⚠ Zone Disclaimer",
        value: "Zone class inferred from OSM — NOT official BDA/BBMP zoning. Obtain CDP 2031 extract before design or investment.",
        tone: "warn",
      },
    ],
    detailMetrics: [
      { group: "Permitted Uses", rows: permittedUses.map((u) => ({ label: u, value: "✓" })) },
      { group: "Nearby Features", rows: nearbyAll.slice(0, 5).map((f) => ({ label: `${f.type}=${f.value}${f.name ? ` (${f.name})` : ""}`, value: `${Math.round(f.distance_m)}m` })) },
    ],
    recommendations: [
      naRequired
        ? `⚠ NA Order: Land cover (ISRO NRSC ${lulcVintage ?? ""}) shows ${lulcClass} — obtain Non-Agricultural conversion order from DC/BDA before construction. Verify with revenue mutation records.`
        : forestRequired
        ? `⚠ Forest clearance: Land cover shows ${lulcClass} — MoEFCC Stage-I and II clearance mandatory.`
        : d.zone_class === "Agricultural"
        ? "Agricultural zone — obtain land use conversion from DC/BDA before any construction."
        : d.zone_class === "Green Belt"
        ? "Green Belt — no permanent structure permitted without High Court clearance."
        : d.zone_class === "Water Body"
        ? "Water Body zone — mandatory buffer applies; consult BBMP Lake Conservation."
        : "Review permitted uses with local BDA/BBMP before design.",
      "Zone classification is inferred from OpenStreetMap and is NOT authoritative. Obtain the official BDA Revised Master Plan / CDP 2031 zoning extract before any development or investment decisions.",
    ],
    loading: false,
    error: null,
  };
}

// ─── Site Capacity — POST /planning/analyze ───────────────────────────────────

export async function getPlanningAnalysis(
  lat: number, lon: number, plotAreaSqm = 1000, zoneClass = "Residential", roadWidthM = 9.0
): Promise<ModuleResult> {
  const d = await svcFetch<Record<string, unknown>>(SVC.planning, "/planning/analyze", {
    method: "POST",
    body: JSON.stringify({ latitude: lat, longitude: lon, plot_area_sqm: plotAreaSqm, zone_class: zoneClass, road_width_m: roadWidthM }),
  });
  const ar = (d.airport_restriction ?? {}) as Record<string, unknown>;
  const openArea = plotAreaSqm - (num(d.buildable_area_sqm) / num(d.far_applicable, 1)) * (1 - num(d.ground_coverage_max));
  const roadWidthSource = d.road_width_source as string | undefined;
  const todApplicable = Boolean(d.tod_applicable);
  const metroInfo = d.metro as Record<string, unknown> | undefined;

  const roadWidthQual: import("../stores/analysis").QualitativeStat[] = [];
  if (roadWidthSource === "default_9m") {
    roadWidthQual.push({
      label: "⚠ Road Width Estimated",
      value: "Road width defaulted to 9m — OSM `width` tag absent. Actual road may be wider, increasing your FAR bracket. Re-run after measuring on-site: a 12m road → FAR 2.0 vs 1.5 for 9m (25% more buildable area).",
      tone: "warn",
    });
  } else if (roadWidthSource === "osm_detected") {
    roadWidthQual.push({ label: "Road Width", value: `Detected from OSM (${num(d.road_width_m).toFixed(1)}m)`, tone: "good" });
  } else if (roadWidthSource === "user_input") {
    roadWidthQual.push({ label: "Road Width", value: `User-provided (${num(d.road_width_m).toFixed(1)}m)`, tone: "good" });
  }

  if (todApplicable) {
    const metroName = metroInfo?.name as string | undefined;
    const metroDist = metroInfo?.distance_m as number | undefined;
    roadWidthQual.push({
      label: "TOD Zone — FAR Boost",
      value: `BDA TOD Notification 2020: FAR 4.0 applicable (within 500m of metro station${metroName ? ` — ${metroName}` : ""}${metroDist != null ? `, ${Math.round(metroDist)}m away` : ""}). Requires BDA approval.`,
      tone: "good",
    });
  }

  return {
    score: num(d.score, 50),
    severity: (d.severity ?? "moderate") as ModuleResult["severity"],
    summary: `FAR ${d.far_applicable}${todApplicable ? " (TOD)" : ""} · ${Number(d.buildable_area_sqm).toLocaleString()} sqm buildable · ${d.max_height_m}m max height${roadWidthSource === "default_9m" ? " ⚠ road width estimated" : ""}`,
    data_source: "NBC 2016 + BDA CDP 2031 + ICAO Annex 14",
    indicators: [
      { label: "FAR", value: String(d.far_applicable ?? "—"), unit: "", barFraction: clamp01(num(d.far_applicable) / 4), citation: todApplicable ? "BDA TOD 2020" : "NBC 2016 Table 15" },
      { label: "Ground Coverage", value: `${Math.round(num(d.ground_coverage_max) * 100)}%`, unit: "", barFraction: clamp01(num(d.ground_coverage_max)), citation: "NBC 2016" },
      { label: "Max Height", value: String(d.max_height_m ?? "—"), unit: "m", barFraction: clamp01(num(d.max_height_m) / 70), citation: String(d.height_limiting_factor ?? "NBC 2016") },
      { label: "Buildable Area", value: `${Number(d.buildable_area_sqm ?? 0).toLocaleString()} sqm`, unit: "", barFraction: clamp01(num(d.buildable_area_sqm) / (plotAreaSqm * 4)), citation: "FAR × plot area" },
    ],
    chart_data: [
      { label: "Buildable Area", value: num(d.buildable_area_sqm) },
      { label: "Open Area", value: Math.max(0, openArea) },
    ],
    qualitative: [
      ...roadWidthQual,
      { label: "FAR Source", value: String(d.far_source ?? "NBC 2016"), tone: "neutral" },
      { label: "Airport", value: `${ar.nearest_airport ?? "—"} (${num(ar.distance_km).toFixed(1)}km)`, tone: ar.dgca_noc_required ? "bad" : "good" },
      { label: "DGCA NOC", value: ar.dgca_noc_required ? "Required — file with AAI before design" : "Not required", tone: ar.dgca_noc_required ? "bad" : "good" },
      { label: "⚠ Disclaimer", value: "FAR is computed from NBC 2016 Table 15 + BDA CDP 2031 rules. These are not a substitute for the official building permit from BDA/BBMP. Always verify with a licensed architect and local authority before investment.", tone: "warn" },
    ],
    detailMetrics: [
      { group: "Setbacks", rows: [{ label: "Front", value: `${d.setback_front_m}m` }, { label: "Rear", value: `${d.setback_rear_m}m` }, { label: "Side", value: `${d.setback_side_m}m` }] },
      { group: "Airport Restriction", rows: [{ label: "Surface", value: String(ar.restriction_surface ?? "—") }, { label: "Max Height", value: ar.max_height_m != null ? `${ar.max_height_m}m` : "No restriction" }] },
    ],
    recommendations: [
      ar.dgca_noc_required ? "DGCA NOC mandatory — file with Airport Authority of India before design finalization." : null,
      roadWidthSource === "default_9m" ? "Road width defaulted to 9m (OSM tag missing). Measure on-site and re-run for accurate FAR — a 12m road increases FAR from 1.5 to 2.0 on a 1000 sqm plot (+500 sqm buildable)." : null,
      todApplicable ? "TOD FAR 4.0 available — confirm BDA TOD approval with local authority before design." : null,
      "Verify FAR and setbacks with local BDA/BBMP before construction permit application.",
    ].filter(Boolean) as string[],
    loading: false,
    error: null,
  };
}

// ─── Road-width resolver — POST /planning/road-width (US-084 feeder) ───────────
// Gated by feature.planning.road-width-resolver. Feed it the distance the user draws
// across the road on the MapTiler measurement overlay (measured_width_m). Renders a
// BAND (or edge-straddling range) + a confidence tier — never a false-authoritative point.

export interface RoadWidthBand { min: number; max: number | null }
export interface RoadWidthResult {
  status: "resolved" | "unresolved";
  value_m: number | null;
  band: RoadWidthBand | null;
  confidence: "authoritative" | "inferred" | "unresolved";
  data_source: string | null;
  data_vintage: string | null;
  error_band_m: number[] | null;
  reg_basis: string[];
  survey_required: boolean;
  band_range: RoadWidthBand[] | null;
  option_value: {
    far_low: number | null; far_high: number | null; far_delta: number | null;
    extra_buildable_sqm: number | null; extra_value: number | null;
    survey_cost: number | null; note: string;
  } | null;
  floor_area_cap: { residential_sqm: number; commercial_sqm: number; reg_basis: string } | null;
  max_far_confidence: "authoritative" | "derived" | "unresolved";
  reason: string | null;
  next_action: string | null;
  notes: string[];
}

export interface RoadWidthInput {
  zone?: string;
  sub_zone?: string | null;
  plot_area_sqm?: number;
  /** distance drawn across the road on the measurement overlay (default tier). */
  measured_width_m?: number;
  /** user-entered surveyed width — the only authoritative tier. */
  surveyed_width_m?: number;
  service_road_widths_m?: number[];
  frontage_roads_m?: number[];
  saleable_value_per_sqm?: number;
  survey_cost?: number;
}

export async function resolveRoadWidth(input: RoadWidthInput): Promise<RoadWidthResult> {
  return svcFetch<RoadWidthResult>(SVC.planning, "/planning/road-width", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Map a RoadWidthResult to visibly-distinct qualitative rows: surveyed=good,
 *  inferred=warn, unresolved=bad, edge-straddle=warn with the survey option value. */
export function roadWidthQualitative(
  r: RoadWidthResult,
): import("../stores/analysis").QualitativeStat[] {
  const out: import("../stores/analysis").QualitativeStat[] = [];
  const bandStr = (b: RoadWidthBand | null) =>
    b ? `${b.min}–${b.max ?? "∞"}m` : "—";

  if (r.status === "unresolved") {
    out.push({
      label: "⚠ Road Width Unresolved",
      value: `${r.reason ?? "No road-width input."} Next: ${r.next_action ?? "measure on the map or enter a surveyed width."}`,
      tone: "bad",
    });
    return out;
  }

  if (r.survey_required && r.band_range) {
    const ov = r.option_value;
    const gain = ov?.extra_value != null
      ? `≈ ₹${ov.extra_value.toLocaleString()} extra saleable value`
      : ov?.extra_buildable_sqm != null
        ? `+${ov.extra_buildable_sqm.toLocaleString()} sqm buildable`
        : "FAR gain PENDING";
    out.push({
      label: "⚠ Survey Required — Band Edge",
      value: `Width ${r.value_m}m straddles two FAR bands (${bandStr(r.band_range[0])} vs ${bandStr(r.band_range[1])}). Surveying resolves ${gain}${ov?.survey_cost != null ? ` vs ₹${ov.survey_cost.toLocaleString()} survey cost` : ""}. Not picking a side.`,
      tone: "warn",
    });
  } else if (r.confidence === "authoritative") {
    out.push({ label: "Road Width (surveyed)", value: `${r.value_m}m → band ${bandStr(r.band)} (authoritative)`, tone: "good" });
  } else if (r.confidence === "inferred") {
    const eb = r.error_band_m ? ` ±${r.error_band_m[0]}–${r.error_band_m[1]}m` : "";
    out.push({ label: "⚠ Road Width (inferred)", value: `${r.value_m}m${eb} → band ${bandStr(r.band)}. ${r.data_source ?? ""} — verify with a survey (an inferred width yields at most a derived FAR).`, tone: "warn" });
  }

  if (r.floor_area_cap) {
    out.push({
      label: "⚠ Narrow Access — Floor-Area Cap",
      value: `Access <3.5m → ${r.floor_area_cap.residential_sqm} sqm residential / ${r.floor_area_cap.commercial_sqm} sqm commercial cap (${r.floor_area_cap.reg_basis}).`,
      tone: "bad",
    });
  }
  return out;
}

// ─── FAR assembly — POST /planning/far (US-084 permissible vs achievable) ─────
// Gated by feature.planning.far-assembly. Always two numbers; achievable <= permissible.

export interface FarValue {
  value: number | null;
  confidence: "authoritative" | "derived" | "inferred" | "unresolved";
  data_source: string | null;
  data_vintage: string | null;
  rule_citation: string;
  notes: string[];
  disclaimer: string;
  modifier_pending?: boolean | null;
  road_width_m?: number | null;
  error_band_m?: number[] | null;
  next_action?: string | null;
}
export interface EntitlementLabel {
  name: string;
  additional_far: number | null;
  status: "applied" | "conditional" | "pending";
  condition: string;
  citation?: string | null;
}
export interface FarBandOption {
  band: RoadWidthBand;
  achievable_base: FarValue;
  achievable_with_entitlements: FarValue;
}
export interface FarAssemblyResult {
  status: "resolved" | "unresolved";
  permissible_far: FarValue | null;
  achievable_base: FarValue | null;
  achievable_with_entitlements: FarValue | null;
  achievable_matrix: { rows: FarBandOption[]; option_value: RoadWidthResult["option_value"] } | null;
  entitlements: EntitlementLabel[];
  ground_coverage: { value: number; rule_citation: string; disclaimer: string } | null;
  setbacks: Record<string, number | string> | null;
  road_width: RoadWidthResult | null;
  invariant_ok: boolean;
  reason: string | null;
  next_action: string | null;
  notes: string[];
  disclaimer: string;
}

export interface FarAssemblyInput extends RoadWidthInput {
  zone_confidence?: "authoritative" | "inferred";
  ring?: "I" | "II" | "III" | null;
  site_dim_m?: number;
  building_height_m?: number;
  additional_far_eligible?: boolean;
  within_metro_150m?: boolean;
  metro_bmrcl_confirmed?: boolean;
}

export async function assembleFar(input: FarAssemblyInput): Promise<FarAssemblyResult> {
  return svcFetch<FarAssemblyResult>(SVC.planning, "/planning/far", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** permissible + TWO-LINE achievable (base / with-entitlements) as distinct lines; each
 *  entitlement tagged with its condition; band-edge matrix; inferred/authoritative/conditional
 *  visibly distinct; citations + sanction disclaimer. */
export function farAssemblyQualitative(
  r: FarAssemblyResult,
): import("../stores/analysis").QualitativeStat[] {
  const out: import("../stores/analysis").QualitativeStat[] = [];
  const tone = (c: FarValue["confidence"]) =>
    c === "authoritative" ? "good" : c === "unresolved" ? "bad" : "warn";
  const far = (v: FarValue) => (v.value == null ? "—" : v.value.toFixed(2));

  if (r.status === "unresolved") {
    out.push({ label: "⚠ FAR Unresolved", value: `${r.reason ?? ""} Next: ${r.next_action ?? "confirm zone + inputs."}`, tone: "bad" });
    return out;
  }

  const p = r.permissible_far;
  if (p) {
    out.push({
      label: `Permissible FAR (${p.confidence})`,
      value: `${far(p)}${p.modifier_pending ? " — upper bound INCOMPLETE (a modifier is PENDING; confirm with authority)" : ""}. ${p.rule_citation}.`,
      tone: p.modifier_pending ? "warn" : tone(p.confidence),
    });
  }

  const eb = (v: FarValue) => (v.error_band_m ? ` (road ±${v.error_band_m[0]}–${v.error_band_m[1]}m)` : "");

  if (r.achievable_matrix) {
    const rows = r.achievable_matrix.rows
      .map((m) => `${m.band.min}–${m.band.max ?? "∞"}m → by-right ${m.achievable_base.value?.toFixed(2)} / with-entitlements ${m.achievable_with_entitlements.value?.toFixed(2)}`)
      .join("  |  ");
    const ov = r.achievable_matrix.option_value;
    out.push({
      label: "⚠ Achievable FAR — Survey Required (band edge)",
      value: `Two candidates, both lines, no side picked: ${rows}. ${ov?.extra_buildable_sqm != null ? `Surveying resolves +${ov.extra_buildable_sqm.toLocaleString()} sqm buildable.` : ""}`,
      tone: "warn",
    });
  } else {
    const b = r.achievable_base;
    if (b) {
      out.push({
        label: `Achievable FAR — by right (${b.confidence})`,
        value: b.value == null
          ? `Unresolved${b.next_action ? ` — ${b.next_action}` : ""}.`
          : `${far(b)}${eb(b)} — after road-band + envelope. ${b.confidence !== "authoritative" ? "Inferred inputs → not authoritative." : ""}`,
        tone: tone(b.confidence),
      });
    }
    const w = r.achievable_with_entitlements;
    if (w && w.value != null && b && w.value !== b.value) {
      out.push({
        label: `Achievable FAR — with entitlements (${w.confidence})`,
        value: `${far(w)}${w.modifier_pending ? " — a qualifying modifier is PENDING (excluded; confirm with authority)" : ""}. Requires the conditions below.`,
        tone: w.modifier_pending ? "warn" : tone(w.confidence),
      });
    }
  }

  for (const e of r.entitlements) {
    out.push({
      label: `${e.status === "applied" ? "Entitlement" : e.status === "conditional" ? "⚠ Conditional entitlement" : "⚠ Pending entitlement"}: ${e.name}${e.additional_far != null ? ` (+${e.additional_far})` : ""}`,
      value: `${e.condition}${e.citation ? ` [${e.citation}]` : ""}`,
      tone: e.status === "applied" ? "neutral" : "warn",
    });
  }

  out.push({ label: "⚠ Disclaimer", value: r.disclaimer, tone: "warn" });
  return out;
}

// ─── Ring + tiered zone resolver — GET /geo/ring, /geo/zone-resolve (US-082) ──
// Gated by feature.geo.zone-resolver. Ring is ALWAYS inferred (OSM-derived). The zone resolver
// tiers RMP (authoritative) > user-confirmed (authoritative-on-attestation, kept DISTINCT) >
// OSM (inferred HINT, unverified) > unresolved. On user confirmation the FAR confidence lifts.

export interface RingResult {
  status: "resolved" | "unresolved";
  ring: "I" | "II" | "III" | null;
  tdr_zone: "A" | "B" | "C" | null;
  confidence: "inferred";
  data_source: string;
  data_vintage: string | null;
  reg_basis: string;
  reason: string | null;
  next_action: string | null;
  notes: string[];
}

export interface ZoneResolution {
  status: "resolved" | "unresolved";
  zone: string | null;
  sub_zone: string | null;
  confidence: "authoritative" | "derived" | "inferred" | "unresolved";
  source: string | null; // "BDA-RMP-2015" | "user-confirmed" | "OSM/Bhuvan (inferred)"
  data_source: string | null;
  data_vintage: string | null;
  unverified: boolean;
  attested: boolean;
  proposed_zone: string | null;
  proposed_sub_zone: string | null;
  reason: string | null;
  next_action: string | null;
  notes: string[];
  far_zone_confidence: "authoritative" | "inferred";
  sub_zone_status: "resolved" | "unresolved";
  sub_zone_reason: string | null;
}

export async function getRing(lat: number, lon: number): Promise<RingResult> {
  return svcFetch<RingResult>(SVC.zone, `/geo/ring?lat=${lat}&lon=${lon}`);
}

export interface ResolveZoneInput {
  lat: number;
  lon: number;
  user_zone?: string;
  user_sub_zone?: string;
  user_attested?: boolean;
  user_confirmed_date?: string;
  include_osm_hint?: boolean;
}

export async function resolveZone(input: ResolveZoneInput): Promise<ZoneResolution> {
  const q = new URLSearchParams({ lat: String(input.lat), lon: String(input.lon) });
  if (input.user_zone) q.set("user_zone", input.user_zone);
  if (input.user_sub_zone) q.set("user_sub_zone", input.user_sub_zone);
  if (input.user_attested != null) q.set("user_attested", String(input.user_attested));
  if (input.user_confirmed_date) q.set("user_confirmed_date", input.user_confirmed_date);
  if (input.include_osm_hint != null) q.set("include_osm_hint", String(input.include_osm_hint));
  return svcFetch<ZoneResolution>(SVC.zone, `/geo/zone-resolve?${q.toString()}`);
}

/** The three zone provenance badges the UI must render VISIBLY DISTINCT — an RMP read, a
 *  user-attested zone, and an unverified OSM hint must never look identical. */
export type ZoneBadge = "rmp-authoritative" | "user-confirmed" | "osm-unverified" | "unresolved";

export function zoneBadge(z: ZoneResolution): ZoneBadge {
  if (z.status === "unresolved") return "unresolved";
  if (z.source === "BDA-RMP-2015") return "rmp-authoritative";
  if (z.source === "user-confirmed") return "user-confirmed";
  return "osm-unverified";
}

/** Deep-links for the confirm-your-zone interaction: the official land-use + khata + DC-conversion
 *  routes a builder uses to verify (or convert) the parcel's zone. */
export function zoneVerificationLinks(): Array<{ label: string; href: string; note: string }> {
  return [
    { label: "BDA / GBA land-use (RMP-2015 district map)", href: "https://bdabangalore.org/",
      note: "Confirm the official RMP land-use zone + sub-zone for the parcel." },
    { label: "Khata — e-Aasthi (urban, BBMP/GBA)", href: "https://eaasthi.karnataka.gov.in/",
      note: "Verify the property record / khata for urban parcels." },
    { label: "Khata — e-Swathu (rural / gram panchayat)", href: "https://eswathu.karnataka.gov.in/",
      note: "Verify the property record for rural / GP parcels." },
    { label: "DC land conversion (Bhoomi / revenue)", href: "https://landrecords.karnataka.gov.in/",
      note: "For agricultural land, confirm / apply for NA (non-agricultural) conversion." },
  ];
}

/** The display model for the confirm-your-zone card: the badge, whether it is unverified, the
 *  headline confidence, the OSM hint to confirm/correct, and the FAR confidence it will drive.
 *  Pure — the React component renders this; no backend behaviour changes. */
export function zoneConfirmationView(z: ZoneResolution): {
  badge: ZoneBadge;
  tone: QualitativeTone;
  headline: string;
  unverified: boolean;
  proposedZone: string | null;
  farConfidence: "authoritative" | "inferred";
  subZoneNeeded: boolean;
  action: string | null;
  links: Array<{ label: string; href: string; note: string }>;
} {
  const badge = zoneBadge(z);
  const tone: QualitativeTone =
    badge === "rmp-authoritative" ? "good"
    : badge === "user-confirmed" ? "good"
    : badge === "osm-unverified" ? "warn"
    : "bad";
  const headline =
    badge === "rmp-authoritative" ? `${z.zone ?? "—"} — authoritative (BDA RMP-2015)`
    : badge === "user-confirmed" ? `${z.zone ?? "—"} — user-confirmed (attested; not an RMP read)`
    : badge === "osm-unverified" ? `${z.zone ?? "—"} — UNVERIFIED OSM hint, confirm before relying`
    : "Zone unresolved — confirm before any FAR";
  return {
    badge,
    tone,
    headline,
    unverified: z.unverified,
    proposedZone: z.proposed_zone,
    farConfidence: z.far_zone_confidence,
    subZoneNeeded: z.sub_zone_status === "unresolved",
    action: z.next_action,
    links: zoneVerificationLinks(),
  };
}

/** Close the loop into FAR: an inferred/unverified zone caps FAR confidence at inferred; only an
 *  RMP or attested user zone lifts it to authoritative (the US-088 anti-laundering contract). */
export function farInputFromZone(
  z: ZoneResolution, ring: RingResult | null,
): Pick<FarAssemblyInput, "zone" | "sub_zone" | "zone_confidence" | "ring"> {
  return {
    zone: z.zone ?? undefined,
    sub_zone: z.sub_zone ?? undefined,
    zone_confidence: z.far_zone_confidence,
    ring: ring?.ring ?? null,
  };
}

// ─── Terrain — POST /flood/terrain (US-089 slope/HAND/cut-fill/geotech) ───────
// Gated by feature.flood.terrain. Slope is DEM-derived (GLO-30, inferred); nodata>20% ->
// unresolved (never a fake 0.0). Bearing capacity is authoritative ONLY from a manual geotech
// value, never inferred from soil type.

export interface SlopeResult {
  status: "resolved" | "unresolved";
  confidence: "authoritative" | "inferred" | "unresolved";
  slope_pct_mean: number | null; slope_pct_max: number | null; slope_deg_mean: number | null;
  nodata_pct: number | null; dem_source: string | null; crs: string | null;
  reason: string | null; next_action: string | null;
}
export interface CutFillResult {
  status: "resolved" | "unresolved"; confidence: string;
  target_pad_m: number | null; target_source: string | null;
  cut_m3: number | null; fill_m3: number | null; net_m3: number | null;
  cell_area_m2: number | null; reason: string | null; next_action: string | null;
}
export interface BearingCapacityResult {
  status: "resolved" | "unresolved";
  confidence: "authoritative" | "inferred" | "unresolved";
  value_kpa: number | null; method: string | null; source: string | null;
  reason: string | null; next_action: string | null;
}
export interface TerrainResult {
  status: "resolved" | "unresolved";
  slope: SlopeResult;
  hand: { status: string; confidence: string; hand_m_mean: number | null; hand_m_max: number | null; drainage_elev_m: number | null; method_note: string | null; reason: string | null; next_action: string | null };
  cut_fill: CutFillResult;
  bearing_capacity: BearingCapacityResult;
  dem_source: string;
  notes: string[];
  data_disclaimer: string;
}
export interface TerrainInput {
  parcel_geojson: Record<string, unknown>;   // GeoJSON Polygon (WGS84)
  target_pad_m?: number;
  bearing_capacity_kpa?: number;
  geotech_method?: string;
  geotech_source?: string;
}

export async function getTerrain(input: TerrainInput): Promise<TerrainResult> {
  return svcFetch<TerrainResult>(SVC.flood, "/flood/terrain", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Terrain display rows — slope/HAND/cut-fill/bearing, each showing resolved vs unresolved
 *  honestly (an unresolved slope is a warning, NOT a 0.0). */
export function terrainQualitative(r: TerrainResult): import("../stores/analysis").QualitativeStat[] {
  const out: import("../stores/analysis").QualitativeStat[] = [];
  const s = r.slope;
  out.push(s.status === "resolved"
    ? { label: "Slope (GLO-30 DEM)", value: `${s.slope_pct_mean}% mean / ${s.slope_pct_max}% max (${s.slope_deg_mean}°). Inferred — verify vs surveyed contours.`, tone: "warn" }
    : { label: "⚠ Slope Unresolved", value: `${s.reason ?? ""} Next: ${s.next_action ?? "supply a surveyed slope."}`, tone: "bad" });
  if (r.hand.status === "resolved")
    out.push({ label: "HAND (parcel-window approx)", value: `${r.hand.hand_m_mean} m mean above drainage. ${r.hand.method_note ?? ""}`, tone: "neutral" });
  const cf = r.cut_fill;
  if (cf.status === "resolved")
    out.push({ label: "Cut / Fill", value: `cut ${cf.cut_m3} m³, fill ${cf.fill_m3} m³ (net ${cf.net_m3} m³) vs ${cf.target_source}.`, tone: "neutral" });
  const b = r.bearing_capacity;
  out.push(b.status === "resolved"
    ? { label: "Bearing Capacity (geotech)", value: `${b.value_kpa} kPa — ${b.method} (${b.source}). Authoritative.`, tone: "good" }
    : { label: "⚠ Bearing Capacity Unresolved", value: `${b.reason ?? ""} Next: ${b.next_action ?? "supply a geotechnical report."}`, tone: "warn" });
  out.push({ label: "⚠ Disclaimer", value: r.data_disclaimer, tone: "warn" });
  return out;
}

// ─── Deal-killer overlays — GET /geo/overlays (US-088) ────────────────────────
// Gated by feature.geo.overlays. CARDINAL RULE: `unresolved` is NOT clear — it renders
// distinct from green. Any RED → hard NO-GO; any unresolved → blocks a clean GO.

export type OverlayStatus = "R" | "A" | "G" | "unresolved";
export interface OverlayProvenance {
  source: string;
  confidence: "authoritative" | "inferred" | "unresolved";
  vintage: string | null;
}
export interface OverlayItem {
  name: string;
  status: OverlayStatus;
  distance_m: number | null;
  buffer_m: number | null;
  buffer_range_m: number[] | null;
  reference_point: "centre" | "periphery" | null;
  rule_citation: string | null;
  effective_date: string | null;
  litigation_status: string | null;
  as_of: string;
  provenance: OverlayProvenance;
  reason: string | null;
  next_action: string | null;
  crs: string;
}
export interface OverlayVerdict {
  hard_no_go: boolean;
  blocks_clean_go: boolean;
  red_overlays: string[];
  unresolved_overlays: string[];
}
export interface OverlayNocChecklistItem {
  name: string;
  authority: string;
  requirement: string;
  rule_citation: string;
  typical_validity: string | null;
  deep_link: string | null;
  reclass_reason: string;
  mandatory: boolean;
}

export interface OverlayResult {
  lat: number;
  lon: number;
  crs: string;
  overlays: OverlayItem[];
  verdict: OverlayVerdict;
  live_overlays: string[];
  pending_overlays: string[];
  // US-087: obligations with no obtainable public geometry (gas, HT-distribution) — surfaced but
  // NOT scored and NOT verdict blockers.
  noc_checklist: OverlayNocChecklistItem[];
  data_disclaimer: string;
}

export async function getOverlays(
  lat: number, lon: number, buildingHeightM?: number,
): Promise<OverlayResult> {
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (buildingHeightM != null) q.set("building_height_m", String(buildingHeightM));
  return svcFetch<OverlayResult>(SVC.zone, `/geo/overlays?${q.toString()}`);
}

/** Map overlays to visibly-distinct rows. RED=bad, unresolved=warn (NEVER good — it is
 *  explicitly NOT a clear), AMBER=warn, GREEN=good. The verdict banner leads. */
export function overlaysQualitative(
  r: OverlayResult,
): import("../stores/analysis").QualitativeStat[] {
  const out: import("../stores/analysis").QualitativeStat[] = [];

  // Verdict banner — the deal-killer summary first.
  if (r.verdict.hard_no_go) {
    out.push({
      label: "⛔ NO-GO — deal-killer overlay",
      value: `RED: ${r.verdict.red_overlays.join(", ")}. A red overlay is a hard NO-GO.`,
      tone: "bad",
    });
  }
  if (r.verdict.blocks_clean_go) {
    out.push({
      label: "⚠ Cannot clear — data unavailable",
      value: `UNRESOLVED (not clear — absence of data is NOT absence of hazard): ${r.verdict.unresolved_overlays.join(", ")}. Blocks a clean GO until each layer is verified.`,
      tone: "warn",
    });
  }
  if (!r.verdict.hard_no_go && !r.verdict.blocks_clean_go) {
    out.push({ label: "Overlays clear", value: "No red or unresolved overlay.", tone: "good" });
  }

  const km = (m: number | null) => (m == null ? "—" : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
  const bufStr = (o: OverlayItem) =>
    o.buffer_range_m ? `${o.buffer_range_m[0]}–${o.buffer_range_m[1]} m (${o.buffer_m} m governs${o.litigation_status ? `, ${o.litigation_status}` : ""})`
                     : o.buffer_m != null ? `${o.buffer_m} m` : "—";

  for (const o of r.overlays) {
    if (o.status === "unresolved") {
      out.push({
        label: `⚠ ${o.name} — UNRESOLVED`,
        value: `${o.reason ?? "No clearing layer."} Next: ${o.next_action ?? "verify on site."} (buffer ${bufStr(o)} from ${o.reference_point ?? "?"})`,
        tone: "warn",
      });
    } else if (o.status === "R") {
      out.push({
        label: `⛔ ${o.name} — INSIDE BUFFER`,
        value: `${km(o.distance_m)} away · strictest buffer ${bufStr(o)} from ${o.reference_point ?? "?"} · ${o.rule_citation ?? ""} [EPSG:32643, as of ${o.as_of}]`,
        tone: "bad",
      });
    } else if (o.status === "A") {
      out.push({
        label: `⚠ ${o.name} — restricted`,
        value: `${km(o.distance_m)} away · ${o.rule_citation ?? ""} · buffer ${bufStr(o)}. ${o.reason ?? ""} ${o.next_action ?? ""}`.trim(),
        tone: "warn",
      });
    } else {
      out.push({
        label: `${o.name} — clear`,
        value: `${km(o.distance_m)} away (> ${o.buffer_m} m buffer, ${o.provenance.confidence}) · ${o.rule_citation ?? ""}`,
        tone: "good",
      });
    }
  }

  out.push({ label: "⚠ Disclaimer", value: r.data_disclaimer, tone: "warn" });
  return out;
}

// ─── Zoning — unified zone + planning synthesis ───────────────────────────────

export async function getZoningAnalysis(
  lat: number, lon: number, plotAreaSqm = 1000
): Promise<ModuleResult> {
  // Zone first — its detected class drives the correct NBC FAR / coverage / height
  // bracket in planning (otherwise every site reports the Residential defaults).
  // road_width_m omitted so planning auto-detects and honestly reports default_9m.
  // Overpass can be rate-limited (502) or slow — fall back to Unknown rather than
  // blocking the entire module.
  let z: Record<string, unknown> = {};
  try {
    z = await svcFetch<Record<string, unknown>>(SVC.zone, `/geo/zone?lat=${lat}&lon=${lon}&radius_m=500`);
  } catch {
    z = { zone_class: "Unknown", score: 50, severity: "moderate", source_confidence: "unavailable" };
  }
  const detectedZone = String(z.zone_class ?? "Residential");
  // Planning only models the 5 buildable NBC zones; non-buildable zones
  // (Agricultural/Green Belt/Water Body/Restricted/Unknown) fall back to a
  // Residential baseline — the zone chip + NA/forest alerts convey the real status.
  const BUILDABLE_ZONES = new Set(["Residential", "Commercial", "Industrial", "Mixed Use", "Institutional"]);
  const planningZone = BUILDABLE_ZONES.has(detectedZone) ? detectedZone : "Residential";
  const p = await svcFetch<Record<string, unknown>>(SVC.planning, "/planning/analyze", {
    method: "POST",
    body: JSON.stringify({ latitude: lat, longitude: lon, plot_area_sqm: plotAreaSqm, zone_class: planningZone }),
  });

  // ── Zone fields ──────────────────────────────────────────────
  const lulcClass   = z.lulc_class as string | null | undefined;
  const lulcVintage = z.lulc_vintage as string | null | undefined;
  const naRequired  = Boolean(z.na_order_required);
  const forestReq   = Boolean(z.forest_clearance_required);
  const srcConf     = z.source_confidence as string | undefined;
  const zoneScore   = num(z.score, 50);
  const kgisRaw     = (z.kgis ?? null) as Record<string, unknown> | null;

  // ── Planning fields ──────────────────────────────────────────
  const ar               = (p.airport_restriction ?? {}) as Record<string, unknown>;
  const roadWidthSource  = p.road_width_source as string | undefined;
  const todApplicable    = Boolean(p.tod_applicable);
  // Planning returns metro fields at the TOP level (not nested under `p.metro`).
  const metroInfo        = { name: p.metro_station_name, distance_m: p.metro_distance_m } as Record<string, unknown>;
  const farApplicable    = num(p.far_applicable, 1.5);
  const buildableArea    = num(p.buildable_area_sqm, plotAreaSqm * 1.5);
  const maxHeightM       = num(p.max_height_m, 15);
  const gcMax            = num(p.ground_coverage_max, 0.5);
  const planningScore    = num(p.score, 50);

  // ── Composite score ──────────────────────────────────────────
  // Zone 40% + Planning 60%; NA order or forest → cap at high risk
  let rawScore = 0.4 * zoneScore + 0.6 * planningScore;
  if (naRequired || forestReq) rawScore = Math.min(rawScore, 35);

  const zSeverity = (z.severity ?? "moderate") as "low" | "moderate" | "high" | "none";
  const pSeverity = (p.severity ?? "moderate") as "low" | "moderate" | "high" | "none";
  const SEV_RANK: Record<string, number> = { none: 0, low: 1, moderate: 2, high: 3 };
  const worstSev = SEV_RANK[zSeverity] >= SEV_RANK[pSeverity] ? zSeverity : pSeverity;
  const severity = (naRequired || forestReq) ? "high" : worstSev;

  // ── Summary ──────────────────────────────────────────────────
  const summaryParts: string[] = [];
  if (naRequired)   summaryParts.push("⚠ NA order required");
  if (forestReq)    summaryParts.push("⚠ Forest clearance required");
  if (ar.dgca_noc_required) summaryParts.push("⚠ DGCA NOC required");
  summaryParts.push(`${z.zone_class ?? "Unknown"} zone`);
  summaryParts.push(`FAR ${todApplicable ? `${farApplicable} (TOD)` : farApplicable}`);
  summaryParts.push(`${Number(buildableArea).toLocaleString()} sqm buildable`);
  if (roadWidthSource === "default_9m") summaryParts.push("road width estimated");

  // ── Qualitative alerts ───────────────────────────────────────
  const qualStats: import("../stores/analysis").QualitativeStat[] = [];

  // Critical blockers (bad) — rendered as red alert banners
  if (naRequired) {
    qualStats.push({
      label: "⚠ NA Order Required",
      value: `Land cover is ${lulcClass ?? "agricultural/grassland"} (ISRO NRSC LULC ${lulcVintage ?? ""}). Non-Agricultural conversion order from DC/BDA is mandatory before any construction. Verify current land conversion status with revenue records (RTC/mutation) — LULC data may be up to 3 years old.`,
      tone: "bad",
    });
  }
  if (forestReq) {
    qualStats.push({
      label: "⚠ Forest Clearance Required",
      value: `Land cover is ${lulcClass ?? "forest"} (ISRO NRSC LULC ${lulcVintage ?? ""}). MoEFCC Stage-I and Stage-II forest clearance mandatory before any development. Confirm boundary with Forest Department before investment.`,
      tone: "bad",
    });
  }
  if (ar.dgca_noc_required) {
    qualStats.push({
      label: "⚠ DGCA NOC Required",
      value: `Site is within ${ar.nearest_airport ?? "an airport"}'s Obstacle Limitation Surface (OLS). Max height restricted to ${ar.max_height_m != null ? `${ar.max_height_m}m` : "a restricted value"}. File NOC with Airport Authority of India before design finalisation.`,
      tone: "bad",
    });
  }

  // Important warnings (warn) — amber banner if long
  if (roadWidthSource === "default_9m") {
    qualStats.push({
      label: "⚠ Road Width Estimated at 9m",
      value: `OSM road width tag absent — FAR defaulted to ${farApplicable} using 9m road bracket. Actual road may be wider: a 12m road → FAR 2.0, adding ~${Math.round((2.0 - farApplicable) * plotAreaSqm)} sqm buildable area. Measure on-site and re-run for accurate FAR.`,
      tone: "warn",
    });
  }
  if (lulcVintage) {
    qualStats.push({
      label: `LULC Data: ISRO NRSC ${lulcVintage}`,
      value: `Land cover from ${lulcVintage} survey — up to ${new Date().getFullYear() - parseInt(lulcVintage.split("-")[0])} years old. Verify current use with Bhoomi/RTC before relying on NA order flag.`,
      tone: "warn",
    });
  }

  // Positive signals
  if (todApplicable) {
    const metroName = metroInfo?.name as string | undefined;
    const metroDist = metroInfo?.distance_m as number | undefined;
    qualStats.push({
      label: "TOD Zone — FAR 4.0 Available",
      value: `BDA TOD Notification 2020: site within 500m of ${metroName ?? "metro station"}${metroDist != null ? ` (${Math.round(metroDist)}m)` : ""}. FAR up to 4.0 with BDA approval — significant development uplift.`,
      tone: "good",
    });
  }
  if (!naRequired && !forestReq && srcConf === "authoritative") {
    qualStats.push({
      label: "Land Cover Confirmed",
      value: `ISRO NRSC Bhuvan LULC ${lulcVintage ?? ""} shows ${lulcClass ?? "built-up/residential"} — NA order unlikely required. Verify with Bhoomi RTC before purchase.`,
      tone: "good",
    });
  }

  // Informational chips
  qualStats.push({ label: "Zone Class",       value: String(z.zone_class ?? "—"),       tone: "neutral" });
  qualStats.push({ label: "FAR",              value: String(farApplicable),              tone: "neutral" });
  qualStats.push({ label: "Data Confidence",  value: srcConf === "authoritative" ? "ISRO NRSC + OSM" : "OSM only", tone: srcConf === "authoritative" ? "good" : "warn" });
  if (!naRequired && !forestReq && lulcClass) {
    qualStats.push({ label: "Land Cover",     value: String(lulcClass),                  tone: "neutral" });
  }

  // ── Indicators with bars ─────────────────────────────────────
  const indicators = [
    { label: "FAR",            value: String(farApplicable),                                    unit: "",    barFraction: clamp01(farApplicable / 4),        citation: todApplicable ? "BDA TOD 2020" : "NBC 2016 Table 15" },
    { label: "Max Height",     value: String(maxHeightM),                                       unit: "m",   barFraction: clamp01(maxHeightM / 70),           citation: String(p.height_limiting_factor ?? "NBC 2016") },
    { label: "Ground Coverage",value: `${Math.round(gcMax * 100)}%`,                            unit: "",    barFraction: clamp01(gcMax),                     citation: "NBC 2016" },
    { label: "Buildable Area", value: `${Number(buildableArea).toLocaleString()} sqm`,          unit: "",    barFraction: clamp01(buildableArea / (plotAreaSqm * 4)), citation: "FAR × plot area" },
  ];

  // ── Detail metrics ───────────────────────────────────────────
  const permittedUses = (z.permitted_uses ?? []) as string[];
  const nearbyAll     = (z.nearby_features ?? []) as Array<{ type: string; value: string; name?: string; distance_m: number; lat?: number; lon?: number }>;

  // ── Structured sub-object for the floating HUD visuals ───────
  const olsHeightM = ar.max_height_m != null ? num(ar.max_height_m) : null;
  const context: import("../stores/analysis").ZoningContextItem[] = [];
  for (const f of nearbyAll) {
    context.push({ label: f.name || f.value, category: f.type, distanceM: f.distance_m, lat: f.lat, lon: f.lon });
  }
  if (ar.distance_km != null) {
    context.push({
      label: String(ar.nearest_airport ?? "Airport"), category: "airport", distanceM: num(ar.distance_km) * 1000,
      lat: ar.lat != null ? num(ar.lat) : undefined, lon: ar.lon != null ? num(ar.lon) : undefined,
    });
  }
  if (metroInfo?.distance_m != null) {
    context.push({
      label: String(metroInfo?.name ?? "Metro"), category: "metro", distanceM: num(metroInfo?.distance_m),
      lat: p.metro_lat != null ? num(p.metro_lat) : undefined, lon: p.metro_lon != null ? num(p.metro_lon) : undefined,
    });
  }

  const zoning: import("../stores/analysis").ZoningData = {
    siteLat: lat,
    siteLon: lon,
    zoneClass: String(z.zone_class ?? "Unknown"),
    zoneIsBuildable: BUILDABLE_ZONES.has(detectedZone),
    zoneCode: (z.zone_code as string | null) ?? null,
    primaryLanduse: String(z.primary_landuse ?? "unclassified"),
    permittedUses,
    lulcClass: lulcClass ?? null,
    lulcVintage: lulcVintage ?? null,
    sourceConfidence: srcConf ?? "community",
    zoneAuthority: (z.zone_authority as string | null) ?? null,
    naRequired,
    forestRequired: forestReq,
    dgcaNocRequired: Boolean(ar.dgca_noc_required),
    roadWidthSource: roadWidthSource ?? "default_9m",
    roadWidthM: num(p.road_width_used_m, 9),
    farApplicable,
    baseFar: z.base_far != null ? num(z.base_far) : null,
    todApplicable,
    todFarMax: 4.0,
    buildableAreaSqm: buildableArea,
    plotAreaSqm,
    groundCoverageMax: gcMax,
    maxHeightM,
    heightLimitingFactor: String(p.height_limiting_factor ?? "NBC 2016"),
    olsHeightM,
    setbackFrontM: p.setback_front_m != null ? num(p.setback_front_m) : null,
    setbackRearM: p.setback_rear_m != null ? num(p.setback_rear_m) : null,
    setbackSideM: p.setback_side_m != null ? num(p.setback_side_m) : null,
    airportName: String(ar.nearest_airport ?? "—"),
    airportDistanceKm: num(ar.distance_km),
    airportSurface: String(ar.restriction_surface ?? "—"),
    airportLat: ar.lat != null ? num(ar.lat) : null,
    airportLon: ar.lon != null ? num(ar.lon) : null,
    metroName: (metroInfo?.name as string | undefined) ?? null,
    metroDistanceM: metroInfo?.distance_m != null ? num(metroInfo?.distance_m) : null,
    metroLat: p.metro_lat != null ? num(p.metro_lat) : null,
    metroLon: p.metro_lon != null ? num(p.metro_lon) : null,
    context,
    kgis: kgisRaw
      ? {
          type: (kgisRaw.type as string) ?? null,
          district: (kgisRaw.district as string) ?? null,
          town: (kgisRaw.town as string) ?? null,
          adminZone: (kgisRaw.admin_zone as string) ?? null,
          ward: (kgisRaw.ward as string) ?? null,
          taluk: (kgisRaw.taluk as string) ?? null,
          hobli: (kgisRaw.hobli as string) ?? null,
          village: (kgisRaw.village as string) ?? null,
          villageCode: (kgisRaw.village_code as string) ?? null,
          surveyNumber: (kgisRaw.survey_number as string) ?? null,
        }
      : null,
    score: Math.round(rawScore),
    severity,
  };

  return {
    score:    Math.round(rawScore),
    severity,
    summary:  summaryParts.join(" · "),
    data_source: "ISRO NRSC Bhuvan LULC + OSM Overpass + NBC 2016 + BDA CDP 2031 + ICAO Annex 14",
    indicators,
    chart_data: [
      { label: "Buildable Area", value: buildableArea },
      { label: "Open/Setback Area", value: Math.max(0, plotAreaSqm - buildableArea / (farApplicable || 1) * gcMax) },
    ],
    qualitative: qualStats,
    detailMetrics: [
      {
        group: "Land Use & Compliance",
        rows: [
          { label: "Zone Class",                 value: String(z.zone_class ?? "—") },
          { label: "Zone Code",                  value: String(z.zone_code ?? "Verify locally") },
          { label: "LULC Land Cover",            value: lulcClass ? `${lulcClass} (${lulcVintage ?? "—"})` : "Unavailable" },
          { label: "NA Order Required",          value: naRequired ? "YES — obtain from DC/BDA" : "Not indicated" },
          { label: "Forest Clearance Required",  value: forestReq ? "YES — MoEFCC mandatory" : "Not indicated" },
          { label: "Source Confidence",          value: srcConf === "authoritative" ? "Authoritative (ISRO + OSM)" : "Community (OSM only)" },
        ],
      },
      {
        group: "Site Capacity",
        rows: [
          { label: "FAR",                    value: `${farApplicable}${todApplicable ? " (TOD 4.0 available)" : ""}` },
          { label: "Max Height",             value: `${maxHeightM}m (${String(p.height_limiting_factor ?? "NBC 2016")})` },
          { label: "Ground Coverage",        value: `${Math.round(gcMax * 100)}%` },
          { label: "Front Setback",          value: p.setback_front_m != null ? `${p.setback_front_m}m` : "—" },
          { label: "Rear Setback",           value: p.setback_rear_m  != null ? `${p.setback_rear_m}m`  : "—" },
          { label: "Side Setback",           value: p.setback_side_m  != null ? `${p.setback_side_m}m`  : "—" },
          { label: "Road Width Source",      value: roadWidthSource === "default_9m" ? "Estimated 9m (OSM tag absent)" : roadWidthSource === "osm_detected" ? `OSM detected (${num(p.road_width_used_m).toFixed(1)}m)` : `User input (${num(p.road_width_used_m).toFixed(1)}m)` },
        ],
      },
      {
        group: "Airport Restriction",
        rows: [
          { label: "Nearest Airport",   value: `${ar.nearest_airport ?? "—"} (${num(ar.distance_km).toFixed(1)} km)` },
          { label: "DGCA NOC",          value: ar.dgca_noc_required ? "Required — file with AAI" : "Not required" },
          { label: "OLS Surface",       value: String(ar.restriction_surface ?? "—") },
          { label: "Height Limit (OLS)", value: ar.max_height_m != null ? `${ar.max_height_m}m` : "No restriction" },
        ],
      },
      ...(permittedUses.length > 0 ? [{
        group: "Permitted Uses",
        rows: permittedUses.map((u) => ({ label: u, value: "✓" })),
      }] : []),
      ...(nearbyAll.length > 0 ? [{
        group: "Nearby Land Features",
        rows: nearbyAll.slice(0, 5).map((f) => ({
          label: `${f.type}=${f.value}${f.name ? ` (${f.name})` : ""}`,
          value: `${Math.round(f.distance_m)}m`,
        })),
      }] : []),
    ],
    recommendations: [
      naRequired
        ? `⚠ NA Order: LULC ${lulcVintage ?? ""} shows ${lulcClass} — obtain Non-Agricultural conversion order from DC/BDA before any construction. Verify with Bhoomi RTC.`
        : forestReq
        ? `⚠ Forest clearance mandatory (LULC shows ${lulcClass}) — MoEFCC Stage-I and II clearance required.`
        : null,
      ar.dgca_noc_required
        ? "DGCA NOC mandatory — file with Airport Authority of India before design finalisation."
        : null,
      roadWidthSource === "default_9m"
        ? `Road width defaulted to 9m (OSM tag absent). Measure on-site and re-run — a 12m road adds ~${Math.round((2.0 - Math.min(farApplicable, 2.0)) * plotAreaSqm)} sqm buildable area.`
        : null,
      todApplicable
        ? "TOD FAR 4.0 available — confirm BDA TOD approval with local authority before design."
        : null,
      "Verify zone class and FAR with BDA/BBMP before construction permit. This tool does not replace the official BDA CDP 2031 zoning extract.",
    ].filter(Boolean) as string[],
    zoning,
    loading: false,
    error: null,
  };
}

// ─── Connectivity — POST /infrastructure/analyze ──────────────────────────────

export async function getInfraAnalysis(lat: number, lon: number): Promise<ModuleResult> {
  const d = await svcFetch<Record<string, unknown>>(SVC.infrastructure, "/infrastructure/analyze", {
    method: "POST",
    body: JSON.stringify({ latitude: lat, longitude: lon, radius_m: 2000 }),
  });
  const road = (d.road_access ?? {}) as Record<string, unknown>;
  const transit = (d.transit ?? []) as Array<{ type: string; name?: string; distance_m: number; line?: string }>;
  const utils = (d.utilities ?? {}) as Record<string, unknown>;
  const subScores = (d.sub_scores ?? {}) as Record<string, number>;
  const nearest = transit.length > 0 ? transit.reduce((lo, t) => t.distance_m < lo.distance_m ? t : lo) : null;
  const nearestTransitDist = nearest?.distance_m ?? 9999;
  const roadDist = num(road.nearest_road_m);

  // Road surface quality note
  const surface = road.road_surface as string | undefined;
  const paved = surface && ["paved", "asphalt", "concrete", "tarmac", "tar", "bituminous"].includes(surface);
  const unpaved = surface && ["unpaved", "dirt", "gravel", "ground", "grass", "sand", "mud"].includes(surface);

  // Power line — most actionable utility
  const powerLineNearby = Boolean(utils.power_line_nearby);
  const powerLineVoltage = utils.power_line_voltage_kv as number | null | undefined;
  const powerLineDist = utils.power_line_distance_m as number | null | undefined;
  const powerSubstation = Boolean(utils.power_substation_nearby);

  return {
    score: num(d.score, 50),
    severity: (d.severity ?? "moderate") as ModuleResult["severity"],
    summary: `${road.road_type ?? "Road"} access ${Math.round(roadDist)}m${nearest ? ` · ${nearest.type} ${Math.round(nearestTransitDist)}m` : ""}${unpaved ? " · unpaved road" : ""}`,
    data_source: "OpenStreetMap (Overpass API)",
    indicators: [
      { label: "Nearest Road", value: `${Math.round(roadDist)}m`, unit: "", barFraction: clamp01(1 - roadDist / 500), citation: "OSM" },
      { label: "Road Score", value: `${subScores.road?.toFixed(0) ?? "—"}/50`, unit: "", barFraction: clamp01((subScores.road ?? 0) / 50), citation: "proximity + type + surface" },
      { label: "Nearest Transit", value: nearest ? `${Math.round(nearestTransitDist)}m` : "None found", unit: "", barFraction: clamp01(1 - nearestTransitDist / 5000), citation: "OSM" },
      { label: "Power Score", value: `${subScores.power?.toFixed(0) ?? "—"}/20`, unit: "", barFraction: clamp01((subScores.power ?? 0) / 20), citation: "OSM power tags" },
    ],
    chart_data: [],
    qualitative: [
      { label: "Road Name", value: `${String(road.road_name ?? "—")}${road.road_ref ? ` (${road.road_ref})` : ""}`, tone: "neutral" },
      { label: "Road Surface", value: surface ? `${surface}${paved ? " — good surface quality (+5 score)" : unpaved ? " — unpaved, construction vehicles may need reinforcement (-5 score)" : ""}` : "Surface tag absent in OSM — verify on-site", tone: paved ? "good" : unpaved ? "warn" : "neutral" },
      { label: "Frontage", value: road.frontage_present ? "Direct frontage to road" : "No direct frontage — internal access road may be needed", tone: road.frontage_present ? "good" : "warn" },
      powerLineNearby
        ? { label: "HT Power Line", value: `${powerLineVoltage != null ? `${powerLineVoltage}kV line` : "Power line"} at ${powerLineDist != null ? `${Math.round(powerLineDist)}m` : "nearby"}. If <10m, contact BESCOM for safety clearance.`, tone: powerLineDist != null && powerLineDist < 10 ? "bad" : "good" }
        : { label: "HT Power Line", value: "Not detected in OSM — verify with BESCOM before design. OSM power line tagging in India is ~30% complete.", tone: "warn" },
      powerSubstation
        ? { label: "Power Substation", value: "Detected within 1km (OSM). Good indicator for reliable supply — verify transformer capacity with BESCOM.", tone: "good" }
        : { label: "Power Substation", value: "Not in OSM — absence likely means it's untagged, not absent. Verify with BESCOM.", tone: "neutral" },
      { label: "⚠ Utility Caveat", value: "Water supply, sewage, and telecom are NOT scored — OSM coverage <20% in India. 'Not detected' ≠ absent. Verify: BWSSB (water), BESCOM (power), BBMP (drainage), BSNL/private ISPs (telecom).", tone: "warn" },
    ],
    detailMetrics: [
      { group: "Sub-scores", rows: [
        { label: "road",    value: String((subScores.road ?? 0).toFixed(1)) },
        { label: "transit", value: String((subScores.transit ?? 0).toFixed(1)) },
        { label: "power",   value: String((subScores.power ?? 0).toFixed(1)) },
      ]},
      { group: "Transit", rows: transit.length > 0 ? transit.slice(0, 5).map((t) => ({ label: `${t.type}${t.name ? ` — ${t.name}` : ""}${t.line ? ` [${t.line}]` : ""}`, value: `${Math.round(t.distance_m)}m` })) : [{ label: "No transit found in OSM", value: "—" }] },
      { group: "Utilities (informational — not scored)", rows: [
        { label: "Water supply (BWSSB)", value: utils.water_supply_nearby ? "✓ detected" : "✗ not in OSM" },
        { label: "Power substation", value: powerSubstation ? "✓ detected" : "✗ not in OSM" },
        { label: "HT power line", value: powerLineNearby ? `✓ ${powerLineVoltage != null ? `${powerLineVoltage}kV` : "voltage unknown"}` : "✗ not in OSM" },
        { label: "Storm drainage (BBMP)", value: utils.storm_drainage_nearby ? "✓ detected" : "✗ not in OSM" },
        { label: "Sewage works (BWSSB)", value: utils.sewage_works_nearby ? "✓ detected" : "✗ not in OSM" },
        { label: "Telecom tower", value: utils.telecom_tower_nearby ? "✓ detected" : "✗ not in OSM" },
      ]},
    ],
    recommendations: [
      roadDist > 50 ? "No road within 50m — access road or easement required before development permits." : null,
      unpaved ? "Road surface is unpaved — construction vehicle access and material delivery will require a hard-surfaced approach road or temporary gravel reinforcement." : null,
      powerLineNearby && powerLineDist != null && powerLineDist < 10 ? "HT power line within 10m — contact BESCOM for clearance certificate before any vertical construction." : null,
      !powerLineNearby && !powerSubstation ? "No power supply detected in OSM — verify with BESCOM for connection availability and transformer capacity." : null,
      "Verify all utility availabilities and capacities with BWSSB, BESCOM, and BBMP before finalizing design.",
    ].filter(Boolean) as string[],
    loading: false,
    error: null,
  };
}

// ─── Utilities + NOC checklist — POST /infrastructure/utilities (US-087) ──────
// Gated by feature.infrastructure.utilities. Water main presence is authoritative-only ('unknown'
// without a BWSSB layer); availability is an inferred OSM proxy; NOC items are mandatory
// obligations, not scored. infra_readiness feeds the US-092 verdict.

export interface UtilityMain {
  name: string;
  present: "present" | "absent" | "unknown";
  confidence: "authoritative" | "inferred" | "unresolved";
  distance_m: number | null; diameter_mm: number | null;
  data_source: string | null; reason: string | null; next_action: string | null;
}
export interface UtilityAvailability {
  name: string; score: number; confidence: "authoritative" | "inferred" | "unresolved";
  nearest_m: number | null; detected: boolean; note: string | null;
}
export interface InfraNocChecklistItem {
  authority: string; requirement: string; rule_citation: string;
  typical_validity: string | null; deep_link: string | null;
  applies_when: string | null; mandatory: boolean;
}
export interface InfraReadiness {
  water_status: "present" | "absent" | "unknown";
  water_confidence: "authoritative" | "inferred" | "unresolved";
  telecom_score: number; power_score: number | null; road_score: number | null;
  noc_pending: number; overall: "ready" | "partial" | "unknown"; notes: string[];
}
export interface UtilitiesResult {
  water_main: UtilityMain; sewer_main: UtilityMain;
  water_availability: UtilityAvailability; telecom_availability: UtilityAvailability;
  storm_water_note: string; noc_checklist: InfraNocChecklistItem[];
  infra_readiness: InfraReadiness; data_source: string; data_disclaimer: string;
}

export async function getUtilities(lat: number, lon: number, radiusM = 3000): Promise<UtilitiesResult> {
  return svcFetch<UtilitiesResult>(SVC.infrastructure, "/infrastructure/utilities", {
    method: "POST",
    body: JSON.stringify({ latitude: lat, longitude: lon, radius_m: radiusM }),
  });
}

/** Utilities rows — main presence shown honestly (unknown != absent), NOC checklist surfaced. */
export function utilitiesQualitative(r: UtilitiesResult): import("../stores/analysis").QualitativeStat[] {
  const out: import("../stores/analysis").QualitativeStat[] = [];
  for (const m of [r.water_main, r.sewer_main]) {
    out.push(m.present === "present"
      ? { label: `${m.name}`, value: `present (${m.confidence})${m.diameter_mm ? `, Ø${m.diameter_mm}mm` : ""}.`, tone: "good" }
      : { label: `⚠ ${m.name}`, value: `${m.present.toUpperCase()} — ${m.reason ?? ""} ${m.next_action ?? ""}`, tone: "warn" });
  }
  out.push({ label: "Water availability (OSM proxy)", value: `${r.water_availability.score}/100 (inferred — not a connection).`, tone: "neutral" });
  out.push({ label: "Telecom availability (OSM proxy)", value: `${r.telecom_availability.score}/100 (inferred).`, tone: "neutral" });
  const rd = r.infra_readiness;
  out.push({ label: "Infra readiness (US-092)", value: `${rd.overall.toUpperCase()} — water ${rd.water_status}, telecom ${rd.telecom_score}/100, ${rd.noc_pending} NOC obligations pending.`, tone: rd.overall === "ready" ? "good" : rd.overall === "unknown" ? "warn" : "neutral" });
  for (const c of r.noc_checklist) {
    out.push({ label: `NOC — ${c.authority}`, value: `${c.requirement}. ${c.rule_citation}.${c.typical_validity ? ` Validity: ${c.typical_validity}.` : ""}${c.applies_when ? ` Applies: ${c.applies_when}.` : ""}`, tone: "warn" });
  }
  out.push({ label: "Storm water", value: r.storm_water_note, tone: "neutral" });
  out.push({ label: "⚠ Disclaimer", value: r.data_disclaimer, tone: "warn" });
  return out;
}

// ─── Soil Profile — GET /geo/soil ─────────────────────────────────────────────

export async function getSoilAnalysis(lat: number, lon: number): Promise<ModuleResult> {
  const d = await svcFetch<Record<string, unknown>>(SVC.zone, `/geo/soil?lat=${lat}&lon=${lon}`);
  return {
    score: num(d.score, 65),
    severity: (d.severity ?? "moderate") as ModuleResult["severity"],
    summary: `${d.texture_class ?? "Unknown"} — ${d.bearing_capacity_class ?? "—"}`,
    data_source: String(d.data_source ?? "SoilGrids REST API v2.0 (ISRIC, 250m)"),
    indicators: [
      { label: "Clay", value: `${num(d.clay_pct).toFixed(1)}%`, unit: "", barFraction: clamp01(num(d.clay_pct) / 60), citation: "SoilGrids v2.0" },
      { label: "Sand", value: `${num(d.sand_pct).toFixed(1)}%`, unit: "", barFraction: clamp01(num(d.sand_pct) / 100), citation: "SoilGrids v2.0" },
      { label: "Bulk Density", value: `${num(d.bulk_density_gcm3).toFixed(2)} g/cm³`, unit: "", barFraction: clamp01(num(d.bulk_density_gcm3) / 2), citation: "SoilGrids v2.0" },
      { label: "pH", value: String(num(d.ph).toFixed(1)), unit: "", barFraction: clamp01(num(d.ph) / 14), citation: "SoilGrids v2.0" },
    ],
    chart_data: [],
    qualitative: [
      { label: "Bearing Capacity", value: String(d.bearing_capacity_class ?? "—"), tone: d.bearing_capacity_class === "Good (>150 kN/m²)" ? "good" : d.bearing_capacity_class === "Poor (<100 kN/m²)" ? "bad" : "warn" },
      { label: "Foundation Notes", value: String(d.foundation_notes ?? "—"), tone: "neutral" },
    ],
    detailMetrics: [{ group: "Soil Properties", rows: [
      { label: "Clay", value: `${num(d.clay_pct).toFixed(1)}%` },
      { label: "Sand", value: `${num(d.sand_pct).toFixed(1)}%` },
      { label: "Silt", value: `${num(d.silt_pct).toFixed(1)}%` },
      { label: "pH (0–5cm)", value: String(num(d.ph).toFixed(1)) },
    ]}],
    recommendations: d.bearing_capacity_class === "Poor (<100 kN/m²)"
      ? ["Expansive clay detected — commission geotechnical investigation before foundation design."]
      : d.bearing_capacity_class === "Good (>150 kN/m²)"
      ? ["Compact soil — standard strip/pad foundation adequate; confirm with site investigation."]
      : ["Conduct site-specific geotechnical investigation to confirm foundation type."],
    loading: false,
    error: null,
  };
}

// ─── Water Constraints — GET /geo/water-constraints ───────────────────────────

export async function getWaterConstraintsAnalysis(lat: number, lon: number): Promise<ModuleResult> {
  const d = await svcFetch<Record<string, unknown>>(SVC.zone, `/geo/water-constraints?lat=${lat}&lon=${lon}&radius_m=500`);
  const bodies = (d.water_bodies ?? []) as Array<{ type: string; name?: string; distance_m: number; buffer_zone_m: number; buffer_source: string; site_within_buffer: boolean }>;
  return {
    score: num(d.score, 70),
    severity: (d.severity ?? "low") as ModuleResult["severity"],
    summary: d.construction_restricted
      ? "Construction restricted — site within water body buffer"
      : `${bodies.length} water features within 500m`,
    data_source: "OpenStreetMap (Overpass API)",
    indicators: [
      { label: "Nearest Water Body", value: d.nearest_distance_m != null ? `${Math.round(num(d.nearest_distance_m))}m` : "None found", unit: "", barFraction: clamp01(1 - num(d.nearest_distance_m, 500) / 500), citation: "OSM" },
    ],
    chart_data: [],
    qualitative: [
      {
        label: "⚠ Disclaimer",
        value: String(d.data_disclaimer ?? "OSM water body coverage may be incomplete. Buffer distances per Karnataka/NGT regulations — verify FTL boundary with BBMP/local authority."),
        tone: "warn" as QualitativeTone,
      },
      ...bodies.map((b) => ({
        label: `${b.type}${b.name ? ` (${b.name})` : ""} · ${b.buffer_source}`,
        value: `${Math.round(b.distance_m)}m — buffer ${b.buffer_zone_m}m`,
        tone: (b.site_within_buffer ? "bad" : "good") as QualitativeTone,
      })),
    ],
    detailMetrics: [{ group: "Water Bodies", rows: bodies.map((b) => ({
      label: `${b.type}${b.name ? ` — ${b.name}` : ""}`,
      value: `${Math.round(b.distance_m)}m (buf ${b.buffer_zone_m}m)`,
    }))}],
    recommendations: d.construction_restricted
      ? [`Construction restricted: ${String(d.restriction_reason ?? "site within regulatory water body buffer")}. Consult BBMP/KSPCB before proceeding.`]
      : bodies.length === 0
      ? ["No water bodies detected within 500m. Verify with local surveys."]
      : ["Water bodies present but site outside mandatory buffers. Confirm with local authority."],
    loading: false,
    error: null,
  };
}

// ─── Growth Context — GET /future-infra/pipeline ──────────────────────────────

export async function getGrowthAnalysis(lat: number, lon: number): Promise<ModuleResult> {
  const d = await svcFetch<Record<string, unknown>>(SVC.growth, `/future-infra/pipeline?lat=${lat}&lon=${lon}&radius_km=10`);
  const items = (d.pipeline_items ?? []) as Array<{ type: string; name: string; status: string; distance_km: number; source: string; source_date: string; description?: string }>;
  const underConstruction = items.filter((p) => p.status === "Under Construction").length;
  return {
    score: num(d.score, 50),
    severity: (d.severity ?? "moderate") as ModuleResult["severity"],
    summary: `${items.length} projects within 10km — ${underConstruction} under construction`,
    data_source: `${d.data_source ?? "Curated pipeline"} (${d.data_as_of ?? "2024-Q4"})`,
    indicators: [
      { label: "Total Projects", value: String(items.length), unit: "", barFraction: clamp01(items.length / 10), citation: "Curated" },
      { label: "Under Construction", value: String(underConstruction), unit: "", barFraction: clamp01(underConstruction / 5), citation: "Curated" },
    ],
    chart_data: items.slice(0, 5).map((p) => ({ label: p.name.substring(0, 30), value: p.distance_km })),
    qualitative: [
      {
        label: "⚠ Data Notice",
        value: "Curated from public announcements (BMRCL/BDA/NHAI) as of 2024-Q4. Project alignments are approximate. Statuses may have changed. Verify at source before investment decisions.",
        tone: "warn" as QualitativeTone,
      },
      ...items.map((p) => ({
        label: `${p.name} (${p.source ?? "Curated"})`,
        value: `${p.status} · ${p.distance_km.toFixed(1)}km · ${p.source_date ?? "2024-Q4"}`,
        tone: (p.status === "Under Construction" || p.status === "Operational" ? "good" : "neutral") as QualitativeTone,
      })),
    ],
    detailMetrics: [{ group: "Pipeline (curated 2024-Q4 — verify at source)", rows: items.map((p) => ({ label: `[${p.type}] ${p.name}`, value: `${p.status} · ${p.distance_km.toFixed(1)}km · ${p.source ?? ""}` })) }],
    recommendations: [
      num(d.score) < 50
        ? "Limited growth pipeline in vicinity — assess long-term land value carefully."
        : "Active infrastructure pipeline nearby — positive for long-term site value.",
      "Pipeline data is curated from public 2024-Q4 announcements. Project alignments are approximate. Verify current status with BMRCL/BDA/NHAI/KIADB before investment decisions.",
    ],
    loading: false,
    error: null,
  };
}

// NOTE: Land records module requires user input — called manually, not on page load
export async function getLandRecordsAnalysis(
  district: string, taluk: string, hobli: string, village: string, surveyNumber: string
): Promise<Record<string, unknown>> {
  return svcFetch<Record<string, unknown>>(SVC.land, "/land-records/lookup", {
    method: "POST",
    body: JSON.stringify({ district, taluk, hobli, village, survey_number: surveyNumber }),
  });
}

// ─── Parcel geometry — GET /geo/parcel (SAT-19, KGIS geomForSurveyNum) ────────

export interface ParcelGeometry {
  survey_number: string;
  village_code: string | null;
  kgis_village_id: string | null;
  ulpin: string | null;
  resolved: boolean;                 // true only when KGIS returned a real polygon
  geometry: GeoJSON.Polygon | null;  // WGS84 (lng, lat); null when unresolved
  crs: string;
  data_source: string;
  data_disclaimer: string;
}

// Survey number → parcel polygon. Flag-gated server-side (feature.geo.parcel-geometry):
// a 403 surfaces as an Error whose message contains "Feature flag disabled".
export async function getParcel(opts: {
  surveyNo: string;
  villageCode?: string | null;
  kgisVillageId?: string | null;
  crs?: "DD" | "UTM";
}): Promise<ParcelGeometry> {
  const q = new URLSearchParams({ survey_no: opts.surveyNo });
  if (opts.villageCode) q.set("village_code", opts.villageCode);
  if (opts.kgisVillageId) q.set("kgis_village_id", opts.kgisVillageId);
  if (opts.crs) q.set("crs", opts.crs);
  return svcFetch<ParcelGeometry>(SVC.zone, `/geo/parcel?${q.toString()}`);
}

// ─── Amenities — GET /geo/amenities ──────────────────────────────────────────

interface AmenityPt { name: string; type: string; distance_m: number; lat?: number; lon?: number }
interface AmenityCat { count: number; nearest_m: number; top_5: AmenityPt[]; points?: AmenityPt[] }
interface AmenitiesRaw {
  radius_m: number;
  healthcare: AmenityCat; education: AmenityCat; retail: AmenityCat;
  finance: AmenityCat; recreation: AmenityCat; religious: AmenityCat;
  transport: AmenityCat; total_count: number;
  score: number; severity: string; data_source: string;
}

export async function getAmenitiesAnalysis(lat: number, lon: number, radiusM = 2000): Promise<ModuleResult> {
  let d: AmenitiesRaw;
  try {
    d = await svcFetch<AmenitiesRaw>(SVC.amenities, `/geo/amenities?lat=${lat}&lon=${lon}&radius_m=${radiusM}`);
  } catch {
    // Overpass rate-limited or unavailable — return empty result so the toggle
    // still renders and zoning overlay doesn't block on this module.
    return {
      score: 50, severity: "moderate",
      summary: "Amenity data unavailable — OSM upstream rate-limited. Try again shortly.",
      data_source: "OpenStreetMap (Overpass API — unavailable)",
      indicators: [], chart_data: [], charts: [], qualitative: [],
      detailMetrics: [],
      recommendations: ["Amenity data could not be fetched. Overpass API may be rate-limited — retry in a few minutes."],
      amenityPoints: [],
      loading: false, error: null,
    };
  }
  const km = Math.round(radiusM / 1000);
  const cats: [string, AmenityCat][] = [
    ["Healthcare",  d.healthcare],  ["Education",  d.education],
    ["Retail",      d.retail],      ["Finance",    d.finance],
    ["Recreation",  d.recreation],  ["Religious",  d.religious],
    ["Transport",   d.transport],
  ];
  const hc = d.healthcare ?? {} as AmenityCat;
  const edu = d.education ?? {} as AmenityCat;
  const tr  = d.transport  ?? {} as AmenityCat;
  // Located amenities for the zoning map overlay — only those with coordinates.
  const amenityPoints: import("../stores/analysis").AmenityPoint[] = [];
  for (const [label, cat] of cats) {
    // Prefer the full `points` list (all located, ≤40/cat); fall back to top_5.
    for (const it of cat?.points ?? cat?.top_5 ?? []) {
      if (it.lat != null && it.lon != null) {
        amenityPoints.push({ name: it.name, type: it.type, category: label, distanceM: it.distance_m, lat: it.lat, lon: it.lon });
      }
    }
  }
  return {
    score: clampScore(num(d.score)),
    severity: (d.severity ?? "moderate") as ModuleResult["severity"],
    summary: `${num(d.total_count)} amenities within ${km}km — ${num(hc.count)} healthcare · ${num(edu.count)} schools`,
    data_source: d.data_source ?? "OpenStreetMap (Overpass API)",
    indicators: cats.map(([label, cat]) => ({
      label,
      value: String(num(cat?.count)),
      unit: "",
      barFraction: clamp01(num(cat?.count) / 20),
      citation: `OSM Overpass ${km}km`,
    })),
    chart_data: cats.map(([label, cat]) => ({ label, value: num(cat?.count) })),
    charts: [{
      title: "Amenity counts by category", kind: "bar", unit: "count",
      series: [{ key: "value", label: "Count", color: "#10B981" }],
      points: cats.map(([label, cat]) => ({ label: label.slice(0, 9), value: num(cat?.count) })),
    }],
    qualitative: [
      { label: "Nearest healthcare", value: hc.nearest_m < 9999 ? `${Math.round(hc.nearest_m)}m` : "None found", tone: hc.nearest_m < 1000 ? "good" : hc.nearest_m < 3000 ? "warn" : "bad" },
      { label: "Nearest school",     value: edu.nearest_m < 9999 ? `${Math.round(edu.nearest_m)}m` : "None found", tone: edu.nearest_m < 1000 ? "good" : edu.nearest_m < 3000 ? "warn" : "bad" },
      { label: "Nearest transit",    value: tr.nearest_m  < 9999 ? `${Math.round(tr.nearest_m)}m`  : "None found", tone: tr.nearest_m  < 500  ? "good" : tr.nearest_m  < 2000 ? "warn" : "bad" },
    ],
    detailMetrics: cats.map(([label, cat]) => ({
      group: label,
      rows: [
        { label: "Count", value: String(num(cat?.count)) },
        { label: "Nearest", value: cat?.nearest_m < 9999 ? `${Math.round(cat.nearest_m)}m` : "—" },
        ...(cat?.top_5 ?? []).slice(0, 3).map((item) => ({
          label: item.name || item.type,
          value: `${Math.round(item.distance_m)}m`,
        })),
      ],
    })),
    recommendations: [
      num(hc.count) === 0
        ? `No healthcare facilities within ${km}km — note for residential projects.`
        : `${num(hc.count)} healthcare facilities within ${km}km — adequate coverage.`,
      "Amenity data from OpenStreetMap — may be incomplete. Verify key facilities on-site.",
    ],
    amenityPoints,
    loading: false,
    error: null,
  };
}

// ─── Site score — computed from resolved module results ───────────────────────
// No dedicated endpoint exists; the composite is derived client-side.

const SEVERITY_RANK: Record<Severity, number> = { none: 0, low: 1, moderate: 2, high: 3 };
const MODULE_LABEL: Record<ModuleId, string> = {
  flood: "Flood", sunpath: "Sun path", wind: "Wind", temperature: "Temperature", rainfall: "Rainfall",
  zone: "Zone & Land Use", planning: "Site Capacity", zoning: "Zoning Compliance",
  infrastructure: "Connectivity",
  soil: "Soil Profile", waterConstraints: "Water Constraints", growth: "Growth Context", land: "Title & Documents",
  amenities: "Amenities",
};

export function computeSiteScore(
  modules: Partial<Record<ModuleId, ModuleResult>>,
  total = 5
): SiteScore | null {
  const resolved = (Object.entries(modules) as [ModuleId, ModuleResult][])
    .filter(([, r]) => r && !r.loading && !r.error);
  if (resolved.length === 0) return null;

  const overall = Math.round(resolved.reduce((sum, [, r]) => sum + r.score, 0) / resolved.length);

  let worst: Severity = "none";
  for (const [, r] of resolved) {
    if (SEVERITY_RANK[r.severity] > SEVERITY_RANK[worst]) worst = r.severity;
  }

  // Binding constraint = lowest-scoring resolved module.
  const binding = resolved.reduce((lo, cur) => (cur[1].score < lo[1].score ? cur : lo));

  const verdict =
    overall >= 80 ? "Highly buildable" :
    overall >= 65 ? "Buildable with standard care" :
    overall >= 45 ? "Buildable with mitigation" :
                    "Significant constraints";

  return {
    overall_score: overall,
    overall_severity: worst,
    verdict_text: verdict,
    desc_text: `Composite of ${resolved.length} module${resolved.length === 1 ? "" : "s"}. ${MODULE_LABEL[binding[0]]} is the binding constraint at ${binding[1].score}/100 — review it before finalising concept.`,
    module_progress: { complete: resolved.length, total },
  };
}

// ─── Export — no backend endpoint yet (GH#54) ─────────────────────────────────

export async function exportProject(
  projectId: string,
  _payload: { modules: string[]; settings: Record<string, boolean> }
): Promise<{ download_url: string }> {
  // TODO GH#54: no export endpoint exists on any service — returns a stub path.
  return { download_url: `/api/projects/${projectId}/export/mock.pdf` };
}
