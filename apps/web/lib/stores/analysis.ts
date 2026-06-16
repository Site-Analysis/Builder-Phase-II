"use client";

import { create } from "zustand";

export type ModuleId = "flood" | "rainfall" | "sunpath" | "wind" | "temperature" | "zone" | "planning" | "zoning" | "infrastructure" | "soil" | "waterConstraints" | "growth" | "land" | "amenities";
export type Severity = "high" | "moderate" | "low" | "none";

export interface Indicator {
  label: string;
  value: string;
  unit: string;
  barFraction: number;
  citation: string;
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

// A self-describing chart. Single-series charts use one series with key "value";
// grouped/multi-line charts use several series, with each point carrying a value
// per series key.
export interface ModuleChart {
  title: string;
  kind: "bar" | "line" | "area" | "groupedBar" | "multiLine" | "dailyBar";
  unit?: string;
  series: ChartSeries[];
  points: Array<{ label: string } & Record<string, number | string>>;
}

export type QualitativeTone = "good" | "warn" | "bad" | "neutral";

export interface QualitativeStat {
  label: string;
  value: string;
  tone?: QualitativeTone;
}

export interface MetricGroup {
  group: string;
  rows: Array<{ label: string; value: string; unit?: string }>;
}

// Raw solar geometry for the sun-path diagram + shadow casting.
export interface SolarPoint { hour: number; az: number; el: number }
export interface SolarData {
  summer: SolarPoint[];
  equinox: SolarPoint[];
  winter: SolarPoint[];
  lat: number;
  lng: number;
}

// One nearby contextual item (feature / amenity / transit) used by the zoning
// site-context radar. `distanceM` is always present; `lat`/`lon` arrive in
// Phase 2 (backend coords) and stay optional until then.
export interface ZoningContextItem {
  label: string;
  category: string;            // "airport" | "metro" | feature type (e.g. "waterbody")
  distanceM: number;
  lat?: number;
  lon?: number;
}

// Authoritative administrative context from KGIS (flag-gated). `adminZone` is the
// BBMP administrative zone, NOT the RMP land-use zone.
export interface ZoningKgis {
  type: string | null;          // "Urban" | "Rural"
  district: string | null;
  town: string | null;
  adminZone: string | null;
  ward: string | null;
  taluk: string | null;
  hobli: string | null;
  village: string | null;
  surveyNumber: string | null;
}

// A located amenity for map markers (Amenities module → zoning overlay).
export interface AmenityPoint {
  name: string;
  type: string;
  category: string;            // "Healthcare" | "Education" | ...
  distanceM: number;
  lat: number;
  lon: number;
}

// Structured, raw zoning fields the floating HUD visuals consume directly —
// avoids re-parsing the formatted indicator/qualitative strings. Populated by
// getZoningAnalysis from the combined geo /zone + planning /analyze responses.
export interface ZoningData {
  // Site location (for provenance deep-links)
  siteLat: number;
  siteLon: number;
  // Land use & classification
  zoneClass: string;
  zoneIsBuildable: boolean;     // false for Green Belt/Water Body/Agricultural/etc.
  zoneCode: string | null;
  primaryLanduse: string;
  permittedUses: string[];
  lulcClass: string | null;
  lulcVintage: string | null;
  sourceConfidence: string;    // "authoritative" | "community"
  // Compliance flags
  naRequired: boolean;
  forestRequired: boolean;
  dgcaNocRequired: boolean;
  roadWidthSource: string;     // "user_input" | "osm_detected" | "default_9m"
  roadWidthM: number;
  // Development capacity
  farApplicable: number;
  baseFar: number | null;
  todApplicable: boolean;
  todFarMax: number;           // TOD ceiling, 4.0
  buildableAreaSqm: number;
  plotAreaSqm: number;
  groundCoverageMax: number;
  maxHeightM: number;
  heightLimitingFactor: string;
  olsHeightM: number | null;   // airport OLS height limit, if restrictive
  setbackFrontM: number | null;
  setbackRearM: number | null;
  setbackSideM: number | null;
  // Context (airport + metro + nearby features by distance)
  airportName: string;
  airportDistanceKm: number;
  airportSurface: string;
  airportLat: number | null;
  airportLon: number | null;
  metroName: string | null;
  metroDistanceM: number | null;
  metroLat: number | null;
  metroLon: number | null;
  context: ZoningContextItem[];
  // Authoritative admin context (KGIS, flag-gated; null otherwise)
  kgis: ZoningKgis | null;
  // Headline
  score: number;
  severity: Severity;
}

export interface ModuleResult {
  score: number;
  severity: Severity;
  summary: string;
  indicators: Indicator[];
  chart_data: ChartDataPoint[];
  charts?: ModuleChart[];
  qualitative?: QualitativeStat[];
  detailMetrics?: MetricGroup[];
  recommendations?: string[];
  data_source?: string;
  solar?: SolarData;
  zoning?: ZoningData;
  amenityPoints?: AmenityPoint[];
  loading: boolean;
  error: string | null;
}

export interface SiteScore {
  overall_score: number;
  overall_severity: Severity;
  verdict_text: string;
  desc_text?: string;
  module_progress: { complete: number; total: number };
}

interface AnalysisState {
  modules: Partial<Record<ModuleId, ModuleResult>>;
  siteScore: SiteScore | null;
  setModuleResult: (id: ModuleId, result: ModuleResult) => void;
  setModuleLoading: (id: ModuleId) => void;
  setModuleError: (id: ModuleId, error: string) => void;
  setSiteScore: (score: SiteScore) => void;
  resetAnalysis: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  modules: {},
  siteScore: null,
  setModuleResult: (id, result) =>
    set((s) => ({ modules: { ...s.modules, [id]: result } })),
  setModuleLoading: (id) =>
    set((s) => ({
      modules: {
        ...s.modules,
        [id]: { ...(s.modules[id] ?? {}), loading: true, error: null } as ModuleResult,
      },
    })),
  setModuleError: (id, error) =>
    set((s) => ({
      modules: {
        ...s.modules,
        [id]: { ...(s.modules[id] ?? {}), loading: false, error } as ModuleResult,
      },
    })),
  setSiteScore: (score) => set({ siteScore: score }),
  resetAnalysis: () => set({ modules: {}, siteScore: null }),
}));
