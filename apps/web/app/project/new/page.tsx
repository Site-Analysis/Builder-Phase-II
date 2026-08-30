// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sun, Waves, Thermometer, Wind, CloudRain, Scale, FileText } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { useAuthStore } from "@/lib/stores/auth";
import { signOut } from "next-auth/react";
import { useProjectStore } from "@/lib/stores/project";
import { useAnalysisStore } from "@/lib/stores/analysis";
import { useConfigStore } from "@/lib/stores/config";
import { useDrawStore } from "@/lib/stores/draw";
import { AnalysisConfigCard } from "@/components/map/AnalysisConfigCard";
import { SiteConfigCard } from "@/components/map/SiteConfigCard";
import { createProject } from "@/lib/api/projects";
import type { ModuleId } from "@/lib/stores/analysis";
import { useProfileStore } from "@/lib/stores/profile";
import type { CadastralParcel } from "@/lib/api/cadastral";
import { useUIStore } from "@/lib/stores/ui";

const MapContainer = dynamic(
  () => import("@/components/map/MapContainer").then((m) => m.MapContainer),
  { ssr: false }
);
const SiteBoundaryOverlay = dynamic(
  () => import("@/components/map/SiteBoundaryOverlay").then((m) => m.SiteBoundaryOverlay),
  { ssr: false }
);
const MapClickHandler = dynamic(
  () => import("@/components/map/MapClickHandler").then((m) => m.MapClickHandler),
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
const SiteContextDock = dynamic(
  () => import("@/components/map/SiteContextDock").then((m) => m.SiteContextDock),
  { ssr: false }
);
const SitePlanningCard = dynamic(
  () => import("@/components/map/SitePlanningCard").then((m) => m.SitePlanningCard),
  { ssr: false }
);


// TODO GH#55: boundary is a 200 m circle — replace with /api/geo/site-boundary when confirmed

type ModuleCategory = "climate" | "builder";
const ANALYSIS_MODULES: { id: ModuleId; name: string; color: string; icon: React.ReactNode; desc: string; category: ModuleCategory }[] = [
  { id: "sunpath",     name: "Sun Path",          color: "#F59E0B", icon: <Sun size={15} />,         desc: "Solar access, shadows, daylight",            category: "climate" },
  { id: "flood",       name: "Risks",             color: "#2563EB", icon: <Waves size={15} />,       desc: "Risk, terrain, hydrology",                   category: "climate" },
  { id: "temperature", name: "Temperature",       color: "#EF4444", icon: <Thermometer size={15} />, desc: "Thermal profile, comfort",                   category: "climate" },
  { id: "wind",        name: "Wind",              color: "#06B6D4", icon: <Wind size={15} />,         desc: "Speed, ventilation, gusts",                  category: "climate" },
  { id: "rainfall",    name: "Rainfall",          color: "#1D4ED8", icon: <CloudRain size={15} />,    desc: "Annual totals, wet days",                    category: "climate" },
  { id: "zoning",      name: "Zoning",            color: "#B45309", icon: <Scale size={15} />,        desc: "Zone, LULC, FAR, NA order, DGCA",            category: "builder" },
  { id: "land",        name: "Title & Documents", color: "#6B21A8", icon: <FileText size={15} />,     desc: "Survey number, parcel boundary, RTC/EC links", category: "builder" },
];

// ─── Drag helper ──────────────────────────────────────────────────────────────
function useDraggable(initialPos: { top: number; left: number }) {
  const [pos, setPos] = useState(initialPos);
  const origin = useRef<{ mx: number; my: number; top: number; left: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!origin.current) return;
      setPos({ top: origin.current.top + e.clientY - origin.current.my, left: origin.current.left + e.clientX - origin.current.mx });
    };
    const onUp = () => { origin.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);
  const onDragStart = (e: React.MouseEvent) => {
    const el = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-draggable]");
    const rect = el?.getBoundingClientRect();
    origin.current = { mx: e.clientX, my: e.clientY, top: rect?.top ?? pos.top, left: rect?.left ?? pos.left };
    e.preventDefault();
  };
  return { pos, onDragStart };
}

const DRAG_HANDLE: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  height: 20, cursor: "grab", color: "#B8C4BB", fontSize: 14, letterSpacing: 3, userSelect: "none",
  borderBottom: "1px solid rgba(207,214,196,0.4)", marginBottom: 4,
};


