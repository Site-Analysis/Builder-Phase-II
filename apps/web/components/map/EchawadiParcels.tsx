// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

// e-Chawadi (Bhoomi) parcel polygons rendered on Leaflet from the cadastral service's
// /parcels-by-bbox endpoint. Primary source — official Karnataka Bhoomi geometry from
// scraped parquet lake. Replaces KGIS L5 parcels where e-Chawadi data exists.
//
// Click → fires onSelect with survey_no, village hierarchy, and geometry. The caller
// (page.tsx) fetches RCCMS + mutations via fetchEchawadiRecords.

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { bboxOfLatLng, type CadastralParcel } from "@/lib/api/cadastral";
import { fetchParcelsByBbox } from "@/lib/api/cadastral_records";

const LABEL_CSS = `.echawadi-lbl{background:transparent;border:none;box-shadow:none;color:#1E3A5F;font-size:9px;font-weight:700;text-shadow:0 0 2px #fff,0 0 2px #fff;}`;

function ensureCss() {
  if (typeof document === "undefined" || document.getElementById("echawadi-parcel-css")) return;
  const s = document.createElement("style");
  s.id = "echawadi-parcel-css";
  s.textContent = LABEL_CSS;
  document.head.appendChild(s);
}

type BBox = { minLon: number; minLat: number; maxLon: number; maxLat: number };
type ParcelProps = {
  survey_no: string;
  village_name: string;
  village_code: string;
  dist: string;
  taluk: string;
  hobli: string;
  vlg: string;
};

function styleFor(props: ParcelProps, selectedKey: string): L.PathOptions {
  const key = `${props.survey_no}|${props.village_code}`;
  if (selectedKey && key === selectedKey) {
    return { color: "#047857", weight: 3, fillColor: "#10B981", fillOpacity: 0.45, dashArray: undefined };
  }
  const dim = selectedKey !== "";
  return {
    color: "#1E40AF",
    weight: 1.25,
    dashArray: "3 3",
    fillColor: "#3B82F6",
    fillOpacity: dim ? 0.03 : 0.12,
  };
}

function popupHtml(p: ParcelProps): string {
  const row = (k: string, v: string) =>
    v ? `<div style="display:flex;gap:8px"><span style="color:#64748B;min-width:72px">${k}</span><b>${v}</b></div>` : "";
  return (
    `<div style="font-size:11px;line-height:1.6;font-family:system-ui">` +
    `<div style="font-weight:800;color:#1E40AF;margin-bottom:3px">Survey No. ${p.survey_no}</div>` +
    row("Village", p.village_name) +
    row("LGD code", p.village_code) +
    `<div style="margin-top:4px;font-size:10px;color:#94A3B8">Source: e-Chawadi / Bhoomi (Govt of Karnataka)</div>` +
    `</div>`
  );
}

function featureKey(p: ParcelProps): string {
  return `${p.survey_no}|${p.village_code}`;
}

interface Props {
  enabled: boolean;
  siteBoundary?: [number, number][];
  onSelect?: (parcel: CadastralParcel) => void;
  selectedKey?: string;
  /** When set, renders this GeoJSON directly instead of fetching by bbox (toolbar-driven mode). */
  toolbarGeoJSON?: GeoJSON.FeatureCollection | null;
}

