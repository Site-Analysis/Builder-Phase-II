// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
//
// KGIS Cadastral Layer 5 (survey parcels) — bbox → parcel FEATURES. INDICATIVE ONLY.
//
// The KGIS CadastralData_Admin MapServer layer 5 is a queryable Feature Layer
// (capabilities=Map,Query,Data). A bbox query returns parcel polygons + `surveynumberi`
// (survey no) + Category + Kharab + KGISVillageCode + ULPIN, in EPSG:4326 with ring
// coordinates already [lon,lat] (verified — no reprojection needed).
//
// HONESTY: this is KGIS's cadastral DIGITIZATION — "indicative, not a legal survey" (their own
// attribution), 3–10 m offset from satellite. It is NOT a legal RTC/title, NOT owner data. Survey
// numbers here are indicative. KGIS commercial/redistribution terms for a PAID product are
// UNRESOLVED (non-commercial until an MOU) — see LICENSING below.

const KGIS_L5_QUERY =
  "https://kgis.ksrsac.in/kgismaps/rest/services/CadastralData_Admin/Dynamic_CadastralData_Admin/MapServer/5/query";

// KGIS maxRecordCount is 1000; a ~1.3 km bbox already returns ~100 parcels in ~3 s, so cap the drawn
// bbox span to keep it responsive and under the transfer limit.
const MAX_SPAN_DEG = 0.03; // ~3.3 km
const RECORD_CAP = 1000;

export const KGIS_ATTRIBUTION =
  "KGIS (KSRSAC) Cadastral — INDICATIVE, not a legal survey (3–10 m satellite offset). Verify against the certified survey / RTC.";
export const KGIS_LICENSING =
  "KGIS commercial / redistribution terms for a paid product are UNRESOLVED — indicative & non-commercial until an MOU with KSRSAC. Do not ship to paying users on this basis.";

export interface CadastralParcel {
  surveyNumber: string;   // `surveynumberi`; "" / "0" ⇒ no survey (road/kharab)
  hasSurvey: boolean;
  category: string;       // "Parcel" | "Road" | …
  kharab: string;         // "" | "ROAD" | kharab code
  villageCode: string;    // KGISVillageCode
  lgdVillage: string;     // LGD_VillageCode
  villageName?: string;   // display name from e-Chawadi GeoJSON
  ulpin: string;
  label: string;
  geometry: GeoJSON.Polygon; // [lon,lat] rings, EPSG:4326
}

export type CadastralStatus = "ok" | "empty" | "too-large" | "error";

export interface CadastralResult {
  status: CadastralStatus;
  parcels: CadastralParcel[];
  count: number;
  parcelCount: number;    // Category === "Parcel" (excludes roads)
  truncated: boolean;     // hit the 1000-record transfer limit
  reason?: string;
  attribution: string;
  licensing: string;
  elapsedMs: number;
}

export interface BBox { minLon: number; minLat: number; maxLon: number; maxLat: number }

/** A stable identity key for a parcel — survey number + its first vertex (survey numbers repeat
 *  across villages; roads have none). Used to highlight the CLICKED parcel across restyles. */
export function parcelKey(surveyNumber: string, geometry: GeoJSON.Polygon): string {
  const c = geometry.coordinates?.[0]?.[0];
  return c ? `${surveyNumber}@${c[0].toFixed(6)},${c[1].toFixed(6)}` : surveyNumber;
}

/** Approx planar area (m²) of a parcel's outer ring via an equirectangular projection at its own
 *  latitude (cosLat matters at Bengaluru's ~12–13°N). Drives the FAR plot-area for a clicked parcel. */
export function parcelAreaSqm(geometry: GeoJSON.Polygon): number {
  const ring = geometry.coordinates?.[0];
  if (!ring || ring.length < 3) return 0;
  const latMean = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((latMean * Math.PI) / 180);
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0] * mPerDegLon, yi = ring[i][1] * mPerDegLat;
    const xj = ring[j][0] * mPerDegLon, yj = ring[j][1] * mPerDegLat;
    a += xj * yi - xi * yj;
  }
  return Math.abs(a) / 2;
}

