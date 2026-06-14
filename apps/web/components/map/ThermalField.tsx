"use client";

import { useEffect, useState } from "react";
import { Circle, Pane, Polygon, useMap } from "react-leaflet";
import { getThermalGrid, type ThermalGridData } from "@/lib/api/analysis";
import { useDrawStore, type RectBounds } from "@/lib/stores/draw";
import { useConfigStore } from "@/lib/stores/config";
import type { ModuleResult } from "@/lib/stores/analysis";

interface ThermalFieldProps {
  center: [number, number];
  result?: ModuleResult;
}

export function tempColor(c: number): string {
  if (c < 12) return "#1E3A8A";
  if (c < 18) return "#2563EB";
  if (c < 22) return "#60A5FA";
  if (c < 26) return "#FCD34D";
  if (c < 30) return "#FB923C";
  if (c < 35) return "#F97316";
  return "#DC2626";
}

// Applies CSS clip-path to the custom pane div, updated on every zoom/pan
function ThermalClip({
  center, bufferM, rectBounds,
}: {
  center: [number, number];
  bufferM: number;
  rectBounds: RectBounds | null;
}) {
  const map = useMap();

  useEffect(() => {
    const update = () => {
      const pane = map.getPane("thermalCells") as HTMLElement | null;
      if (!pane) return;

      // Pane div is translated by Leaflet during pan — measure actual offset vs container
      const mapRect  = map.getContainer().getBoundingClientRect();
      const paneRect = pane.getBoundingClientRect();
      const ox = paneRect.left - mapRect.left;
      const oy = paneRect.top  - mapRect.top;

      // Convert latlng → container px, then into pane-local px (subtract pane offset)
      const toPaneLocal = (lat: number, lng: number) => {
        const p = map.latLngToContainerPoint([lat, lng] as [number, number]);
        return { x: p.x - ox, y: p.y - oy };
      };

      if (rectBounds) {
        const minLat = Math.min(rectBounds[0][0], rectBounds[1][0]);
        const maxLat = Math.max(rectBounds[0][0], rectBounds[1][0]);
        const minLng = Math.min(rectBounds[0][1], rectBounds[1][1]);
        const maxLng = Math.max(rectBounds[0][1], rectBounds[1][1]);
        const sw = toPaneLocal(minLat, minLng);
        const ne = toPaneLocal(maxLat, maxLng);
        pane.style.clipPath =
          `polygon(${sw.x}px ${ne.y}px, ${ne.x}px ${ne.y}px, ${ne.x}px ${sw.y}px, ${sw.x}px ${sw.y}px)`;
      } else {
        const cp = toPaneLocal(center[0], center[1]);
        const cosLat = Math.cos((center[0] * Math.PI) / 180);
        const ep = toPaneLocal(center[0], center[1] + bufferM / (111320 * cosLat));
        const rPx = Math.hypot(ep.x - cp.x, ep.y - cp.y);
        pane.style.clipPath = `circle(${Math.ceil(rPx)}px at ${cp.x}px ${cp.y}px)`;
      }
    };

    update();
    map.on("move zoom viewreset zoomend moveend", update);
    return () => {
      map.off("move zoom viewreset zoomend moveend", update);
      const pane = map.getPane("thermalCells") as HTMLElement | null;
      if (pane) pane.style.clipPath = "";
    };
  }, [map, center, bufferM, rectBounds]);

  return null;
}

export function ThermalField({ center }: ThermalFieldProps) {
  const [grid, setGrid] = useState<ThermalGridData | null>(null);
  const { rectBounds } = useDrawStore();
  const { bufferM } = useConfigStore();

  useEffect(() => {
    let alive = true;
    setGrid(null);
    getThermalGrid(
      { lat: center[0], lng: center[1] },
      0.02,
      8,
      rectBounds ?? undefined,
    ).then((g) => {
      if (alive) setGrid(g);
    });
    return () => { alive = false; };
  }, [center[0], center[1], rectBounds]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ThermalClip center={center} bufferM={bufferM} rectBounds={rectBounds} />

      <Pane name="thermalCells" style={{ zIndex: 390 }}>
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
      </Pane>

      {/* Site marker — rendered outside clipped pane so it's always visible */}
      <Circle center={center} radius={6}
        pathOptions={{ color: "#991B1B", weight: 1.5, fillColor: "#EF4444", fillOpacity: 1 }} />
    </>
  );
}
