// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Sun, Waves, Thermometer, Wind, CloudRain, Settings, MapPin, Building2, Wifi, Layers, Droplets, TrendingUp, FileText, Scale } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { RightPanel } from "@/components/layout/RightPanel";
import type { ActiveModuleInfo } from "@/components/layout/RightPanel";
import { AnalysisModuleSection } from "@/components/layout/AnalysisModuleSection";
import { ModuleDetailCard } from "@/components/layout/ModuleDetailCard";
import { SunPanel } from "@/components/layout/SunPanel";
import { FloodRiskPanel } from "@/components/layout/FloodRiskPanel";
import { FloodZoneOverlay } from "@/components/map/FloodZoneOverlay";
import { WindPanel } from "@/components/layout/WindPanel";
import { WindOverlay } from "@/components/map/WindOverlay";
import { RainfallPanel } from "@/components/layout/RainfallPanel";
import { TemperaturePanel } from "@/components/layout/TemperaturePanel";
import { LandRecordsPanel } from "@/components/layout/LandRecordsPanel";
import { TemperatureOverlay } from "@/components/map/TemperatureOverlay";
import { SunOverlay } from "@/components/map/SunOverlay";
import { RainfallOverlay } from "@/components/map/RainfallOverlay";
import { MapCompass } from "@/components/map/MapCompass";
import { useAuthStore } from "@/lib/stores/auth";
import { supabase } from "@/lib/supabase/client";
import { useProjectStore } from "@/lib/stores/project";
import { useAnalysisStore } from "@/lib/stores/analysis";
import { useConfigStore } from "@/lib/stores/config";
import { useParcelStore } from "@/lib/stores/parcel";
import { useProfileStore } from "@/lib/stores/profile";
import { getProject } from "@/lib/api/projects";
import { ParcelVerdictDock, type ParcelVerdictState } from "@/components/map/ParcelVerdictDock";
import { parcelKey, parcelAreaSqm, type CadastralParcel } from "@/lib/api/cadastral";
import { runBuilderSignals } from "@/lib/api/verdict";
import { fetchEchawadiRecords, fetchEncroachment } from "@/lib/api/cadastral_records";
import {
  computeSiteScore,
  getFloodAnalysis,
  getRainfallAnalysis,
  getSunpathAnalysis,
  getWindAnalysis,
  getTemperatureAnalysis,
  getZoneAnalysis,
  getPlanningAnalysis,
  getZoningAnalysis,
  getInfraAnalysis,
  getSoilAnalysis,
  getWaterConstraintsAnalysis,
  getGrowthAnalysis,
  getAmenitiesAnalysis,
  getSolarDay,
  // US-092 Job A signal adapters (signal → ModuleResult)
  zoneRingModule,
  farModule,
  obligationsModule,
  connectivityModule,
  utilitiesModule,
  overlaysModule,
  terrainModule,
  priceUpsideModule,
  type AnalysisCoords,
  type SolarDay,
} from "@/lib/api/analysis";
import type { ModuleId, ModuleResult } from "@/lib/stores/analysis";
import { dayRange, fmtHour } from "@/lib/solar";

// 3D scene — client-only (MapLibre GL + Three.js)
const Scene3D = dynamic(
  () => import("@/components/three/Scene3D").then((m) => m.Scene3D),
  { ssr: false, loading: () => <div style={{ position: "absolute", inset: 0, background: "#F4F4F2" }} /> }
);

// React-Leaflet has no SSR support — dynamic import required
const MapContainer = dynamic(
  () => import("@/components/map/MapContainer").then((m) => m.MapContainer),
  { ssr: false }
);
const SiteBoundaryOverlay = dynamic(
  () => import("@/components/map/SiteBoundaryOverlay").then((m) => m.SiteBoundaryOverlay),
  { ssr: false }
);
const ParcelOverlay = dynamic(
  () => import("@/components/map/ParcelOverlay").then((m) => m.ParcelOverlay),
  { ssr: false }
);
const SiteLabel = dynamic(
  () => import("@/components/map/SiteLabel").then((m) => m.SiteLabel),
  { ssr: false }
);
const FloodZoneRings = dynamic(
  () => import("@/components/map/FloodZoneRings").then((m) => m.FloodZoneRings),
  { ssr: false }
);
const WindRose = dynamic(
  () => import("@/components/map/WindRose").then((m) => m.WindRose),
  { ssr: false }
);
const ThermalField = dynamic(
  () => import("@/components/map/ThermalField").then((m) => m.ThermalField),
  { ssr: false }
);
const DrawTools = dynamic(
  () => import("@/components/map/DrawTools").then((m) => m.DrawTools),
  { ssr: false }
);
const MapSearch = dynamic(
  () => import("@/components/map/MapSearch").then((m) => m.MapSearch),
  { ssr: false }
);
const SunPathArc = dynamic(
  () => import("@/components/map/SunPathArc").then((m) => m.SunPathArc),
  { ssr: false }
);
const ZoningComplianceHUD = dynamic(
  () => import("@/components/zoning/ZoningComplianceHUD").then((m) => m.ZoningComplianceHUD),
  { ssr: false }
);
const ZoningCapacityHUD = dynamic(
  () => import("@/components/zoning/ZoningCapacityHUD").then((m) => m.ZoningCapacityHUD),
  { ssr: false }
);
const ZoningContextOverlay = dynamic(
  () => import("@/components/map/ZoningContextOverlay").then((m) => m.ZoningContextOverlay),
  { ssr: false }
);
const ZoningMapLegend = dynamic(
  () => import("@/components/map/ZoningMapLegend").then((m) => m.ZoningMapLegend),
  { ssr: false }
);
const MapToggle = dynamic(
  () => import("@/components/map/MapToggle").then((m) => m.MapToggle),
  { ssr: false }
);
const ClimateContextHUD = dynamic(
  () => import("@/components/zoning/ClimateContextHUD").then((m) => m.ClimateContextHUD),
  { ssr: false }
);
// Cadastral infrastructure overlays (Phase 3 + 4)
const RoadWidthOverlay = dynamic(
  () => import("@/components/map/RoadWidthOverlay").then((m) => m.RoadWidthOverlay),
  { ssr: false }
);
const BwssbSewerageOverlay = dynamic(
  () => import("@/components/map/BwssbSewerageOverlay").then((m) => m.BwssbSewerageOverlay),
  { ssr: false }
);
const PowerLinesOverlay = dynamic(
  () => import("@/components/map/PowerLinesOverlay").then((m) => m.PowerLinesOverlay),
  { ssr: false }
);
const GasPipelineOverlay = dynamic(
  () => import("@/components/map/GasPipelineOverlay").then((m) => m.GasPipelineOverlay),
  { ssr: false }
);
const DrainageOverlay = dynamic(
  () => import("@/components/map/DrainageOverlay").then((m) => m.DrainageOverlay),
  { ssr: false }
);

