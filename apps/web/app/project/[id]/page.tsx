"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Sun, Waves, Thermometer, Wind, CloudRain, Settings } from "lucide-react";
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
import { RainfallOverlay } from "@/components/map/RainfallOverlay";
import { TemperaturePanel } from "@/components/layout/TemperaturePanel";
import { TemperatureOverlay } from "@/components/map/TemperatureOverlay";
import { SunOverlay } from "@/components/map/SunOverlay";
import { useAuthStore } from "@/lib/stores/auth";
import { useProjectStore } from "@/lib/stores/project";
import { useAnalysisStore } from "@/lib/stores/analysis";
import { useConfigStore } from "@/lib/stores/config";
import { getProject } from "@/lib/api/projects";
import {
  computeSiteScore,
  getFloodAnalysis,
  getRainfallAnalysis,
  getSunpathAnalysis,
  getWindAnalysis,
  getTemperatureAnalysis,
  type AnalysisCoords,
} from "@/lib/api/analysis";
import type { ModuleId } from "@/lib/stores/analysis";

// React-Leaflet has no SSR support — dynamic import required
const MapContainer = dynamic(
  () => import("@/components/map/MapContainer").then((m) => m.MapContainer),
  { ssr: false }
);
const SiteBoundaryOverlay = dynamic(
  () => import("@/components/map/SiteBoundaryOverlay").then((m) => m.SiteBoundaryOverlay),
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
const RainfallRose = dynamic(
  () => import("@/components/map/RainfallRose").then((m) => m.RainfallRose),
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

// TODO GH#53: all 5 analysis endpoints unconfirmed — responses are mapped via defensive guesses

const SEVERITY_VERDICT: Record<string, string> = {
  none: "Optimal", low: "Low risk", moderate: "Moderate risk", high: "High risk",
};

const MODULE_ABBREV: Record<ModuleId, string> = {
  sunpath: "SUN", flood: "FLOOD", temperature: "TEMP", wind: "WIND", rainfall: "RAIN",
};

const MODULE_META: {
  id: ModuleId;
  name: string;
  color: string;
  icon: React.ReactNode;
}[] = [
  { id: "sunpath",     name: "Sun Path",    color: "#F59E0B", icon: <Sun size={14} />         },
  { id: "flood",       name: "Flood",       color: "#2563EB", icon: <Waves size={14} />       },
  { id: "temperature", name: "Temperature", color: "#EF4444", icon: <Thermometer size={14} /> },
  { id: "wind",        name: "Wind",        color: "#06B6D4", icon: <Wind size={14} />        },
  { id: "rainfall",    name: "Rainfall",    color: "#7C3AED", icon: <CloudRain size={14} />   },
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

  const { user }             = useAuthStore();
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

  const [project,      setProject]      = useState<Awaited<ReturnType<typeof getProject>> | null>(null);
  const [center,       setCenter]       = useState<[number, number]>([12.9716, 77.5946]);
  const [detailModule, setDetailModule] = useState<ModuleId | null>(null);
  const [expanded,     setExpanded]     = useState<Record<ModuleId, boolean>>({
    flood: true, sunpath: false, wind: false, temperature: false, rainfall: false,
  });

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
  }, [user, router]);

  useEffect(() => {
    if (!id || !user) return;
    resetAnalysis();
    getProject(id).then((p) => {
      setProject(p);
      setCurrentProject(p);

      // Extract lat/lng from the GeoJSON Point boundary, fall back to Bangalore
      let lat = 12.9716, lng = 77.5946;
      if (p.boundary?.type === "Point" && Array.isArray(p.boundary.coordinates)) {
        lng = p.boundary.coordinates[0] as number;
        lat = p.boundary.coordinates[1] as number;
      }
      setCenter([lat, lng]);
      const coords: AnalysisCoords = { lat, lng, projectId: id, bufferM, startDate, endDate };

      // Only run the modules the user selected at creation (default: all 5).
      const run = new Set<ModuleId>(p.modules_run ?? MODULE_META.map((m) => m.id));
      const allFetchers: [ModuleId, () => Promise<unknown>][] = [
        ["flood",       () => getFloodAnalysis(coords)],
        ["rainfall",    () => getRainfallAnalysis(coords)],
        ["sunpath",     () => getSunpathAnalysis(coords)],
        ["wind",        () => getWindAnalysis(coords)],
        ["temperature", () => getTemperatureAnalysis(coords)],
      ];

      // Open the first selected module in canonical order.
      const firstSelected = MODULE_META.find((m) => run.has(m.id))?.id;
      if (firstSelected) {
        setExpanded({
          flood: false, sunpath: false, wind: false, temperature: false, rainfall: false,
          [firstSelected]: true,
        });
      }

      for (const [moduleId, fetcher] of allFetchers) {
        if (!run.has(moduleId)) continue;
        setModuleLoading(moduleId);
        fetcher()
          .then((result) => setModuleResult(moduleId, result as never))
          .catch((err) => setModuleError(moduleId, err instanceof Error ? err.message : "Failed"));
      }
    }).catch(console.error);
  }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Composite site score — recomputed from module results as they resolve.
  useEffect(() => {
    const total = project?.modules_run?.length ?? 5;
    const score = computeSiteScore(modules, total);
    if (score) setSiteScore(score);
  }, [modules, project, setSiteScore]);

  function toggleModule(moduleId: ModuleId) {
    setExpanded((prev) => ({
      flood: false, sunpath: false, wind: false, temperature: false, rainfall: false,
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
        onSettingsClick={() => router.push("/settings")}
        onExportClick={() => router.push(`/project/${id}/export`)}
      />

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
                  background: "#657166", color: "white", borderRadius: 9999,
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
                  onMouseEnter={(e) => { (e.currentTarget).style.background = "#F2EDE8"; (e.currentTarget).style.color = "#657166"; }}
                  onMouseLeave={(e) => { (e.currentTarget).style.background = "none"; (e.currentTarget).style.color = "#B8C4BB"; }}
                >
                  <Settings size={15} aria-hidden />
                </button>
              </div>

              {/* Full-screen map with floating card */}
              <div className="relative flex-1">
                <MapContainer mode="full-screen" center={center} zoom={16}>

                  {project?.boundary && (
                    <SiteBoundaryOverlay
                      shape="circle"
                      coordinates={{ center, radius: bufferM }}
                    />
                  )}
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
                    <FloodZoneRings center={center} result={result} />
                  )}
                  {detailModule === "wind" && result && !result.loading && !result.error && (
                    <WindRose center={center} result={result} />
                  )}
                  {detailModule === "rainfall" && result && !result.loading && !result.error && (
                    <RainfallRose center={center} result={result} />
                  )}
                  {detailModule === "temperature" && result && !result.loading && !result.error && (
                    <ThermalField center={center} result={result} />
                  )}
                  {detailModule === "sunpath" && result && !result.loading && !result.error && result.solar && (
                    <SunPathArc center={center} result={result} />
                  )}
                  <DrawTools />
                  <MapSearch />
                </MapContainer>

                {/* HTML badge + legend overlay — not inside Leaflet */}
                {detailModule === "flood" && result && !result.loading && !result.error && (
                  <FloodZoneOverlay result={result} />
                )}
                {detailModule === "wind" && result && !result.loading && !result.error && (
                  <WindOverlay result={result} />
                )}
                {detailModule === "rainfall" && result && !result.loading && !result.error && (
                  <RainfallOverlay result={result} />
                )}
                {detailModule === "temperature" && result && !result.loading && !result.error && (
                  <TemperatureOverlay result={result} />
                )}
                {detailModule === "sunpath" && result && !result.loading && !result.error && result.solar && (
                  <SunOverlay result={result} />
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
              <MapContainer mode="split" center={center} zoom={16}>
                {project?.boundary && (
                  <SiteBoundaryOverlay
                    shape="circle"
                    coordinates={{ center, radius: bufferM }}
                  />
                )}
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
                  <FloodZoneRings center={center} result={modules.flood} />
                )}
                {expanded.wind && modules.wind && !modules.wind.loading && !modules.wind.error && (
                  <WindRose center={center} result={modules.wind} />
                )}
                {expanded.rainfall && modules.rainfall && !modules.rainfall.loading && !modules.rainfall.error && (
                  <RainfallRose center={center} result={modules.rainfall} />
                )}
                {expanded.temperature && modules.temperature && !modules.temperature.loading && !modules.temperature.error && (
                  <ThermalField center={center} result={modules.temperature} />
                )}
                {expanded.sunpath && modules.sunpath && !modules.sunpath.loading && !modules.sunpath.error && modules.sunpath.solar && (
                  <SunPathArc center={center} result={modules.sunpath} />
                )}
                <DrawTools />
                <MapSearch topOffset={16} />
              </MapContainer>
              {/* HTML badge + legend overlay — not inside Leaflet */}
              {expanded.flood && modules.flood && !modules.flood.loading && !modules.flood.error && (
                <FloodZoneOverlay result={modules.flood} />
              )}
              {expanded.wind && modules.wind && !modules.wind.loading && !modules.wind.error && (
                <WindOverlay result={modules.wind} />
              )}
              {expanded.rainfall && modules.rainfall && !modules.rainfall.loading && !modules.rainfall.error && (
                <RainfallOverlay result={modules.rainfall} />
              )}
              {expanded.temperature && modules.temperature && !modules.temperature.loading && !modules.temperature.error && (
                <TemperatureOverlay result={modules.temperature} />
              )}
              {expanded.sunpath && modules.sunpath && !modules.sunpath.loading && !modules.sunpath.error && modules.sunpath.solar && (
                <SunOverlay result={modules.sunpath} />
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
