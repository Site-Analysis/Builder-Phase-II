"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sun, Waves, Thermometer, Wind, CloudRain } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { useAuthStore } from "@/lib/stores/auth";
import { useProjectStore } from "@/lib/stores/project";
import { useAnalysisStore } from "@/lib/stores/analysis";
import { useConfigStore } from "@/lib/stores/config";
import { AnalysisConfigCard } from "@/components/map/AnalysisConfigCard";
import { createProject } from "@/lib/api/projects";
import type { ModuleId } from "@/lib/stores/analysis";

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

const ANALYSIS_MODULES: { id: ModuleId; name: string; color: string; icon: React.ReactNode; desc: string }[] = [
  { id: "sunpath",     name: "Sun Path",    color: "#F59E0B", icon: <Sun size={15} />,         desc: "Solar access, shadows, daylight" },
  { id: "flood",       name: "Flood",       color: "#2563EB", icon: <Waves size={15} />,       desc: "Risk, terrain, hydrology" },
  { id: "temperature", name: "Temperature", color: "#EF4444", icon: <Thermometer size={15} />, desc: "Thermal profile, comfort" },
  { id: "wind",        name: "Wind",        color: "#06B6D4", icon: <Wind size={15} />,         desc: "Speed, ventilation, gusts" },
  { id: "rainfall",    name: "Rainfall",    color: "#7C3AED", icon: <CloudRain size={15} />,    desc: "Annual totals, wet days" },
];

