"use client";

import { Circle, Polygon } from "react-leaflet";
import type { ModuleResult } from "@/lib/stores/analysis";

interface WindRoseProps {
  center: [number, number];
  result: ModuleResult;
}

// 16-point compass — name → bearing (deg, 0 = North, clockwise)
const DIRS: { name: string; bearing: number }[] = [
  { name: "N", bearing: 0 },     { name: "NNE", bearing: 22.5 },
  { name: "NE", bearing: 45 },   { name: "ENE", bearing: 67.5 },
  { name: "E", bearing: 90 },    { name: "ESE", bearing: 112.5 },
  { name: "SE", bearing: 135 },  { name: "SSE", bearing: 157.5 },
  { name: "S", bearing: 180 },   { name: "SSW", bearing: 202.5 },
  { name: "SW", bearing: 225 },  { name: "WSW", bearing: 247.5 },
  { name: "W", bearing: 270 },   { name: "WNW", bearing: 292.5 },
  { name: "NW", bearing: 315 },  { name: "NNW", bearing: 337.5 },
];

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
function frac(x: number) {
  return x - Math.floor(x);
}
// deterministic pseudo-random per index — keeps the rose stable across renders
function jitter(i: number) {
  return frac(Math.sin(i * 127.1) * 43758.5453);
}

function indVal(result: ModuleResult, label: string): number {
  const v = result.indicators?.find((i) => i.label === label)?.value;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
function prevailingIndex(result: ModuleResult): number {
  const raw = result.detailMetrics
    ?.find((g) => g.group === "Wind profile")
    ?.rows.find((r) => r.label === "Prevailing direction")?.value;
  const code = String(raw ?? "NW").trim().toUpperCase();
  const idx = DIRS.findIndex((d) => d.name === code);
  return idx >= 0 ? idx : 14; // default NW
}

// Speed → meteorological colour ramp (m/s)
export function speedColor(s: number): string {
  if (s < 2)  return "#DBEAFE";
  if (s < 4)  return "#93C5FD";
  if (s < 6)  return "#3B82F6";
  if (s < 8)  return "#2563EB";
  if (s < 10) return "#F59E0B";
  if (s < 12) return "#F97316";
  return "#EF4444";
}

// Equirectangular offset — accurate enough at site scale (< 1 km)
function dest(center: [number, number], bearingDeg: number, distM: number): [number, number] {
  const br = (bearingDeg * Math.PI) / 180;
  const dLat = (distM * Math.cos(br)) / 111320;
  const dLng = (distM * Math.sin(br)) / (111320 * Math.cos((center[0] * Math.PI) / 180));
  return [center[0] + dLat, center[1] + dLng];
}

// Annular wedge polygon (between inner & outer radius, spanning the sector)
function wedge(
  center: [number, number],
  bearing: number,
  halfWidth: number,
  ri: number,
  ro: number,
): [number, number][] {
  const pts: [number, number][] = [];
  const steps = 5;
  for (let k = 0; k <= steps; k++) {
    pts.push(dest(center, bearing - halfWidth + (2 * halfWidth * k) / steps, ro));
  }
  for (let k = steps; k >= 0; k--) {
    pts.push(dest(center, bearing - halfWidth + (2 * halfWidth * k) / steps, ri));
  }
  return pts;
}

export function WindRose({ center, result }: WindRoseProps) {
  const meanSpeed = indVal(result, "Mean wind speed") || 4;
  const p         = prevailingIndex(result);
  const sigma     = 2.2;

  // Per-direction frequency — gaussian peak at prevailing dir + light jitter
  const rawFreq = DIRS.map((_, i) => {
    const d = Math.min(Math.abs(i - p), DIRS.length - Math.abs(i - p));
    const g = Math.exp(-(d * d) / (2 * sigma * sigma));
    return clamp(g * (0.8 + 0.4 * jitter(i)), 0, 1);
  });
  const maxFreq = Math.max(...rawFreq, 0.0001);
  const freq    = rawFreq.map((f) => f / maxFreq);

  const R_MIN = 40;   // metres — minimum petal length
  const R_SPAN = 240; // metres — added at max frequency
  const HALF_WIDTH = 9.5; // degrees — petal half-angle

  const petals = DIRS.map((dir, i) => {
    const ro = R_MIN + freq[i] * R_SPAN;
    const dirSpeed = meanSpeed * (0.55 + 0.7 * freq[i]);
    // three stacked bands: inner (calm) → outer (peak) of this direction
    const bands = [
      { ri: 0,         ro: ro * 0.5, color: speedColor(dirSpeed * 0.45) },
      { ri: ro * 0.5,  ro: ro * 0.8, color: speedColor(dirSpeed * 0.75) },
      { ri: ro * 0.8,  ro,           color: speedColor(dirSpeed) },
    ];
    return { dir, bands };
  });

  const maxRo = R_MIN + R_SPAN;

  return (
    <>
      {/* Range circle — frames the rose like a compass dial */}
      <Circle
        center={center} radius={maxRo}
        pathOptions={{ color: "#06B6D4", weight: 1, opacity: 0.5, fill: false, dashArray: "4 4" }}
      />
      <Circle
        center={center} radius={maxRo * 0.5}
        pathOptions={{ color: "#06B6D4", weight: 0.8, opacity: 0.3, fill: false, dashArray: "3 5" }}
      />

      {/* Petals — back band first so outer bands overlay cleanly */}
      {petals.map(({ dir, bands }) =>
        bands.map((b, bi) => (
          <Polygon
            key={`${dir.name}-${bi}`}
            positions={wedge(center, dir.bearing, HALF_WIDTH, b.ri, b.ro)}
            pathOptions={{
              fillColor: b.color, fillOpacity: 0.82,
              color: "#FFFFFF", weight: 0.6, opacity: 0.7,
            }}
          />
        )),
      )}

      {/* Site marker */}
      <Circle
        center={center} radius={6}
        pathOptions={{ color: "#0E7490", weight: 1.5, fillColor: "#06B6D4", fillOpacity: 1 }}
      />
    </>
  );
}
