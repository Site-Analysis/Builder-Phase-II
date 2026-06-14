"use client";

import { Circle, Polygon } from "react-leaflet";
import type { ModuleResult } from "@/lib/stores/analysis";

interface RainfallRoseProps {
  center: [number, number];
  result: ModuleResult;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// Monthly total → blue intensity ramp (light = dry month, deep = wettest)
export function rainColor(t: number): string {
  if (t < 0.15) return "#EFF6FF";
  if (t < 0.30) return "#BFDBFE";
  if (t < 0.45) return "#93C5FD";
  if (t < 0.60) return "#60A5FA";
  if (t < 0.75) return "#3B82F6";
  if (t < 0.90) return "#1D4ED8";
  return "#1E3A8A";
}

function monthlyPoints(result: ModuleResult): number[] {
  const pts = result.charts?.find((c) => c.title === "Monthly rainfall")?.points;
  if (!pts || pts.length === 0) return [];
  // points are ordered Jan..Dec
  return pts.map((p) => Number(p.value) || 0);
}

function dest(center: [number, number], bearingDeg: number, distM: number): [number, number] {
  const br = (bearingDeg * Math.PI) / 180;
  const dLat = (distM * Math.cos(br)) / 111320;
  const dLng = (distM * Math.sin(br)) / (111320 * Math.cos((center[0] * Math.PI) / 180));
  return [center[0] + dLat, center[1] + dLng];
}

function wedge(
  center: [number, number], bearing: number, halfWidth: number, ri: number, ro: number,
): [number, number][] {
  const pts: [number, number][] = [];
  const steps = 5;
  for (let k = 0; k <= steps; k++) pts.push(dest(center, bearing - halfWidth + (2 * halfWidth * k) / steps, ro));
  for (let k = steps; k >= 0; k--) pts.push(dest(center, bearing - halfWidth + (2 * halfWidth * k) / steps, ri));
  return pts;
}

export function RainfallRose({ center, result }: RainfallRoseProps) {
  const monthly = monthlyPoints(result);
  if (monthly.length !== 12) {
    // No monthly archive — just mark the site
    return (
      <Circle center={center} radius={6}
        pathOptions={{ color: "#5B21B6", weight: 1.5, fillColor: "#7C3AED", fillOpacity: 1 }} />
    );
  }

  const maxV = Math.max(...monthly, 1);
  const R_MIN = 45;
  const R_SPAN = 235;
  const HALF_WIDTH = 12.5; // 25° petal, 5° gap

  const maxRo = R_MIN + R_SPAN;

  return (
    <>
      {/* Compass dial framing the rose */}
      <Circle center={center} radius={maxRo}
        pathOptions={{ color: "#7C3AED", weight: 1, opacity: 0.45, fill: false, dashArray: "4 4" }} />
      <Circle center={center} radius={maxRo * 0.5}
        pathOptions={{ color: "#7C3AED", weight: 0.8, opacity: 0.28, fill: false, dashArray: "3 5" }} />

      {/* Monthly petals — Jan at top (bearing 0), clockwise */}
      {monthly.map((v, i) => {
        const t = clamp(v / maxV, 0, 1);
        const ro = R_MIN + t * R_SPAN;
        const bearing = i * 30;
        return (
          <Polygon
            key={i}
            positions={wedge(center, bearing, HALF_WIDTH, 0, ro)}
            pathOptions={{ fillColor: rainColor(t), fillOpacity: 0.82, color: "#FFFFFF", weight: 0.6, opacity: 0.7 }}
          />
        );
      })}

      {/* Site marker */}
      <Circle center={center} radius={6}
        pathOptions={{ color: "#5B21B6", weight: 1.5, fillColor: "#7C3AED", fillOpacity: 1 }} />
    </>
  );
}
