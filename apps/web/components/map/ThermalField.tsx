"use client";

import { useEffect, useState } from "react";
import { Circle, Polygon } from "react-leaflet";
import { getThermalGrid, type ThermalGridData } from "@/lib/api/analysis";
import type { ModuleResult } from "@/lib/stores/analysis";

interface ThermalFieldProps {
  center: [number, number];
  result?: ModuleResult; // unused — grid is its own real data source
}

// Temperature (°C) → cold-to-hot ramp. Absolute scale so colours stay consistent
// with the legend in TemperatureOverlay (no per-tile normalisation tricks).
export function tempColor(c: number): string {
  if (c < 12) return "#1E3A8A";
  if (c < 18) return "#2563EB";
  if (c < 22) return "#60A5FA";
  if (c < 26) return "#FCD34D";
  if (c < 30) return "#FB923C";
  if (c < 35) return "#F97316";
  return "#DC2626";
}

export function ThermalField({ center }: ThermalFieldProps) {
  const [grid, setGrid] = useState<ThermalGridData | null>(null);

  useEffect(() => {
    let alive = true;
    setGrid(null);
    getThermalGrid({ lat: center[0], lng: center[1] }).then((g) => {
      if (alive) setGrid(g);
    });
    return () => { alive = false; };
  }, [center[0], center[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {grid?.cells.map((cell, i) => (
        <Polygon
          key={i}
          positions={cell.ring}
          pathOptions={{
            fillColor: tempColor(cell.temp), fillOpacity: 0.5,
            color: "#FFFFFF", weight: 0.4, opacity: 0.5,
          }}
        />
      ))}
      {/* Site marker */}
      <Circle center={center} radius={6}
        pathOptions={{ color: "#991B1B", weight: 1.5, fillColor: "#EF4444", fillOpacity: 1 }} />
    </>
  );
}