// TODO GH#53: all 5 analysis endpoints unconfirmed — responses are mapped via defensive guesses

const SEVERITY_VERDICT: Record<string, string> = {
  none: "Optimal", low: "Low risk", moderate: "Moderate risk", high: "High risk",
};

const MODULE_ABBREV: Record<ModuleId, string> = {
  sunpath: "SUN", flood: "FLOOD", temperature: "TEMP", wind: "WIND", rainfall: "RAIN",
  zone: "ZONE", planning: "FAR", zoning: "ZONING", infrastructure: "INFRA", soil: "SOIL",
  waterConstraints: "WATER", growth: "GROWTH", land: "TITLE", amenities: "AMENITY",
  zoneRing: "ZONE+", farAssembly: "FAR2", obligations: "MIX", connectivitySignal: "CONN",
  utilities: "UTIL", overlays: "OVERLAY", terrain: "TERRAIN", priceUpside: "PRICE",
};

const MODULE_META: {
  id: ModuleId;
  name: string;
  color: string;
  icon: React.ReactNode;
}[] = [
  { id: "sunpath",          name: "Sun Path",          color: "#F59E0B", icon: <Sun size={14} />          },
  { id: "flood",            name: "Flood",             color: "#2563EB", icon: <Waves size={14} />        },
  { id: "temperature",      name: "Temperature",       color: "#EF4444", icon: <Thermometer size={14} />  },
  { id: "wind",             name: "Wind",              color: "#06B6D4", icon: <Wind size={14} />         },
  { id: "rainfall",         name: "Rainfall",          color: "#1D4ED8", icon: <CloudRain size={14} />    },
  { id: "zoning",           name: "Zoning",            color: "#B45309", icon: <Scale size={14} />        },
  { id: "zone",             name: "Zone & Land Use",   color: "#10B981", icon: <MapPin size={14} />       },
  { id: "planning",         name: "Site Capacity",     color: "#F97316", icon: <Building2 size={14} />    },
  { id: "infrastructure",   name: "Connectivity",      color: "#0EA5E9", icon: <Wifi size={14} />         },
  { id: "soil",             name: "Soil Profile",      color: "#92400E", icon: <Layers size={14} />       },
  { id: "waterConstraints", name: "Water Constraints", color: "#1D4ED8", icon: <Droplets size={14} />     },
  { id: "growth",           name: "Growth Context",    color: "#16A34A", icon: <TrendingUp size={14} />   },
  { id: "land",             name: "Title & Documents", color: "#6B21A8", icon: <FileText size={14} />     },
  { id: "amenities",        name: "Amenities",         color: "#059669", icon: <MapPin size={14} />        },
  // US-092 Job A — Builder-feasibility signal panels (honest-by-shape; C4 confidence badge, no score).
  { id: "zoneRing",           name: "Zone & Ring (RMP)",            color: "#0D9488", icon: <MapPin size={14} />    },
  { id: "farAssembly",        name: "FAR — Permissible/Achievable", color: "#EA580C", icon: <Building2 size={14} /> },
  { id: "obligations",        name: "Mixed-Use, Parking & TIA",     color: "#B45309", icon: <Scale size={14} />     },
  { id: "connectivitySignal", name: "Connectivity — Air/Metro/Road", color: "#0EA5E9", icon: <Wifi size={14} />     },
  { id: "utilities",          name: "Utilities & NOC",              color: "#0891B2", icon: <Droplets size={14} />  },
  { id: "overlays",           name: "Deal-Killer Overlays",         color: "#DC2626", icon: <Layers size={14} />    },
  { id: "terrain",            name: "Terrain — Slope/Geotech",      color: "#65A30D", icon: <TrendingUp size={14} /> },
  { id: "priceUpside",        name: "Price Upside (Indicative)",    color: "#16A34A", icon: <TrendingUp size={14} /> },
];

function getInitials(user: { email?: string; user_metadata?: { full_name?: string } }) {
  const name = user.user_metadata?.full_name;
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return user.email?.[0]?.toUpperCase() ?? "U";
}

