// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Layers, BadgeCheck, Clock, CalendarDays } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { useAuthStore } from "@/lib/stores/auth";
import { supabase } from "@/lib/supabase/client";
import { useProjectStore } from "@/lib/stores/project";
import { getProjects } from "@/lib/api/projects";
import type { Project } from "@/lib/stores/project";

const CLIMATE_PIPS = [
  { id: "sunpath",     color: "#F59E0B" },
  { id: "flood",       color: "#5B93C9" },
  { id: "temperature", color: "#D97575" },
  { id: "wind",        color: "#6BBFCC" },
  { id: "rainfall",    color: "#9B7EC8" },
] as const;

const BUILDER_PIPS = [
  { id: "zoning", color: "#B45309" },
  { id: "land",   color: "#6B21A8" },
] as const;

// Combined for decorative use (NewAnalysisCard)
const MODULE_PIPS = [...CLIMATE_PIPS];

const HERO_MODULES = [
  { label: "Sun Path",    bg: "rgba(245,158,11,0.10)",  color: "#8A6820", border: "rgba(245,158,11,0.22)",  dot: "#F59E0B" },
  { label: "Flood",       bg: "rgba(91,147,201,0.10)",  color: "#3A6A99", border: "rgba(91,147,201,0.22)",  dot: "#5B93C9" },
  { label: "Temperature", bg: "rgba(217,117,117,0.10)", color: "#A85050", border: "rgba(217,117,117,0.22)", dot: "#D97575" },
  { label: "Wind",        bg: "rgba(107,191,204,0.10)", color: "#3A8999", border: "rgba(107,191,204,0.22)", dot: "#6BBFCC" },
  { label: "Rainfall",    bg: "rgba(155,126,200,0.10)", color: "#6A4FA0", border: "rgba(155,126,200,0.22)", dot: "#9B7EC8" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
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

// ─── Illustrated map thumbnails — 3 watercolour variants ─────────────────────
function CardMapSVG({ variant = 0 }: { variant?: number }) {
  const v = variant % 3;

  if (v === 0) {
    // Dense urban — lots of sage blocks, salmon roads, small water corner
    return (
      <svg viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full">
        <rect fill="#EAE5DF" width="300" height="130"/>
        <ellipse cx="22" cy="22" rx="22" ry="17" fill="#B5D8E0"/>
        <ellipse cx="10" cy="28" rx="12" ry="10" fill="#C2DFE7"/>
        <line x1="0" y1="48"  x2="300" y2="52"  stroke="#F3C3B2" strokeWidth="7"/>
        <line x1="0" y1="92"  x2="300" y2="88"  stroke="#F3C3B2" strokeWidth="9"/>
        <line x1="98"  y1="0" x2="94"  y2="130" stroke="#F3C3B2" strokeWidth="6"/>
        <line x1="208" y1="0" x2="212" y2="130" stroke="#F3C3B2" strokeWidth="8"/>
        <line x1="0" y1="70"  x2="300" y2="72"  stroke="#E8CEBE" strokeWidth="3"/>
        <rect x="106" y="4"  width="96"  height="38" rx="3" fill="#CFD6C4" opacity="0.86"/>
        <rect x="216" y="5"  width="80"  height="36" rx="3" fill="#C8D1BB" opacity="0.80"/>
        <rect x="4"   y="56" width="82"  height="26" rx="3" fill="#C8D1BB" opacity="0.76"/>
        <rect x="106" y="58" width="96"  height="26" rx="3" fill="#CFD6C4" opacity="0.82"/>
        <rect x="216" y="57" width="80"  height="26" rx="3" fill="#CFD6C4" opacity="0.78"/>
        <rect x="4"   y="98" width="88"  height="26" rx="3" fill="#CFD6C4" opacity="0.72"/>
        <rect x="106" y="97" width="186" height="26" rx="3" fill="#C8D1BB" opacity="0.74"/>
        <rect x="114" y="10" width="36"  height="22" rx="2" fill="#F0EDE8" opacity="0.92"/>
        <rect x="224" y="10" width="32"  height="20" rx="2" fill="#EDE9E4" opacity="0.88"/>
        <rect x="114" y="62" width="28"  height="16" rx="2" fill="#EDE9E4" opacity="0.85"/>
        <circle cx="158" cy="73" r="10" fill="rgba(153,205,216,0.14)"/>
        <circle cx="158" cy="73" r="5"  fill="#99CDD8"/>
        <circle cx="158" cy="73" r="2"  fill="#FDFCFB"/>
      </svg>
    );
  }

  if (v === 1) {
    // Waterfront — icy blue water dominates left, sage blocks right, vegetation
    return (
      <svg viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full">
        <rect fill="#EAE5DF" width="300" height="130"/>
        <ellipse cx="30"  cy="65"  rx="42" ry="58" fill="#B5D8E0"/>
        <ellipse cx="12"  cy="80"  rx="22" ry="38" fill="#C2DFE7"/>
        <ellipse cx="48"  cy="18"  rx="14" ry="10" fill="#BEDDE5" opacity="0.80"/>
        <path d="M60,8 Q76,65 60,122" stroke="#F3C3B2" strokeWidth="8" fill="none"/>
        <line x1="60" y1="48" x2="300" y2="44" stroke="#F3C3B2" strokeWidth="7"/>
        <line x1="60" y1="90" x2="300" y2="92" stroke="#F3C3B2" strokeWidth="9"/>
        <rect x="78"  y="4"  width="80"  height="36" rx="3" fill="#CFD6C4" opacity="0.84"/>
        <rect x="168" y="4"  width="128" height="36" rx="3" fill="#C8D1BB" opacity="0.80"/>
        <rect x="78"  y="52" width="78"  height="30" rx="3" fill="#CFD6C4" opacity="0.78"/>
        <rect x="168" y="52" width="128" height="30" rx="3" fill="#C8D1BB" opacity="0.82"/>
        <rect x="78"  y="98" width="218" height="26" rx="3" fill="#CFD6C4" opacity="0.74"/>
        <circle cx="68" cy="30"  r="9"  fill="#C8DDD5" opacity="0.76"/>
        <circle cx="65" cy="108" r="8"  fill="#C4D9D1" opacity="0.70"/>
        <circle cx="72" cy="66"  r="6"  fill="#C8DDD5" opacity="0.65"/>
        <rect x="86"  y="10" width="30" height="20" rx="2" fill="#F0EDE8" opacity="0.92"/>
        <rect x="176" y="9"  width="36" height="22" rx="2" fill="#EDE9E4" opacity="0.88"/>
        <circle cx="188" cy="70" r="10" fill="rgba(153,205,216,0.14)"/>
        <circle cx="188" cy="70" r="5"  fill="#99CDD8"/>
        <circle cx="188" cy="70" r="2"  fill="#FDFCFB"/>
      </svg>
    );
  }

  // v === 2 — Peri-urban / green — vegetation patches, pond, scattered blocks
  return (
    <svg viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 w-full h-full">
      <rect fill="#EAE5DF" width="300" height="130"/>
      <ellipse cx="244" cy="100" rx="32" ry="22" fill="#B5D8E0"/>
      <ellipse cx="260" cy="108" rx="16" ry="12" fill="#C2DFE7"/>
      <circle cx="38"  cy="38"  r="24" fill="#C8DDD5" opacity="0.70"/>
      <circle cx="58"  cy="96"  r="17" fill="#C4D9D1" opacity="0.66"/>
      <circle cx="262" cy="26"  r="19" fill="#C8DDD5" opacity="0.64"/>
      <circle cx="222" cy="48"  r="13" fill="#BDDAD2" opacity="0.60"/>
      <circle cx="290" cy="58"  r="10" fill="#C4D9D1" opacity="0.58"/>
      <line x1="0"   y1="76"  x2="300" y2="58"  stroke="#F3C3B2" strokeWidth="9"/>
      <line x1="138" y1="0"   x2="132" y2="130" stroke="#F3C3B2" strokeWidth="7"/>
      <line x1="0"   y1="110" x2="300" y2="106" stroke="#E8CEBE" strokeWidth="3"/>
      <rect x="72"  y="6"   width="58" height="44" rx="3" fill="#CFD6C4" opacity="0.82"/>
      <rect x="148" y="10"  width="64" height="36" rx="3" fill="#C8D1BB" opacity="0.78"/>
      <rect x="6"   y="88"  width="74" height="36" rx="3" fill="#CFD6C4" opacity="0.76"/>
      <rect x="148" y="88"  width="64" height="36" rx="3" fill="#C8D1BB" opacity="0.74"/>
      <rect x="80"  y="14"  width="28" height="20" rx="2" fill="#F0EDE8" opacity="0.92"/>
      <rect x="156" y="16"  width="32" height="18" rx="2" fill="#EDE9E4" opacity="0.88"/>
      <circle cx="150" cy="62" r="10" fill="rgba(153,205,216,0.14)"/>
      <circle cx="150" cy="62" r="5"  fill="#99CDD8"/>
      <circle cx="150" cy="62" r="2"  fill="#FDFCFB"/>
    </svg>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────
function ProjectCard({ project, onClick, mapVariant }: {
  project: Project;
  onClick: () => void;
  mapVariant: number;
}) {
  const isComplete = project.status === "complete";
  const activeModuleIds = new Set(project.modules_run ?? []);
  const isBuilder = activeModuleIds.has("zoning") || activeModuleIds.has("land");
  const PIPS = isBuilder ? BUILDER_PIPS : CLIMATE_PIPS;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      style={{
        background: "#FDFCFB",
        border: "1px solid #CFD6C4",
        borderRadius: 16,
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
        boxShadow: "0 1px 4px rgba(48,98,35,0.07), 0 4px 16px rgba(48,98,35,0.05)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 32px rgba(48,98,35,0.16), 0 2px 8px rgba(48,98,35,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(48,98,35,0.07), 0 4px 16px rgba(48,98,35,0.05)";
      }}
      onFocus={(e) => { (e.currentTarget as HTMLDivElement).style.outline = "2px solid #99CDD8"; (e.currentTarget as HTMLDivElement).style.outlineOffset = "2px"; }}
      onBlur={(e)  => { (e.currentTarget as HTMLDivElement).style.outline = "none"; }}
    >
      {/* Map thumbnail — taller, with gradient vignette at bottom */}
      <div style={{ position: "relative", height: 160, overflow: "hidden" }}>
        <CardMapSVG variant={mapVariant} />

        {/* Bottom gradient fade into card body */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 56,
          background: "linear-gradient(to bottom, transparent, rgba(253,252,251,0.92))",
          pointerEvents: "none",
        }}/>

        {/* Status badge — frosted */}
        <span style={{
          position: "absolute", top: 12, right: 12,
          padding: "3px 10px", borderRadius: 9999,
          fontSize: 10, fontWeight: 600, letterSpacing: "0.2px",
          backdropFilter: "blur(6px)",
          background: isComplete
            ? "rgba(228,240,232,0.88)"
            : "rgba(248,237,224,0.88)",
          color: isComplete ? "#5A8F6A" : "#C4865A",
          border: `1px solid ${isComplete ? "rgba(90,143,106,0.28)" : "rgba(196,134,90,0.28)"}`,
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}>
          {isComplete ? "Complete" : "Needs review"}
        </span>

        {/* Score circle — bottom-left, overlaps the fade */}
        {project.overall_score != null && (
          <div style={{
            position: "absolute", bottom: 10, left: 14,
            width: 40, height: 40, borderRadius: "50%",
            background: "#FDFCFB",
            border: "1.5px solid #CFD6C4",
            boxShadow: "0 2px 8px rgba(48,98,35,0.12)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#3A3F3B", lineHeight: 1, fontFamily: "var(--font-geist-mono), monospace" }}>
              {project.overall_score}
            </span>
            <span style={{ fontSize: 7, color: "#B8C4BB", letterSpacing: "0.3px", marginTop: 1 }}>SCORE</span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: "12px 16px 16px" }}>
        {/* Name */}
        <div style={{
          fontSize: 14, fontWeight: 700, color: "#3A3F3B",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          letterSpacing: "-0.2px",
        }}>
          {project.name}
        </div>

        {/* Location */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
          <MapPin size={10} color="#B8C4BB" style={{ flexShrink: 0 }} aria-hidden />
          <span style={{ fontSize: 11, color: "#7B8F83", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {project.location}
          </span>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#F0EDE9", margin: "12px 0" }}/>

        {/* Footer: module tags + date */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Module pill tags */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {PIPS.filter(({ id }) => activeModuleIds.has(id)).map(({ id, color }) => (
              <span key={id} style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "2px 7px", borderRadius: 9999,
                fontSize: 9, fontWeight: 600, letterSpacing: "0.3px",
                textTransform: "uppercase",
                background: `${color}14`,
                color,
                border: `1px solid ${color}30`,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }}/>
                {id === "sunpath" ? "sun" : id === "temperature" ? "temp" : id}
              </span>
            ))}
            {/* Inactive pips as faded dots */}
            {PIPS.filter(({ id }) => !activeModuleIds.has(id)).length > 0 && (
              <span style={{ display: "flex", gap: 3, alignItems: "center", marginLeft: 2 }}>
                {PIPS.filter(({ id }) => !activeModuleIds.has(id)).map(({ id }) => (
                  <span key={id} style={{ width: 5, height: 5, borderRadius: "50%", background: "#D8DED5", display: "block" }} aria-label={id}/>
                ))}
              </span>
            )}
            {/* Builder badge */}
            {isBuilder && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "2px 7px", borderRadius: 9999,
                fontSize: 9, fontWeight: 700, letterSpacing: "0.3px",
                background: "rgba(48,98,35,0.08)", color: "#306223",
                border: "1px solid rgba(48,98,35,0.20)",
              }}>BUILDER</span>
            )}
          </div>

          {/* Date + more */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: "#B8C4BB" }}>{formatDate(project.created_at)}</span>
            <button
              onClick={(e) => e.stopPropagation()}
              aria-label="More options"
              style={{
                width: 22, height: 22, borderRadius: 6, border: "1px solid #E4DDD6",
                background: "transparent", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#B8C4BB", fontSize: 13, lineHeight: 1,
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#F0EDE9"; e.currentTarget.style.color = "#7B8F83"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#B8C4BB"; }}
            >···</button>
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
      style={{
        position: "relative", overflow: "hidden",
        borderRadius: 16, cursor: "pointer",
        border: "1.5px dashed #AECBD2",
        background: "linear-gradient(145deg, #F8FAFB 0%, #F2EFF9 100%)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 12,
        padding: "32px 24px",
        transition: "border-color 0.18s, box-shadow 0.18s, background 0.18s",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = "#99CDD8";
        el.style.background = "linear-gradient(145deg, #F2F8FA 0%, #EAF0F7 100%)";
        el.style.boxShadow = "0 6px 24px rgba(153,205,216,0.20)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = "#AECBD2";
        el.style.background = "linear-gradient(145deg, #F8FAFB 0%, #F2EFF9 100%)";
        el.style.boxShadow = "none";
      }}
      onFocus={(e) => { (e.currentTarget as HTMLDivElement).style.outline = "2px solid #99CDD8"; (e.currentTarget as HTMLDivElement).style.outlineOffset = "2px"; }}
      onBlur={(e)  => { (e.currentTarget as HTMLDivElement).style.outline = "none"; }}
    >
      {/* Decorative corner contour rings */}
      <svg style={{ position: "absolute", bottom: -20, right: -20, opacity: 0.12, pointerEvents: "none" }}
        width="130" height="130" viewBox="0 0 130 130" fill="none">
        <circle cx="65" cy="65" r="60" stroke="#99CDD8" strokeWidth="1"/>
        <circle cx="65" cy="65" r="44" stroke="#99CDD8" strokeWidth="1"/>
        <circle cx="65" cy="65" r="28" stroke="#99CDD8" strokeWidth="1"/>
        <circle cx="65" cy="65" r="12" stroke="#99CDD8" strokeWidth="1"/>
      </svg>
      <svg style={{ position: "absolute", top: -24, left: -24, opacity: 0.07, pointerEvents: "none" }}
        width="100" height="100" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="46" stroke="#306223" strokeWidth="1"/>
        <circle cx="50" cy="50" r="30" stroke="#306223" strokeWidth="1"/>
      </svg>

      {/* Module color dots arc */}
      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
        {MODULE_PIPS.map(({ id, color }) => (
          <div key={id} style={{
            width: 10, height: 10, borderRadius: "50%",
            background: color, opacity: 0.55,
            boxShadow: `0 0 6px ${color}60`,
          }}/>
        ))}
      </div>

      {/* Plus icon */}
      <div style={{
        position: "relative", zIndex: 1,
        width: 48, height: 48, borderRadius: "50%",
        border: "1.5px solid #99CDD8",
        background: "rgba(153,205,216,0.10)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24, color: "#99CDD8", fontWeight: 300, lineHeight: 1,
      }}>+</div>

      <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3F3B", letterSpacing: "-0.1px" }}>
          New site analysis
        </div>
        <div style={{ fontSize: 11, color: "#7B8F83", marginTop: 4, lineHeight: 1.6, maxWidth: 160 }}>
          Drop a pin anywhere in India — get climate, flood, and solar data instantly.
        </div>
      </div>

      {/* CTA tag */}
      <div style={{
        position: "relative", zIndex: 1,
        padding: "5px 14px", borderRadius: 9999,
        background: "#306223", color: "white",
        fontSize: 11, fontWeight: 600, letterSpacing: "0.2px",
      }}>
        Start analysis →
      </div>
    </div>
  );
}

// ─── Ghost card (empty state placeholder) ────────────────────────────────────
function GhostCard({ variant }: { variant: number }) {
  return (
    <div style={{
      background: "#FDFCFB", border: "1px solid #E4DDD6",
      borderRadius: 16, overflow: "hidden", opacity: 0.28, pointerEvents: "none",
      boxShadow: "0 1px 4px rgba(48,98,35,0.04)",
    }}>
      <div style={{ height: 160, position: "relative", overflow: "hidden" }}>
        <CardMapSVG variant={variant} />
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 56,
          background: "linear-gradient(to bottom, transparent, rgba(253,252,251,0.92))",
        }}/>
      </div>
      <div style={{ padding: "12px 16px 16px" }}>
        <div style={{ height: 11, background: "#E4DDD6", borderRadius: 6, marginBottom: 7, width: "75%" }}/>
        <div style={{ height: 9,  background: "#E4DDD6", borderRadius: 6, marginBottom: 14, width: "50%" }}/>
        <div style={{ height: 1,  background: "#F0EDE9", marginBottom: 12 }}/>
        <div style={{ display: "flex", gap: 5 }}>
          {[40, 30, 36].map((w, i) => (
            <div key={i} style={{ height: 17, width: w, background: "#E4DDD6", borderRadius: 9999 }}/>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Welcome hero (empty state) ───────────────────────────────────────────────
function WelcomeHero({ onStart }: { onStart: () => void }) {
  return (
    <div style={{
      display: "flex", borderRadius: 16, overflow: "hidden",
      border: "1px solid #CFD6C4", marginBottom: 28,
      boxShadow: "0 2px 12px rgba(48,98,35,0.07)",
    }}>
      {/* Left — copy */}
      <div style={{
        flex: "0 0 58%", padding: "32px 36px",
        background: "linear-gradient(135deg, #F5F0EB 0%, #EEE9E3 100%)",
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 10px", borderRadius: 9999, marginBottom: 16,
          background: "rgba(153,205,216,0.14)", border: "1px solid rgba(153,205,216,0.30)",
          fontSize: 10, fontWeight: 600, color: "#3A6A99", letterSpacing: "0.4px",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#99CDD8", display: "inline-block" }}/>
          READY TO ANALYSE
        </div>
        <div style={{
          fontSize: 22, fontWeight: 700, color: "#3A3F3B",
          lineHeight: 1.25, letterSpacing: "-0.4px", marginBottom: 10,
        }}>
          Every site decision,<br/>evidence-backed.
        </div>
        <div style={{ fontSize: 13, color: "#7B8F83", lineHeight: 1.65, marginBottom: 18, maxWidth: 340 }}>
          Qnit pulls climate, flood, solar, wind, and regulatory data from authoritative sources — cited and ready to export.
        </div>
        {/* Module chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 24 }}>
          {HERO_MODULES.map(({ label, bg, color, border, dot }) => (
            <span key={label} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 9999,
              fontSize: 11, fontWeight: 500,
              background: bg, color, border: `1px solid ${border}`,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }}/>
              {label}
            </span>
          ))}
        </div>
        <button
          onClick={onStart}
          style={{
            height: 40, padding: "0 22px", background: "#306223", color: "white",
            border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget).style.background = "#24491a"; }}
          onMouseLeave={(e) => { (e.currentTarget).style.background = "#306223"; }}
        >
          Start your first analysis →
        </button>
      </div>

      {/* Right — illustrated mini site plan */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#EAE5DF" }}>
        <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <rect fill="#EAE5DF" width="320" height="220"/>
          {/* Water */}
          <ellipse cx="50"  cy="110" rx="52" ry="80" fill="#B5D8E0"/>
          <ellipse cx="28"  cy="130" rx="28" ry="50" fill="#C2DFE7"/>
          {/* Vegetation */}
          <circle cx="88"  cy="30"  r="16" fill="#C8DDD5" opacity="0.72"/>
          <circle cx="88"  cy="192" r="14" fill="#C4D9D1" opacity="0.68"/>
          <circle cx="290" cy="180" r="20" fill="#C8DDD5" opacity="0.60"/>
          {/* Roads */}
          <path d="M88,0 Q100,110 88,220" stroke="#F3C3B2" strokeWidth="10" fill="none"/>
          <line x1="88" y1="70"  x2="320" y2="66"  stroke="#F3C3B2" strokeWidth="8"/>
          <line x1="88" y1="148" x2="320" y2="152" stroke="#F3C3B2" strokeWidth="10"/>
          {/* Blocks */}
          <rect x="108" y="6"   width="90"  height="54" rx="4" fill="#CFD6C4" opacity="0.84"/>
          <rect x="210" y="6"   width="106" height="54" rx="4" fill="#C8D1BB" opacity="0.80"/>
          <rect x="108" y="78"  width="90"  height="60" rx="4" fill="#C8D1BB" opacity="0.80"/>
          <rect x="210" y="78"  width="106" height="60" rx="4" fill="#CFD6C4" opacity="0.76"/>
          <rect x="108" y="158" width="206" height="56" rx="4" fill="#CFD6C4" opacity="0.78"/>
          {/* Building footprints */}
          <rect x="116" y="14"  width="38" height="30" rx="3" fill="#F0EDE8" opacity="0.92"/>
          <rect x="218" y="12"  width="44" height="32" rx="3" fill="#EDE9E4" opacity="0.88"/>
          <rect x="116" y="86"  width="38" height="36" rx="3" fill="#EDE9E4" opacity="0.88"/>
          {/* Contours */}
          <ellipse cx="200" cy="110" rx="80" ry="52" stroke="#C4B9AE" strokeWidth="0.8" fill="none"/>
          <ellipse cx="200" cy="110" rx="112" ry="72" stroke="#C4B9AE" strokeWidth="0.5" fill="none"/>
          {/* Site pin */}
          <circle cx="200" cy="110" r="14" fill="rgba(153,205,216,0.12)"/>
          <circle cx="200" cy="110" r="8"  fill="rgba(153,205,216,0.18)"/>
          <circle cx="200" cy="110" r="5"  fill="#99CDD8"/>
          <circle cx="200" cy="110" r="2"  fill="#FDFCFB"/>
          {/* Module heat dots */}
          <circle cx="188" cy="98"  r="4" fill="#F59E0B" opacity="0.50"/>
          <circle cx="212" cy="122" r="4" fill="#5B93C9" opacity="0.50"/>
          <circle cx="196" cy="124" r="4" fill="#D97575" opacity="0.50"/>
        </svg>

        {/* Subtle label overlay */}
        <div style={{
          position: "absolute", bottom: 14, left: 14,
          background: "rgba(253,252,251,0.88)", backdropFilter: "blur(4px)",
          borderRadius: 8, padding: "5px 10px", border: "1px solid #CFD6C4",
          fontSize: 10, fontWeight: 600, color: "#7B8F83", letterSpacing: "0.3px",
        }}>
          SITE PLAN PREVIEW
        </div>
      </div>
    </div>
  );
}

// ─── Stats card ───────────────────────────────────────────────────────────────
const STAT_META = [
  {
    accent: "#99CDD8", tint: "rgba(153,205,216,0.08)",
    icon: Layers,       iconColor: "#99CDD8",
    label: "Total projects",
  },
  {
    accent: "#5A8F6A", tint: "rgba(90,143,106,0.07)",
    icon: BadgeCheck,   iconColor: "#5A8F6A",
    label: "Fully analysed",
  },
  {
    accent: "#C4865A", tint: "rgba(196,134,90,0.07)",
    icon: Clock,        iconColor: "#C4865A",
    label: "Needs review",
  },
  {
    accent: "#306223", tint: "rgba(48,98,35,0.07)",
    icon: CalendarDays, iconColor: "#306223",
    label: "This month",
  },
] as const;

function StatCard({ num, meta, dim }: {
  num: number | string;
  meta: typeof STAT_META[number];
  dim: boolean;
}) {
  const Icon = meta.icon;
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: dim ? "#FDFCFB" : meta.tint,
      border: "1px solid #CFD6C4",
      borderTop: `2.5px solid ${dim ? "#CFD6C4" : meta.accent}`,
      borderRadius: 14,
      padding: "20px 22px 18px",
    }}>
      {/* Faint dot grid decoration */}
      <svg style={{ position: "absolute", top: 0, right: 0, opacity: dim ? 0.04 : 0.10, pointerEvents: "none" }}
        width="80" height="80" viewBox="0 0 80 80" fill="none">
        {[0,16,32,48,64].flatMap(x => [0,16,32,48,64].map(y =>
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill={meta.accent}/>
        ))}
      </svg>

      {/* Icon chip */}
      <div style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, borderRadius: 8, marginBottom: 14,
        background: dim ? "rgba(48,98,35,0.06)" : `${meta.accent}18`,
        border: `1px solid ${dim ? "#CFD6C4" : `${meta.accent}30`}`,
      }}>
        <Icon size={15} color={dim ? "#B8C4BB" : meta.iconColor} aria-hidden />
      </div>

      {/* Number */}
      <div style={{
        fontSize: 36, fontWeight: 700, lineHeight: 1, letterSpacing: "-1px",
        color: dim ? "#B8C4BB" : "#3A3F3B",
        fontFamily: "var(--font-geist-mono), monospace",
      }}>{num}</div>

      {/* Label */}
      <div style={{
        fontSize: 11, fontWeight: 500, marginTop: 6, letterSpacing: "0.2px",
        color: dim ? "#B8C4BB" : "#7B8F83",
        textTransform: "uppercase",
      }}>{meta.label}</div>

      {/* Accent rule at bottom */}
      {!dim && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(to right, ${meta.accent}40, transparent)`,
        }}/>
      )}
    </div>
  );
}

// ─── Hero map SVG ─────────────────────────────────────────────────────────────
function HeroMapSVG() {
  const railLen = Math.sqrt(540 ** 2 + 430 ** 2);
  const railTicks = Array.from({ length: 28 }, (_, i) => {
    const t = (i + 0.5) / 28;
    const cx = 540 * t;
    const cy = 430 * (1 - t);
    const px = (430 / railLen) * 5;
    const py = (540 / railLen) * 5;
    return { x1: cx - px, y1: cy - py, x2: cx + px, y2: cy + py };
  });

  const treeDots = [
    {cx:148,cy:188},{cx:166,cy:183},{cx:184,cy:190},
    {cx:203,cy:200},{cx:223,cy:213},{cx:244,cy:226},
    {cx:266,cy:240},{cx:288,cy:252},{cx:310,cy:262},
    {cx:333,cy:271},{cx:356,cy:279},
    {cx:146,cy:207},{cx:165,cy:200},{cx:186,cy:208},
    {cx:209,cy:221},{cx:232,cy:235},{cx:256,cy:248},
    {cx:279,cy:259},
  ];

  return (
    <svg viewBox="0 0 680 500" xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "100%", display: "block" }}>

      {/* Background */}
      <rect fill="#EDE8DF" width="680" height="500"/>

      {/* Contour lines */}
      <g transform="rotate(-10, 340, 250)" opacity="0.50">
        {[320,280,240,200,160,120,80,45].map((rx, i) => (
          <ellipse key={i} cx="340" cy="250" rx={rx} ry={Math.round(rx * 0.64)}
            stroke="#C0B8AE" strokeWidth="0.5" fill="none"/>
        ))}
      </g>

      {/* Water body — upper-left */}
      <path d="M 10,8 C 52,0 118,20 148,58 C 172,90 164,130 132,150 C 100,168 60,160 32,142 C 8,124 0,90 10,58 Z"
        fill="#B5D8E0" stroke="#89B4C0" strokeWidth="0.8"/>

      {/* River — wide ribbon */}
      <path d="M 0,202 C 62,190 102,210 150,204 C 200,197 228,240 274,260 C 320,280 350,302 390,310 C 424,317 454,336 480,362 L 480,500 L 0,500 Z"
        fill="#B5D8E0" opacity="0.60"/>
      <path d="M 0,202 C 62,190 102,210 150,204 C 200,197 228,240 274,260 C 320,280 350,302 390,310 C 424,317 454,336 480,362"
        stroke="#7AABB8" strokeWidth="1.4" fill="none"/>
      <path d="M 0,214 C 58,204 96,222 142,217 C 190,210 218,252 262,272 C 308,292 338,312 376,320"
        stroke="#A8D0D8" strokeWidth="0.7" fill="none" opacity="0.5"/>

      {/* Vegetation patches */}
      <circle cx="55"  cy="295" r="48" fill="#8DB89A" opacity="0.56"/>
      <circle cx="24"  cy="322" r="32" fill="#6EA080" opacity="0.46"/>
      <circle cx="86"  cy="335" r="26" fill="#8DB89A" opacity="0.42"/>
      <circle cx="518" cy="192" r="44" fill="#8DB89A" opacity="0.48"/>
      <circle cx="550" cy="162" r="28" fill="#6EA080" opacity="0.40"/>
      <circle cx="492" cy="228" r="22" fill="#A8C8BC" opacity="0.46"/>
      <circle cx="604" cy="382" r="36" fill="#8DB89A" opacity="0.40"/>
      <circle cx="636" cy="415" r="22" fill="#6EA080" opacity="0.34"/>

      {/* Tree dots along river bank */}
      {treeDots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r="3.5" fill="#7DAF90" opacity="0.65"/>
      ))}

      {/* Railway + tie marks */}
      <line x1="0" y1="430" x2="540" y2="0" stroke="#3A5A6A" strokeWidth="3.5"/>
      {railTicks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke="#5A7A8A" strokeWidth="1.2"/>
      ))}

      {/* Secondary roads */}
      <line x1="0"   y1="190" x2="680" y2="198" stroke="#E8A898" strokeWidth="3.5"/>
      <line x1="0"   y1="248" x2="680" y2="254" stroke="#E8A898" strokeWidth="3"/>
      <line x1="160" y1="0"   x2="158" y2="500" stroke="#E8A898" strokeWidth="3"/>
      <line x1="378" y1="0"   x2="382" y2="500" stroke="#E8A898" strokeWidth="3"/>
      <line x1="452" y1="0"   x2="458" y2="340" stroke="#E8A898" strokeWidth="3"/>

      {/* Primary arterial roads */}
      <line x1="0"   y1="140" x2="680" y2="147" stroke="#D4845A" strokeWidth="8"/>
      <line x1="286" y1="0"   x2="292" y2="380" stroke="#D4845A" strokeWidth="7"/>
      <line x1="462" y1="0"   x2="680" y2="282" stroke="#D4845A" strokeWidth="6.5"/>

      {/* Urban block fills */}
      <rect x="168" y="0"   width="112" height="132" rx="2" fill="#D5CFC6"/>
      <rect x="300" y="0"   width="72"  height="132" rx="2" fill="#CCCABB"/>
      <rect x="390" y="0"   width="64"  height="132" rx="2" fill="#D5CFC6"/>
      <rect x="464" y="0"   width="64"  height="132" rx="2" fill="#C8C2B8"/>
      <rect x="0"   y="157" width="157" height="25"  rx="1" fill="#CCCABB"/>
      <rect x="168" y="157" width="112" height="25"  rx="1" fill="#D5CFC6"/>
      <rect x="300" y="155" width="72"  height="27"  rx="1" fill="#D5CFC6"/>
      <rect x="390" y="155" width="64"  height="27"  rx="1" fill="#CCCABB"/>
      <rect x="464" y="157" width="64"  height="40"  rx="2" fill="#D5CFC6"/>
      <rect x="168" y="202" width="112" height="40"  rx="2" fill="#D5CFC6"/>
      <rect x="390" y="202" width="64"  height="40"  rx="2" fill="#CCCABB"/>
      <rect x="464" y="215" width="64"  height="48"  rx="2" fill="#D5CFC6"/>
      <rect x="168" y="262" width="112" height="68"  rx="2" fill="#D0CAC0"/>
      <rect x="390" y="262" width="64"  height="68"  rx="2" fill="#D5CFC6"/>

      {/* Building footprints */}
      <rect x="178" y="8"   width="50" height="36" rx="1.5" fill="#F2EDE8" stroke="#C8C0B4" strokeWidth="0.5"/>
      <rect x="236" y="8"   width="36" height="28" rx="1.5" fill="#EDE8E0" stroke="#C8C0B4" strokeWidth="0.5"/>
      <rect x="178" y="52"  width="62" height="46" rx="1.5" fill="#F2EDE8" stroke="#C8C0B4" strokeWidth="0.5"/>
      <rect x="178" y="106" width="32" height="22" rx="1.5" fill="#EDE8E0" stroke="#C8C0B4" strokeWidth="0.5"/>
      <rect x="310" y="8"   width="44" height="40" rx="1.5" fill="#EDE8E0" stroke="#C8C0B4" strokeWidth="0.5"/>
      <rect x="310" y="56"  width="44" height="58" rx="1.5" fill="#F2EDE8" stroke="#C8C0B4" strokeWidth="0.5"/>
      <rect x="400" y="8"   width="46" height="44" rx="1.5" fill="#EDE8E0" stroke="#C8C0B4" strokeWidth="0.5"/>
      <rect x="400" y="60"  width="46" height="62" rx="1.5" fill="#F2EDE8" stroke="#C8C0B4" strokeWidth="0.5"/>
      <rect x="474" y="8"   width="44" height="62" rx="1.5" fill="#EDE8E0" stroke="#C8C0B4" strokeWidth="0.5"/>
      <rect x="474" y="78"  width="44" height="46" rx="1.5" fill="#F2EDE8" stroke="#C8C0B4" strokeWidth="0.5"/>
      <rect x="178" y="210" width="42" height="24" rx="1.5" fill="#EDE8E0" stroke="#C8C0B4" strokeWidth="0.5"/>
      <rect x="232" y="210" width="40" height="24" rx="1.5" fill="#F2EDE8" stroke="#C8C0B4" strokeWidth="0.5"/>
      <rect x="400" y="210" width="44" height="24" rx="1.5" fill="#EDE8E0" stroke="#C8C0B4" strokeWidth="0.5"/>
      <rect x="474" y="165" width="44" height="24" rx="1.5" fill="#EDE8E0" stroke="#C8C0B4" strokeWidth="0.5"/>

      {/* Blue dot-hatching on left block (like in inspiration) */}
      {Array.from({ length: 5 }, (_, row) =>
        Array.from({ length: 8 }, (_, col) => (
          <circle key={`bd-${row}-${col}`}
            cx={172 + col * 14} cy={163 + row * 4}
            r="1.3" fill="#5B93C9" opacity="0.52"/>
        ))
      )}

      {/* Site highlight block — salmon + dashed red boundary */}
      <rect x="300" y="202" width="72" height="40" rx="2" fill="#E8C4B8" opacity="0.78"/>
      {Array.from({ length: 5 }, (_, i) => (
        <line key={`hatch-${i}`} x1="300" y1={206 + i * 8} x2="372" y2={206 + i * 8}
          stroke="#C45A3A" strokeWidth="0.6" opacity="0.28"/>
      ))}
      <rect x="300" y="202" width="72" height="40" rx="2"
        fill="none" stroke="#C45A3A" strokeWidth="1.5" strokeDasharray="6,3"/>

      {/* Site analysis pin */}
      <circle cx="336" cy="222" r="16" fill="rgba(153,205,216,0.10)"/>
      <circle cx="336" cy="222" r="9"  fill="rgba(153,205,216,0.22)"/>
      <circle cx="336" cy="222" r="5"  fill="#99CDD8"/>
      <circle cx="336" cy="222" r="2"  fill="#FDFCFB"/>
      <circle cx="336" cy="222" r="18" fill="none" stroke="#99CDD8" strokeWidth="0.8" opacity="0.45"/>

      {/* Scale bar */}
      <g transform="translate(30, 475)">
        <line x1="0"  y1="0" x2="60" y2="0" stroke="#8B8380" strokeWidth="0.9"/>
        <line x1="0"  y1="-3" x2="0"  y2="3" stroke="#8B8380" strokeWidth="0.9"/>
        <line x1="30" y1="-2" x2="30" y2="2" stroke="#8B8380" strokeWidth="0.9"/>
        <line x1="60" y1="-3" x2="60" y2="3" stroke="#8B8380" strokeWidth="0.9"/>
        <text x="-2"  y="12" fontSize="6.5" fill="#8B8380" fontFamily="monospace">0</text>
        <text x="22"  y="12" fontSize="6.5" fill="#8B8380" fontFamily="monospace">50m</text>
        <text x="50"  y="12" fontSize="6.5" fill="#8B8380" fontFamily="monospace">100m</text>
      </g>

      {/* North indicator */}
      <g transform="translate(642, 462)">
        <circle cx="0" cy="0" r="14" fill="rgba(237,232,223,0.88)" stroke="#C0B8AE" strokeWidth="0.8"/>
        <line x1="0" y1="-10" x2="0" y2="10" stroke="#5A5550" strokeWidth="0.8"/>
        <polygon points="0,-10 -3,-3 3,-3" fill="#3A3F3B"/>
        <polygon points="0,10 -3,3 3,3" fill="#C0B8AE"/>
        <text x="-2.5" y="-13" fontSize="7" fill="#3A3F3B" fontFamily="monospace" fontWeight="bold">N</text>
      </g>
    </svg>
  );
}

// ─── Hero section ─────────────────────────────────────────────────────────────
function HeroSection({ onStart, studioName }: { onStart: () => void; studioName: string }) {
  const heroRef  = useRef<HTMLDivElement>(null);
  const tiltRef  = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (tiltRef.current) tiltRef.current.style.transition = "none";
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tiltRef.current || !heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const rotX = -(y * 12) + 5;
    const rotY = (x * 16) - 5;
    tiltRef.current.style.transform =
      `perspective(1100px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
  };

  const handleMouseLeave = () => {
    if (!tiltRef.current) return;
    tiltRef.current.style.transition = "transform 0.9s cubic-bezier(0.23, 1, 0.32, 1)";
    tiltRef.current.style.transform = "perspective(1100px) rotateX(5deg) rotateY(-5deg)";
  };

  return (
    <div
      ref={heroRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        height: "calc(100vh - 56px)", display: "flex", position: "relative",
        background: "#F2EDE8", overflow: "hidden",
      }}
    >
      {/* Faint full-bg topographic contours */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.09, pointerEvents: "none" }}
        viewBox="0 0 1400 800" preserveAspectRatio="xMidYMid slice">
        <g transform="rotate(-6, 700, 400)">
          {[680,600,520,440,360,280,200,120,55].map((r, i) => (
            <ellipse key={i} cx="700" cy="400" rx={r} ry={Math.round(r * 0.56)}
              stroke="#8FA89A" strokeWidth="0.9" fill="none"/>
          ))}
        </g>
      </svg>

      {/* ── Left: copy panel ───────────────────────────────────────────────── */}
      <div style={{
        flex: "0 0 42%", display: "flex", flexDirection: "column",
        justifyContent: "center", padding: "0 52px 48px 48px",
        position: "relative", zIndex: 2,
      }}>
        {/* Eyebrow */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 22 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#99CDD8" }}/>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", color: "#9DB0A2", textTransform: "uppercase" }}>
            {studioName}
          </span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 40, fontWeight: 800, color: "#3A3F3B", lineHeight: 1.1,
          letterSpacing: "-1.2px", margin: "0 0 18px 0",
        }}>
          Understand every site before you break ground.
        </h1>

        {/* Subtext */}
        <p style={{
          fontSize: 14, color: "#7B8F83", lineHeight: 1.72,
          margin: "0 0 30px 0", maxWidth: 380,
        }}>
          Qnit aggregates flood risk, solar gain, wind climatology and regulatory constraints — cited from authoritative sources, exported in one click.
        </p>

        {/* Module chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 36 }}>
          {HERO_MODULES.map(({ label, bg, color, border, dot }) => (
            <span key={label} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 9999, fontSize: 11, fontWeight: 500,
              background: bg, color, border: `1px solid ${border}`,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }}/>
              {label}
            </span>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onStart}
            style={{
              height: 44, padding: "0 24px", background: "#306223", color: "white",
              border: "none", borderRadius: 12, fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.1px",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#24491a"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#306223"; }}
          >
            Start new analysis →
          </button>
          <button
            onClick={() => document.getElementById("projects-section")?.scrollIntoView({ behavior: "smooth" })}
            style={{
              height: 44, padding: "0 20px", background: "transparent",
              border: "1.5px solid #306223", borderRadius: 12,
              fontSize: 13, fontWeight: 600, color: "#306223",
              cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(48,98,35,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            View projects ↓
          </button>
        </div>
      </div>

      {/* ── Right: tiltable map ────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", padding: "32px 44px 32px 0",
      }}>
        <div
          ref={tiltRef}
          style={{
            position: "relative", width: "100%", maxWidth: 640,
            borderRadius: 20, overflow: "hidden",
            transform: "perspective(1100px) rotateX(5deg) rotateY(-5deg)",
            boxShadow: "0 28px 90px rgba(58,63,59,0.22), 0 6px 20px rgba(58,63,59,0.10)",
            border: "1px solid rgba(192,184,174,0.50)",
            willChange: "transform",
          }}
        >
          <HeroMapSVG />

          {/* Floating score card — top-left */}
          <div style={{
            position: "absolute", top: 16, left: 16,
            background: "rgba(253,252,251,0.92)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(207,214,196,0.70)", borderRadius: 12,
            padding: "10px 14px",
            boxShadow: "0 4px 16px rgba(58,63,59,0.10)",
          }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#B8C4BB", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 4 }}>
              Site Score
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#3A3F3B", lineHeight: 1, fontFamily: "var(--font-geist-mono), monospace" }}>
              72<span style={{ fontSize: 12, color: "#B8C4BB", fontWeight: 400 }}>/100</span>
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 7 }}>
              {MODULE_PIPS.map(({ id, color }) => (
                <div key={id} style={{ width: 6, height: 6, borderRadius: "50%", background: color }}/>
              ))}
            </div>
          </div>

          {/* Location badge — top-right */}
          <div style={{
            position: "absolute", top: 16, right: 16,
            padding: "4px 10px", borderRadius: 6, backdropFilter: "blur(4px)",
            background: "rgba(58,90,106,0.84)", fontSize: 9, fontWeight: 600,
            letterSpacing: "0.5px", color: "rgba(255,255,255,0.92)", textTransform: "uppercase",
          }}>
            Aundh · Pune
          </div>

          {/* Floating analysis tags — bottom-right */}
          <div style={{
            position: "absolute", bottom: 16, right: 16,
            display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end",
          }}>
            {[
              { label: "Flood Risk", value: "Low",    color: "#5B93C9" },
              { label: "Solar",      value: "4.8 h/d",color: "#F59E0B" },
              { label: "Wind",       value: "Mod.",   color: "#6BBFCC" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", borderRadius: 8, fontSize: 10,
                background: "rgba(253,252,251,0.90)", backdropFilter: "blur(6px)",
                border: "1px solid rgba(207,214,196,0.60)",
                boxShadow: "0 2px 8px rgba(58,63,59,0.08)",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }}/>
                <span style={{ color: "#7B8F83" }}>{label}</span>
                <span style={{ color: "#3A3F3B", fontWeight: 700, fontFamily: "monospace" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div style={{
        position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
        color: "#B8C4BB", fontSize: 10, fontWeight: 600, letterSpacing: "0.5px",
        textTransform: "uppercase", animation: "scrollBounce 2.2s ease-in-out infinite",
        pointerEvents: "none",
      }}>
        <span>Your projects</span>
        <svg width="14" height="8" viewBox="0 0 14 8" fill="none" aria-hidden>
          <path d="M 1 1 L 7 7 L 13 1" stroke="#CFD6C4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const { projects, stats, setProjects } = useProjectStore();

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    getProjects()
      .then(({ projects, stats }) => setProjects(projects, stats))
      .catch(console.error);
  }, [user, router, setProjects]);

  if (!user) return null;

  const initials   = getInitials(user);
  const studioName = user.user_metadata?.studio_name ?? user.user_metadata?.full_name ?? "Your studio";
  const isEmpty    = projects.length === 0;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-neutral-bg">
      <TopNav
        context="dashboard"
        userInitials={initials}
        userAvatarUrl={user.user_metadata?.avatar_url}
        userName={user.user_metadata?.full_name || user.email}
        userEmail={user.email}
        onSettingsClick={() => router.push("/settings")}
        onSignOut={async () => { await supabase.auth.signOut(); clearAuth(); router.replace("/login"); }}
        onNewAnalysisClick={() => router.push("/project/new")}
      />

      <main className="pt-14 flex-1 overflow-y-auto">
        <HeroSection onStart={() => router.push("/project/new")} studioName={studioName} />

        <div id="projects-section" style={{ padding: "40px 40px 60px" }}>

          {/* Page header */}
          <div style={{
            display: "flex", alignItems: "flex-end", justifyContent: "space-between",
            marginBottom: 28, paddingBottom: 20,
            borderBottom: "1px solid #CFD6C4",
          }}>
            <div>
              {/* Eyebrow */}
              <div style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
              }}>
                <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden>
                  <rect x="0"  y="0"  width="7"  height="7"  rx="1.5" fill="#CFD6C4"/>
                  <rect x="9"  y="0"  width="9"  height="3"  rx="1.5" fill="#CFD6C4"/>
                  <rect x="9"  y="5"  width="6"  height="3"  rx="1.5" fill="#CFD6C4" opacity="0.6"/>
                  <rect x="0"  y="9"  width="18" height="2"  rx="1"   fill="#CFD6C4" opacity="0.5"/>
                  <rect x="0"  y="13" width="12" height="1"  rx="0.5" fill="#CFD6C4" opacity="0.35"/>
                </svg>
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.8px",
                  color: "#B8C4BB", textTransform: "uppercase",
                }}>Qnit</span>
              </div>

              <h1 style={{
                fontSize: 30, fontWeight: 800, color: "#3A3F3B",
                letterSpacing: "-0.8px", lineHeight: 1, margin: 0,
              }}>
                Projects
              </h1>

              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginTop: 8,
              }}>
                {!isEmpty && stats && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 9px", borderRadius: 9999,
                    fontSize: 11, fontWeight: 500,
                    background: "rgba(90,143,106,0.09)",
                    color: "#5A8F6A",
                    border: "1px solid rgba(90,143,106,0.20)",
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#5A8F6A" }}/>
                    {stats.total} site{stats.total !== 1 ? "s" : ""} analysed
                  </span>
                )}
                <span style={{ fontSize: 13, color: "#B8C4BB" }}>{studioName}</span>
              </div>
            </div>

            {/* Right — decorative contour rings */}
            <svg width="90" height="56" viewBox="0 0 90 56" fill="none" aria-hidden style={{ opacity: 0.55, flexShrink: 0 }}>
              <ellipse cx="45" cy="28" rx="44" ry="27" stroke="#CFD6C4" strokeWidth="0.8"/>
              <ellipse cx="45" cy="28" rx="33" ry="20" stroke="#CFD6C4" strokeWidth="0.8"/>
              <ellipse cx="45" cy="28" rx="22" ry="13" stroke="#CFD6C4" strokeWidth="0.8"/>
              <ellipse cx="45" cy="28" rx="11" ry="6"  stroke="#CFD6C4" strokeWidth="0.8"/>
              <circle  cx="45" cy="28" r="4"            fill="#99CDD8"   opacity="0.7"/>
              <circle  cx="45" cy="28" r="1.5"          fill="#FDFCFB"/>
            </svg>
          </div>

          {/* Section label */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 2, height: 14, borderRadius: 9999, background: "#CFD6C4" }}/>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#B8C4BB", letterSpacing: "0.6px", textTransform: "uppercase" }}>
                {isEmpty ? "Start here" : `${projects.length} project${projects.length !== 1 ? "s" : ""}`}
              </span>
            </div>
            {!isEmpty && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#B8C4BB" }}>Sort:</span>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "#7B8F83",
                  padding: "2px 8px", borderRadius: 6, background: "#F0EDE9",
                  border: "1px solid #E4DDD6",
                }}>Newest</span>
              </div>
            )}
          </div>

          {/* Project grid */}
          {isEmpty ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
              <NewAnalysisCard onClick={() => router.push("/project/new")} />
              <GhostCard variant={1} />
              <GhostCard variant={2} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
              {projects.map((project, i) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  mapVariant={i}
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