// ─── Floating module selector ─────────────────────────────────────────────────
function ModuleSelector({
  selected, onToggle, onAll, onNone,
}: {
  selected: Set<ModuleId>;
  onToggle: (id: ModuleId) => void;
  onAll: () => void;
  onNone: () => void;
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
          <div style={{ fontSize: 11, color: "#7B8F83", marginTop: 1 }}>{selected.size} of 5 selected</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onAll}  style={pillBtn}>All</button>
          <button onClick={onNone} style={pillBtn}>None</button>
        </div>
      </div>

      <div style={{ padding: 8 }}>
        {ANALYSIS_MODULES.map((m) => {
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
    </div>
  );
}

const pillBtn: React.CSSProperties = {
  height: 24, padding: "0 9px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.6)",
  background: "rgba(253,252,251,0.5)", color: "#657166", fontSize: 11, fontWeight: 600,
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

// ─── Inline search bar for TopNav centerContent ───────────────────────────────
interface SearchBarProps {
  pinDropped:  boolean;
  address:     string;
  projectName: string;
  error:       string;
  creating:    boolean;
  onAddressChange:     (v: string) => void;
  onProjectNameChange: (v: string) => void;
  onCurrentLocation:   () => void;
  onStart:             () => void;
  onReset:             () => void;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
}

function SearchBar({
  pinDropped, address, projectName, error, creating,
  onAddressChange, onProjectNameChange, onCurrentLocation, onStart, onReset,
  nameInputRef,
}: SearchBarProps) {
  const inputBase: React.CSSProperties = {
    height: 34, border: "1.5px solid #CFD6C4", borderRadius: 8,
    padding: "0 11px", fontSize: 13, fontFamily: "inherit",
    color: "#3A3F3B", outline: "none", background: "#F2EDE8",
  };

  if (!pinDropped) {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, maxWidth: 520 }}>
        <input
          type="text"
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="Search address, place, or paste lat, lon…"
          style={{ ...inputBase, flex: 1 }}
          onFocus={(e) => { e.target.style.borderColor = "#99CDD8"; e.target.style.background = "#FDFCFB"; }}
          onBlur={(e)  => { e.target.style.borderColor = "#CFD6C4"; e.target.style.background = "#F2EDE8"; }}
        />
        <button
          type="button"
          onClick={onCurrentLocation}
          style={{
            height: 34, padding: "0 12px", borderRadius: 8,
            border: "1.5px solid #657166", background: "none",
            color: "#657166", fontSize: 12, fontWeight: 600,
            cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { (e.currentTarget).style.background = "#DAEBE3"; }}
          onMouseLeave={(e) => { (e.currentTarget).style.background = "none"; }}
        >
          Use current location
        </button>
      </div>
    );
  }

  // Pin dropped — address confirmed + project name + start
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, maxWidth: 640 }}>
      {/* Confirmed address */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, height: 34,
        padding: "0 10px", borderRadius: 8, border: "1.5px solid #5A8F6A",
        background: "#E4F0E8", minWidth: 0, maxWidth: 200, flexShrink: 0,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#5A8F6A", flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: "#3A3F3B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {address}
        </span>
      </div>

      {/* Change */}
      <button
        type="button"
        onClick={onReset}
        style={{
          height: 34, padding: "0 10px", borderRadius: 8,
          border: "1.5px solid #CFD6C4", background: "none",
          color: "#7B8F83", fontSize: 12, fontWeight: 500,
          cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", flexShrink: 0,
        }}
        onMouseEnter={(e) => { (e.currentTarget).style.borderColor = "#657166"; (e.currentTarget).style.color = "#657166"; }}
        onMouseLeave={(e) => { (e.currentTarget).style.borderColor = "#CFD6C4"; (e.currentTarget).style.color = "#7B8F83"; }}
      >
        Change
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "#CFD6C4", flexShrink: 0 }} />

      {/* Project name */}
      <input
        ref={nameInputRef}
        type="text"
        value={projectName}
        onChange={(e) => onProjectNameChange(e.target.value)}
        placeholder="Project name…"
        style={{
          ...inputBase,
          flex: 1,
          borderColor: error ? "#DC2626" : "#CFD6C4",
          minWidth: 120,
        }}
        onFocus={(e) => { e.target.style.borderColor = "#99CDD8"; e.target.style.background = "#FDFCFB"; e.target.style.boxShadow = "0 0 0 3px rgba(153,205,216,0.18)"; }}
        onBlur={(e)  => { e.target.style.borderColor = error ? "#DC2626" : "#CFD6C4"; e.target.style.background = "#F2EDE8"; e.target.style.boxShadow = "none"; }}
      />

      {/* Start */}
      <button
        type="button"
        onClick={onStart}
        disabled={creating}
        style={{
          height: 34, padding: "0 14px", borderRadius: 8,
          background: creating ? "#4D5850" : "#657166",
          color: "white", border: "none", fontSize: 13, fontWeight: 600,
          cursor: creating ? "not-allowed" : "pointer",
          whiteSpace: "nowrap", fontFamily: "inherit", flexShrink: 0,
          opacity: creating ? 0.8 : 1,
        }}
        onMouseEnter={(e) => { if (!creating) (e.currentTarget).style.background = "#4D5850"; }}
        onMouseLeave={(e) => { if (!creating) (e.currentTarget).style.background = "#657166"; }}
      >
        {creating ? "Creating…" : "Start Analysis →"}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NewAnalysisPage() {
  const router = useRouter();
  const { user }               = useAuthStore();
  const { setPendingProject }  = useProjectStore();
  const { resetAnalysis }      = useAnalysisStore();
  const { bufferM }            = useConfigStore();

  const [address,     setAddress]     = useState("");
  const [projectName, setProjectName] = useState("");
  const [center,      setCenter]      = useState<[number, number]>([12.9716, 77.5946]);
  const [pinDropped,  setPinDropped]  = useState(false);
  const [pinFromDraw, setPinFromDraw] = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [error,       setError]       = useState("");
  const [selected,    setSelected]    = useState<Set<ModuleId>>(new Set());
  const nameInputRef = useRef<HTMLInputElement>(null);

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
    const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setCenter([lat, lng]);
    setPinDropped(true);
    setPinFromDraw(false);
    setAddress(coords);
    setProjectName(suggestName(coords));
    setError("");
    setTimeout(() => nameInputRef.current?.focus(), 80);
  }

  function handleShapeCommitted(lat: number, lng: number) {
    const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setCenter([lat, lng]);
    setPinDropped(true);
    setPinFromDraw(true);
    setAddress(coords);
    setProjectName(suggestName(coords));
    setError("");
    setTimeout(() => nameInputRef.current?.focus(), 80);
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
  }

  async function handleStart() {
    if (!projectName.trim()) { setError("Project name is required."); return; }
    if (selected.size === 0) { setError("Select at least one analysis to run."); return; }
    setError("");
    setCreating(true);
    resetAnalysis();
    try {
      const boundary: GeoJSON.Geometry = { type: "Point", coordinates: [center[1], center[0]] };
      // Preserve the canonical module order.
      const modules_run = ANALYSIS_MODULES.map((m) => m.id).filter((id) => selected.has(id));
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

  const searchBar = (
    <SearchBar
      pinDropped={pinDropped}
      address={address}
      projectName={projectName}
      error={error}
      creating={creating}
      onAddressChange={setAddress}
      onProjectNameChange={(v) => { setProjectName(v); if (error) setError(""); }}
      onCurrentLocation={handleCurrentLocation}
      onStart={handleStart}
      onReset={handleReset}
      nameInputRef={nameInputRef}
    />
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-bg">
      <TopNav
        context="new-analysis"
        breadcrumbs={[
          { label: "Projects",     href: "/dashboard"   },
          { label: "New Analysis", href: "/project/new" },
        ]}
        centerContent={searchBar}
        userInitials={initials}
        userAvatarUrl={user.user_metadata?.avatar_url}
        onSettingsClick={() => router.push("/settings")}
      />

      {/* Full-screen map */}
      <div className="pt-14 flex-1 relative" style={{ cursor: "crosshair" }}>
        <MapContainer mode="full-screen">
          <MapClickHandler onMapClick={handleMapClick} />
          {pinDropped && !pinFromDraw && (
            <SiteBoundaryOverlay
              shape="circle"
              coordinates={{ center, radius: bufferM }}
            />
          )}
          <DrawTools onShapeCommitted={handleShapeCommitted} />
          <MapSearch />
        </MapContainer>

        {/* Config card + Module selector — appear once a pin is placed */}
        {pinDropped && <AnalysisConfigCard />}
        {pinDropped && (
          <ModuleSelector
            selected={selected}
            onToggle={toggleModule}
            onAll={() => setSelected(new Set(ANALYSIS_MODULES.map((m) => m.id)))}
            onNone={() => setSelected(new Set())}
          />
        )}

        {/* Error toast (only for geolocation / creation errors) */}
        {error && (
          <div style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
            background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8,
            padding: "8px 14px", fontSize: 12, color: "#DC2626", zIndex: 500,
            pointerEvents: "none", whiteSpace: "nowrap",
          }}>
            {error}
          </div>
        )}


      </div>
    </div>
  );
}
