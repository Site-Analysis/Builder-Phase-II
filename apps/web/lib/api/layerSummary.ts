// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
//
// Fetches structured infrastructure-layer summaries for the builder report.
// Sources: cadastral service (port 8011) + Overpass for power grid.
// Returns honest nulls on failure — never throws.

import { bboxOfLatLng } from "./cadastral";
import {
  fetchGasPipelines,
  fetchBwssbSewerage,
  fetchBbmpSwd,
  fetchEncroachment,
  fetchDrainage,
  fetchWrisLakes,
} from "./cadastral_records";

const OVERPASS_URL =
  process.env.NEXT_PUBLIC_OVERPASS_URL ?? "https://overpass.openstreetmap.fr/api/interpreter";

export interface LayerFeatureSummary {
  count: number;
  nearestM: number | null;
  details: string[];
}

export interface LayerSummaryData {
  gasPipelines:  LayerFeatureSummary & { confirmed: number; probable: number; possible: number };
  sewerageMain:  LayerFeatureSummary & { largestDiameterMm: number | null; tierCounts: Record<string, number> };
  stormDrains:   LayerFeatureSummary;
  encroachment:  LayerFeatureSummary;
  waterBodies:   LayerFeatureSummary & { lakes: number; drainage: number };
  powerGrid:     LayerFeatureSummary & { maxVoltageKv: number | null; substationCount: number; lines: { voltageKv: number; name: string | null; distanceM: number }[] };
}

// Haversine — metres
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointsOfGeom(geom: GeoJSON.Geometry): [number, number][] {
  switch (geom.type) {
    case "Point":
      return [geom.coordinates as [number, number]];
    case "LineString":
      return geom.coordinates as [number, number][];
    case "MultiLineString":
      return (geom.coordinates as [number, number][][]).flat();
    case "Polygon":
      return (geom.coordinates as [number, number][][]).flat();
    case "MultiPolygon":
      return (geom.coordinates as [number, number][][][]).flat(2);
    default:
      return [];
  }
}

function nearestToSite(
  fc: GeoJSON.FeatureCollection | null,
  lat: number,
  lon: number,
): number | null {
  if (!fc?.features?.length) return null;
  let minM = Infinity;
  for (const f of fc.features) {
    for (const [flon, flat] of pointsOfGeom(f.geometry)) {
      const d = haversineM(lat, lon, flat, flon);
      if (d < minM) minM = d;
    }
  }
  return isFinite(minM) ? Math.round(minM) : null;
}

function prop<T>(f: GeoJSON.Feature, key: string): T | null {
  return ((f.properties as Record<string, unknown>)?.[key] as T) ?? null;
}

