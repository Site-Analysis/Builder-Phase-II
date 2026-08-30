// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { bboxOfLatLng } from "@/lib/api/cadastral";
import { fetchGasPipelines, fetchCgdZones } from "@/lib/api/cadastral_records";

// Colors match CadastralLayersPanel legend exactly
const CONFIDENCE_STYLE: Record<string, { color: string; weight: number; dashArray?: string }> = {
  confirmed: { color: "#f57c00", weight: 2.5 },
  probable:  { color: "#ff8f00", weight: 2, dashArray: "6,4" },
  possible:  { color: "#ffb74d", weight: 1.5, dashArray: "4,4" },
};
const DEFAULT_STYLE = { color: "#f57c00", weight: 2 };
const CGD_ZONE_STYLE = { color: "#e65100", weight: 1, dashArray: "8,5", fillOpacity: 0.04, fillColor: "#ff9800" };

interface Props {
  enabled: boolean;
  siteBoundary?: [number, number][];
}

export function GasPipelineOverlay({ enabled, siteBoundary }: Props) {
  const map = useMap();
  const pipeRef = useRef<L.GeoJSON | null>(null);
  const zoneRef = useRef<L.GeoJSON | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const clearAll = () => {
      if (pipeRef.current) { map.removeLayer(pipeRef.current); pipeRef.current = null; }
      if (zoneRef.current) { map.removeLayer(zoneRef.current); zoneRef.current = null; }
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
        fetchGasPipelines(paddedBbox, ctrl.signal),
        fetchCgdZones(ctrl.signal),
      ]).then(([pipeFC, zoneFC]) => {
        if (ctrl.signal.aborted) return;
        clearAll();

        if (pipeFC?.features?.length) {
          const layer = L.geoJSON(pipeFC, {
            style: (feature) => {
              const conf = String((feature?.properties as Record<string, unknown>)?.substance_confidence ?? "");
              return CONFIDENCE_STYLE[conf] ?? DEFAULT_STYLE;
            },
            onEachFeature: (feature, lyr) => {
              const p = (feature.properties ?? {}) as Record<string, unknown>;
              lyr.bindPopup(
                `<div style="font-size:11px;font-family:system-ui">` +
                `<b>Gas Pipeline</b><br>` +
                `Confidence: ${p.substance_confidence ?? "—"}<br>` +
                (p.usage ? `Usage: ${p.usage}<br>` : "") +
                (p.operator ? `Operator: ${p.operator}<br>` : "") +
                `<i style="color:#64748B;font-size:10px">Source: OpenStreetMap (ODbL)</i>` +
                `</div>`,
              );
            },
          });
          layer.addTo(map);
          pipeRef.current = layer;
        }

        if (zoneFC?.features?.length) {
          const layer = L.geoJSON(zoneFC, {
            style: () => CGD_ZONE_STYLE,
            onEachFeature: (feature, lyr) => {
              const p = (feature.properties ?? {}) as Record<string, unknown>;
              lyr.bindPopup(
                `<div style="font-size:11px;font-family:system-ui">` +
                `<b>CGD Zone</b>${p.entity_name ? `: ${p.entity_name}` : ""}<br>` +
                (p.ga_name ? `GA: ${p.ga_name}<br>` : "") +
                `<i style="color:#64748B;font-size:10px">Source: PNGRB</i>` +
                `</div>`,
              );
            },
          });
          layer.addTo(map);
          zoneRef.current = layer;
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
  }, [enabled, siteBoundary, map]);

  return null;
}
