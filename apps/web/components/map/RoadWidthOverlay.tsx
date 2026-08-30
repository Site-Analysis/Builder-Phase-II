// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { bboxOfLatLng } from "@/lib/api/cadastral";
import { fetchRoadWidth } from "@/lib/api/cadastral_records";

// Colors match CadastralLayersPanel legend exactly
const SOURCE_COLOR: Record<string, string> = {
  BBMP: "#1565c0",
  OSM:  "#2e7d32",
};
const EST_COLOR = "#9e9e9e";

function roadColor(source: string | null | undefined): string {
  if (!source) return EST_COLOR;
  const s = String(source).toUpperCase();
  if (s.includes("BBMP")) return SOURCE_COLOR.BBMP;
  if (s.includes("OSM"))  return SOURCE_COLOR.OSM;
  return EST_COLOR;
}

function farForWidth(widthM: number | null | undefined): number | null {
  if (widthM == null || widthM <= 0) return null;
  if (widthM < 9)  return 1.5;
  if (widthM < 12) return 1.75;
  if (widthM < 18) return 2.25;
  if (widthM < 24) return 2.75;
  if (widthM < 30) return 3.25;
  return 3.75;
}

function popupHtml(props: Record<string, unknown>): string {
  const w   = props.width_m != null ? `${props.width_m} m` : "—";
  const wb  = props.width_built_m != null ? `${props.width_built_m} m` : "—";
  const far = props.far_rmp ?? farForWidth(typeof props.width_m === "number" ? props.width_m : null) ?? "—";
  const hier = props.road_hier ?? props.highway ?? "—";
  const src  = props.source ?? "OSM";
  const name = props.road_name
    ? `<div style="font-weight:800;color:#334155;margin-bottom:3px">${props.road_name}</div>`
    : "";
  const row = (k: string, v: string) =>
    `<div style="display:flex;gap:8px"><span style="color:#7B8F83;min-width:80px">${k}</span><b>${v}</b></div>`;
  return (
    `<div style="font-size:11px;line-height:1.6;font-family:system-ui">` +
    name +
    row("Source", String(src)) +
    row("Class", String(hier)) +
    row("ROW width", w) +
    row("Built width", wb) +
    `<div style="margin-top:6px;background:#F0FDF4;border-radius:4px;padding:4px 6px;">` +
    `<span style="font-weight:800;color:#15803D">RMP FAR</span>&nbsp;<span style="font-size:15px;font-weight:900;color:#15803D">${far}</span>` +
    `</div>` +
    `<div style="margin-top:5px;color:#64748B;font-style:italic;font-size:10px">` +
    `Road-width FAR is the RMP-primary criterion. Source: ${src} (BBMP/OSM).` +
    `</div></div>`
  );
}

interface Props {
  enabled: boolean;
  siteBoundary?: [number, number][];
}

export function RoadWidthOverlay({ enabled, siteBoundary }: Props) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const ctrlRef  = useRef<AbortController | null>(null);

  useEffect(() => {
    const clearAll = () => {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
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

      fetchRoadWidth(paddedBbox, ctrl.signal).then((fc) => {
        if (ctrl.signal.aborted || !fc) return;
        clearAll();
        if (!fc.features?.length) return;

        const layer = L.geoJSON(fc, {
          style: (feature) => {
            const props = (feature?.properties ?? {}) as Record<string, unknown>;
            const color = roadColor(props.source as string | null);
            return { color, weight: 3, opacity: 0.85, fillOpacity: 0 };
          },
          onEachFeature: (feature, lyr) => {
            const props = (feature.properties ?? {}) as Record<string, unknown>;
            lyr.bindPopup(popupHtml(props), { maxWidth: 260 });
          },
        });
        layer.addTo(map);
        layerRef.current = layer;
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
