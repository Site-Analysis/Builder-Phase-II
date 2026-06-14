"use client";

import { Circle } from "react-leaflet";
import type { ModuleResult } from "@/lib/stores/analysis";

interface FloodZoneRingsProps {
  center: [number, number];
  result: ModuleResult;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function indFrac(result: ModuleResult, label: string): number {
  return result.indicators?.find((i) => i.label === label)?.barFraction ?? 0;
}

export function FloodZoneRings({ center, result }: FloodZoneRingsProps) {
  const score          = result.score ?? 50;
  const overallRisk    = clamp(1 - score / 100, 0, 1);
  const riverProximity = clamp(indFrac(result, "Nearest river distance"), 0, 1);
  const waterOccurrence = clamp(indFrac(result, "Water occurrence"), 0, 1);
  const lowLyingRisk   = clamp(indFrac(result, "Low-lying area"), 0, 1);

  const rScale = clamp(0.75 + overallRisk * 0.50, 0.75, 1.25);

  // Radii in metres — site-local scale, driven by risk factor data
  const r1 = (60  + overallRisk     * 40) * rScale;
  const r2 = (140 + lowLyingRisk    * 80) * rScale;
  const r3 = (240 + waterOccurrence * 100) * rScale;
  const r4 = (340 + riverProximity  * 110) * rScale;

  const a1 = clamp(overallRisk     * 0.72, 0.10, 0.55);
  const a2 = clamp(lowLyingRisk    * 0.58, 0.06, 0.44);
  const a3 = clamp(waterOccurrence * 0.48, 0.05, 0.35);
  const a4 = clamp(riverProximity  * 0.36, 0.04, 0.24);

  return (
    <>
      {/* Outermost ring first so inner rings paint on top */}
      <Circle
        center={center} radius={r4}
        pathOptions={{ color: "#93C5FD", fillColor: "#93C5FD", fillOpacity: a4, weight: 0.8 }}
      />
      <Circle
        center={center} radius={r3}
        pathOptions={{ color: "#3B82F6", fillColor: "#3B82F6", fillOpacity: a3, weight: 0.8 }}
      />
      <Circle
        center={center} radius={r2}
        pathOptions={{ color: "#2563EB", fillColor: "#2563EB", fillOpacity: a2, weight: 1.0 }}
      />
      <Circle
        center={center} radius={r1}
        pathOptions={{ color: "#1E3A8A", fillColor: "#1E3A8A", fillOpacity: a1, weight: 1.2 }}
      />
    </>
  );
}
