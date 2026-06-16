// Provenance + confidence model for the zoning module.
//
// Every datum the zoning analysis surfaces is mapped to: where it came from,
// how old it is, how accurate it is (spatial + thematic), a confidence tier,
// and an official "verify here" deep-link. An overall Data-Confidence score is
// derived from the tier coverage — surfaced SEPARATELY from the suitability
// score so a high score on weak data reads as "promising but unverified".

import type { ZoningData } from "@/lib/stores/analysis";

export type ConfidenceTier = "authoritative" | "official" | "modelled" | "community";

export interface ProvenanceRow {
  key: string;
  label: string;
  value: string;
  source: string;
  vintage: string;
  spatialAccuracy: string;
  thematicAccuracy: string;
  tier: ConfidenceTier;
  verifyLabel: string;
  verifyUrl: string;
}

// Tier → weight for the aggregate Data-Confidence score (0..1).
const TIER_WEIGHT: Record<ConfidenceTier, number> = {
  authoritative: 1.0,
  official: 0.7,
  modelled: 0.5,
  community: 0.3,
};

export const TIER_LABEL: Record<ConfidenceTier, string> = {
  authoritative: "Authoritative",
  official: "Official doc",
  modelled: "Modelled",
  community: "Community",
};

// ── Official "verify here" deep-link builders ────────────────────────────────
const LINKS = {
  rmp2015: () => "https://data.opencity.in/dataset/bda-revised-master-plan-2015",
  nocas: () => "https://nocas2.aai.aero/nocas/MapPage.html",
  bhoomiRtc: () => "https://landrecords.karnataka.gov.in/",
  dishaank: () => "https://dishaank.karnataka.gov.in/",
  bhuvan: () => "https://bhuvan.nrsc.gov.in/",
  swd: () => "https://data.opencity.in/dataset/bengaluru-stormwater-drains-maps",
  forestAtlas: () => "https://fsi.nic.in/forest-atlas",
  bmrcl: () => "https://english.bmrc.co.in/",
  // satellite view at the site for a visual "survey" sanity check
  sat: (lat: number, lon: number) => `https://www.google.com/maps/@${lat},${lon},18z/data=!3m1!1e3`,
};

export function buildProvenance(z: ZoningData): { rows: ProvenanceRow[]; dataConfidence: number } {
  const lulcStale = z.lulcVintage != null; // SISDP 2016-19 → authoritative source but old
  const roadCommunity = z.roadWidthSource !== "user_input";

  const rows: ProvenanceRow[] = [
    {
      key: "zone",
      label: "Zone / land use",
      value: z.zoneClass,
      source: "OpenStreetMap (Overpass)",
      vintage: "Live (uneven currency)",
      spatialAccuracy: "±2–8 m urban",
      thematicAccuracy: "Crowd-sourced — no formal %",
      tier: "community",
      verifyLabel: "BDA RMP 2015 land-use",
      verifyUrl: LINKS.rmp2015(),
    },
    {
      key: "lulc",
      label: "Land cover (NA/forest basis)",
      value: z.lulcClass ?? "Unavailable",
      source: "ISRO NRSC Bhuvan (SISDP Phase-2)",
      vintage: z.lulcVintage ?? "—",
      spatialAccuracy: "~5.8 m (1:10K)",
      thematicAccuracy: "~85–90% Level-I",
      tier: lulcStale ? "official" : "community",
      verifyLabel: "Bhoomi RTC / Bhuvan",
      verifyUrl: z.naRequired || z.forestRequired ? LINKS.bhoomiRtc() : LINKS.bhuvan(),
    },
    {
      key: "far",
      label: "FAR / setbacks / height",
      value: `FAR ${z.farApplicable} · ${z.maxHeightM} m`,
      source: "NBC 2016 Table 15 + BDA RMP",
      vintage: "2016 / 2015 notifications",
      spatialAccuracy: "N/A (rule)",
      thematicAccuracy: "Correct but generic (road bracket)",
      tier: "official",
      verifyLabel: "BDA RMP 2015 regulations",
      verifyUrl: LINKS.rmp2015(),
    },
    {
      key: "road",
      label: "Road width (FAR driver)",
      value: z.roadWidthSource === "default_9m" ? "Estimated 9 m" : `${z.roadWidthM.toFixed(1)} m`,
      source: z.roadWidthSource === "default_9m" ? "Default (OSM tag absent)" : "OpenStreetMap",
      vintage: "Live",
      spatialAccuracy: roadCommunity ? "±2–8 m" : "User input",
      thematicAccuracy: "Tag present ~30–40% of roads",
      tier: z.roadWidthSource === "default_9m" ? "modelled" : "community",
      verifyLabel: "Site measurement",
      verifyUrl: LINKS.sat(z.siteLat, z.siteLon),
    },
    {
      key: "airport",
      label: "Airport / DGCA height",
      value: `${z.airportName} · ${z.airportDistanceKm.toFixed(1)} km`,
      source: "AAI airport coords + ICAO Annex 14 model",
      vintage: "Static model",
      spatialAccuracy: "Coords ±tens of m; OLS band coarse",
      thematicAccuracy: "OLS approximated (ignores runway geometry)",
      tier: "modelled",
      verifyLabel: "AAI NOCAS (exact PTE)",
      verifyUrl: LINKS.nocas(),
    },
    {
      key: "metro",
      label: "Metro / TOD",
      value: z.metroName ? `${z.metroName} · ${Math.round(z.metroDistanceM ?? 0)} m` : "None within 600 m",
      source: "OpenStreetMap (railway=station)",
      vintage: "Live",
      spatialAccuracy: "±2–8 m",
      thematicAccuracy: "Stations well-mapped; suburban rail patchy",
      tier: "community",
      verifyLabel: "BMRCL",
      verifyUrl: LINKS.bmrcl(),
    },
  ];

  // Authoritative location context from KGIS (flag-gated) — high-confidence add.
  if (z.kgis) {
    const k = z.kgis;
    const isRural = k.type === "Rural";
    const value = isRural
      ? `${k.village ?? "—"}, ${k.taluk ?? "—"}${k.surveyNumber ? ` · Survey ${k.surveyNumber}` : ""}`
      : `${k.ward ?? "—"} · BBMP ${k.adminZone ?? "—"} (admin zone)`;
    rows.push({
      key: "kgis",
      label: "Location (authoritative)",
      value,
      source: "Karnataka State GIS (KGIS)",
      vintage: "Current",
      spatialAccuracy: "Official admin boundaries",
      thematicAccuracy: isRural ? "Survey number → Bhoomi RTC" : "Admin ward/zone (not land-use)",
      tier: "authoritative",
      verifyLabel: isRural ? "Bhoomi RTC" : "Dishaank parcel",
      verifyUrl: isRural ? LINKS.bhoomiRtc() : LINKS.dishaank(),
    });
  }

  // Data-Confidence = mean tier weight across rows, 0..100.
  const dataConfidence = Math.round(
    (rows.reduce((s, r) => s + TIER_WEIGHT[r.tier], 0) / rows.length) * 100,
  );

  return { rows, dataConfidence };
}
