"use client";

import { Circle, Polygon } from "react-leaflet";
import type { ModuleResult } from "@/lib/stores/analysis";

interface RainfallRoseProps {
  center: [number, number];
  result: ModuleResult;
}

// 7-step blue ramp matching reference choropleth (light = dry, dark = wet)
const ZONE_COLORS = [
  "#DBEAFE", // outermost — lightest
  "#BFDBFE",
  "#93C5FD",
  "#60A5FA",
  "#3B82F6",
  "#2563EB",
  "#1D4ED8", // innermost — darkest
] as const;

// Outer → inner radii in metres
const ZONE_RADII = [300, 250, 200, 155, 115, 75, 38];

// Irregular blob polygon — deterministic distortion per zone (seed) so zones differ in shape
// Location hash — mixes lat/lng into a stable float so blobs differ per site
function locHash(center: [number, number]): number {
  return Math.sin(center[0] * 127.3 + center[1] * 311.7) * 43758.5453 % 1;
}

function blob(center: [number, number], baseR: number, seed: number): [number, number][] {
  const steps = 40;
  const cosLat = Math.cos((center[0] * Math.PI) / 180);
  const loc = locHash(center);
  const pts: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const variation =
      0.18 * Math.sin(seed * 1.9 + loc * 6.3 + a * 3.1) +
      0.10 * Math.cos(seed * 2.7 + loc * 4.1 + a * 5.3) +
      0.06 * Math.sin(seed * 0.8 + loc * 9.7 + a * 7.7);
    const r = baseR * (1 + variation);
    const dLat = (r * Math.cos(a)) / 111320;
    const dLng = (r * Math.sin(a)) / (111320 * cosLat);
    pts.push([center[0] + dLat, center[1] + dLng]);
  }
  return pts;
}

function annualTotal(result: ModuleResult): number {
  const ind = result.indicators?.find((i) => i.label === "Annual total");
  return ind ? parseFloat(ind.value) || 0 : 0;
}

// Shift the whole palette toward darker blues for wetter sites
function paletteOffset(annualMm: number): number {
  if (annualMm > 1800) return 2;
  if (annualMm > 1200) return 1;
  return 0;
}

export function RainfallRose({ center, result }: RainfallRoseProps) {
  const annual = annualTotal(result);
  const offset = paletteOffset(annual);
  const colors = ZONE_COLORS.slice(offset);            // fewer light zones for wetter sites
  const radii  = ZONE_RADII.slice(ZONE_RADII.length - colors.length);

  if (!annual) {
    return (
      <Circle center={center} radius={8}
        pathOptions={{ color: "#1D4ED8", weight: 1.5, fillColor: "#3B82F6", fillOpacity: 0.9 }} />
    );
  }

  return (
    <>
      {/* Draw outer → inner so inner overlays outer */}
      {radii.map((r, i) => (
        <Polygon
          key={i}
          positions={blob(center, r, i + 1)}
          pathOptions={{
            fillColor: colors[i],
            fillOpacity: 0.72,
            color: "#FFFFFF",
            weight: 0.8,
            opacity: 0.6,
          }}
        />
      ))}

      {/* Site pin */}
      <Circle center={center} radius={7}
        pathOptions={{ color: "#1D4ED8", weight: 2, fillColor: "#FDFCFB", fillOpacity: 1 }} />
    </>
  );
}
