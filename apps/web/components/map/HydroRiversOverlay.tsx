// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { bboxOfLatLng } from "@/lib/api/cadastral";
import { fetchHydroRivers } from "@/lib/api/cadastral_records";

interface Props {
  enabled: boolean;
  siteBoundary?: [number, number][];
}

export function HydroRiversOverlay({ enabled, siteBoundary }: Props) {
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

      fetchHydroRivers(paddedBbox, ctrl.signal).then((fc) => {
        if (ctrl.signal.aborted || !fc) return;
        clearAll();
        const layer = L.geoJSON(fc, {
          style: (feature) => {
            const strahler = feature?.properties?.strahler ?? 0;
            const major = strahler >= 3;
            return { color: major ? "#1565c0" : "#64b5f6", weight: major ? 3.5 : 1.5, opacity: 0.8 };
          },
          onEachFeature: (feature, lyr) => {
            const p = feature.properties ?? {};
            lyr.bindPopup(
              `<div style="font-size:11px"><b>River</b><br>Strahler: ${p.strahler ?? "?"}<br>Discharge: ${p.discharge_cms != null ? `${p.discharge_cms} cms` : "—"}</div>`,
            );
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