export default function ProjectPage() {
  const router      = useRouter();
  const { id }      = useParams<{ id: string }>();

  const { user, clearAuth }  = useAuthStore();
  const { setCurrentProject } = useProjectStore();
  const { bufferM, startDate, endDate } = useConfigStore();
  const {
    modules,
    siteScore,
    setModuleLoading,
    setModuleResult,
    setModuleError,
    setSiteScore,
    resetAnalysis,
  } = useAnalysisStore();
  const profile = useProfileStore((s) => s.profile);
  console.log("[ProfileDebug] profile =", profile, "showCadastralUI =", profile === "builder");
  const parcel = useParcelStore((s) => s.parcel);
  const selected = useParcelStore((s) => s.selected);
  const setSelected = useParcelStore((s) => s.setSelected);
  const clearSelected = useParcelStore((s) => s.clearSelected);
  const echawadiRecords = useParcelStore((s) => s.echawadiRecords);
  const setEchawadiRecords = useParcelStore((s) => s.setEchawadiRecords);

  const [project,      setProject]      = useState<Awaited<ReturnType<typeof getProject>> | null>(null);
  const [center,       setCenter]       = useState<[number, number]>([12.9716, 77.5946]);
  const [boundaryPolygon, setBoundaryPolygon] = useState<[number, number][] | null>(null);
  const [detailModule, setDetailModule] = useState<ModuleId | null>(null);
  const [view3D,       setView3D]       = useState(false);
  const [showAmenities, setShowAmenities] = useState(false);
  const [showClimate,  setShowClimate]  = useState(false);
  const [showSiteCircle, setShowSiteCircle] = useState(true);
  const [analysisCoords, setAnalysisCoords] = useState<AnalysisCoords | null>(null);
  // SLICE 1 — the JOIN. Clicking a KGIS parcel selects it; the dock's Analyze button then runs the
  // signal panels + verdict for THAT parcel. Flag-gated, default-off.
  const parcelAnalysisEnabled = process.env.NEXT_PUBLIC_ENABLE_PARCEL_ANALYSIS === "1";
  const [verdictState, setVerdictState] = useState<ParcelVerdictState>({ analyzing: false, verdict: null, error: null });
  const climateRequestedRef = useRef(false);
  // 3D sun-path study — selected date drives the accurate sun/shadows.
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [solarDay,     setSolarDay]     = useState<SolarDay | null>(null);
  const [showSurroundings, setShowSurroundings] = useState(true);
  const [viewMode,     setViewMode]     = useState<"massing" | "diagram">("massing");
  const [hour,         setHour]         = useState(12);
  // 3D map orientation → compass widget (Scene3D default bearing is -20).
  const [bearing,      setBearing]      = useState(-20);
  const [northNonce,   setNorthNonce]   = useState(0);

  const solar     = modules.sunpath?.solar ?? null;
  const dayPoints = solarDay?.points ?? null;
  // Slider window: prefer the selected date's daylight hours, else the equinox arc.
  const sunRange  = dayPoints && dayPoints.length
    ? dayRange(dayPoints)
    : solar ? dayRange(solar.equinox) : { start: 6, end: 18 };
  const [expanded,     setExpanded]     = useState<Record<ModuleId, boolean>>({
    flood: true, sunpath: false, wind: false, temperature: false, rainfall: false,
    zone: false, planning: false, zoning: false, infrastructure: false, soil: false,
    waterConstraints: false, growth: false, land: false, amenities: false,
    zoneRing: false, farAssembly: false, obligations: false, connectivitySignal: false,
    utilities: false, overlays: false, terrain: false, priceUpside: false,
  });

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
  }, [user, router]);

  useEffect(() => { setShowSiteCircle(true); }, [bufferM]);

  // Recenter the map on a located KGIS parcel (centroid of its outer ring).
  useEffect(() => {
    const ring = parcel?.geometry?.coordinates?.[0];
    if (!ring || ring.length === 0) return;
    const lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    setCenter([lat, lng]);
  }, [parcel]);

  // Fire every analysis fetcher for a subject (project boundary OR a clicked parcel). Extracted from
  // the load effect so the parcel-select "Analyze" button re-runs the SAME modules for the parcel's
  // TRUE geometry. `runIds` undefined ⇒ run all (button); a Set ⇒ only those (project load).
  const runAnalysisFor = useCallback(
    (lat: number, lng: number, polygon: [number, number][] | null, area: number, runIds?: Set<ModuleId>) => {
      resetAnalysis();
      const coords: AnalysisCoords = { lat, lng, projectId: id, bufferM, startDate, endDate };
      const plotArea = area && area > 0 ? area : 1000;
      const allFetchers: [ModuleId, () => Promise<unknown>][] = [
        ["flood",             () => getFloodAnalysis(coords)],
        ["rainfall",          () => getRainfallAnalysis(coords)],
        ["sunpath",           () => getSunpathAnalysis(coords)],
        ["wind",              () => getWindAnalysis(coords)],
        ["temperature",       () => getTemperatureAnalysis(coords)],
        ["zone",              () => getZoneAnalysis(lat, lng)],
        ["planning",          () => getPlanningAnalysis(lat, lng)],
        ["zoning",            () => getZoningAnalysis(lat, lng, plotArea)],
        ["infrastructure",    () => getInfraAnalysis(lat, lng)],
        ["soil",              () => getSoilAnalysis(lat, lng)],
        ["waterConstraints",  () => getWaterConstraintsAnalysis(lat, lng)],
        ["growth",            () => getGrowthAnalysis(lat, lng)],
        ["amenities",         () => getAmenitiesAnalysis(lat, lng)],
        // US-092 Job A — Builder-feasibility signals; input-dependent ones (FAR/obligations/terrain)
        // return honest-unresolved until their inputs are supplied.
        ["zoneRing",           () => zoneRingModule(lat, lng)],
        ["farAssembly",        () => farModule(lat, lng, plotArea)],
        ["obligations",        () => obligationsModule(lat, lng, plotArea)],
        ["connectivitySignal", () => connectivityModule(lat, lng)],
        ["utilities",          () => utilitiesModule(lat, lng)],
        ["overlays",           () => overlaysModule(lat, lng)],
        ["terrain",            () => terrainModule(lat, lng, polygon)],
        ["priceUpside",        () => priceUpsideModule(lat, lng)],
      ];
      for (const [moduleId, fetcher] of allFetchers) {
        if (runIds && !runIds.has(moduleId)) continue;
        setModuleLoading(moduleId);
        fetcher()
          .then((result) => setModuleResult(moduleId, result as never))
          .catch((err) => setModuleError(moduleId, err instanceof Error ? err.message : "Failed"));
      }
    },
    [id, bufferM, startDate, endDate, resetAnalysis, setModuleLoading, setModuleResult, setModuleError],
  );

  useEffect(() => {
    if (!id || !user) return;
    resetAnalysis();
    getProject(id).then((p) => {
      setProject(p);
      setCurrentProject(p);

      // Extract analysis centre from the GeoJSON boundary, fall back to Bangalore.
      // Point → that point; Polygon (drawn rect/freehand) → centroid + keep the
      // ring so the map shows the actual drawn area instead of a marker/circle.
      let lat = 12.9716, lng = 77.5946;
      let analysisPolygon: [number, number][] | null = null;
      if (p.boundary?.type === "Point" && Array.isArray(p.boundary.coordinates)) {
        lng = p.boundary.coordinates[0] as number;
        lat = p.boundary.coordinates[1] as number;
        setBoundaryPolygon(null);
        setShowSiteCircle(true);
      } else if (p.boundary?.type === "Polygon" && Array.isArray(p.boundary.coordinates)) {
        const ring = (p.boundary.coordinates[0] as [number, number][]).slice(0, -1); // drop closing dup
        const pts: [number, number][] = ring.map(([lo, la]) => [la, lo]); // [lat,lng]
        if (pts.length >= 3) {
          lat = pts.reduce((s, q) => s + q[0], 0) / pts.length;
          lng = pts.reduce((s, q) => s + q[1], 0) / pts.length;
          setBoundaryPolygon(pts);
          analysisPolygon = pts;
        }
      }
      setCenter([lat, lng]);
      const coords: AnalysisCoords = { lat, lng, projectId: id, bufferM, startDate, endDate };
      setAnalysisCoords(coords);
      climateRequestedRef.current = false;

      // Only run the modules the user selected at creation (default: all 5).
      const run = new Set<ModuleId>(p.modules_run ?? MODULE_META.map((m) => m.id));
      // The zoning map overlay renders amenity pins, so amenities must run whenever
      // zoning does — even if the project's modules_run didn't list it explicitly.
      if (run.has("zoning")) run.add("amenities");
      // US-092 Job A: the Builder-feasibility signals always run (existing projects' stored
      // modules_run predates them) so Analyze always shows the epic panels.
      for (const sig of ["zoneRing", "farAssembly", "obligations", "connectivitySignal", "utilities", "overlays", "terrain", "priceUpside"] as ModuleId[]) run.add(sig);
      const plotArea = p.area_sqm && p.area_sqm > 0 ? p.area_sqm : 1000;

      // Open the first selected module in canonical order.
      const firstSelected = MODULE_META.find((m) => run.has(m.id))?.id;
      if (firstSelected) {
        setExpanded({
          flood: false, sunpath: false, wind: false, temperature: false, rainfall: false,
          zone: false, planning: false, zoning: false, infrastructure: false, soil: false,
          waterConstraints: false, growth: false, land: false, amenities: false,
          zoneRing: false, farAssembly: false, obligations: false, connectivitySignal: false,
          utilities: false, overlays: false, terrain: false, priceUpside: false,
          [firstSelected]: true,
        });
      }

      runAnalysisFor(lat, lng, analysisPolygon, plotArea, run);
    }).catch(console.error);
  }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load the Core-3 climate modules the first time the Climate layer is
  // toggled on — reuses the existing validated endpoints (no eager fetch).
  useEffect(() => {
    if (!showClimate || !analysisCoords || climateRequestedRef.current) return;
    climateRequestedRef.current = true;
    const climate: [ModuleId, (c: AnalysisCoords) => Promise<ModuleResult>][] = [
      ["temperature", getTemperatureAnalysis],
      ["wind",        getWindAnalysis],
      ["sunpath",     getSunpathAnalysis],
    ];
    for (const [mid, fetcher] of climate) {
      if (modules[mid]) continue; // already run via the project's modules_run
      setModuleLoading(mid);
      fetcher(analysisCoords)
        .then((r) => setModuleResult(mid, r as never))
        .catch((e) => setModuleError(mid, e instanceof Error ? e.message : "Failed"));
    }
  }, [showClimate, analysisCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  // Accurate per-date sun path for the 3D study — refetched when the date or
  // site changes while the 3D view is open.
  useEffect(() => {
    if (!view3D || !analysisCoords) return;
    let cancelled = false;
    getSolarDay(analysisCoords.lat, analysisCoords.lng, selectedDate)
      .then((d) => { if (!cancelled) setSolarDay(d); })
      .catch(() => { if (!cancelled) setSolarDay(null); });
    return () => { cancelled = true; };
  }, [view3D, analysisCoords, selectedDate]);

  // Keep the hour slider inside the selected day's daylight window.
  useEffect(() => {
    setHour((h) => Math.min(Math.max(h, sunRange.start), sunRange.end));
  }, [sunRange.start, sunRange.end]);

  // Composite site score — recomputed from module results as they resolve.
  useEffect(() => {
    const total = project?.modules_run?.length ?? 14;
    const score = computeSiteScore(modules, total);
    if (score) setSiteScore(score);
  }, [modules, project, setSiteScore]);

  // Click a KGIS parcel → make it the selection (its TRUE geometry; the alignment nudge never enters
  // here — Rule 5). No backend runs yet; the dock's Analyze button drives analysis.
  // Immediately kick off an async e-Chawadi lookup so RCCMS + mutation chips appear in the dock.
  const handleParcelSelect = useCallback((p: CadastralParcel) => {
    const ring = p.geometry.coordinates?.[0] ?? [];
    if (ring.length < 3) return;
    const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    setSelected({
      surveyNumber: p.surveyNumber, hasSurvey: p.hasSurvey, category: p.category,
      ulpin: p.ulpin, villageCode: p.villageCode, lgdVillage: p.lgdVillage,
      geometryTrue: p.geometry, centroid: [lat, lon], areaSqm: parcelAreaSqm(p.geometry),
    });
    setVerdictState({ analyzing: false, verdict: null, error: null });

    // Async e-Chawadi fetch — show loading chip immediately, update on completion
    if (p.hasSurvey && p.lgdVillage) {
      setEchawadiRecords({
        rccms: [], mutations: [], villageInfo: null,
        loading: true, error: null,
        encroachmentFlagged: null, bbmpNotified: false, revenueFlagged: false,
      });
      (async () => {
        const records = await fetchEchawadiRecords(p.surveyNumber, p.lgdVillage);
        // Also check encroachment via bbox of parcel
        const coords = ring;
        const lons = coords.map((c: number[]) => c[0]);
        const lats = coords.map((c: number[]) => c[1]);
        const bbox = {
          minLon: Math.min(...lons), minLat: Math.min(...lats),
          maxLon: Math.max(...lons), maxLat: Math.max(...lats),
        };
        const encFC = await fetchEncroachment(bbox);
        let encroachmentFlagged = false;
        let bbmpNotified = false;
        let revenueFlagged = false;
        if (encFC?.features?.length) {
          const sn = p.surveyNumber.split("/")[0].trim();
          const match = encFC.features.find((f: GeoJSON.Feature) => {
            const fp = (f.properties as Record<string, unknown>);
            return String(fp?.survey_no ?? "").split("/")[0].trim() === sn;
          });
          if (match) {
            const fp = match.properties as Record<string, unknown>;
            encroachmentFlagged = true;
            bbmpNotified = Boolean(fp.bbmp_notified);
            revenueFlagged = Boolean(fp.revenue_flagged);
          }
        }
        setEchawadiRecords({
          rccms:       records?.rccms ?? [],
          mutations:   records?.mutations ?? [],
          villageInfo: records?.villageInfo ?? null,
          loading: false, error: null,
          encroachmentFlagged, bbmpNotified, revenueFlagged,
        });
      })();
    }
  }, [setSelected, setEchawadiRecords]);

  // Analyze the selected parcel — runs the map's signal panels for its centroid + TRUE geometry AND
  // requests the GO / CAUTION / NO-GO verdict for the dock. Both use TRUE geometry, never the nudge.
  const handleAnalyzeParcel = useCallback(async () => {
    const sel = selected;
    if (!sel) return;
    const [clat, clon] = sel.centroid;
    const trueRing: [number, number][] = sel.geometryTrue.coordinates[0].map(([lo, la]) => [la, lo]);
    setCenter([clat, clon]);
    runAnalysisFor(clat, clon, trueRing, sel.areaSqm);
    setVerdictState({ analyzing: true, verdict: null, error: null });
    const res = await runBuilderSignals({
      lat: clat, lon: clon, polygon: trueRing, area: sel.areaSqm || 1000,
      label: sel.hasSurvey ? `Survey ${sel.surveyNumber}` : "Parcel",
      survey: sel.hasSurvey ? sel.surveyNumber : null,
    });
    setVerdictState({ analyzing: false, verdict: res.verdict, error: res.verdictError });
  }, [selected, runAnalysisFor]);

  function toggleModule(moduleId: ModuleId) {
    setExpanded((prev) => ({
      flood: false, sunpath: false, wind: false, temperature: false, rainfall: false,
      zone: false, planning: false, zoning: false, infrastructure: false, soil: false,
      waterConstraints: false, growth: false, land: false, amenities: false,
      zoneRing: false, farAssembly: false, obligations: false, connectivitySignal: false,
      utilities: false, overlays: false, terrain: false, priceUpside: false,
      [moduleId]: !prev[moduleId],
    }));
  }

  // Derive which module (if any) is currently expanded — drives score card tinting
  const activeModuleId = (Object.entries(expanded) as [ModuleId, boolean][])
    .find(([, v]) => v)?.[0];

  const activeModuleProp: ActiveModuleInfo | undefined = (() => {
    if (!activeModuleId) return undefined;
    const meta   = MODULE_META.find((m) => m.id === activeModuleId);
    const result = modules[activeModuleId];
    if (!meta || !result || result.loading) return undefined;
    return {
      name:    meta.name,
      label:   MODULE_ABBREV[activeModuleId],
      color:   meta.color,
      score:   result.score ?? 0,
      verdict: result.summary ?? SEVERITY_VERDICT[result.severity ?? "none"] ?? "Analysing…",
      desc:    result.summary,
    };
  })();

  const panelState = siteScore ? "populated" : "loading";

  // Only the modules the user selected at creation (default: all 5).
  const runModules = MODULE_META.filter(
    (m) => !project?.modules_run || project.modules_run.includes(m.id)
  );
  const selectedParcelKey = selected ? parcelKey(selected.surveyNumber, selected.geometryTrue) : "";

  if (!user) return null;

  const initials = getInitials(user);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-bg">
      <TopNav
        context="analysis"
        breadcrumbs={[
          { label: "Projects",              href: "/dashboard"    },
          { label: project?.name ?? "…",   href: `/project/${id}` },
        ]}
        userInitials={initials}
        userAvatarUrl={user.user_metadata?.avatar_url}
        userName={user.user_metadata?.full_name || user.email}
        userEmail={user.email}
        onSettingsClick={() => router.push("/settings")}
        onSignOut={async () => { await supabase.auth.signOut(); clearAuth(); router.replace("/login"); }}
        onExportClick={() => router.push(`/project/${id}/export`)}
      />

      {parcelAnalysisEnabled && (
        <ParcelVerdictDock
          selected={selected}
          state={verdictState}
          echawadiRecords={echawadiRecords}
          onAnalyze={handleAnalyzeParcel}
          onClear={() => { clearSelected(); setVerdictState({ analyzing: false, verdict: null, error: null }); }}
        />
      )}

      {/* Main layout — overview vs module detail */}
      <div className="pt-14 flex flex-1 min-h-0 overflow-hidden">

        {/* ── Module detail mode: icon rail + full map + floating card ── */}
        {detailModule !== null && (() => {
          const meta   = MODULE_META.find((m) => m.id === detailModule)!;
          const result = modules[detailModule];
          return (
            <>
              {/* Icon rail (52px) */}
              <div style={{
                width: 52, flexShrink: 0, background: "rgba(253,252,251,0.95)",
                borderRight: "1px solid #E2E8F0",
                display: "flex", flexDirection: "column", alignItems: "center",
                padding: "12px 0", gap: 4, zIndex: 10,
              }}>
                {/* Score pill */}
                <div style={{
                  background: "#306223", color: "white", borderRadius: 9999,
                  padding: "4px 8px", fontSize: 11, fontWeight: 700, marginBottom: 8,
                }}>
                  {siteScore?.overall_score ?? "—"}
                </div>

                {/* Module icons */}
                {runModules.map(({ id: mid, color, icon }) => {
                  const active = mid === detailModule;
                  return (
                    <button
                      key={mid}
                      onClick={() => setDetailModule(mid)}
                      title={MODULE_META.find((m) => m.id === mid)?.name}
                      style={{
                        width: 36, height: 36, borderRadius: 10,
                        display: "flex", flexDirection: "column", alignItems: "center",
                        justifyContent: "center", gap: 2, cursor: "pointer",
                        border: "none", background: active ? "#DAEBE3" : "none",
                        position: "relative",
                      }}
                      onMouseEnter={(e) => { if (!active) (e.currentTarget).style.background = "#F2EDE8"; }}
                      onMouseLeave={(e) => { if (!active) (e.currentTarget).style.background = "none"; }}
                    >
                      {active && (
                        <span style={{
                          position: "absolute", left: -1, top: "50%", transform: "translateY(-50%)",
                          width: 3, height: 20, background: color, borderRadius: "0 3px 3px 0",
                        }} />
                      )}
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
                      <span style={{ color: active ? color : "#B8C4BB", display: "flex" }}>
                        {icon}
                      </span>
                    </button>
                  );
                })}

                {/* Separator */}
                <div style={{ width: 24, height: 1, background: "#CFD6C4", margin: "4px 0" }} />

                {/* Back to overview */}
                <button
                  onClick={() => setDetailModule(null)}
                  title="Back to overview"
                  style={{
                    width: 36, height: 36, borderRadius: 10, border: "none",
                    background: "none", cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center", color: "#B8C4BB",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget).style.background = "#F2EDE8"; (e.currentTarget).style.color = "#306223"; }}
                  onMouseLeave={(e) => { (e.currentTarget).style.background = "none"; (e.currentTarget).style.color = "#B8C4BB"; }}
                >
                  <Settings size={15} aria-hidden />
                </button>
              </div>

              {/* Full-screen map with floating card */}
              <div className="relative flex-1">
                <MapContainer mode="full-screen" center={center} zoom={16} siteBoundary={boundaryPolygon ?? undefined} onParcelSelect={parcelAnalysisEnabled ? handleParcelSelect : undefined} selectedParcelKey={selectedParcelKey} showCadastralUI={profile === "builder"}>

                  {project?.boundary && (
                    boundaryPolygon
                      ? <SiteBoundaryOverlay shape="polygon" coordinates={boundaryPolygon} />
                      : showSiteCircle
                        ? <SiteBoundaryOverlay shape="circle" coordinates={{ center, radius: bufferM }} />
                        : null
                  )}
                  <ParcelOverlay geometry={parcel?.geometry} surveyNumber={parcel?.survey_number} />
                  {project && (
                    <SiteLabel
                      projectName={project.name}
                      coordinates={project.coordinates ?? ""}
                      area={project.area_sqm ? `${(project.area_sqm / 10000).toFixed(2)} ha` : "—"}
                      date={new Date(project.created_at).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    />
                  )}
                  {detailModule === "flood" && result && !result.loading && !result.error && (
                    <FloodZoneRings center={center} result={result} boundaryPolygon={boundaryPolygon} />
                  )}
                  {detailModule === "wind" && result && !result.loading && !result.error && (
                    <WindRose center={center} result={result} />
                  )}
                  {detailModule === "rainfall" && result && !result.loading && !result.error && (
                    <RainfallOverlay result={result} />
                  )}
                  {detailModule === "temperature" && result && !result.loading && !result.error && (
                    <ThermalField center={center} result={result} />
                  )}
                  {detailModule === "sunpath" && result && !result.loading && !result.error && result.solar && (
                    <SunPathArc center={center} result={result} />
                  )}
                  {detailModule === "zoning" && result && !result.loading && !result.error && result.zoning && (
                    <ZoningContextOverlay center={center} zoningResult={result} amenitiesResult={modules.amenities} showAmenities={showAmenities} />
                  )}
                  {detailModule === "zoning" && showClimate && modules.wind && !modules.wind.loading && !modules.wind.error && (
                    <WindRose center={center} result={modules.wind} />
                  )}
                  {detailModule === "zoning" && showClimate && modules.sunpath && !modules.sunpath.loading && !modules.sunpath.error && modules.sunpath.solar && (
                    <SunPathArc center={center} result={modules.sunpath} />
                  )}
                  <RoadWidthOverlay enabled={detailModule === "farAssembly"} siteBoundary={boundaryPolygon ?? undefined} />
                  <BwssbSewerageOverlay enabled={detailModule === "utilities"} siteBoundary={boundaryPolygon ?? undefined} />
                  <PowerLinesOverlay enabled={detailModule === "utilities"} siteBoundary={boundaryPolygon ?? undefined} />
                  <GasPipelineOverlay enabled={detailModule === "utilities"} siteBoundary={boundaryPolygon ?? undefined} />
                  <DrainageOverlay enabled={detailModule === "waterConstraints" || detailModule === "flood"} siteBoundary={boundaryPolygon ?? undefined} />
                  <DrawTools
                    hasSiteCircle={showSiteCircle && !boundaryPolygon}
                    onClear={() => setShowSiteCircle(false)}
                  />
                  <MapSearch topOffset={104} />
                </MapContainer>

                {/* HTML badge + legend overlay — not inside Leaflet */}
                {detailModule === "flood" && result && !result.loading && !result.error && (
                  <FloodZoneOverlay result={result} />
                )}
                {detailModule === "wind" && result && !result.loading && !result.error && (
                  <WindOverlay result={result} />
                )}
                {detailModule === "temperature" && result && !result.loading && !result.error && (
                  <TemperatureOverlay result={result} />
                )}
                {detailModule === "sunpath" && result && !result.loading && !result.error && result.solar && (
                  <SunOverlay result={result} />
                )}
                {detailModule === "zoning" && result && !result.loading && !result.error && result.zoning && (
                  <>
                    <ZoningComplianceHUD result={result} variant="full" corner="tl" />
                    <ZoningCapacityHUD result={result} variant="full" corner="bl" />
                    <ZoningMapLegend zoningResult={result} amenitiesResult={modules.amenities} showAmenities={showAmenities} />
                    <MapToggle
                      label="Amenities" icon={<MapPin size={14} />} top={130}
                      on={showAmenities} onToggle={() => setShowAmenities((v) => !v)}
                      count={modules.amenities?.amenityPoints?.length}
                    />
                    <MapToggle
                      label="Climate" icon={<Thermometer size={14} />} top={178} accent="#C4865A"
                      on={showClimate} onToggle={() => setShowClimate((v) => !v)}
                    />
                    {showClimate && (
                      <ClimateContextHUD
                        temperature={modules.temperature} wind={modules.wind} sunpath={modules.sunpath}
                      />
                    )}
                  </>
                )}

                <ModuleDetailCard
                  moduleId={detailModule}
                  moduleName={meta.name}
                  moduleColor={meta.color}
                  severity={result?.severity ?? "none"}
                  score={result?.score ?? 0}
                  indicators={result?.indicators}
                  charts={result?.charts}
                  qualitative={result?.qualitative}
                  detailMetrics={result?.detailMetrics}
                  recommendations={result?.recommendations}
                  summary={result?.summary}
                  onDismiss={() => setDetailModule(null)}
                />
              </div>
            </>
          );
        })()}

        {/* ── Overview mode: map + right panel ── */}
        {detailModule === null && (
          <>
            {/* Map */}
            <div className="relative flex-1">

              {/* 2D / 3D view toggle — top-right corner of map area */}
              <div style={{
                position: "absolute", top: 14, right: 14, zIndex: 500,
                display: "flex", gap: 0, borderRadius: 9,
                border: "1px solid rgba(207,214,196,0.8)",
                background: "rgba(253,252,251,0.92)",
                backdropFilter: "blur(10px)",
                boxShadow: "0 2px 10px rgba(58,63,59,0.12)",
                overflow: "hidden",
              }}>
                {(["2D", "3D"] as const).map((mode) => {
                  const active = (mode === "3D") === view3D;
                  return (
                    <button
                      key={mode}
                      onClick={() => setView3D(mode === "3D")}
                      style={{
                        padding: "5px 14px", fontSize: 11, fontWeight: 700,
                        border: "none", cursor: "pointer", fontFamily: "inherit",
                        background: active ? "#3A3F3B" : "transparent",
                        color: active ? "#FDFCFB" : "#7B8F83",
                        transition: "background 0.15s, color 0.15s",
                      }}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>

              {/* Compass — under the 2D/3D toggle; rotates with the live map bearing */}
              <MapCompass
                bearing={view3D ? bearing : 0}
                onResetNorth={() => view3D && setNorthNonce((n) => n + 1)}
              />

              {/* 3D scene (MapLibre + Three.js) — only after project coords loaded */}
              {view3D && project && (
                <Scene3D
                  center={center}
                  bufferM={bufferM}
                  mode={viewMode}
                  solar={solar}
                  hour={hour}
                  boundary={boundaryPolygon}
                  dayPoints={dayPoints}
                  showContext={showSurroundings}
                  onBearingChange={setBearing}
                  northNonce={northNonce}
                />
              )}

              {/* ── 3D control panel (bottom-centre) ── */}
              {view3D && (
                <div style={{
                  position: "absolute", bottom: 14, left: "50%",
                  transform: "translateX(-50%)", zIndex: 500,
                  display: "flex", flexDirection: "column", gap: 6,
                  alignItems: "center",
                }}>
                  {/* Date control — drives the accurate sun position + shadows */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 10px", borderRadius: 9,
                    border: "1px solid rgba(207,214,196,0.8)",
                    background: "rgba(253,252,251,0.92)",
                    backdropFilter: "blur(10px)",
                    boxShadow: "0 2px 10px rgba(58,63,59,0.12)",
                  }}>
                    {(["Jun 21,06-21", "Equinox,03-20", "Dec 21,12-21"]).map((s) => {
                      const [label, md] = s.split(",");
                      const d = `${selectedDate.slice(0, 4)}-${md}`;
                      const on = selectedDate === d;
                      return (
                        <button
                          key={md}
                          onClick={() => setSelectedDate(d)}
                          title={label === "Dec 21" ? "Winter solstice — worst-case shadows" : label}
                          style={{
                            padding: "3px 8px", fontSize: 10, fontWeight: 700, borderRadius: 6,
                            border: "none", cursor: "pointer", fontFamily: "inherit",
                            background: on ? "#F4A259" : "transparent",
                            color: on ? "#3A2A1A" : "#7B8F83",
                            transition: "background 0.15s, color 0.15s",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                      style={{
                        fontSize: 10, border: "1px solid #CFD6C4", borderRadius: 6,
                        padding: "2px 5px", color: "#3A3F3B", background: "#FDFCFB", fontFamily: "inherit",
                      }}
                    />
                    {solarDay?.dayLengthHours != null && (
                      <span style={{ fontSize: 9.5, color: "#7B8F83", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {solarDay.dayLengthHours.toFixed(1)} h sun
                      </span>
                    )}
                  </div>

                  {/* Hour slider */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "7px 14px", borderRadius: 9,
                    border: "1px solid rgba(207,214,196,0.8)",
                    background: "rgba(253,252,251,0.92)",
                    backdropFilter: "blur(10px)",
                    boxShadow: "0 2px 10px rgba(58,63,59,0.12)",
                  }}>
                    <span style={{ fontSize: 11, color: "#7B8F83", userSelect: "none" }}>☀</span>
                    <input
                      type="range"
                      min={sunRange.start}
                      max={sunRange.end}
                      step={0.25}
                      value={hour}
                      onChange={(e) => setHour(Number(e.target.value))}
                      style={{ width: 160, accentColor: "#F4A259", cursor: "pointer" }}
                    />
                    <span style={{
                      fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                      color: "#3A3F3B", minWidth: 36, fontFamily: "inherit",
                    }}>
                      {fmtHour(hour)}
                    </span>
                  </div>

                  {/* Massing / Diagram toggle */}
                  <div style={{
                    display: "flex", gap: 0, borderRadius: 9,
                    border: "1px solid rgba(207,214,196,0.8)",
                    background: "rgba(253,252,251,0.92)",
                    backdropFilter: "blur(10px)",
                    boxShadow: "0 2px 10px rgba(58,63,59,0.12)",
                    overflow: "hidden",
                  }}>
                    {(["massing", "diagram"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setViewMode(m)}
                        style={{
                          padding: "5px 14px", fontSize: 11, fontWeight: 700,
                          border: "none", cursor: "pointer", fontFamily: "inherit",
                          background: viewMode === m ? "#3A3F3B" : "transparent",
                          color: viewMode === m ? "#FDFCFB" : "#7B8F83",
                          transition: "background 0.15s, color 0.15s",
                          textTransform: "capitalize",
                        }}
                      >
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Surroundings toggle — hide/show the context-city massing */}
                  <button
                    type="button"
                    onClick={() => setShowSurroundings((v) => !v)}
                    aria-pressed={showSurroundings}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 12px", borderRadius: 9, cursor: "pointer",
                      border: "1px solid rgba(207,214,196,0.8)",
                      background: "rgba(253,252,251,0.92)",
                      backdropFilter: "blur(10px)",
                      boxShadow: "0 2px 10px rgba(58,63,59,0.12)",
                      fontSize: 11, fontWeight: 700, fontFamily: "inherit", color: "#3A3F3B",
                    }}
                  >
                    <span>Surroundings</span>
                    <span style={{
                      width: 26, height: 15, borderRadius: 999, flexShrink: 0,
                      background: showSurroundings ? "#306223" : "#CFD6C4",
                      position: "relative", transition: "background .14s",
                    }}>
                      <span style={{
                        position: "absolute", top: 2, left: showSurroundings ? 13 : 2,
                        width: 11, height: 11, borderRadius: "50%", background: "#FDFCFB",
                        transition: "left .14s", boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                      }} />
                    </span>
                  </button>
                </div>
              )}

              {/* 2D map + HTML overlays (Leaflet) — hidden when 3D is active */}
              {!view3D && (
                <>
                  <MapContainer mode="split" center={center} zoom={16} siteBoundary={boundaryPolygon ?? undefined} onParcelSelect={parcelAnalysisEnabled ? handleParcelSelect : undefined} selectedParcelKey={selectedParcelKey} showCadastralUI={profile === "builder"}>
                    {project?.boundary && (
                      boundaryPolygon
                        ? <SiteBoundaryOverlay shape="polygon" coordinates={boundaryPolygon} />
                        : showSiteCircle
                          ? <SiteBoundaryOverlay shape="circle" coordinates={{ center, radius: bufferM }} />
                          : null
                    )}
                    <ParcelOverlay geometry={parcel?.geometry} surveyNumber={parcel?.survey_number} />
                    {project && (
                      <SiteLabel
                        projectName={project.name}
                        coordinates={project.coordinates ?? ""}
                        area={project.area_sqm ? `${(project.area_sqm / 10000).toFixed(2)} ha` : "—"}
                        date={new Date(project.created_at).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      />
                    )}
                    {expanded.flood && modules.flood && !modules.flood.loading && !modules.flood.error && (
                      <FloodZoneRings center={center} result={modules.flood} boundaryPolygon={boundaryPolygon} />
                    )}
                    {expanded.wind && modules.wind && !modules.wind.loading && !modules.wind.error && (
                      <WindRose center={center} result={modules.wind} />
                    )}
                    {expanded.rainfall && modules.rainfall && !modules.rainfall.loading && !modules.rainfall.error && (
                      <RainfallOverlay result={modules.rainfall} />
                    )}
                    {expanded.temperature && modules.temperature && !modules.temperature.loading && !modules.temperature.error && (
                      <ThermalField center={center} result={modules.temperature} />
                    )}
                    {expanded.sunpath && modules.sunpath && !modules.sunpath.loading && !modules.sunpath.error && modules.sunpath.solar && (
                      <SunPathArc center={center} result={modules.sunpath} />
                    )}
                    {expanded.zoning && modules.zoning && !modules.zoning.loading && !modules.zoning.error && modules.zoning.zoning && (
                      <ZoningContextOverlay center={center} zoningResult={modules.zoning} amenitiesResult={modules.amenities} showAmenities={showAmenities} />
                    )}
                    {expanded.zoning && showClimate && modules.wind && !modules.wind.loading && !modules.wind.error && (
                      <WindRose center={center} result={modules.wind} />
                    )}
                    {expanded.zoning && showClimate && modules.sunpath && !modules.sunpath.loading && !modules.sunpath.error && modules.sunpath.solar && (
                      <SunPathArc center={center} result={modules.sunpath} />
                    )}
                    {/* Road-width FAR overlay: shown when farAssembly panel is open (Phase 3) */}
                    <RoadWidthOverlay enabled={expanded.farAssembly} siteBoundary={boundaryPolygon ?? undefined} />
                    {/* Utilities overlays: shown when utilities panel is open (Phase 4) */}
                    <BwssbSewerageOverlay enabled={expanded.utilities} siteBoundary={boundaryPolygon ?? undefined} />
                    <PowerLinesOverlay enabled={expanded.utilities} siteBoundary={boundaryPolygon ?? undefined} />
                    <GasPipelineOverlay enabled={expanded.utilities} siteBoundary={boundaryPolygon ?? undefined} />
                    {/* Drainage: shown when waterConstraints or flood panels are open */}
                    <DrainageOverlay enabled={expanded.waterConstraints || expanded.flood} siteBoundary={boundaryPolygon ?? undefined} />
                    <DrawTools
                      hasSiteCircle={showSiteCircle && !boundaryPolygon}
                      onClear={() => setShowSiteCircle(false)}
                    />
                    <MapSearch topOffset={104} />
                  </MapContainer>
                  {/* HTML badge + legend overlay — not inside Leaflet */}
                  {expanded.flood && modules.flood && !modules.flood.loading && !modules.flood.error && (
                    <FloodZoneOverlay result={modules.flood} />
                  )}
                  {expanded.wind && modules.wind && !modules.wind.loading && !modules.wind.error && (
                    <WindOverlay result={modules.wind} />
                  )}
                  {expanded.temperature && modules.temperature && !modules.temperature.loading && !modules.temperature.error && (
                    <TemperatureOverlay result={modules.temperature} />
                  )}
                  {expanded.sunpath && modules.sunpath && !modules.sunpath.loading && !modules.sunpath.error && modules.sunpath.solar && (
                    <SunOverlay result={modules.sunpath} />
                  )}
                  {expanded.zoning && modules.zoning && !modules.zoning.loading && !modules.zoning.error && modules.zoning.zoning && (
                    <>
                      <ZoningComplianceHUD result={modules.zoning} variant="compact" corner="tl" />
                      <ZoningCapacityHUD result={modules.zoning} variant="compact" corner="br" />
                      <ZoningMapLegend zoningResult={modules.zoning} amenitiesResult={modules.amenities} showAmenities={showAmenities} />
                      <MapToggle
                        label="Amenities" icon={<MapPin size={14} />} top={130}
                        on={showAmenities} onToggle={() => setShowAmenities((v) => !v)}
                        count={modules.amenities?.amenityPoints?.length}
                      />
                      <MapToggle
                        label="Climate" icon={<Thermometer size={14} />} top={178} accent="#C4865A"
                        on={showClimate} onToggle={() => setShowClimate((v) => !v)}
                      />
                      {showClimate && (
                        <ClimateContextHUD
                          temperature={modules.temperature} wind={modules.wind} sunpath={modules.sunpath}
                        />
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Right panel */}
            <RightPanel
              state={panelState}
              overallScore={siteScore?.overall_score}
              overallSeverity={siteScore?.overall_severity}
              verdictText={siteScore?.verdict_text}
              descText={siteScore?.desc_text}
              moduleProgress={siteScore?.module_progress}
              activeModule={activeModuleProp}
            >
              {runModules.map(({ id: moduleId, name, color }) => {
                const result = modules[moduleId];
                return (
                  <AnalysisModuleSection
                    key={moduleId}
                    moduleName={name}
                    moduleColor={color}
                    severity={result?.severity ?? "none"}
                    score={result?.score ?? 0}
                    confidence={result?.confidence}
                    loading={!result || result.loading}
                    error={result?.error}
                    indicators={result?.indicators}
                    charts={result?.charts}
                    qualitative={result?.qualitative}
                    dataSource={result?.data_source}
                    summary={result?.summary}
                    moduleSpecificContent={
                      moduleId === "sunpath" ? <SunPanel result={result} /> :
                      moduleId === "flood"   ? <FloodRiskPanel result={result} severity={result?.severity ?? "none"} /> :
                      moduleId === "wind"    ? <WindPanel result={result} severity={result?.severity ?? "none"} /> :
                      moduleId === "rainfall" ? <RainfallPanel result={result} severity={result?.severity ?? "none"} /> :
                      moduleId === "temperature" ? <TemperaturePanel result={result} severity={result?.severity ?? "none"} /> :
                      moduleId === "land" ? <LandRecordsPanel result={result} prefill={(() => {
                        const k = modules.zoning?.zoning?.kgis;
                        if (!k || k.type !== "Rural") return undefined;
                        return { district: k.district ?? undefined, taluk: k.taluk ?? undefined, hobli: k.hobli ?? undefined, village: k.village ?? undefined, villageCode: k.villageCode ?? undefined, surveyNumber: k.surveyNumber ?? undefined };
                      })()} /> :
                      undefined
                    }
                    expanded={expanded[moduleId]}
                    onToggle={() => toggleModule(moduleId)}
                    onDetailClick={() => setDetailModule(moduleId)}
                  />
                );
              })}
            </RightPanel>
          </>
        )}
      </div>

    </div>
  );
}
