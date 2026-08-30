// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
//
// OSM building FOOTPRINTS for a drawn area (Overpass). These are STRUCTURE outlines — NOT land
// parcels, and they carry NO survey number / no ownership. They fill the visual gap where the KGIS
// revenue-cadastral has no parcels (dense urban / city-survey / cantonment), for context only.
//
// HONESTY: a building outline ≠ a plot boundary. One plot may hold several buildings, or a building
// may straddle plots. Never presented as a parcel or a survey number.

import type { BBox } from "./cadastral";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const MAX_SPAN_DEG = 0.03; // ~3.3 km — same guard as parcels; keeps the Overpass response bounded

export const OSM_ATTRIBUTION =
  "Building footprints © OpenStreetMap contributors (ODbL). STRUCTURES, not land parcels — no survey number, no ownership. One plot may hold several buildings.";

export interface OsmBuilding {
  geometry: GeoJSON.Polygon; // [lon,lat] ring, EPSG:4326
  levels: string;            // building:levels, if tagged
  name: string;              // name, if tagged
  kind: string;              // the `building` tag value (yes/residential/commercial/…)
}

export type BuildingStatus = "ok" | "empty" | "too-large" | "error";

export interface BuildingResult {
  status: BuildingStatus;
  buildings: OsmBuilding[];
  count: number;
  reason?: string;
  attribution: string;
  elapsedMs: number;
}

const base = (status: BuildingStatus, reason?: string): BuildingResult => ({
  status, buildings: [], count: 0, reason, attribution: OSM_ATTRIBUTION, elapsedMs: 0,
});

interface OverpassWay { type: string; geometry?: { lat: number; lon: number }[]; tags?: Record<string, string> }

function toBuilding(w: OverpassWay): OsmBuilding | null {
  const g = w.geometry;
  if (!g || g.length < 3) return null;
  const ring: GeoJSON.Position[] = g.map((p) => [p.lon, p.lat]);
  // close the ring for a valid GeoJSON Polygon
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
  const t = w.tags ?? {};
  return {
    geometry: { type: "Polygon", coordinates: [ring] },
    levels: String(t["building:levels"] ?? ""),
    name: String(t.name ?? ""),
    kind: String(t.building ?? "yes"),
  };
}

/** Fetch OSM building footprints intersecting `bbox` via Overpass. Never throws; never fabricates —
 *  slow/down/oversized Overpass yields an explicit non-`ok` status the UI renders honestly. Parses
 *  `way` buildings (the vast majority); relation multipolygons are skipped (rare, complex). */
export async function fetchBuildings(bbox: BBox, signal?: AbortSignal): Promise<BuildingResult> {
  if (bbox.maxLon - bbox.minLon > MAX_SPAN_DEG || bbox.maxLat - bbox.minLat > MAX_SPAN_DEG) {
    return base("too-large", "Drawn area too large for a building fetch — draw a smaller site.");
  }
  // Overpass bbox order = (south,west,north,east)
  const bb = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
  const query = `[out:json][timeout:25];(way["building"](${bb}););out geom;`;
  const t0 = performance.now();
  try {
    const res = await fetch(OVERPASS_URL, { method: "POST", body: query, signal });
    if (!res.ok) return { ...base("error", `Overpass returned HTTP ${res.status} — building data unavailable (may be rate-limited; retry shortly).`), elapsedMs: performance.now() - t0 };
    const j = await res.json();
    const buildings = (j.elements ?? [])
      .filter((e: OverpassWay) => e.type === "way")
      .map(toBuilding)
      .filter((b: OsmBuilding | null): b is OsmBuilding => b !== null);
    return {
      status: buildings.length ? "ok" : "empty",
      buildings, count: buildings.length,
      reason: buildings.length ? undefined : "No OSM buildings mapped in this area (OSM coverage gap — not proof the ground is empty).",
      attribution: OSM_ATTRIBUTION, elapsedMs: performance.now() - t0,
    };
  } catch (e) {
    if (signal?.aborted) return { ...base("error", "cancelled"), elapsedMs: performance.now() - t0 };
    return { ...base("error", e instanceof Error ? `Overpass unreachable: ${e.message}` : "Overpass unreachable — building data unavailable."), elapsedMs: performance.now() - t0 };
  }
}
