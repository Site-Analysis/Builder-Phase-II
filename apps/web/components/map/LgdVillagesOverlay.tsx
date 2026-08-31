// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

import { useEffect, useRef, useCallback } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { getSession } from "next-auth/react";

async function getToken(): Promise<string | null> {
  for (let i = 0; i < 8; i++) {
    const session = await getSession();
    if (session?.accessToken) return session.accessToken as string;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

const BASE = process.env.NEXT_PUBLIC_CADASTRAL_API_URL ?? "https://api.builder.qnit.site/cadastral";

interface Props {
  enabled: boolean;
}

export function LgdVillagesOverlay({ enabled }: Props) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const fetchLgd = useCallback(() => {
    if (ctrlRef.current) ctrlRef.current.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    const b = map.getBounds();
    const bbox = `${b.getWest().toFixed(6)},${b.getSouth().toFixed(6)},${b.getEast().toFixed(6)},${b.getNorth().toFixed(6)}`;

    getToken().then((token) => {
      const authHeader: Record<string, string> = token
        ? { Authorization: `Bearer ${token}` }
        : {};
      fetch(`${BASE}/lgd-villages?bbox=${bbox}`, { headers: authHeader, signal: ctrl.signal })
        .then((r) => r.json())
        .then((fc: GeoJSON.FeatureCollection) => {
          if (ctrl.signal.aborted) return;
          if (layerRef.current) map.removeLayer(layerRef.current);
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
                `<div style="font-size:11px"><b>${p.vilname11 ?? "Village"}</b><br>LGD: ${p.vil_lgd ?? ""}<br>${p.covered ? "✓ Covered" : "✗ Uncovered"}</div>`,
              );
            },
          });
          layer.addTo(map);
          layerRef.current = layer;
        })
        .catch(() => {});
    });
  }, [map]);

  useEffect(() => {
    if (!enabled) {
      if (ctrlRef.current) { ctrlRef.current.abort(); ctrlRef.current = null; }
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
      return;
    }

    fetchLgd();
    map.on("moveend", fetchLgd);

    return () => {
      if (ctrlRef.current) { ctrlRef.current.abort(); ctrlRef.current = null; }
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
      map.off("moveend", fetchLgd);
    };
  }, [enabled, map, fetchLgd]);

  return null;
}