export async function fetchLayerSummaries(
  lat: number,
  lon: number,
  siteBoundary?: [number, number][] | null,
): Promise<LayerSummaryData> {
  const PAD = 0.012; // ~1.3 km — enough to catch nearby mains without flooding the response
  const base = siteBoundary?.length
    ? bboxOfLatLng(siteBoundary)
    : { minLat: lat - PAD, maxLat: lat + PAD, minLon: lon - PAD, maxLon: lon + PAD };
  const bbox = {
    minLat: base.minLat - PAD,
    maxLat: base.maxLat + PAD,
    minLon: base.minLon - PAD,
    maxLon: base.maxLon + PAD,
  };

  // Power grid via Overpass — same query as PowerGridOverlay but capped to 3 km
  const pwrBbox = `${lat - 0.03},${lon - 0.03},${lat + 0.03},${lon + 0.03}`;
  const pwrQuery = `[out:json][timeout:20];
(
  way[power~"^(line|cable)$"](${pwrBbox});
  node[power=substation](${pwrBbox});
  way[power=substation](${pwrBbox});
  node[power=plant](${pwrBbox});
);
out geom;`;

  const settled = await Promise.allSettled([
    fetchGasPipelines(bbox),
    fetchBwssbSewerage(bbox),
    fetchBbmpSwd(bbox),
    fetchEncroachment(bbox),
    fetchDrainage(bbox),
    fetchWrisLakes(bbox),
    fetch(OVERPASS_URL, {
      method: "POST",
      body: new URLSearchParams({ data: pwrQuery }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }).then((r) => r.ok ? r.json() as Promise<{ elements: Record<string, unknown>[] }> : null).catch(() => null),
  ]);
  const [gasR, sewerR, swdR, encrR, drainR, lakesR, pwrR] = settled.map((r) =>
    r.status === "fulfilled" ? r.value : null,
  );
  const gasFC   = gasR   as GeoJSON.FeatureCollection | null;
  const sewerFC = sewerR as GeoJSON.FeatureCollection | null;
  const swdFC   = swdR   as GeoJSON.FeatureCollection | null;
  const encrFC  = encrR  as GeoJSON.FeatureCollection | null;
  const drainFC = drainR as GeoJSON.FeatureCollection | null;
  const lakesFC = lakesR as GeoJSON.FeatureCollection | null;
  const pwrElements = ((pwrR as { elements?: Record<string, unknown>[] } | null)?.elements ?? []);

  // ── Gas pipelines ────────────────────────────────────────────────────────────
  const gasFeatures = gasFC?.features ?? [];
  let gasConfirmed = 0, gasProbable = 0, gasPossible = 0;
  for (const f of gasFeatures) {
    const c = String(prop<string>(f, "confidence") ?? "");
    if (c === "confirmed") gasConfirmed++;
    else if (c === "probable") gasProbable++;
    else gasPossible++;
  }
  const gasNearestM = nearestToSite(gasFC, lat, lon);
  const gasDetails: string[] = [];
  if (gasFeatures.length === 0) gasDetails.push("No gas pipeline data in this area");
  else {
    if (gasConfirmed) gasDetails.push(`${gasConfirmed} confirmed segment(s)`);
    if (gasProbable)  gasDetails.push(`${gasProbable} probable`);
    if (gasPossible)  gasDetails.push(`${gasPossible} possible`);
    gasDetails.push("Source: IGL/GAIL CGD mapping");
  }

  // ── BWSSB sewerage ───────────────────────────────────────────────────────────
  const sewerFeatures = sewerFC?.features ?? [];
  const tierCounts: Record<string, number> = {};
  let maxDiam = 0;
  for (const f of sewerFeatures) {
    const tier = String(prop<string>(f, "diameter_range") ?? "unknown");
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
    const dm = Number(prop<number>(f, "diameter_mm") ?? 0);
    if (dm > maxDiam) maxDiam = dm;
  }
  const sewerNearestM = nearestToSite(sewerFC, lat, lon);
  const sewerDetails: string[] = [];
  if (sewerFeatures.length === 0) sewerDetails.push("No BWSSB sewerage network data in this area");
  else {
    if (maxDiam > 0) sewerDetails.push(`Largest pipe: ${maxDiam} mm`);
    const tierStr = Object.entries(tierCounts).map(([t, n]) => `${n}× ${t}`).join(", ");
    if (tierStr) sewerDetails.push(tierStr);
    sewerDetails.push("Source: BWSSB / data.opencity.in");
  }

  // ── BBMP storm water drains ──────────────────────────────────────────────────
  const swdFeatures = swdFC?.features ?? [];
  const swdNearestM = nearestToSite(swdFC, lat, lon);
  const swdDetails = swdFeatures.length
    ? [`${swdFeatures.length} BBMP SWD segments`, "Source: BBMP / data.opencity.in"]
    : ["No BBMP SWD coverage data in this area"];

  // ── Encroachment ─────────────────────────────────────────────────────────────
  const encrFeatures = encrFC?.features ?? [];
  const encrDetails = encrFeatures.length
    ? [`⚠ ${encrFeatures.length} encroachment feature(s) detected within ~1.3 km of site`, "Verify clear title before proceeding"]
    : ["No encroachment features detected in immediate vicinity"];

  // ── Water bodies ─────────────────────────────────────────────────────────────
  const drainFeatures = drainFC?.features ?? [];
  const lakesFeatures = lakesFC?.features ?? [];
  const wbTotal = drainFeatures.length + lakesFeatures.length;
  const wbDetails = wbTotal
    ? [`${lakesFeatures.length} WRIS lake(s)`, `${drainFeatures.length} drainage feature(s)`, "Proximity increases flood risk — cross-check with flood panel"]
    : ["No significant water bodies or drainage features detected near site"];

  // ── Power grid (Overpass) ────────────────────────────────────────────────────
  interface PwrLine { voltageKv: number; name: string | null; distanceM: number }
  const pwrLines: PwrLine[] = [];
  let pwrSubstationCount = 0;
  let pwrNearestM: number | null = null;
  let pwrMaxKv = 0;

  function parseKv(tags: Record<string, unknown>): number {
    const raw = String(tags.voltage ?? tags["voltage:primary"] ?? "0");
    const v = parseInt(raw.split(";")[0].trim(), 10);
    if (isNaN(v)) return 0;
    return v > 1000 ? v / 1000 : v;
  }

  for (const el of pwrElements) {
    const tags = (el.tags ?? {}) as Record<string, unknown>;
    const powerTag = String(tags.power ?? "");
    if ((el.type === "way") && (powerTag === "line" || powerTag === "cable")) {
      const geom = (el.geometry as { lat: number; lon: number }[] | undefined) ?? [];
      const kv = parseKv(tags);
      if (kv > pwrMaxKv) pwrMaxKv = kv;
      let nearEl = Infinity;
      for (const n of geom) {
        const d = haversineM(lat, lon, n.lat, n.lon);
        if (d < nearEl) nearEl = d;
      }
      if (isFinite(nearEl)) {
        if (pwrNearestM === null || nearEl < pwrNearestM) pwrNearestM = Math.round(nearEl);
        pwrLines.push({ voltageKv: kv, name: String(tags.name ?? "").trim() || null, distanceM: Math.round(nearEl) });
      }
    } else if (powerTag === "substation" || powerTag === "plant") {
      pwrSubstationCount++;
    }
  }
  // Sort lines by distance, keep top 5
  pwrLines.sort((a, b) => a.distanceM - b.distanceM);
  const topLines = pwrLines.slice(0, 5);
  const pwrDetails: string[] = [];
  if (pwrElements.length === 0) {
    pwrDetails.push("No power infrastructure detected in 3 km radius — Overpass may be offline");
  } else {
    if (pwrMaxKv > 0) pwrDetails.push(`Highest voltage: ${pwrMaxKv} kV`);
    if (pwrSubstationCount > 0) pwrDetails.push(`${pwrSubstationCount} substation/plant feature(s)`);
    if (topLines.length) pwrDetails.push(`Nearest line: ${topLines[0].distanceM} m (${topLines[0].voltageKv || "—"} kV)`);
    pwrDetails.push("Source: OpenStreetMap (ODbL)");
  }

  return {
    gasPipelines: {
      count: gasFeatures.length,
      nearestM: gasNearestM,
      confirmed: gasConfirmed,
      probable: gasProbable,
      possible: gasPossible,
      details: gasDetails,
    },
    sewerageMain: {
      count: sewerFeatures.length,
      nearestM: sewerNearestM,
      largestDiameterMm: maxDiam > 0 ? maxDiam : null,
      tierCounts,
      details: sewerDetails,
    },
    stormDrains: {
      count: swdFeatures.length,
      nearestM: swdNearestM,
      details: swdDetails,
    },
    encroachment: {
      count: encrFeatures.length,
      nearestM: null,
      details: encrDetails,
    },
    waterBodies: {
      count: wbTotal,
      nearestM: null,
      lakes: lakesFeatures.length,
      drainage: drainFeatures.length,
      details: wbDetails,
    },
    powerGrid: {
      count: pwrLines.length,
      nearestM: pwrNearestM,
      maxVoltageKv: pwrMaxKv > 0 ? pwrMaxKv : null,
      substationCount: pwrSubstationCount,
      lines: topLines,
      details: pwrDetails,
    },
  };
}