function renderParcelLayer(
  fc: GeoJSON.FeatureCollection,
  map: L.Map,
  selectedKey: string,
  onSelect?: (parcel: CadastralParcel) => void,
): { layer: L.GeoJSON; labelLayer: L.LayerGroup } {
  const showLabels = (fc.features?.length ?? 0) <= 500;
  const labelLayer = L.layerGroup().addTo(map);

  const layer = L.geoJSON(fc, {
    style: (feature) => {
      const p = (feature?.properties ?? {}) as ParcelProps;
      return styleFor(p, selectedKey);
    },
    onEachFeature: (feature, lyr) => {
      const p = (feature.properties ?? {}) as ParcelProps;
      lyr.bindPopup(popupHtml(p));

      if (showLabels && p.survey_no) {
        const geom = feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
        const ring = geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates[0][0];
        if (ring?.length) {
          const lats = ring.map((c) => c[1]);
          const lons = ring.map((c) => c[0]);
          const clat = (Math.min(...lats) + Math.max(...lats)) / 2;
          const clon = (Math.min(...lons) + Math.max(...lons)) / 2;
          L.marker([clat, clon], {
            icon: L.divIcon({ className: "echawadi-lbl", html: p.survey_no.split("/")[0], iconSize: undefined }),
            interactive: false,
          }).addTo(labelLayer);
        }
      }

      lyr.on("click", () => {
        if (!onSelect) return;
        const geom = feature.geometry as GeoJSON.Polygon;
        onSelect({
          surveyNumber: p.survey_no, hasSurvey: true, category: "Parcel",
          kharab: "", label: p.survey_no.split("/")[0], ulpin: "",
          villageCode: p.village_code, lgdVillage: p.village_code, villageName: p.village_name, geometry: geom,
        });
      });
    },
  });

  layer.addTo(map);
  return { layer, labelLayer };
}

export function EchawadiParcels({ enabled, siteBoundary, onSelect, selectedKey = "", toolbarGeoJSON }: Props) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const labelLayerRef = useRef<L.LayerGroup | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "empty" | "error">("idle");

  useEffect(() => {
    ensureCss();
  }, []);

  // Toolbar-driven mode: render toolbarGeoJSON when provided
  useEffect(() => {
    if (toolbarGeoJSON === undefined) return; // not in toolbar mode
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    if (labelLayerRef.current) { map.removeLayer(labelLayerRef.current); labelLayerRef.current = null; }
    if (!toolbarGeoJSON || !toolbarGeoJSON.features?.length) { setStatus("empty"); return; }
    const { layer, labelLayer } = renderParcelLayer(toolbarGeoJSON, map, selectedKey, onSelect);
    layerRef.current = layer;
    labelLayerRef.current = labelLayer;
    setStatus("ok");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolbarGeoJSON, map]);

  useEffect(() => {
    const clear = () => {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
      if (labelLayerRef.current) { map.removeLayer(labelLayerRef.current); labelLayerRef.current = null; }
    };

    // If toolbar mode is active, skip bbox loading
    if (toolbarGeoJSON !== undefined) return;

    if (!enabled || !siteBoundary || siteBoundary.length < 2) { clear(); return; }

    const ctrl = new AbortController();
    const bbox: BBox = bboxOfLatLng(siteBoundary);

    setStatus("loading");
    fetchParcelsByBbox(bbox, ctrl.signal).then((fc) => {
      if (ctrl.signal.aborted) return;
      clear();
      if (!fc || !fc.features?.length) { setStatus("empty"); return; }
      const { layer, labelLayer } = renderParcelLayer(fc, map, selectedKey, onSelect);
      layerRef.current = layer;
      labelLayerRef.current = labelLayer;
      setStatus("ok");
    });

    return () => { ctrl.abort(); clear(); setStatus("idle"); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, siteBoundary, map]);

  // Re-style on selection change without refetching
  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.setStyle((feature) => {
      const p = (feature?.properties ?? {}) as ParcelProps;
      return styleFor(p, selectedKey);
    });
  }, [selectedKey]);

  // Status indicator — bottom-left of map
  if (status === "loading") {
    return (
      <div style={{
        position: "absolute", bottom: 8, left: 8, zIndex: 500,
        background: "rgba(255,255,255,0.9)", borderRadius: 4, padding: "2px 8px",
        fontSize: 11, fontFamily: "system-ui", color: "#1E40AF",
        border: "1px solid #BFDBFE",
      }}>
        Loading Bhoomi parcels…
      </div>
    );
  }
  if (status === "empty") {
    return (
      <div style={{
        position: "absolute", bottom: 8, left: 8, zIndex: 500,
        background: "rgba(255,255,255,0.9)", borderRadius: 4, padding: "2px 8px",
        fontSize: 11, fontFamily: "system-ui", color: "#64748B",
        border: "1px solid #E2E8F0",
      }}>
        No e-Chawadi parcel data for this area
      </div>
    );
  }
  return null;
}
