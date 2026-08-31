// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
//
// e-Chawadi (Bhoomi) land records API — distinct from cadastral.ts (which wraps the KGIS live API).
//
// This service (port 8011) holds scraped Karnataka Bhoomi data: parcel geometries, RCCMS court
// cases, mutation (transfer) records, and infrastructure overlays. It is the primary source for
// land records; KGIS is used as fallback for areas without e-Chawadi coverage.
//
// Conflict resolution: when both KGIS and e-Chawadi have data for a parcel, e-Chawadi is
// preferred (official Bhoomi source). Link via survey number + LGD village code.

import { getSession } from "next-auth/react";

const BASE = process.env.NEXT_PUBLIC_CADASTRAL_API_URL ?? "https://api.builder.qnit.site/cadastral";

const TIMEOUT_MS = 20_000;

async function getToken(): Promise<string | null> {
  for (let i = 0; i < 8; i++) {
    const session = await getSession();
    if (session?.accessToken) return session.accessToken as string;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const token = await getToken();
  const authHeader: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { ...authHeader },
      signal: signal ?? ctrl.signal,
    });
    if (!res.ok) {
      const detail = await res.json().then((b) => b?.detail ?? `HTTP ${res.status}`).catch(() => `HTTP ${res.status}`);
      throw new Error(String(detail));
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Cadastral service timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SurveySearchResult {
  survey_no:    string;  // raw Bhoomi format e.g. "309/*/*"
  village_name: string;
  dist:  string;
  taluk: string;
  hobli: string;
  vlg:   string;
}

export interface RCCMSCase {
  ack_no:         string;
  case_id:        string;
  applicant_name: string;
  survey_no:      string;
  case_status:    string;
}

export interface MutationRecord {
  tran_no:          string;
  mr_number:        string;
  applicant:        string;
  transaction_type: string;
  survey_numbers:   string;  // comma-separated
  status:           string;
  acquisition_type: string;
}

export interface VillageInfo {
  village_name:    string;
  lgd_code:        string | null;
  has_parcel_data: boolean;
}

export interface VillageByLgd {
  lgd_code:      string;
  village_name?: string;
  hobli_name?:   string;
  taluk_name?:   string;
  district_name?: string;
  covered:       boolean;
}

export interface EchawadiRecords {
  rccms:     RCCMSCase[];
  mutations: MutationRecord[];
  villageInfo: VillageInfo | null;
  /** Survey match from the index search (populated when we looked up by survey number) */
  match: SurveySearchResult | null;
}

export interface EncroachmentFeature {
  survey_no:      string;
  village_name:   string;
  lgd_code:       string;
  bbmp_notified:  boolean;
  revenue_flagged: boolean;
  near_drain:     boolean;
  near_lake:      boolean;
}

// ─── Survey search ───────────────────────────────────────────────────────────

export async function searchBySurveyNo(
  surveyNo: string,
  signal?: AbortSignal,
): Promise<SurveySearchResult[]> {
  const q = surveyNo.split("/")[0].trim();
  if (q.length < 2) return [];
  try {
    return await get<SurveySearchResult[]>(`/search?q=${encodeURIComponent(q)}`, signal);
  } catch {
    return [];
  }
}

/** Resolve an LGD code (from KGIS parcel LGD_VillageCode) to e-Chawadi hierarchy codes. */
export async function resolveByLgd(
  lgdCode: string,
  signal?: AbortSignal,
): Promise<VillageByLgd | null> {
  try {
    return await get<VillageByLgd>(`/village-by-lgd?lgd=${encodeURIComponent(lgdCode)}`, signal);
  } catch {
    return null;
  }
}

// ─── Land records ─────────────────────────────────────────────────────────────

export async function fetchRccms(
  dist: string, taluk: string, hobli: string, vlg: string,
  signal?: AbortSignal,
): Promise<RCCMSCase[]> {
  try {
    return await get<RCCMSCase[]>(
      `/rccms?dist=${dist}&taluk=${taluk}&hobli=${hobli}&vlg=${vlg}`, signal,
    );
  } catch {
    return [];
  }
}

export async function fetchMutations(
  dist: string, taluk: string, hobli: string, vlg: string,
  signal?: AbortSignal,
): Promise<MutationRecord[]> {
  try {
    return await get<MutationRecord[]>(
      `/mutations?dist=${dist}&taluk=${taluk}&hobli=${hobli}&vlg=${vlg}`, signal,
    );
  } catch {
    return [];
  }
}

export async function fetchVillageInfo(
  dist: string, taluk: string, hobli: string, vlg: string,
  signal?: AbortSignal,
): Promise<VillageInfo | null> {
  try {
    return await get<VillageInfo>(
      `/village-info?dist=${dist}&taluk=${taluk}&hobli=${hobli}&vlg=${vlg}`, signal,
    );
  } catch {
    return null;
  }
}

/**
 * Fetch all land records for a parcel identified by survey number + LGD village code.
 *
 * Two lookup paths:
 * 1. Primary (e-Chawadi covered): search survey_no → match by lgdCode → fetch RCCMS + mutations.
 * 2. Fallback (KGIS area): lgdCode → /village-by-lgd → derive hierarchy → fetch records.
 *
 * Returns null if the service is unreachable or the parcel has no e-Chawadi coverage.
 */
export async function fetchEchawadiRecords(
  surveyNo: string,
  lgdCode: string,
  signal?: AbortSignal,
): Promise<EchawadiRecords | null> {
  // Try survey number search first (fastest path)
  const results = await searchBySurveyNo(surveyNo, signal);

  // Match by LGD code to disambiguate survey numbers that repeat across villages
  let match: SurveySearchResult | null = null;
  if (results.length > 0 && lgdCode) {
    // Resolve LGD → dist/taluk/hobli to find the right match
    const lgdInfo = await resolveByLgd(lgdCode, signal);
    if (lgdInfo && lgdInfo.covered) {
      // Find the search result whose village context matches the resolved LGD hierarchy
      // We match by village_name as a heuristic since /search doesn't return lgd_code directly
      match = results[0]; // best match — first result ordered by numeric survey_no
      if (lgdInfo.village_name) {
        const named = results.find(
          (r) => r.village_name?.toLowerCase() === lgdInfo.village_name?.toLowerCase(),
        );
        if (named) match = named;
      }
    }
  } else if (results.length > 0) {
    match = results[0];
  }

  if (!match) {
    // Fallback: try resolving via LGD code alone
    const lgdInfo = await resolveByLgd(lgdCode, signal);
    if (!lgdInfo?.covered) return null;
    // Without hierarchy from search, we can't fetch RCCMS/mutations (need dist/taluk/hobli/vlg)
    return { rccms: [], mutations: [], villageInfo: null, match: null };
  }

  const { dist, taluk, hobli, vlg } = match;
  const [rccms, mutations, villageInfo] = await Promise.all([
    fetchRccms(dist, taluk, hobli, vlg, signal),
    fetchMutations(dist, taluk, hobli, vlg, signal),
    fetchVillageInfo(dist, taluk, hobli, vlg, signal),
  ]);

  return { rccms, mutations, villageInfo, match };
}

// ─── Overlay fetchers ─────────────────────────────────────────────────────────

export async function fetchRoadWidth(
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  const b = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  try {
    return await get<GeoJSON.FeatureCollection>(`/road-width?bbox=${b}`, signal);
  } catch {
    return null;
  }
}

/** Returns null if not yet built (404) or service is down. Never throws. */
export async function fetchEncroachment(
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  const b = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  try {
    return await get<GeoJSON.FeatureCollection>(`/encroachment?bbox=${b}`, signal);
  } catch {
    return null;
  }
}

export async function fetchBwssbSewerage(
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  tier?: "300+" | "150-300" | "<150",
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  const b = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  const t = tier ? `&tier=${encodeURIComponent(tier)}` : "";
  try {
    return await get<GeoJSON.FeatureCollection>(`/bwssb-sewerage?bbox=${b}${t}`, signal);
  } catch {
    return null;
  }
}

export async function fetchOsmPowerlines(
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  const b = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  try {
    return await get<GeoJSON.FeatureCollection>(`/osm-powerlines?bbox=${b}`, signal);
  } catch {
    return null;
  }
}

export async function fetchBescomBoundaries(
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  try {
    return await get<GeoJSON.FeatureCollection>(`/bescom-boundaries`, signal);
  } catch {
    return null;
  }
}

export async function fetchGasPipelines(
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  const b = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  try {
    return await get<GeoJSON.FeatureCollection>(`/gas-pipelines?bbox=${b}`, signal);
  } catch {
    return null;
  }
}

export async function fetchDrainage(
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  const b = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  try {
    return await get<GeoJSON.FeatureCollection>(`/drainage?bbox=${b}`, signal);
  } catch {
    return null;
  }
}

export async function fetchWrisLakes(
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  const b = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  try {
    return await get<GeoJSON.FeatureCollection>(`/wris-lakes?bbox=${b}`, signal);
  } catch {
    return null;
  }
}

// ─── Cadastral explorer (dropdown cascade) ────────────────────────────────────

export interface HierarchyItem { code: string; name: string; }

export async function fetchDistricts(signal?: AbortSignal): Promise<HierarchyItem[]> {
  try { return await get<HierarchyItem[]>("/districts", signal); } catch { return []; }
}
export async function fetchTaluks(dist: string, signal?: AbortSignal): Promise<HierarchyItem[]> {
  try { return await get<HierarchyItem[]>(`/taluks?dist=${dist}`, signal); } catch { return []; }
}
export async function fetchHoblis(dist: string, taluk: string, signal?: AbortSignal): Promise<HierarchyItem[]> {
  try { return await get<HierarchyItem[]>(`/hoblis?dist=${dist}&taluk=${taluk}`, signal); } catch { return []; }
}
export async function fetchVillages(dist: string, taluk: string, hobli: string, signal?: AbortSignal): Promise<HierarchyItem[]> {
  try { return await get<HierarchyItem[]>(`/villages?dist=${dist}&taluk=${taluk}&hobli=${hobli}`, signal); } catch { return []; }
}
export async function fetchParcelData(
  dist: string, taluk: string, hobli: string, vlg: string,
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  try {
    return await get<GeoJSON.FeatureCollection>(
      `/data?dist=${dist}&taluk=${taluk}&hobli=${hobli}&vlg=${vlg}`, signal,
    );
  } catch { return null; }
}
export async function fetchHydroRivers(
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  const b = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  try { return await get<GeoJSON.FeatureCollection>(`/hydrorivers?bbox=${b}`, signal); } catch { return null; }
}
export async function fetchBbmpSwd(
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  const b = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  try { return await get<GeoJSON.FeatureCollection>(`/bbmp-swd?bbox=${b}`, signal); } catch { return null; }
}
export async function fetchCgdZones(signal?: AbortSignal): Promise<GeoJSON.FeatureCollection | null> {
  try { return await get<GeoJSON.FeatureCollection>("/cgd-zones", signal); } catch { return null; }
}

/** e-Chawadi parcel polygons for all covered villages intersecting bbox.
 *  Features carry survey_no, village_name, village_code (lgd), dist, taluk, hobli, vlg.
 *  First call is slow (loads 418 MB lgd_villages index). Returns null on error. */
export async function fetchParcelsByBbox(
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection | null> {
  const b = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  try {
    return await get<GeoJSON.FeatureCollection>(`/parcels-by-bbox?bbox=${b}`, signal);
  } catch {
    return null;
  }
}
