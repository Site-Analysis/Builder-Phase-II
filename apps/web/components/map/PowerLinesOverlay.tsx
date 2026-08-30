// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { bboxOfLatLng } from "@/lib/api/cadastral";
import { fetchOsmPowerlines, fetchBescomBoundaries } from "@/lib/api/cadastral_records";

// Colors match CadastralLayersPanel legend exactly
const CLASS_STYLE: Record<string, { color: string; weight: number; dashArray?: string }> = {
  EHV: { color: "#b71c1c", weight: 3 },   // ≥110 kV
  HV:  { color: "#e53935", weight: 2 },   // 11–109 kV
  MV:  { color: "#ff7043", weight: 1.5 }, // <11 kV
};
const DEFAULT_STYLE  = { color: "#ff7043", weight: 1.5 };
const ZONE_STYLE     = { color: "#37474f", weight: 1.5, dashArray: "6,4", fillOpacity: 0 };

interface Props {
  enabled: boolean;
  siteBoundary?: [number, number][];
  showLines?: boolean;  // EHV/HV/MV polylines (default true)
  showZones?: boolean;  // BESCOM admin zone polygons (default true)
}

export function PowerLinesOverlay({ enabled, siteBoundary, showLines = true, showZones = true }: Props) {
  const map = useMap();
  const linesRef = useRef<L.GeoJSON | null>(null);
  const zonesRef = useRef<L.GeoJSON | null>(null);
  const ctrlRef  = useRef<AbortController | null>(null);

  useEffect(() => {
    const clearAll = () => {
      if (linesRef.current) { map.removeLayer(linesRef.current); linesRef.current = null; }
      if (zonesRef.current) { map.removeLayer(zonesRef.current); zonesRef.current = null; }
    };

    if (!enabled) { clearAll(); ctrlRef.current?.abort(); return; }

    const handler = () => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;

      const bounds = map.getBounds();
      const bbox = (siteBoundary && siteBoundary.length >= 2) ? bboxOfLatLng(siteBoundary)
        : { minLon: bounds.getWest(), minLat: bounds.getSouth(), maxLon: bounds.getEast(), maxLat: bounds.getNorth() };
      const pad = 0.01;
      const paddedBbox = {
        minLon: bbox.minLon - pad, minLat: bbox.minLat - pad,
        maxLon: bbox.maxLon + pad, maxLat: bbox.maxLat + pad,
      };

      Promise.all([
        showLines ? fetchOsmPowerlines(paddedBbox, ctrl.signal) : Promise.resolve(null),
        showZones ? fetchBescomBoundaries(ctrl.signal) : Promise.resolve(null),
      ]).then(([linesFC, zonesFC]) => {
        if (ctrl.signal.aborted) return;
        clearAll();

        if (linesFC?.features?.length) {
          const layer = L.geoJSON(linesFC, {
            style: (feature) => {
              const cls = String((feature?.properties as Record<string, unknown>)?.power_class ?? "");
              return CLASS_STYLE[cls] ?? DEFAULT_STYLE;
            },
            onEachFeature: (feature, lyr) => {
              const p = (feature.properties ?? {}) as Record<string, unknown>;
              lyr.bindPopup(
                `<div style="font-size:11px;font-family:system-ui">` +
                `<b>Power Line</b> (${p.power_class ?? "—"})<br>` +
                `Voltage: ${p.voltage ?? "—"}<br>` +
                (p.operator ? `Operator: ${p.operator}<br>` : "") +
                `<i style="color:#64748B;font-size:10px">Source: OpenStreetMap (ODbL)</i>` +
                `</div>`,
              );
            },
          });
          layer.addTo(map);
          linesRef.current = layer;
        }

        if (zonesFC?.features?.length) {
          const layer = L.geoJSON(zonesFC, {
            style: () => ZONE_STYLE,
            onEachFeature: (feature, lyr) => {
              const p = (feature.properties ?? {}) as Record<string, unknown>;
              lyr.bindPopup(
                `<div style="font-size:11px;font-family:system-ui">` +
                `<b>BESCOM Zone</b>${p.name ? `: ${p.name}` : ""}<br>` +
                `<i style="color:#64748B;font-size:10px">Source: BESCOM</i>` +
                `</div>`,
              );
            },
          });
          layer.addTo(map);
          zonesRef.current = layer;
        }
      });
    };

    handler();
    map.on("moveend", handler);

    return () => {
      ctrlRef.current?.abort();
      map.off("moveend", handler);
      clearAll();
    };
  }, [enabled, siteBoundary, showLines, showZones, map]);

  return null;
}
