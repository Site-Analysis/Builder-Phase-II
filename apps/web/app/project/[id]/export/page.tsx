"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { TopNav } from "@/components/layout/TopNav";
import { ExportDrawer, type ExportModule, type ExportSettings, type ExportFormats } from "@/components/layout/ExportDrawer";
import { ReportDocument } from "@/components/export/ReportDocument";
import { generatePdf, exportChartPngs, exportCsv, exportJson } from "@/lib/export/generators";
import { useAuthStore } from "@/lib/stores/auth";
import { useProjectStore } from "@/lib/stores/project";
import { useAnalysisStore, type ModuleId } from "@/lib/stores/analysis";
import { getProject } from "@/lib/api/projects";
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
  type AnalysisCoords,
} from "@/lib/api/analysis";

const MODULE_META: { id: ModuleId; name: string; color: string }[] = [
  { id: "sunpath",          name: "Sun Path",          color: "#F59E0B" },
  { id: "flood",            name: "Flood",             color: "#2563EB" },
  { id: "temperature",      name: "Temperature",       color: "#EF4444" },
  { id: "wind",             name: "Wind",              color: "#06B6D4" },
  { id: "rainfall",         name: "Rainfall",          color: "#7C3AED" },
  { id: "zoning",           name: "Zoning Compliance", color: "#B45309" },
  { id: "zone",             name: "Zone & Land Use",   color: "#10B981" },
  { id: "planning",         name: "Site Capacity",     color: "#F97316" },
  { id: "infrastructure",   name: "Connectivity",      color: "#0EA5E9" },
  { id: "soil",             name: "Soil Profile",      color: "#92400E" },
  { id: "waterConstraints", name: "Water Constraints", color: "#1D4ED8" },
  { id: "growth",           name: "Growth Context",    color: "#16A34A" },
  { id: "land",             name: "Title & Documents", color: "#6B21A8" },
  { id: "amenities",        name: "Amenities",         color: "#059669" },
];

const FETCHERS: Partial<Record<ModuleId, (c: AnalysisCoords) => Promise<unknown>>> = {
  flood:       getFloodAnalysis,
  rainfall:    getRainfallAnalysis,
  sunpath:     getSunpathAnalysis,
  wind:        getWindAnalysis,
  temperature: getTemperatureAnalysis,
  zone:              (c) => getZoneAnalysis(c.lat, c.lng),
  planning:          (c) => getPlanningAnalysis(c.lat, c.lng),
  zoning:            (c) => getZoningAnalysis(c.lat, c.lng),
  infrastructure:    (c) => getInfraAnalysis(c.lat, c.lng),
  soil:              (c) => getSoilAnalysis(c.lat, c.lng),
  waterConstraints:  (c) => getWaterConstraintsAnalysis(c.lat, c.lng),
  growth:            (c) => getGrowthAnalysis(c.lat, c.lng),
  amenities:         (c) => getAmenitiesAnalysis(c.lat, c.lng),
};

const DEFAULT_SETTINGS: ExportSettings = {
  citations:           true,
  regulatoryCrossRefs: true,
  charts:              true,
  language:            "English",
  paperSize:           "A4 Portrait",
  template:            "overview",
  formats:             { pdf: true, csv: false, png: false, json: false },
};

function getInitials(user: { email?: string; user_metadata?: { full_name?: string } }) {
  const name = user.user_metadata?.full_name;
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return user.email?.[0]?.toUpperCase() ?? "U";
}

