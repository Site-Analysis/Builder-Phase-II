// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
"use client";

// OIM-quality power grid overlay. Sources: OpenStreetMap via Overpass (ODbL).
// Renders: transmission/distribution lines (voltage-accurate colors), substation
// and power-plant node markers (sized by voltage), named labels at zoom ≥ 13.

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { useUIStore } from "@/lib/stores/ui";
import { bboxOfLatLng } from "@/lib/api/cadastral";

const OVERPASS_URL =
  process.env.NEXT_PUBLIC_OVERPASS_URL ?? "https://overpass.openstreetmap.fr/api/interpreter";

interface Props {
  siteBoundary?: [number, number][];
}

// ── Color / weight by voltage ──────────────────────────────────────────────────
function parseVoltageKv(tags: Record<string, unknown>): number {
  const raw = String(tags.voltage ?? tags["voltage:primary"] ?? "0");
  const v = parseInt(raw.split(";")[0].trim(), 10);
  if (isNaN(v)) return 0;
  return v > 1000 ? v / 1000 : v; // store as V or kV both handled
}

function lineStyle(kv: number): L.PathOptions {
  if (kv >= 700) return { color: "#c0392b", weight: 4,   opacity: 0.95 };
  if (kv >= 400) return { color: "#e74c3c", weight: 3.5, opacity: 0.95 };
  if (kv >= 220) return { color: "#e91e63", weight: 3,   opacity: 0.9  };
  if (kv >= 132) return { color: "#ff9800", weight: 2.5, opacity: 0.9  };
  if (kv >= 66)  return { color: "#ffc107", weight: 2,   opacity: 0.85 };
  if (kv >= 33)  return { color: "#8bc34a", weight: 1.5, opacity: 0.85 };
  if (kv >= 11)  return { color: "#4fc3f7", weight: 1.5, opacity: 0.8  };
  return          { color: "#bdbdbd",       weight: 1,   opacity: 0.7  };
}

function nodeStyle(powerTag: string, kv: number): L.CircleMarkerOptions {
  const base: L.CircleMarkerOptions = { color: "#ffffff", weight: 2, fillOpacity: 0.92 };
  if (powerTag === "converter") return { ...base, radius: 10, fillColor: "#9c27b0" };
  if (powerTag === "plant")     return { ...base, radius: 10, fillColor: "#e74c3c" };
  if (kv >= 220) return { ...base, radius: 9,  fillColor: "#c0392b" };
  if (kv >= 66)  return { ...base, radius: 7,  fillColor: "#ff9800" };
  if (kv >= 11)  return { ...base, radius: 5,  fillColor: "#ffc107", weight: 1.5 };
  return          { ...base, radius: 3,  fillColor: "#9e9e9e", weight: 1  };
}

function kvLabel(kv: number): string {
  return kv > 0 ? `${kv} kV` : "—";
}

function popupHtml(tags: Record<string, unknown>, powerTag: string, kv: number): string {
  const name = String(tags.name ?? tags.ref ?? "").trim();
  const op   = String(tags.operator ?? "").trim();
  const typeLabel = powerTag === "plant" ? "Power Plant"
    : powerTag === "converter" ? "HVDC Converter"
    : powerTag === "generator" ? "Generator"
    : "Substation";
  return [
    name ? `<b>${name}</b>` : `<b>${typeLabel}</b>`,
    `Type: ${typeLabel} · Voltage: ${kvLabel(kv)}`,
    op ? `Operator: ${op}` : "",
    `<i style="font-size:9px;color:#64748B">Source: OpenStreetMap (ODbL)</i>`,
  ].filter(Boolean).join("<br>");
}

function linePopupHtml(tags: Record<string, unknown>, kv: number): string {
  const name = String(tags.name ?? "").trim();
  const op   = String(tags.operator ?? "").trim();
  const cable = tags.power === "cable";
  return [
    name ? `<b>${name}</b>` : `<b>${cable ? "Underground Cable" : "Power Line"}</b>`,
    `Voltage: ${kvLabel(kv)}`,
    op ? `Operator: ${op}` : "",
    `<i style="font-size:9px;color:#64748B">Source: OpenStreetMap (ODbL)</i>`,
  ].filter(Boolean).join("<br>");
}

// Inject CSS for named labels once
let _cssInjected = false;
function injectLabelCss() {
  if (_cssInjected || typeof document === "undefined") return;
  _cssInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .power-label {
      background: rgba(20,20,30,0.88) !important;
      color: #fff !important;
      border: none !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.5) !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      padding: 2px 6px !important;
      border-radius: 3px !important;
      white-space: nowrap !important;
    }
    .power-label::before { display: none !important; }
  `;
  document.head.appendChild(s);
}

export function PowerGridOverlay({ siteBoundary }: Props) {
  const map = useMap();
  const enabled = useUIStore((s) => s.powerGridEnabled);

  const linesRef  = useRef<L.GeoJSON | null>(null);
  const nodesRef  = useRef<L.LayerGroup | null>(null);
  const ctrlRef   = useRef<AbortController | null>(null);

  useEffect(() => {
    injectLabelCss();
  }, []);

  useEffect(() => {
    const clearAll = () => {
      if (linesRef.current)  { map.removeLayer(linesRef.current);  linesRef.current  = null; }
      if (nodesRef.current)  { map.removeLayer(nodesRef.current);  nodesRef.current  = null; }
    };

    if (!enabled) { clearAll(); ctrlRef.current?.abort(); return; }

    const handler = async () => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;

      const mapCenter = map.getCenter();
      const zoom = map.getZoom();

      // Cap bbox so Overpass never gets a region >~60km wide regardless of zoom.
      // Without this, zoomed-out views timeout the 30s Overpass budget.
      const CAP = 0.3; // ≈33km per side
      let b: { minLat: number; minLon: number; maxLat: number; maxLon: number };
      if (siteBoundary && siteBoundary.length >= 3) {
        const base = bboxOfLatLng(siteBoundary);
        const pad = 0.4; // generous padding around site to catch nearby substations
        b = {
          minLat: base.minLat - pad, minLon: base.minLon - pad,
          maxLat: base.maxLat + pad, maxLon: base.maxLon + pad,
        };
      } else {
        b = {
          minLat: mapCenter.lat - CAP, minLon: mapCenter.lng - CAP,
          maxLat: mapCenter.lat + CAP, maxLon: mapCenter.lng + CAP,
        };
      }
      const bbox = `${b.minLat},${b.minLon},${b.maxLat},${b.maxLon}`;

      // Always query nodes — rendering threshold is separate from query threshold
      const query = `[out:json][timeout:30];