function getInitials(user: { email?: string; user_metadata?: { full_name?: string } }) {
  const name = user.user_metadata?.full_name;
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return user.email?.[0]?.toUpperCase() ?? "U";
}

function suggestName(address: string, isBuilder?: boolean) {
  if (!address) return "";
  const prefix = isBuilder ? "Builder Site" : "Site";
  if (/^-?\d/.test(address)) return `${prefix} — ${address}`;
  return address.split(",").slice(0, 2).map((s) => s.trim()).join(", ");
}

function _hav(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function boundingBoxDims(positions: [number, number][] | null | undefined): { nsM: number; ewM: number } | null {
  if (!positions || positions.length < 2) return null;
  const lats = positions.map(p => p[0]);
  const lons = positions.map(p => p[1]);
  const midLat = (Math.max(...lats) + Math.min(...lats)) / 2;
  return {
    nsM: _hav(Math.min(...lats), lons[0], Math.max(...lats), lons[0]),
    ewM: _hav(midLat, Math.min(...lons), midLat, Math.max(...lons)),
  };
}

// ─── Draggable config cards (left panel) ──────────────────────────────────────
function DraggableConfigCards({ projectName, onSiteNameChange, lat, lng, onStart, creating, error }: {
  projectName: string; onSiteNameChange: (v: string) => void; lat: number; lng: number;
  onStart: () => void; creating: boolean; error: string;
}) {
  const { pos, onDragStart } = useDraggable({ top: 70, left: 16 });
  return (
    <div data-draggable style={{ position: "fixed", top: pos.top, left: pos.left, width: 248, zIndex: 500, display: "flex", flexDirection: "column", gap: 8 }}>
      <div onMouseDown={onDragStart} style={{ ...DRAG_HANDLE, background: "rgba(253,252,251,0.7)", backdropFilter: "blur(8px)", borderRadius: 8, marginBottom: 0, border: "1px solid rgba(207,214,196,0.5)" }}>⠿⠿⠿ drag to move</div>
      <AnalysisConfigCard />
      <SiteConfigCard siteName={projectName} onSiteNameChange={onSiteNameChange} lat={lat} lng={lng} />
      <div>
        {error && (
          <div style={{ fontSize: 11, color: "#DC2626", marginBottom: 6, padding: "5px 10px", borderRadius: 6, background: "#FEF2F2", border: "1px solid #FCA5A5" }}>
            {error}
          </div>
        )}
        <button
          type="button" onClick={onStart} disabled={creating}
          style={{
            width: "100%", height: 38, borderRadius: 9, border: "none",
            background: creating ? "#24491a" : "#306223",
            color: "white", fontSize: 13, fontWeight: 600,
            cursor: creating ? "not-allowed" : "pointer",
            fontFamily: "inherit", opacity: creating ? 0.8 : 1,
          }}
          onMouseEnter={(e) => { if (!creating) (e.currentTarget as HTMLButtonElement).style.background = "#24491a"; }}
          onMouseLeave={(e) => { if (!creating) (e.currentTarget as HTMLButtonElement).style.background = "#306223"; }}
        >
          {creating ? "Creating…" : "Start Analysis →"}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NewAnalysisPage() {
  const router = useRouter();
  const { user, clearAuth }    = useAuthStore();
  const { setPendingProject }  = useProjectStore();
  const { resetAnalysis }      = useAnalysisStore();
  const { bufferM }            = useConfigStore();
  const drawnBoundary          = useDrawStore((s) => s.boundary);
  const siteMeasurements       = useDrawStore((s) => s.siteMeasurements);
  const setDrawnBoundary        = useDrawStore((s) => s.setBoundary);
  const { setPowerGridEnabled } = useUIStore();

  const [address,     setAddress]     = useState("");
  const [projectName, setProjectName] = useState("");
  const [center,      setCenter]      = useState<[number, number]>([12.9716, 77.5946]);
  const [pinDropped,  setPinDropped]  = useState(false);
  const [pinFromDraw, setPinFromDraw] = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [error,       setError]       = useState("");
  const profile = useProfileStore((s) => s.profile);
  const visibleModules = ANALYSIS_MODULES.filter(
    (m) => m.category === (profile === "builder" ? "builder" : "climate"),
  );

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  useEffect(() => {
    if (drawnBoundary?.positions?.length) setPowerGridEnabled(true);
  }, [drawnBoundary, setPowerGridEnabled]);

  if (!user) return null;

  function handleMapClick(lat: number, lng: number) {
    const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setCenter([lat, lng]);
    setPinDropped(true);
    setPinFromDraw(false);
    setAddress(coords);
    setProjectName(suggestName(coords, profile === "builder"));
    setError("");
  }

  function handleShapeCommitted(lat: number, lng: number) {
    const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setCenter([lat, lng]);
    setPinDropped(true);
    setPinFromDraw(true);
    setAddress(coords);
    setProjectName(suggestName(coords, profile === "builder"));
    setError("");
  }

  function handleCurrentLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => handleMapClick(coords.latitude, coords.longitude),
      () => setError("Location access denied.")
    );
  }

  function handleReset() {
    setPinDropped(false);
    setPinFromDraw(false);
    setAddress("");
    setProjectName("");
    setError("");
    setDrawnBoundary(null);
  }

  function handleParcelSelectOnNew(p: CadastralParcel) {
    const ring = p.geometry.coordinates?.[0] ?? [];
    if (!ring.length) return;
    const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    setCenter([lat, lon]);
    setPinDropped(true);
    setPinFromDraw(false);
    const label = p.surveyNumber ? `Survey ${p.surveyNumber}` : "Parcel";
    setAddress(label);
    setProjectName(suggestName(label, profile === "builder"));
    setError("");
  }

  async function handleStart() {
    if (!projectName.trim()) { setError("Project name is required."); return; }
    setError("");
    setCreating(true);
    resetAnalysis();
    try {
      let boundary: GeoJSON.Geometry;
      let polygon: [number, number][] | null = null;
      if (drawnBoundary && drawnBoundary.positions.length >= 3) {
        const ring = drawnBoundary.positions.map(([lat, lng]) => [lng, lat]);
        ring.push(ring[0]);
        boundary = { type: "Polygon", coordinates: [ring] };
        polygon = drawnBoundary.positions as [number, number][];
      } else {
        boundary = { type: "Point", coordinates: [center[1], center[0]] };
      }
      const modules_run = visibleModules.map((m) => m.id);
      const project = await createProject({
        name: projectName.trim(),
        location: address.trim() || `${center[0].toFixed(4)}, ${center[1].toFixed(4)}`,
        boundary,
        modules_run,
      });
      setPendingProject(project);
      router.push(`/project/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setCreating(false);
    }
  }

  const initials = getInitials(user);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-bg">
      <TopNav
        context="new-analysis"
        breadcrumbs={[
          { label: "Projects",     href: "/dashboard"   },
          { label: "New Analysis", href: "/project/new" },
        ]}
        userInitials={initials}
        userAvatarUrl={user.user_metadata?.avatar_url}
        userName={user.user_metadata?.full_name || user.email}
        userEmail={user.email}
        showCurrentLocation={!pinDropped}
        onCurrentLocationClick={handleCurrentLocation}
        onSettingsClick={() => router.push("/settings")}
        onSignOut={async () => { clearAuth(); await signOut({ callbackUrl: "/login" }); }}
        viewProfile={profile ?? undefined}
        onSwitchProfile={() => router.push("/select-profile")}
      />

      {/* Full-screen map */}
      <div className="pt-14 flex-1 relative" style={{ cursor: "crosshair" }}>
        <MapContainer mode="full-screen" showCadastralUI controlsAtBottom={pinDropped} onParcelSelect={handleParcelSelectOnNew} amenitiesCenter={pinDropped ? center : undefined}>
          <MapClickHandler onMapClick={handleMapClick} />
          {pinDropped && (
            <>
              <SiteBoundaryOverlay
                shape="circle"
                coordinates={{ center, radius: bufferM }}
              />
              <SitePlanningCard
                lat={center[0]}
                lon={center[1]}
                plotAreaSqm={siteMeasurements?.area ?? null}
                plotDims={boundingBoxDims(drawnBoundary?.positions)}
              />
            </>
          )}
          <DrawTools onShapeCommitted={handleShapeCommitted} />
          <MapSearch topOffset={104} />
        </MapContainer>

        {pinDropped && <SiteContextDock lat={center[0]} lon={center[1]} />}

        {/* Config cards — draggable, stacked flex column, appear once a pin is placed */}
        {pinDropped && <DraggableConfigCards projectName={projectName} onSiteNameChange={setProjectName} lat={center[0]} lng={center[1]} onStart={handleStart} creating={creating} error={error} />}



      </div>
    </div>
  );
}