export default function ExportPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const { setCurrentProject } = useProjectStore();
  const { modules: analysisModules, siteScore, setModuleLoading, setModuleResult, setModuleError, setSiteScore } = useAnalysisStore();

  const [project, setProject] = useState<Awaited<ReturnType<typeof getProject>> | null>(null);
  const [included, setIncluded] = useState<Set<ModuleId>>(new Set(MODULE_META.map((m) => m.id)));
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<"ready" | "generating">("ready");
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
  }, [user, router]);

  // Load project + hydrate any analysis results not already in the store.
  useEffect(() => {
    if (!id || !user) return;
    getProject(id).then((p) => {
      setProject(p);
      setCurrentProject(p);

      let lat = 12.9716, lng = 77.5946;
      if (p.boundary?.type === "Point" && Array.isArray(p.boundary.coordinates)) {
        lng = p.boundary.coordinates[0] as number;
        lat = p.boundary.coordinates[1] as number;
      }
      const coords: AnalysisCoords = { lat, lng, projectId: id };
      const run = new Set<ModuleId>(p.modules_run ?? MODULE_META.map((m) => m.id));
      setIncluded(run);

      const existing = useAnalysisStore.getState().modules;
      for (const { id: moduleId } of MODULE_META) {
        if (!run.has(moduleId)) continue;
        const cur = existing[moduleId];
        if (cur && !cur.loading && !cur.error) continue; // already hydrated
        setModuleLoading(moduleId);
        const fetcher = FETCHERS[moduleId];
        if (!fetcher) continue;
        fetcher(coords)
          .then((result) => setModuleResult(moduleId, result as never))
          .catch((err) => setModuleError(moduleId, err instanceof Error ? err.message : "Failed"));
      }
    }).catch(console.error);
  }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute composite score as module results resolve.
  useEffect(() => {
    const total = project?.modules_run?.length ?? 5;
    const score = computeSiteScore(analysisModules, total);
    if (score) setSiteScore(score);
  }, [analysisModules, project, setSiteScore]);

  const runMeta = useMemo(
    () => MODULE_META.filter((m) => !project?.modules_run || project.modules_run.includes(m.id)),
    [project]
  );

  const exportModules: ExportModule[] = runMeta.map((m) => {
    const r = analysisModules[m.id];
    return {
      id: m.id,
      name: m.name,
      color: m.color,
      score: r && !r.loading && !r.error ? r.score : undefined,
      verdict: r?.summary,
      included: included.has(m.id),
    };
  });

  const includedIds = exportModules.filter((m) => m.included).map((m) => m.id as ModuleId);

  function handleModuleToggle(modId: string, inc: boolean) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (inc) next.add(modId as ModuleId); else next.delete(modId as ModuleId);
      return next;
    });
  }

  function handleSettingChange(key: keyof Omit<ExportSettings, "formats">, value: boolean | string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleFormatToggle(key: keyof ExportFormats, value: boolean) {
    setSettings((prev) => ({ ...prev, formats: { ...prev.formats, [key]: value } }));
  }

  async function handleGenerate() {
    const base = project?.name || "project";
    setState("generating");
    try {
      // Let the offscreen report (and recharts) settle before capture.
      await new Promise((r) => setTimeout(r, 350));
      const el = reportRef.current;
      if (settings.formats.pdf && el) await generatePdf(el, base, settings.paperSize);
      if (settings.formats.png && el) await exportChartPngs(el, base);
      if (settings.formats.csv) exportCsv(project, analysisModules, base);
      if (settings.formats.json) exportJson(project, siteScore, analysisModules, base);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setState("ready");
    }
  }

  if (!user) return null;
  const initials = getInitials(user);

  const preview = (
    <div style={{ zoom: 0.62 } as React.CSSProperties}>
      <div style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.18)", borderRadius: 4, overflow: "hidden" }}>
        <ReportDocument
          project={project}
          modules={analysisModules}
          siteScore={siteScore}
          includedIds={includedIds}
          settings={settings}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-bg">
      <TopNav
        context="analysis"
        breadcrumbs={[
          { label: "Projects",            href: "/dashboard"            },
          { label: project?.name ?? "…",  href: `/project/${id}`        },
          { label: "Export",              href: `/project/${id}/export` },
        ]}
        userInitials={initials}
        userAvatarUrl={user.user_metadata?.avatar_url}
        onSettingsClick={() => router.push("/settings")}
      />
      <div className="pt-14 flex-1 overflow-hidden">
        <ExportDrawer
          projectName={project?.name ?? ""}
          state={state}
          modules={exportModules}
          settings={settings}
          preview={preview}
          onModuleToggle={handleModuleToggle}
          onSettingChange={handleSettingChange}
          onFormatToggle={handleFormatToggle}
          onGenerate={handleGenerate}
          onCancel={() => router.push(`/project/${id}`)}
        />
      </div>

      {/* Offscreen full-size report — captured by the PDF/PNG generators */}
      <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden>
        <ReportDocument
          ref={reportRef}
          project={project}
          modules={analysisModules}
          siteScore={siteScore}
          includedIds={includedIds}
          settings={settings}
        />
      </div>
    </div>
  );
}
