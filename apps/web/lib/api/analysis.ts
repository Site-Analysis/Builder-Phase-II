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
  wind: "#06B6D4", rainfall: "#7C3AED",
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
  flood:       process.env.NEXT_PUBLIC_FLOOD_API_URL       ?? "http://localhost:8002",
  sunpath:     process.env.NEXT_PUBLIC_SUNPATH_API_URL     ?? "http://localhost:8001",
  wind:        process.env.NEXT_PUBLIC_WIND_API_URL        ?? "http://localhost:8003",
  temperature: process.env.NEXT_PUBLIC_TEMPERATURE_API_URL ?? "http://localhost:8000",
  rainfall:    process.env.NEXT_PUBLIC_RAINFALL_API_URL    ?? "http://localhost:8004",
} as const;

async function svcFetch<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
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
    body: JSON.stringify({ latitude: coords.lat, longitude: coords.lng, radius_meters: 1000 }),
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
    data_source: raw.metadata?.data_source ?? "MERIT DEM + ALOS-PALSAR (GEE)",
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
    body: JSON.stringify({ latitude: coords.lat, longitude: coords.lng, radius_meters: 1000 }),
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
    data_source: raw.metadata?.data_source ?? "Open-Meteo ERA5 reanalysis · 5-yr daily",
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
  const raw = await svcFetch<ClimateReport>(
    SVC.temperature,
    `/weather/thermal-profile?lat=${coords.lat}&lon=${coords.lng}`
  );
  const sum = raw.summary ?? {} as ClimateReport["summary"];
  const rec = raw.recommendations ?? {} as ClimateReport["recommendations"];
  const peak = num(sum.peak_max_temp, 41);
  const months = raw.monthly_data ?? [];
  // Goodness score — moderate peaks read as more comfortable / buildable.
  const score = clampScore(100 - ((peak - 20) / 25) * 100);
  return {
    score,
    severity: severityFromScore(score),
    summary: rec.material_suggestion
      ?? `${rec.thermal_comfort_status ?? "Thermal profile assessed"} — peak ${peak.toFixed(1)} °C.`,
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
          { label: "Material approach",  value: rec.material_suggestion ?? "—" },
          { label: "Insulation",         value: rec.insulation_strategy ?? "—" },
        ],
      },
    ],
    recommendations: [rec.material_suggestion, rec.insulation_strategy].filter(Boolean) as string[],
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
): Promise<ThermalGridData | null> {
  const { lat, lng } = coords;
  const geometry = {
    type: "Polygon",
    coordinates: [[
      [lng - halfDeg, lat - halfDeg],
      [lng + halfDeg, lat - halfDeg],
      [lng + halfDeg, lat + halfDeg],
      [lng - halfDeg, lat + halfDeg],
      [lng - halfDeg, lat - halfDeg],
    ]],
  };
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
  const { start, end } = dateRange();
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
    series: [{ key: "value", label: "Days", color: "#7C3AED" }],
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

function maxElevation(slice: SunpathResponse["hourly_data"]): number {
  return slice.reduce((mx, p) => Math.max(mx, num(p.elevation)), 0);
}

function daylightHours(slice: SunpathResponse["hourly_data"]): number {
  return slice.filter((p) => num(p.elevation) > 0).length;
}

export async function getSunpathAnalysis(coords: AnalysisCoords): Promise<ModuleResult> {
  const raw = await svcFetch<SunpathResponse>(
    SVC.sunpath,
    `/sunpath/annual?lat=${coords.lat}&lon=${coords.lng}`
  );
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

  return {
    score,
    severity: severityFromScore(score),
    summary: `Summer noon altitude ${summerAlt.toFixed(1)}°, winter ${winterAlt.toFixed(1)}° — ${winterDaylight} h winter daylight.`,
    data_source: `pvlib (NREL SPA)${raw.timezone ? ` · ${raw.timezone}` : ""}`,
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
    qualitative: [
      { label: "Summer noon", value: `${summerAlt.toFixed(0)}°`, tone: "good" },
      { label: "Winter noon", value: `${winterAlt.toFixed(0)}°`, tone: winterAlt > 40 ? "good" : "warn" },
    ],
    detailMetrics: [
      {
        group: "Solar geometry",
        rows: [
          { label: "Summer daylight", value: String(summerDaylight), unit: "h" },
          { label: "Winter daylight", value: String(winterDaylight), unit: "h" },
          { label: "Timezone",        value: String(raw.timezone ?? "—") },
        ],
      },
    ],
    loading: false,
    error: null,
  };
}

// ─── Site score — computed from resolved module results ───────────────────────
// No dedicated endpoint exists; the composite is derived client-side.

const SEVERITY_RANK: Record<Severity, number> = { none: 0, low: 1, moderate: 2, high: 3 };
const MODULE_LABEL: Record<ModuleId, string> = {
  flood: "Flood", sunpath: "Sun path", wind: "Wind", temperature: "Temperature", rainfall: "Rainfall",
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
