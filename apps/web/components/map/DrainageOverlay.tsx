// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

// OSM waterways (drains, canals, streams) + HydroRIVERS (Strahler order ≥3).
// Also renders WRIS lake polygons. Combined into one overlay toggle.
// Sources: OpenStreetMap (ODbL), HydroSHEDS HydroRIVERS v10, WRIS Govt of India.
// Flood signal enrichment: proximity to drains/rivers → drainage constraint context.

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { bboxOfLatLng } from "@/lib/api/cadastral";
import { fetchWrisLakes } from "@/lib/api/cadastral_records";

const LAKE_STYLE = { color: "#0369A1", weight: 1, fillColor: "#BAE6FD", fillOpacity: 0.35 };

interface Props {
  enabled: boolean;
  siteBoundary?: [number, number][];
}

export function DrainageOverlay({ enabled, siteBoundary }: Props) {
  const map = useMap();
  const lakeRef = useRef<L.GeoJSON | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const clearAll = () => {
      if (lakeRef.current) { map.removeLayer(lakeRef.current); lakeRef.current = null; }
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

      fetchWrisLakes(paddedBbox, ctrl.signal).then((lakeFC) => {
        if (ctrl.signal.aborted) return;
        clearAll();

        if (lakeFC?.features?.length) {
          const layer = L.geoJSON(lakeFC, {
            style: () => LAKE_STYLE,
            onEachFeature: (feature, lyr) => {
              const p = (feature.properties ?? {}) as Record<string, unknown>;
              lyr.bindPopup(
                `<div style="font-size:11px;font-family:system-ui">` +
                `<b>Water body</b>${p.wbname ? `: ${p.wbname}` : ""}<br>` +
                (p.area_ha ? `Area: ${p.area_ha} ha<br>` : "") +
                `<i style="color:#64748B;font-size:10px">Source: WRIS (Govt of India)</i>` +
                `</div>`,
              );
            },
          });
          layer.addTo(map);
          lakeRef.current = layer;
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
