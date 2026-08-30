// Copyright (c) 2026 Qnit. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Proprietary
//
// SLICE 1 — the ONE place the Builder-feasibility signals are fetched, mapped to panels, AND
// assembled into the /report/go-no-go verdict bundle. Extracted from the results page so the map
// workspace (parcel-click JOIN) and the results surface share IDENTICAL honesty logic — an unresolved
// signal is scored unresolved in exactly one place, never diverging between two hand-copies.

import {
  getOverlays, getConnectivity, getUtilities, getTerrain, getPriceUpside, getObligations,
  resolveZone, getRing, assembleFar, farInputFromZone, getGrowthAnalysis,
  overlaysQualitative, connectivityQualitative, utilitiesQualitative, terrainQualitative,
  priceUpsideQualitative, farAssemblyQualitative, obligationsQualitative, zoneConfirmationView,
} from "@/lib/api/analysis";
import type { ModuleId, ModuleResult, QualitativeStat, LadderConfidence } from "@/lib/stores/analysis";
import { getGoNoGo, type ReportResponse } from "@/lib/api/report";

// The analysis subject. `polygon` ([lat,lon] ring) drives terrain; `area` drives FAR/obligations.
export interface ParcelInput {
  lat: number;
  lon: number;
  polygon: [number, number][] | null;
  area: number;
  label: string;
  survey?: string | null;
}

export interface BuilderSignals {
  panels: Partial<Record<ModuleId, ModuleResult>>;
  bundle: Record<string, unknown>;
  verdict: ReportResponse | null;
  verdictError: string | null;
}

// ── panel result builders (moved verbatim from results/page.tsx) ────────────────
function mr(qualitative: QualitativeStat[], confidence: LadderConfidence, data_source: string, summary: string): ModuleResult {
  const severity = qualitative.some((s) => s.tone === "bad") ? "high" : qualitative.some((s) => s.tone === "warn") ? "moderate" : "low";
  return { score: 0, severity, summary, indicators: [], chart_data: [], qualitative, confidence, data_source, loading: false, error: null };
}
export const LOADING_PANEL: ModuleResult = { score: 0, severity: "none", summary: "", indicators: [], chart_data: [], loading: true, error: null };
const errModule = (e: unknown): ModuleResult => ({ score: 0, severity: "none", summary: "", indicators: [], chart_data: [], loading: false, error: e instanceof Error ? e.message : "Failed — service unreachable or flag off" });

// The builder-signal panel ids this helper resolves (for callers that want to pre-set LOADING).
export const BUILDER_SIGNAL_IDS: ModuleId[] = [
  "zoneRing", "farAssembly", "obligations", "overlays", "terrain", "connectivitySignal", "utilities", "priceUpside", "growth",
];

/** Fetch every builder signal ONCE, map each to its panel, collect the /report/go-no-go bundle, and
 *  request the verdict. Never throws — a down service becomes an honest panel error / unresolved
 *  tier; a down report service becomes `verdictError` (NEVER a fabricated GO). */
