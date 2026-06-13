"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sun, Waves, Thermometer, Wind, CloudRain } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { useAuthStore } from "@/lib/stores/auth";
import { useProjectStore } from "@/lib/stores/project";
import { useAnalysisStore } from "@/lib/stores/analysis";
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
      position: "absolute", top: 16, right: 16, width: 300, zIndex: 500,
      background: "rgba(255,255,255,0.97)", backdropFilter: "blur(6px)",
      border: "1px solid #E2E8F0", borderRadius: 12,
      boxShadow: "0 8px 30px rgba(0,0,0,0.12)", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px", borderBottom: "1px solid #E2E8F0",
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Analyses to run</div>
          <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{selected.size} of 5 selected</div>
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
                background: on ? m.color : "#F1F5F9", color: on ? "#fff" : "#94A3B8",
              }}>
                {m.icon}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{m.name}</span>
                <span style={{ display: "block", fontSize: 10.5, color: "#64748B" }}>{m.desc}</span>
              </span>
              <span style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                border: on ? "none" : "1.5px solid #CBD5E1",
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
  height: 24, padding: "0 9px", borderRadius: 6, border: "1px solid #E2E8F0",
  background: "#fff", color: "#64748B", fontSize: 11, fontWeight: 600,
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
    height: 34, border: "1.5px solid #E2E8F0", borderRadius: 8,
    padding: "0 11px", fontSize: 13, fontFamily: "inherit",
    color: "#0F172A", outline: "none", background: "#F8F9FA",
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
          onFocus={(e) => { e.target.style.borderColor = "#1A3A5C"; e.target.style.background = "#fff"; }}
          onBlur={(e)  => { e.target.style.borderColor = "#E2E8F0"; e.target.style.background = "#F8F9FA"; }}
        />
        <button
          type="button"
          onClick={onCurrentLocation}
          style={{
            height: 34, padding: "0 12px", borderRadius: 8,
            border: "1.5px solid #1A3A5C", background: "none",
            color: "#1A3A5C", fontSize: 12, fontWeight: 600,
            cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { (e.currentTarget).style.background = "#EFF6FF"; }}
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
        padding: "0 10px", borderRadius: 8, border: "1.5px solid #16A34A",
        background: "#F0FDF4", minWidth: 0, maxWidth: 200, flexShrink: 0,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16A34A", flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {address}
        </span>
      </div>

      {/* Change */}
      <button
        type="button"
        onClick={onReset}
        style={{
          height: 34, padding: "0 10px", borderRadius: 8,
          border: "1.5px solid #E2E8F0", background: "none",
          color: "#64748B", fontSize: 12, fontWeight: 500,
          cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", flexShrink: 0,
        }}
        onMouseEnter={(e) => { (e.currentTarget).style.borderColor = "#1A3A5C"; (e.currentTarget).style.color = "#1A3A5C"; }}
        onMouseLeave={(e) => { (e.currentTarget).style.borderColor = "#E2E8F0"; (e.currentTarget).style.color = "#64748B"; }}
      >
        Change
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "#E2E8F0", flexShrink: 0 }} />

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
          borderColor: error ? "#DC2626" : "#E2E8F0",
          minWidth: 120,
        }}
        onFocus={(e) => { e.target.style.borderColor = "#1A3A5C"; e.target.style.background = "#fff"; e.target.style.boxShadow = "0 0 0 3px rgba(26,58,92,0.08)"; }}
        onBlur={(e)  => { e.target.style.borderColor = error ? "#DC2626" : "#E2E8F0"; e.target.style.background = "#F8F9FA"; e.target.style.boxShadow = "none"; }}
      />

      {/* Start */}
      <button
        type="button"
        onClick={onStart}
        disabled={creating}
        style={{
          height: 34, padding: "0 14px", borderRadius: 8,
          background: creating ? "#256B5F" : "#2E7D6F",
          color: "white", border: "none", fontSize: 13, fontWeight: 600,
          cursor: creating ? "not-allowed" : "pointer",
          whiteSpace: "nowrap", fontFamily: "inherit", flexShrink: 0,
          opacity: creating ? 0.8 : 1,
        }}
        onMouseEnter={(e) => { if (!creating) (e.currentTarget).style.background = "#256B5F"; }}
        onMouseLeave={(e) => { if (!creating) (e.currentTarget).style.background = "#2E7D6F"; }}
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

  const [address,     setAddress]     = useState("");
  const [projectName, setProjectName] = useState("");
  const [center,      setCenter]      = useState<[number, number]>([20.5937, 78.9629]);
  const [pinDropped,  setPinDropped]  = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [error,       setError]       = useState("");
  const [selected,    setSelected]    = useState<Set<ModuleId>>(
    new Set(["sunpath", "flood", "temperature", "wind", "rainfall"])
  );
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
          {pinDropped && (
            <SiteBoundaryOverlay
              shape="circle"
              coordinates={{ center, radius: 200 }}
            />
          )}
        </MapContainer>

        {/* Module selector — appears once a pin is placed */}
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

        {/* Hint strip */}
        <div style={{
          position: "absolute", bottom: 36, left: "50%", transform: "translateX(-50%)",
          background: "rgba(15,23,42,0.75)", color: "rgba(255,255,255,0.85)",
          borderRadius: 20, padding: "6px 16px", fontSize: 11,
          whiteSpace: "nowrap", zIndex: 500, pointerEvents: "none",
        }}>
          {pinDropped
            ? "Pin placed · Fill in the project name in the bar above and click Start Analysis"
            : "↑ Click the map to drop a pin, or use current location in the bar above"}
        </div>
      </div>
    </div>
  );
}