/** bbox of a drawn boundary (positions are [lat,lng]). */
export function bboxOfLatLng(positions: [number, number][]): BBox {
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
  for (const [lat, lon] of positions) {
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
  }
  return { minLon, minLat, maxLon, maxLat };
}

function toParcel(f: { attributes?: Record<string, unknown>; geometry?: { rings?: number[][][] } }): CadastralParcel | null {
  const rings = f.geometry?.rings;
  if (!rings || rings.length === 0) return null;
  const a = f.attributes ?? {};
  const survey = String(a.surveynumberi ?? "").trim();
  return {
    surveyNumber: survey,
    hasSurvey: survey !== "" && survey !== "0",
    category: String(a.Category ?? ""),
    kharab: String(a.Kharab ?? ""),
    villageCode: String(a.KGISVillageCode ?? ""),
    lgdVillage: String(a.LGD_VillageCode ?? ""),
    ulpin: String(a.ULPIN ?? ""),
    label: String(a.Label ?? ""),
    // esri rings are [x=lon, y=lat] in 4326 — already GeoJSON [lon,lat]. Leaflet renders esri winding fine.
    geometry: { type: "Polygon", coordinates: rings as GeoJSON.Position[][] },
  };
}

const base = (status: CadastralStatus, reason?: string): CadastralResult => ({
  status, parcels: [], count: 0, parcelCount: 0, truncated: false, reason,
  attribution: KGIS_ATTRIBUTION, licensing: KGIS_LICENSING, elapsedMs: 0,
});

/** Query KGIS L5 for parcels intersecting `bbox`. Never throws; never fabricates geometry — an
 *  unreachable / slow / oversized KGIS yields an explicit non-`ok` status the UI renders honestly. */
export async function fetchCadastralParcels(bbox: BBox, signal?: AbortSignal): Promise<CadastralResult> {
  if (bbox.maxLon - bbox.minLon > MAX_SPAN_DEG || bbox.maxLat - bbox.minLat > MAX_SPAN_DEG) {
    return base("too-large", "Drawn area too large — draw a smaller site / zoom in (KGIS caps at 1000 parcels).");
  }
  const params = new URLSearchParams({
    where: "1=1",
    geometry: `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`,
    geometryType: "esriGeometryEnvelope", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "surveynumberi,KGISVillageCode,LGD_VillageCode,Category,Kharab,ULPIN,Label",
    returnGeometry: "true", outSR: "4326", resultRecordCount: String(RECORD_CAP), f: "json",
  });
  const t0 = performance.now();
  try {
    const res = await fetch(`${KGIS_L5_QUERY}?${params.toString()}`, { signal });
    if (!res.ok) return { ...base("error", `KGIS returned HTTP ${res.status} — parcels unavailable.`), elapsedMs: performance.now() - t0 };
    const j = await res.json();
    if (j.error) return { ...base("error", `KGIS query error: ${j.error?.message ?? "unknown"}`), elapsedMs: performance.now() - t0 };
    const parcels = (j.features ?? []).map(toParcel).filter((p: CadastralParcel | null): p is CadastralParcel => p !== null);
    const parcelCount = parcels.filter((p: CadastralParcel) => p.category === "Parcel").length;
    return {
      status: parcels.length ? "ok" : "empty",
      parcels, count: parcels.length, parcelCount,
      truncated: Boolean(j.exceededTransferLimit),
      reason: parcels.length
        ? undefined
        : "No KGIS REVENUE-survey parcels here. KGIS Cadastral (Layer 5) covers rural + peri-urban " +
          "revenue land; dense urban / city-survey / cantonment plots are largely NOT digitized in it. " +
          "This is a KGIS coverage gap — NOT proof there are no plots. (Urban parcels live in BBMP " +
          "e-Aasthi / city-survey / UPOR, which are portal-gated, not public here. Outside Karnataka, " +
          "KGIS has no coverage at all.)",
      attribution: KGIS_ATTRIBUTION, licensing: KGIS_LICENSING, elapsedMs: performance.now() - t0,
    };
  } catch (e) {
    if (signal?.aborted) return { ...base("error", "cancelled"), elapsedMs: performance.now() - t0 };
    return { ...base("error", e instanceof Error ? `KGIS unreachable: ${e.message}` : "KGIS unreachable — parcels unavailable."), elapsedMs: performance.now() - t0 };
  }
}