export async function runBuilderSignals(parcel: ParcelInput): Promise<BuilderSignals> {
  const { lat, lon } = parcel;
  const panels: Partial<Record<ModuleId, ModuleResult>> = {};
  const bundle: Record<string, unknown> = {};

  const [z, ring] = await Promise.all([
    resolveZone({ lat, lon, include_osm_hint: true }).catch(() => null),
    getRing(lat, lon).catch(() => null),
  ]);
  if (z) {
    bundle.zone = z;
    const view = zoneConfirmationView(z);
    const stats: QualitativeStat[] = [{ label: `Zone — ${view.badge}`, value: view.headline, tone: view.tone }];
    if (z.next_action) stats.push({ label: "☑ Confirm your zone", value: z.next_action, tone: "warn" });
    if (ring?.status === "resolved") stats.push({ label: `Ring ${ring.ring} (TDR ${ring.tdr_zone})`, value: `${ring.reg_basis} — ${ring.confidence}.`, tone: "neutral" });
    panels.zoneRing = mr(stats, z.confidence, z.data_source ?? "geo /geo/zone-resolve", view.headline);
  } else { panels.zoneRing = errModule("zone resolver unreachable"); }

  const far = z ? await assembleFar({ ...farInputFromZone(z, ring), plot_area_sqm: parcel.area }).catch(() => null) : null;
  if (far) {
    bundle.far = far;
    const conf: LadderConfidence = far.status === "unresolved" ? "unresolved" : (far.permissible_far?.confidence ?? "inferred");
    panels.farAssembly = mr(farAssemblyQualitative(far), conf, "planning /planning/far", far.status === "unresolved" ? (far.reason ?? "FAR unresolved") : `Permissible ${far.permissible_far?.value ?? "—"} · ${far.achievable_matrix ? "achievable = band-edge (survey)" : `achievable ${(far.achievable_with_entitlements ?? far.achievable_base)?.value ?? "—"}`}`);
  } else { panels.farAssembly = errModule("FAR needs a resolved zone / planning service"); }

  const oblig = z ? await getObligations({ zone: z.zone ?? undefined, sub_zone: z.sub_zone ?? undefined, plot_area_sqm: parcel.area, use_type: "residential_multi_dwelling", achievable_far: far?.achievable_with_entitlements?.value ?? far?.achievable_base?.value ?? undefined }).catch(() => null) : null;
  if (oblig) panels.obligations = mr(obligationsQualitative(oblig), (oblig.parking?.confidence as LadderConfidence) ?? "inferred", oblig.data_source, `${oblig.computed_count} computed, ${oblig.checklist_count} to confirm`);
  else panels.obligations = errModule("obligations need a zone / planning service");

  const overlays = await getOverlays(lat, lon).catch(() => null);
  if (overlays) {
    bundle.overlays = overlays;
    const conf: LadderConfidence = overlays.verdict.blocks_clean_go && !overlays.verdict.hard_no_go ? "unresolved" : "authoritative";
    panels.overlays = mr(overlaysQualitative(overlays), conf, "geo /geo/overlays", overlays.verdict.hard_no_go ? `NO-GO — RED: ${overlays.verdict.red_overlays.join(", ")}` : overlays.verdict.blocks_clean_go ? `Blocks clean GO — unresolved: ${overlays.verdict.unresolved_overlays.join(", ")}` : "All overlays clear");
  } else { panels.overlays = errModule("overlay engine unreachable"); }

  const terr = parcel.polygon ? await getTerrain({ parcel_geojson: { type: "Polygon", coordinates: [[...parcel.polygon.map(([la, lo]) => [lo, la]), [parcel.polygon[0][1], parcel.polygon[0][0]]]] } }).catch(() => null) : null;
  if (terr) { bundle.terrain = terr; panels.terrain = mr(terrainQualitative(terr), terr.status === "unresolved" ? "unresolved" : (terr.slope.confidence as LadderConfidence), terr.dem_source, terr.status === "unresolved" ? "Terrain unresolved (no DEM/GEE)" : "Slope / HAND / cut-fill"); }
  else panels.terrain = mr([{ label: "⚠ Terrain — draw the parcel", value: "Draw the parcel boundary (or run with GEE) to resolve slope / HAND / cut-fill. NOT assumed flat.", tone: "warn" }], "unresolved", "flood /flood/terrain", "Terrain unresolved");

  const conn = await getConnectivity(lat, lon).catch(() => null);
  if (conn) { bundle.connectivity = conn.connectivity_signal; const sig = conn.connectivity_signal; panels.connectivitySignal = mr(connectivityQualitative(conn), sig.confidence, conn.data_source, sig.status === "unresolved" ? `UNRESOLVED — confirm ${sig.unknowns.map((u) => u.name).join(", ")}` : `${sig.status} · ${sig.resolved_score}/100`); }
  else panels.connectivitySignal = errModule("connectivity service unreachable");

  const util = await getUtilities(lat, lon).catch(() => null);
  if (util) { bundle.infra_readiness = util.infra_readiness; const rd = util.infra_readiness; panels.utilities = mr(utilitiesQualitative(util), rd.confidence, util.data_source, rd.status === "unresolved" ? "UNRESOLVED — confirm water main" : `readiness ${rd.status}`); }
  else panels.utilities = errModule("utilities service unreachable");

  const price = await getPriceUpside(lat, lon, null).catch(() => null);
  if (price) { bundle.price = price; const conf: LadderConfidence = price.status === "unresolved" ? "unresolved" : (price.upside?.confidence ?? "inferred"); panels.priceUpside = mr(priceUpsideQualitative(price), conf, "future-infra /price-upside", price.status === "unresolved" ? "Provide guidance value for upside" : `₹${price.upside?.low}–₹${price.upside?.high}/sqm`); }
  else panels.priceUpside = errModule("price service unreachable");

  try { const g = await getGrowthAnalysis(lat, lon); panels.growth = g; } catch (e) { panels.growth = errModule(e); }

  // ── the verdict — from the LIVE bundle; an unreachable report service is an honest error ──
  let verdict: ReportResponse | null = null;
  let verdictError: string | null = null;
  try {
    verdict = await getGoNoGo({ lat, lon, survey_number: parcel.survey ?? null, label: parcel.label }, bundle);
  } catch (e) {
    verdictError = e instanceof Error ? e.message : "report service unreachable";
  }

  return { panels, bundle, verdict, verdictError };
}
