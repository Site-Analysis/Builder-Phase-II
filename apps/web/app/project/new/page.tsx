// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sun, Waves, Thermometer, Wind, CloudRain, Scale, FileText } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { useAuthStore } from "@/lib/stores/auth";
import { supabase } from "@/lib/supabase/client";
import { useProjectStore } from "@/lib/stores/project";
import { useAnalysisStore } from "@/lib/stores/analysis";
import { useConfigStore } from "@/lib/stores/config";
import { useDrawStore } from "@/lib/stores/draw";
import { AnalysisConfigCard } from "@/components/map/AnalysisConfigCard";
import { SiteConfigCard } from "@/components/map/SiteConfigCard";
import { createProject } from "@/lib/api/projects";
import type { ModuleId } from "@/lib/stores/analysis";
import { useProfileStore } from "@/lib/stores/profile";

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

// ─── Floating module selector ─────────────────────────────────────────────────
function ModuleSelector({
  modules, selected, onToggle, onAll, onNone, onStart, creating, error,
}: {
  modules: typeof ANALYSIS_MODULES;
  selected: Set<ModuleId>;
  onToggle: (id: ModuleId) => void;
  onAll: () => void;
  onNone: () => void;
  onStart: () => void;
  creating: boolean;
  error: string;
}) {
  return (
    <div style={{
      position: "absolute", top: 70, right: 16, width: 300, zIndex: 500,
      background: "rgba(253,252,251,0.55)",
      backdropFilter: "blur(16px) saturate(160%)",
      WebkitBackdropFilter: "blur(16px) saturate(160%)",
      border: "1px solid rgba(255,255,255,0.6)", borderRadius: 14,
      boxShadow: "0 8px 30px rgba(58,63,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px", borderBottom: "1px solid rgba(207,214,196,0.5)",
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3F3B" }}>Analyses to run</div>
          <div style={{ fontSize: 11, color: "#7B8F83", marginTop: 1 }}>{selected.size} of {modules.length} selected</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onAll}  style={pillBtn}>All</button>
          <button onClick={onNone} style={pillBtn}>None</button>
        </div>
      </div>

      <div style={{ padding: 8 }}>
        {modules.map((m) => {
          const on = selected.has(m.id);
          return (
            <button
              key={m.id}
              onClick={() => onToggle(m.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 10px", borderRadius: 8, cursor: "pointer",
                border: "1px solid", borderColor: on ? `${m.color}55` : "transparent",
                background: on ? `${m.color}10` : "transparent", textAlign: "left",
                fontFamily: "inherit", transition: "all 0.12s",
              }}
            >
              <span style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: on ? m.color : "#F0EDE9", color: on ? "#fff" : "#B8C4BB",
              }}>
                {m.icon}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3A3F3B" }}>{m.name}</span>
                <span style={{ display: "block", fontSize: 10.5, color: "#7B8F83" }}>{m.desc}</span>
              </span>
              <span style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                border: on ? "none" : "1.5px solid #CFD6C4",
                background: on ? m.color : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 11, fontWeight: 700,
              }}>
                {on ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ padding: "8px 12px 12px" }}>
        {error && (
          <div style={{
            fontSize: 11, color: "#DC2626", marginBottom: 8,
            padding: "5px 10px", borderRadius: 6,
            background: "#FEF2F2", border: "1px solid #FCA5A5",
          }}>
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={onStart}
          disabled={creating}
          style={{
            width: "100%", height: 36, borderRadius: 8, border: "none",
            background: creating ? "#24491a" : "#306223",
            color: "white", fontSize: 13, fontWeight: 600,
            cursor: creating ? "not-allowed" : "pointer",
            fontFamily: "inherit", opacity: creating ? 0.8 : 1,
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => { if (!creating) (e.currentTarget).style.background = "#24491a"; }}
          onMouseLeave={(e) => { if (!creating) (e.currentTarget).style.background = "#306223"; }}
        >
          {creating ? "Creating…" : "Start Analysis →"}
        </button>
      </div>
    </div>
  );
}

const pillBtn: React.CSSProperties = {
  height: 24, padding: "0 9px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.6)",
  background: "rgba(253,252,251,0.5)", color: "#306223", fontSize: 11, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
};

function getInitials(user: { email?: string; user_metadata?: { full_name?: string } }) {
  const name = user.user_metadata?.full_name;
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return user.email?.[0]?.toUpperCase() ?? "U";
}

function suggestName(address: string) {
  if (!address) return "";
  if (/^-?\d/.test(address)) return `Site at ${address}`;
  return address.split(",").slice(0, 2).map((s) => s.trim()).join(", ");
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NewAnalysisPage() {
  const router = useRouter();
  const { user, clearAuth }    = useAuthStore();
  const { setPendingProject }  = useProjectStore();
  const { resetAnalysis }      = useAnalysisStore();
  const { bufferM }            = useConfigStore();
  const drawnBoundary          = useDrawStore((s) => s.boundary);
  const setDrawnBoundary        = useDrawStore((s) => s.setBoundary);

  const [address,     setAddress]     = useState("");
  const [projectName, setProjectName] = useState("");
  const [center,      setCenter]      = useState<[number, number]>([12.9716, 77.5946]);
  const [pinDropped,  setPinDropped]  = useState(false);
  const [pinFromDraw, setPinFromDraw] = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [error,       setError]       = useState("");
  const [selected,    setSelected]    = useState<Set<ModuleId>>(new Set());
  const profile = useProfileStore((s) => s.profile);
  // The active view profile decides which analyses are offered.
  const visibleModules = ANALYSIS_MODULES.filter(
    (m) => m.category === (profile === "builder" ? "builder" : "climate"),
  );

  function toggleModule(id: ModuleId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  if (!user) return null;

  function handleMapClick(lat: number, lng: number) {
    if (pinDropped) return; // site already set — ignore stray clicks
    const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setCenter([lat, lng]);
    setPinDropped(true);
    setPinFromDraw(false);
    setAddress(coords);
    setProjectName(suggestName(coords));
    setError("");
  }

  function handleShapeCommitted(lat: number, lng: number) {
    const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setCenter([lat, lng]);
    setPinDropped(true);
    setPinFromDraw(true);
    setAddress(coords);
    setProjectName(suggestName(coords));
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

  async function handleStart() {
    if (!projectName.trim()) { setError("Project name is required."); return; }
    if (selected.size === 0) { setError("Select at least one analysis to run."); return; }
    setError("");
    setCreating(true);
    resetAnalysis();
    try {
      // Use the drawn rectangle/polygon as the site boundary when present;
      // otherwise fall back to the dropped marker point.
      let boundary: GeoJSON.Geometry;
      if (drawnBoundary && drawnBoundary.positions.length >= 3) {
        const ring = drawnBoundary.positions.map(([lat, lng]) => [lng, lat]);
        ring.push(ring[0]); // close the ring
        boundary = { type: "Polygon", coordinates: [ring] };
      } else {
        boundary = { type: "Point", coordinates: [center[1], center[0]] };
      }
      // Preserve the canonical module order.
      const modules_run = visibleModules.map((m) => m.id).filter((id) => selected.has(id));
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
        onSignOut={async () => { await supabase.auth.signOut(); clearAuth(); router.replace("/login"); }}
        viewProfile={profile ?? undefined}
        onSwitchProfile={() => router.push("/select-profile")}
      />

      {/* Full-screen map */}
      <div className="pt-14 flex-1 relative" style={{ cursor: "crosshair" }}>
        <MapContainer mode="full-screen">
          <MapClickHandler onMapClick={handleMapClick} />
          {pinDropped && (
            <SiteBoundaryOverlay
              shape="circle"
              coordinates={{ center, radius: bufferM }}
            />
          )}
          <DrawTools onShapeCommitted={handleShapeCommitted} />
          <MapSearch />
        </MapContainer>

        {/* Config cards — stacked flex column, appear once a pin is placed */}
        {pinDropped && (
          <div style={{
            position: "absolute", top: 70, left: 16, width: 248, zIndex: 500,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <AnalysisConfigCard />
            <SiteConfigCard
              siteName={projectName}
              onSiteNameChange={setProjectName}
              lat={center[0]}
              lng={center[1]}
            />
          </div>
        )}
        {pinDropped && (
          <ModuleSelector
            modules={visibleModules}
            selected={selected}
            onToggle={toggleModule}
            onAll={() => setSelected(new Set(visibleModules.map((m) => m.id)))}
            onNone={() => setSelected(new Set())}
            onStart={handleStart}
            creating={creating}
            error={error}
          />
        )}



      </div>
    </div>
  );
}
