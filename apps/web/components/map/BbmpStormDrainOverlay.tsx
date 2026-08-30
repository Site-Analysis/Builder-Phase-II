// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { bboxOfLatLng } from "@/lib/api/cadastral";
import { fetchBbmpSwd } from "@/lib/api/cadastral_records";

const TIER_COLORS: Record<string, { color: string; weight: number }> = {
  primary:   { color: "#004d40", weight: 4 },
  secondary: { color: "#00695c", weight: 2.5 },
  tertiary:  { color: "#00897b", weight: 1.5 },
};

interface Props {
  enabled: boolean;
  siteBoundary?: [number, number][];
}

export function BbmpStormDrainOverlay({ enabled, siteBoundary }: Props) {
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

      fetchBbmpSwd(paddedBbox, ctrl.signal).then((fc) => {
        if (ctrl.signal.aborted || !fc) return;
        clearAll();
        if (!fc.features?.length) return;
        const layer = L.geoJSON(fc, {
          style: (feature) => {
            const tier = (feature?.properties?.tier as string | undefined)?.toLowerCase() ?? "tertiary";
            const s = TIER_COLORS[tier] ?? TIER_COLORS.tertiary;
            return { color: s.color, weight: s.weight, opacity: 0.85 };
          },
          onEachFeature: (feature, lyr) => {
            const p = feature.properties ?? {};
            lyr.bindPopup(`<div style="font-size:11px"><b>BBMP Storm Drain</b><br>Tier: ${p.tier ?? "—"}</div>`);
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
