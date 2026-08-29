// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

// OSM building footprints for the drawn area — STRUCTURES, not parcels (no survey number). Rendered
// in a distinct slate style so they never read as cadastral parcels. Fills the visual gap where KGIS
// has no revenue parcels (urban / cantonment). Never fabricates geometry.

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { useDrawStore } from "@/lib/stores/draw";
import { bboxOfLatLng } from "@/lib/api/cadastral";
import { fetchBuildings, type BuildingResult, type OsmBuilding } from "@/lib/api/buildings";

const STYLE: L.PathOptions = { color: "#475569", weight: 0.8, fillColor: "#64748B", fillOpacity: 0.28 };

function popupHtml(b: OsmBuilding): string {
  const row = (k: string, v: string) => (v ? `<div style="display:flex;gap:8px"><span style="color:#7B8F83;min-width:56px">${k}</span><b>${v}</b></div>` : "");
  return (
    `<div style="font-size:11px;line-height:1.5;font-family:system-ui">` +
    `<div style="font-weight:800;color:#334155;margin-bottom:3px">OSM building</div>` +
    row("Type", b.kind) + row("Levels", b.levels) + row("Name", b.name) +
    `<div style="margin-top:5px;color:#64748B;font-style:italic">A STRUCTURE outline, NOT a land parcel — no survey number. One plot may hold several buildings.</div>` +
    `</div>`
  );
}

interface Props {
  enabled: boolean;
  onStatus: (r: BuildingResult | "loading" | null) => void;
  siteBoundary?: [number, number][];
}

export function BuildingFootprints({ enabled, onStatus, siteBoundary }: Props) {
  const map = useMap();
  const drawBoundary = useDrawStore((s) => s.boundary);
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const positions = (drawBoundary && drawBoundary.positions.length >= 3)
      ? drawBoundary.positions
      : (siteBoundary && siteBoundary.length >= 3 ? siteBoundary : null);
    const clear = () => { if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; } };
    if (!enabled || !positions) { clear(); onStatus(null); return; }

    const ctrl = new AbortController();
    onStatus("loading");
    fetchBuildings(bboxOfLatLng(positions), ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      onStatus(res);
      clear();
      if (res.status !== "ok") return;
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: res.buildings.map((b, i) => ({ type: "Feature", id: i, properties: { i }, geometry: b.geometry })),
      };
      const layer = L.geoJSON(fc, {
        style: () => STYLE,
        onEachFeature: (feat, lyr) => lyr.bindPopup(popupHtml(res.buildings[(feat.properties as { i: number }).i])),
      }).addTo(map);
      layerRef.current = layer;
    });
    return () => { ctrl.abort(); clear(); };
  }, [enabled, drawBoundary, siteBoundary, map]);

  return null;
}
