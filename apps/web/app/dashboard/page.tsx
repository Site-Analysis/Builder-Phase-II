"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { useAuthStore } from "@/lib/stores/auth";
import { useProjectStore } from "@/lib/stores/project";
import { getProjects } from "@/lib/api/projects";
import type { Project } from "@/lib/stores/project";

// TODO GH#53: getProjects returns mock stubs — swap for real Supabase query once table exists

const MODULE_PIPS = [
  { id: "sunpath",     color: "#F59E0B" },
  { id: "flood",       color: "#2563EB" },
  { id: "temperature", color: "#EF4444" },
  { id: "wind",        color: "#06B6D4" },
  { id: "rainfall",    color: "#7C3AED" },
] as const;

const HERO_MODULES = [
  { label: "Sun Path",    bg: "rgba(245,158,11,0.10)", color: "#92400E", border: "rgba(245,158,11,0.25)", dot: "#F59E0B" },
  { label: "Flood",       bg: "rgba(37,99,235,0.08)",  color: "#1D4ED8", border: "rgba(37,99,235,0.2)",   dot: "#2563EB" },
  { label: "Temperature", bg: "rgba(239,68,68,0.08)",  color: "#B91C1C", border: "rgba(239,68,68,0.2)",   dot: "#EF4444" },
  { label: "Wind",        bg: "rgba(6,182,212,0.08)",  color: "#0E7490", border: "rgba(6,182,212,0.2)",   dot: "#06B6D4" },
  { label: "Rainfall",    bg: "rgba(124,58,237,0.08)", color: "#5B21B6", border: "rgba(124,58,237,0.2)",  dot: "#7C3AED" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getInitials(user: { email?: string; user_metadata?: { full_name?: string } }) {
  const name = user.user_metadata?.full_name;
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return user.email?.[0]?.toUpperCase() ?? "U";
}

// ─── Map thumbnail SVG ────────────────────────────────────────────────────────
function CardMapSVG() {
  return (
    <svg
      viewBox="0 0 300 130"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 w-full h-full"
    >
      <rect fill="#C5D3DA" width="300" height="130" />
      <path d="M0 60 Q75 50 150 65 Q225 80 300 65" stroke="#B5C2C9" strokeWidth="7" fill="none" />
      <path d="M60 0 Q70 45 55 90 Q48 115 65 130" stroke="#B5C2C9" strokeWidth="5" fill="none" />
      <path d="M0 95 Q100 85 200 98 Q260 105 300 92" stroke="#BDC9D0" strokeWidth="4" fill="none" />
    </svg>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────
function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const isComplete = project.status === "complete";
  const activeModuleIds = new Set(project.modules_run ?? []);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="bg-neutral-surface border border-neutral-border rounded-xl overflow-hidden cursor-pointer transition-all duration-150 hover:-translate-y-px hover:shadow-[0_6px_24px_rgba(0,0,0,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary"
    >
      {/* Map thumbnail */}
      <div className="relative h-[130px] overflow-hidden" style={{ background: "#C8D4DC" }}>
        <CardMapSVG />
        {/* Center pin */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white"
          style={{ background: "#1A3A5C", boxShadow: "0 0 0 3px rgba(26,58,92,0.20)" }}
        />
        {/* Status badge */}
        {isComplete ? (
          <span
            className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.20)" }}
          >
            Complete
          </span>
        ) : (
          <span
            className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ background: "rgba(217,119,6,0.12)", color: "#D97706", border: "1px solid rgba(217,119,6,0.20)" }}
          >
            Needs review
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="px-[14px] pt-[14px] pb-[14px]">
        <div className="text-[13px] font-semibold text-text-primary truncate">{project.name}</div>
        <div className="flex items-center gap-1 mt-[3px] text-[11px] text-text-secondary">
          <MapPin size={10} className="shrink-0" aria-hidden />
          {project.location}
        </div>
        <div className="flex items-center justify-between mt-[10px]">
          {/* Module pips */}
          <div className="flex items-center gap-[3px]">
            {MODULE_PIPS.map(({ id, color }) => (
              <span
                key={id}
                className="w-[7px] h-[7px] rounded-full block"
                style={{ background: activeModuleIds.has(id) ? color : "#CBD5E1" }}
                aria-label={id}
              />
            ))}
          </div>
          {/* Score + date + overflow */}
          <div className="flex items-center gap-2">
            {project.overall_score != null && (
              <span className="text-[13px] font-bold text-text-primary">{project.overall_score}</span>
            )}
            <span className="text-[10px] text-text-disabled">{formatDate(project.created_at)}</span>
            <span
              className="text-[16px] text-text-secondary leading-none cursor-pointer px-1 hover:text-text-primary"
              aria-label="More options"
            >
              ···
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── New analysis card ────────────────────────────────────────────────────────
function NewAnalysisCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="group flex flex-col items-center justify-center gap-2.5 rounded-xl min-h-[208px] cursor-pointer transition-all duration-150 border-[1.5px] border-dashed border-neutral-border bg-neutral-bg hover:bg-neutral-surface hover:border-brand-secondary hover:shadow-[0_4px_16px_rgba(46,125,111,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary"
    >
      <div className="w-11 h-11 rounded-full bg-neutral-surface border-[1.5px] border-neutral-border flex items-center justify-center text-[22px] text-brand-secondary group-hover:border-brand-secondary group-hover:bg-[#F0FDF9] transition-colors font-light">
        +
      </div>
      <span className="text-[13px] font-medium text-text-secondary">New site analysis</span>
      <span className="text-[11px] text-text-disabled text-center max-w-[140px] leading-snug">
        Search an address and select your modules to begin
      </span>
    </div>
  );
}

// ─── Ghost card (empty state) ─────────────────────────────────────────────────
function GhostCard() {
  return (
    <div className="bg-neutral-surface border border-neutral-border rounded-xl overflow-hidden" style={{ opacity: 0.38, pointerEvents: "none" }}>
      <div className="h-[130px] bg-neutral-border" />
      <div className="px-[14px] pt-[14px] pb-[14px]">
        <div className="h-[10px] bg-neutral-border rounded-full mb-2" />
        <div className="h-[10px] bg-neutral-border rounded-full mb-2 w-[60%]" />
        <div className="h-[7px] bg-neutral-border rounded-full w-[40%]" />
      </div>
    </div>
  );
}

// ─── Welcome hero (empty state) ───────────────────────────────────────────────
function WelcomeHero({ onStart }: { onStart: () => void }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #EFF6FF 0%, #F0FDF9 100%)",
      border: "1px solid rgba(26,58,92,0.10)",
      borderRadius: 14, padding: "28px 32px",
      display: "flex", alignItems: "center", gap: 32, marginBottom: 28,
    }}>
      {/* Text */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1A3A5C", lineHeight: 1.3, marginBottom: 8 }}>
          Every site decision,<br />evidence-backed.
        </div>
        <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.65, maxWidth: 480 }}>
          Search any site address and SAT will pull climate, flood, solar, wind, and regulatory data from authoritative sources — cited and ready to export.
        </div>
        {/* Module chips */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {HERO_MODULES.map(({ label, bg, color, border, dot }) => (
            <span
              key={label}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 9999,
                fontSize: 11, fontWeight: 500,
                background: bg, color, border: `1px solid ${border}`,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, display: "inline-block" }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      {/* CTA */}
      <div style={{ flexShrink: 0 }}>
        <button
          onClick={onStart}
          style={{
            height: 42, padding: "0 22px", background: "#2E7D6F", color: "white",
            border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => { (e.currentTarget).style.background = "#256B5F"; }}
          onMouseLeave={(e) => { (e.currentTarget).style.background = "#2E7D6F"; }}
        >
          Start your first analysis →
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { projects, stats, setProjects } = useProjectStore();

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    getProjects()
      .then(({ projects, stats }) => setProjects(projects, stats))
      .catch(console.error);
  }, [user, router, setProjects]);

  if (!user) return null;

  const initials    = getInitials(user);
  const studioName  = user.user_metadata?.studio_name ?? user.user_metadata?.full_name ?? "Your studio";
  const firstName   = user.user_metadata?.full_name?.split(" ")[0] ?? null;
  const isEmpty     = projects.length === 0;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-neutral-bg">
      <TopNav
        context="dashboard"
        userInitials={initials}
        userAvatarUrl={user.user_metadata?.avatar_url}
        onSettingsClick={() => router.push("/settings")}
        onNewAnalysisClick={() => router.push("/project/new")}
      />

      <main className="pt-14 flex-1 overflow-y-auto">
        <div className="px-8 py-8">
          {/* Page header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-[22px] font-bold text-text-primary tracking-tight">Projects</h1>
              <p className="text-[13px] text-text-secondary mt-[3px]">
                {isEmpty
                  ? `${studioName}${firstName ? ` · Welcome, ${firstName}` : ""}`
                  : `${stats ? `${stats.total} site${stats.total !== 1 ? "s" : ""} analysed` : "—"} · ${studioName}`}
              </p>
            </div>
          </div>

          {/* Stats row — numbers dimmed when no projects */}
          <div className="grid grid-cols-4 gap-3 mb-7">
            {[
              { num: stats?.total          ?? (isEmpty ? 0 : "—"), label: "Total projects" },
              { num: stats?.fully_analysed ?? (isEmpty ? 0 : "—"), label: "Fully analysed" },
              { num: stats?.needs_review   ?? (isEmpty ? 0 : "—"), label: "Needs review"   },
              { num: stats?.this_month     ?? (isEmpty ? 0 : "—"), label: "This month"     },
            ].map(({ num, label }) => (
              <div
                key={label}
                className="bg-neutral-surface border border-neutral-border rounded-[10px] px-[18px] py-[14px]"
              >
                <div className={`text-[24px] font-bold leading-none ${isEmpty ? "text-text-disabled" : "text-text-primary"}`}>{num}</div>
                <div className={`text-[11px] mt-[5px] ${isEmpty ? "text-text-disabled" : "text-text-secondary"}`}>{label}</div>
              </div>
            ))}
          </div>

          {/* Welcome hero — empty state only */}
          {isEmpty && <WelcomeHero onStart={() => router.push("/project/new")} />}

          {/* Project grid */}
          <div className="text-[11px] font-semibold text-text-disabled uppercase tracking-[0.4px] mb-3">
            Your projects
          </div>
          {isEmpty ? (
            <div className="grid grid-cols-3 gap-4">
              <NewAnalysisCard onClick={() => router.push("/project/new")} />
              <GhostCard />
              <GhostCard />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onClick={() => router.push(`/project/${project.id}`)}
                />
              ))}
              <NewAnalysisCard onClick={() => router.push("/project/new")} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
