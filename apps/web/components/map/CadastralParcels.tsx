// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

// KGIS Cadastral L5 parcels for the drawn area. INDICATIVE reference boundaries (3–10 m offset),
// NOT survey-exact. The geometry is KGIS full-resolution; the only inaccuracy is KGIS's inherent
// positional offset vs the satellite. `offsetLat/offsetLon` (degrees) is a MANUAL alignment nudge so
// the user can rubber-sheet the layer onto the basemap — a visual aid, never a change to the data.

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { useDrawStore } from "@/lib/stores/draw";
import { bboxOfLatLng, fetchCadastralParcels, parcelKey, type CadastralParcel, type CadastralResult } from "@/lib/api/cadastral";

const LABEL_CSS = `.kgis-parcel-lbl{background:transparent;border:none;box-shadow:none;color:#7C2D12;font-size:9px;font-weight:700;text-shadow:0 0 2px #fff,0 0 2px #fff;}`;
function ensureCss() {
  if (typeof document === "undefined" || document.getElementById("kgis-parcel-css")) return;
  const s = document.createElement("style");
  s.id = "kgis-parcel-css";
  s.textContent = LABEL_CSS;
  document.head.appendChild(s);
}

function styleFor(p: CadastralParcel, filter: string, selectedKey: string): L.PathOptions {
  const isRoad = p.category !== "Parcel";
  // The CLICKED parcel (SLICE 1) — strongest emphasis, distinct emerald from the teal filter-match.
  if (selectedKey !== "" && parcelKey(p.surveyNumber, p.geometry) === selectedKey) {
    return { color: "#047857", weight: 3, fillColor: "#10B981", fillOpacity: 0.45, dashArray: undefined };
  }
  const match = filter.trim() !== "" && p.surveyNumber === filter.trim();
  if (match) return { color: "#0F766E", weight: 2.5, fillColor: "#14B8A6", fillOpacity: 0.35, dashArray: undefined };
  // Dim the rest whenever a filter OR a selection is active, so the emphasised parcel stands out.
  const dim = (filter.trim() !== "" && !match) || selectedKey !== "";
  return {
    color: isRoad ? "#9CA3AF" : "#C2410C",
    weight: isRoad ? 1 : 1.25,
    dashArray: "3 3",
    fillColor: isRoad ? "#9CA3AF" : "#F97316",
    fillOpacity: dim ? 0.03 : isRoad ? 0.05 : 0.10,
  };
}

function popupHtml(p: CadastralParcel): string {
  const row = (k: string, v: string) => (v ? `<div style="display:flex;gap:8px"><span style="color:#7B8F83;min-width:70px">${k}</span><b>${v}</b></div>` : "");
  return (
    `<div style="font-size:11px;line-height:1.5;font-family:system-ui">` +
    `<div style="font-weight:800;color:#7C2D12;margin-bottom:3px">${p.hasSurvey ? `Survey No. ${p.surveyNumber}` : (p.category || "Parcel")}</div>` +
    row("Category", p.category) + row("Kharab", p.kharab) + row("ULPIN", p.ulpin) +
    row("Village", p.villageCode) + row("LGD village", p.lgdVillage) +
    `<div style="margin-top:5px;color:#B45309;font-style:italic">Indicative KGIS boundary — not a legal survey (3–10 m offset). Verify against the certified survey / RTC.</div>` +
    `</div>`
  );
}

// Apply the manual alignment nudge (degrees) to a parcel polygon.
function shiftGeom(g: GeoJSON.Polygon, dLon: number, dLat: number): GeoJSON.Polygon {
  if (!dLon && !dLat) return g;
  return { type: "Polygon", coordinates: g.coordinates.map((ring) => ring.map(([lon, lat]) => [lon + dLon, lat + dLat])) };
}

interface Props {
  enabled: boolean;
  filter: string;
  onStatus: (r: CadastralResult | "loading" | null) => void;
  siteBoundary?: [number, number][];
  offsetLat?: number;
  offsetLon?: number;
  // SLICE 1 — the JOIN. onSelect fires with the parcel's TRUE (unshifted) geometry so a nudged
  // screen position can never drive analysis (Rule 5). selectedKey highlights the clicked parcel.
  onSelect?: (p: CadastralParcel) => void;
  selectedKey?: string;
}

export function CadastralParcels({ enabled, filter, onStatus, siteBoundary, offsetLat = 0, offsetLon = 0, onSelect, selectedKey = "" }: Props) {
  const map = useMap();
  const drawBoundary = useDrawStore((s) => s.boundary);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const parcelsRef = useRef<CadastralParcel[]>([]);
  const bboxKeyRef = useRef<string>("");
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const selectedKeyRef = useRef(selectedKey);
  selectedKeyRef.current = selectedKey;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const clear = () => { if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; } };

  const render = (parcels: CadastralParcel[], dLat: number, dLon: number) => {
    clear();
    if (!parcels.length) return;
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: parcels.map((p, i) => ({ type: "Feature", id: i, properties: { i }, geometry: shiftGeom(p.geometry, dLon, dLat) })),
    };
    const layer = L.geoJSON(fc, {
      style: (feat) => styleFor(parcels[(feat?.properties as { i: number }).i], filterRef.current, selectedKeyRef.current),
      onEachFeature: (feat, lyr) => {
        const p = parcels[(feat.properties as { i: number }).i];
        if (p.hasSurvey && p.category === "Parcel") {
          lyr.bindTooltip(p.surveyNumber, { permanent: true, direction: "center", className: "kgis-parcel-lbl" });
        }
        lyr.bindPopup(popupHtml(p));
        // Click selects the parcel by its TRUE geometry (never the nudged position — Rule 5).
        lyr.on("click", (e) => { L.DomEvent.stopPropagation(e); onSelectRef.current?.(p); });
      },
    }).addTo(map);
    layerRef.current = layer;
  };

  // fetch (cached by bbox) + render. An offset-only change re-renders from cache (no refetch).
  useEffect(() => {
    ensureCss();
    const positions = (drawBoundary && drawBoundary.positions.length >= 3)
      ? drawBoundary.positions
      : (siteBoundary && siteBoundary.length >= 3 ? siteBoundary : null);
    if (!enabled || !positions) { clear(); parcelsRef.current = []; bboxKeyRef.current = ""; onStatus(null); return; }
    const bbox = bboxOfLatLng(positions);
    const key = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
    if (key === bboxKeyRef.current && parcelsRef.current.length) {
      render(parcelsRef.current, offsetLat, offsetLon); // same area — just re-align
      return;
    }
    const ctrl = new AbortController();
    onStatus("loading");
    fetchCadastralParcels(bbox, ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      onStatus(res);
      parcelsRef.current = res.status === "ok" ? res.parcels : [];
      bboxKeyRef.current = res.status === "ok" ? key : "";
      render(parcelsRef.current, offsetLat, offsetLon);
    });
    return () => { ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, drawBoundary, siteBoundary, offsetLat, offsetLon, map]);

  // restyle on filter / selection change (no refetch / re-render)
  useEffect(() => {
    const layer = layerRef.current;
    if (layer) layer.setStyle((feat) => styleFor(parcelsRef.current[(feat?.properties as { i: number }).i], filterRef.current, selectedKeyRef.current));
  }, [filter, selectedKey]);

  // remove the layer on unmount
  useEffect(() => () => { clear(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