(
  way[power=line](${bbox});
  way[power=cable](${bbox});
  node[power=substation](${bbox});
  node[power=plant](${bbox});
  node[power=generator](${bbox});
  node[power=converter](${bbox});
  way[power=substation](${bbox});
  way[power=plant](${bbox});
);
out geom;`;

      let elements: Record<string, unknown>[] = [];
      try {
        const resp = await fetch(OVERPASS_URL, {
          method: "POST",
          body: new URLSearchParams({ data: query }),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          signal: ctrl.signal,
        });
        if (resp.ok) {
          const json = await resp.json() as { elements: Record<string, unknown>[] };
          elements = json.elements ?? [];
        }
      } catch {
        return;
      }
      if (ctrl.signal.aborted) return;

      clearAll();

      // ── Lines (ways with power=line or power=cable) ───────────────────────
      const lineFeatures: GeoJSON.Feature[] = [];
      const nodeElements: Record<string, unknown>[] = [];

      for (const el of elements) {
        const tags = (el.tags ?? {}) as Record<string, unknown>;
        const powerTag = String(tags.power ?? "");

        if (el.type === "way" && (powerTag === "line" || powerTag === "cable")) {
          const geom = el.geometry as { lat: number; lon: number }[] | undefined;
          if (!geom?.length) continue;
          lineFeatures.push({
            type: "Feature",
            properties: { ...tags, _kv: parseVoltageKv(tags) },
            geometry: {
              type: "LineString",
              coordinates: geom.map((n) => [n.lon, n.lat]),
            },
          });
        } else if (
          el.type === "node" &&
          (powerTag === "substation" || powerTag === "plant" || powerTag === "generator" || powerTag === "converter")
        ) {
          nodeElements.push(el);
        } else if (
          el.type === "way" &&
          (powerTag === "substation" || powerTag === "plant")
        ) {
          // Use centroid of way polygon for the marker
          const geom = el.geometry as { lat: number; lon: number }[] | undefined;
          if (!geom?.length) continue;
          const lat = geom.reduce((s, n) => s + n.lat, 0) / geom.length;
          const lon = geom.reduce((s, n) => s + n.lon, 0) / geom.length;
          nodeElements.push({ ...el, lat, lon, type: "node" });
        }
      }

      // Render lines
      if (lineFeatures.length) {
        const layer = L.geoJSON(
          { type: "FeatureCollection", features: lineFeatures } as GeoJSON.FeatureCollection,
          {
            style: (feature) => {
              const kv = Number((feature?.properties as Record<string, unknown>)?._kv ?? 0);
              return lineStyle(kv);
            },
            onEachFeature: (feature, lyr) => {
              const p = (feature.properties ?? {}) as Record<string, unknown>;
              const kv = Number(p._kv ?? 0);
              lyr.bindPopup(linePopupHtml(p, kv), { maxWidth: 260 });
            },
          },
        );
        layer.addTo(map);
        linesRef.current = layer;
      }

      // Render nodes (substations, plants, converters, generators)
      if (nodeElements.length) {
        const group = L.layerGroup();
        const isPermanent = zoom >= 13;

        for (const el of nodeElements) {
          const tags = (el.tags ?? {}) as Record<string, unknown>;
          const powerTag = String(tags.power ?? "");
          const kv = parseVoltageKv(tags);
          const lat = el.lat as number;
          const lon = el.lon as number;
          if (!lat || !lon) continue;

          const marker = L.circleMarker([lat, lon], nodeStyle(powerTag, kv));
          marker.bindPopup(popupHtml(tags, powerTag, kv), { maxWidth: 280 });

          const name = String(tags.name ?? tags.ref ?? "").trim();
          if (name) {
            marker.bindTooltip(name, {
              permanent: isPermanent,
              direction: "right",
              className: "power-label",
              offset: [8, 0],
            });
          }

          group.addLayer(marker);
        }
        group.addTo(map);
        nodesRef.current = group;
      }
    };

    // Re-run when zoom changes (label permanence + node visibility threshold)
    const onZoomEnd = () => { handler(); };

    handler();
    map.on("moveend", handler);
    map.on("zoomend", onZoomEnd);

    return () => {
      ctrlRef.current?.abort();
      map.off("moveend", handler);
      map.off("zoomend", onZoomEnd);
      if (linesRef.current)  { map.removeLayer(linesRef.current);  linesRef.current  = null; }
      if (nodesRef.current)  { map.removeLayer(nodesRef.current);  nodesRef.current  = null; }
    };
  }, [enabled, siteBoundary, map]);

  return null;
}
