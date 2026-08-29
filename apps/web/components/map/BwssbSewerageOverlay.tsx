// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

// BWSSB sewerage network — pipe polylines colored by diameter tier.
// Source: BBMP data.opencity.in (public domain, Govt of Karnataka).
// Utility signal enrichment: nearest pipe diameter → BWSSB connection feasibility.

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { bboxOfLatLng } from "@/lib/api/cadastral";
import { fetchBwssbSewerage } from "@/lib/api/cadastral_records";

const TIER_STYLE: Record<string, { color: string; weight: number }> = {
  "300+":    { color: "#1D4ED8", weight: 3.5 },
  "150-300": { color: "#60A5FA", weight: 2.5 },
  "<150":    { color: "#BAE6FD", weight: 1.5 },
};
const DEFAULT_STYLE = { color: "#93C5FD", weight: 2 };

interface Props {
  enabled: boolean;
  siteBoundary?: [number, number][];
  /** Filter by diameter tier: "300+" | "150-300" | "<150". Omit for all tiers. */
  tier?: "300+" | "150-300" | "<150";
}

export function BwssbSewerageOverlay({ enabled, siteBoundary, tier }: Props) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const clear = () => {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    };
    if (!enabled) { clear(); return; }

    const ctrl = new AbortController();
    const bounds = map.getBounds();
    const bbox = (siteBoundary && siteBoundary.length >= 2) ? bboxOfLatLng(siteBoundary)
      : { minLon: bounds.getWest(), minLat: bounds.getSouth(), maxLon: bounds.getEast(), maxLat: bounds.getNorth() };

    fetchBwssbSewerage(bbox, tier, ctrl.signal).then((fc) => {
      if (ctrl.signal.aborted || !fc) return;
      clear();
      if (!fc.features?.length) return;
      const layer = L.geoJSON(fc, {
        style: (feature) => {
          const tier = String((feature?.properties as Record<string, unknown>)?.diameter_range ?? "");
          return TIER_STYLE[tier] ?? DEFAULT_STYLE;
        },
        onEachFeature: (feature, lyr) => {
          const p = (feature.properties ?? {}) as Record<string, unknown>;
          lyr.bindPopup(
            `<div style="font-size:11px;font-family:system-ui">` +
            `<b>BWSSB Sewerage</b><br>` +
            `Diameter: ${p.diameter_mm ?? "—"} mm (${p.diameter_range ?? "—"})<br>` +
            `<i style="color:#64748B;font-size:10px">Source: data.opencity.in / BWSSB (public domain)</i>` +
            `</div>`,
          );
        },
      });
      layer.addTo(map);
      layerRef.current = layer;
    });

    return () => { ctrl.abort(); clear(); };
  }, [enabled, siteBoundary, tier, map]);

  return null;
}
