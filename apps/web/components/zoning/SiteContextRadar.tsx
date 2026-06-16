"use client";

import type { ZoningContextItem } from "@/lib/stores/analysis";
import { Z, polar, clamp, fmtDist } from "./theme";

interface SiteContextRadarProps {
  items: ZoningContextItem[];
  size?: number;
}

// Category → colour. Radius encodes distance (log scale, 50m..30km); angle is
// categorical (grouped by type) until real bearings arrive in Phase 3.
const CAT_COLOR: Record<string, string> = {
  airport: "#B45309",
  metro: "#7C3AED",
  railway: "#7C3AED",
  bus: "#7C3AED",
  waterbody: "#2563EB",
  water: "#2563EB",
  lake: "#2563EB",
  river: "#2563EB",
  stream: "#2563EB",
  drain: "#2563EB",
};
function catColor(cat: string): string {
  return CAT_COLOR[cat] ?? Z.good;
}
// Deterministic angle per category so the same type always lands in one sector.
function catAngle(cat: string): number {
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) % 360;
  return h;
}

const RINGS = [100, 500, 2000, 10000]; // metres
const RMIN = 50, RMAX = 30000;

export function SiteContextRadar({ items, size = 168 }: SiteContextRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 12;

  const logMin = Math.log10(RMIN);
  const logMax = Math.log10(RMAX);
  const radiusFor = (m: number) =>
    rOuter * clamp((Math.log10(clamp(m, RMIN, RMAX)) - logMin) / (logMax - logMin), 0.04, 1);

  // place points, spreading same-category items by index
  const placed = items.slice(0, 24).map((it, i) => {
    const base = catAngle(it.category);
    const angle = base + ((i % 5) - 2) * 9;
    const [x, y] = polar(cx, cy, radiusFor(it.distanceM), angle);
    return { x, y, color: catColor(it.category), it };
  });

  return (
    <div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Site context radar by distance">
        {/* distance rings */}
        {RINGS.map((m) => {
          const rr = radiusFor(m);
          return (
            <g key={m}>
              <circle cx={cx} cy={cy} r={rr} fill="none" stroke={Z.border} strokeWidth={0.8} strokeDasharray="2 3" />
              <text x={cx} y={cy - rr - 1} textAnchor="middle" fontSize={7} fill={Z.inkFaint}>{fmtDist(m)}</text>
            </g>
          );
        })}
        {/* site centre */}
        <circle cx={cx} cy={cy} r={3.5} fill={Z.amber} stroke={Z.surfaceSolid} strokeWidth={1.5} />
        {/* points */}
        {placed.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={p.color} fillOpacity={0.85} stroke={Z.surfaceSolid} strokeWidth={0.8}>
            <title>{`${p.it.label} · ${fmtDist(p.it.distanceM)}`}</title>
          </circle>
        ))}
      </svg>
      <div style={{ fontSize: 7.5, color: Z.inkFaint, textAlign: "center", marginTop: -2 }}>
        Distance to {items.length} features · rings log-scaled
      </div>
    </div>
  );
}
