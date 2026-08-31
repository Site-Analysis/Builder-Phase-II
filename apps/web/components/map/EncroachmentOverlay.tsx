// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { bboxOfLatLng } from "@/lib/api/cadastral";

const BASE = process.env.NEXT_PUBLIC_CADASTRAL_API_URL ?? "https://api.builder.qnit.site/cadastral";

interface Props {
  enabled: boolean;
  siteBoundary?: [number, number][];
}

export function EncroachmentOverlay({ enabled, siteBoundary }: Props) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
      return;
    }

    const ctrl = new AbortController();
    const bbox = siteBoundary?.length ? bboxOfLatLng(siteBoundary) : null;
    const bboxParam = bbox ? `?bbox=${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}` : "";

    fetch(`${BASE}/encroachment${bboxParam}`, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((fc: GeoJSON.FeatureCollection) => {
        if (ctrl.signal.aborted) return;
        if (layerRef.current) { map.removeLayer(layerRef.current); }
        const layer = L.geoJSON(fc, {
          style: (feature) => {
            const p = feature?.properties ?? {};
            const color = p.bbmp_notified ? "#d32f2f" : "#f57c00";
            return { color, weight: 1.5, fillColor: color, fillOpacity: 0.6 };
          },
          onEachFeature: (feature, lyr) => {
            const p = feature.properties ?? {};
            lyr.bindPopup(
              `<div style="font-size:11px">
                <b>Encroachment</b><br>
                Survey: ${p.survey_no ?? ""}<br>
                Village: ${p.village_name ?? ""}<br>
                ${p.bbmp_notified ? "<span style='color:#d32f2f'>BBMP Notified</span><br>" : ""}
                ${p.revenue_flagged ? "<span style='color:#f57c00'>Revenue Flagged</span>" : ""}
              </div>`,
            );
          },
        });
        layer.addTo(map);
        layerRef.current = layer;
      })
      .catch(() => {});

    return () => {
      ctrl.abort();
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    };
  }, [enabled, siteBoundary, map]);

  return null;
}
