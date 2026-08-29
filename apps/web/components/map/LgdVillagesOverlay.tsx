// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

const BASE = process.env.NEXT_PUBLIC_CADASTRAL_API_URL ?? "http://localhost:8011";

interface Props {
  enabled: boolean;
}

export function LgdVillagesOverlay({ enabled }: Props) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
      return;
    }

    const ctrl = new AbortController();
    fetch(`${BASE}/lgd-villages`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        if (ctrl.signal.aborted) return;
        if (layerRef.current) { map.removeLayer(layerRef.current); }
        const layer = L.geoJSON(fc, {
          style: (feature) => {
            const covered = feature?.properties?.covered;
            return {
              color: covered ? "#4caf50" : "#ef5350",
              weight: 1,
              fillOpacity: 0.05,
              fillColor: covered ? "#4caf50" : "#ef5350",
            };
          },
          onEachFeature: (feature, lyr) => {
            const p = feature.properties ?? {};
            lyr.bindPopup(
              `<div style="font-size:11px"><b>${p.vilname11 ?? "Village"}</b><br>LGD: ${p.vil_lgd ?? ""}<br>${p.covered ? "e-Chawadi covered" : "Not covered"}</div>`,
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
  }, [enabled, map]);

  return null;
}
