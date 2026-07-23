# Contract Changelog

## 2.21.0 — 2026-07-24

### Changed — infrastructure.yaml (v1.1.0 → v1.2.0) + planning.yaml (v1.3.0 → v1.4.0), US-086 connectivity consolidation
- **`POST /infrastructure/connectivity`** (`ConnectivityResult`) — infrastructure is now the single
  connectivity owner. Airport distance is STRAIGHT-LINE in EPSG:32643 from the bundled AAI ARP;
  metro/rail/highway resolve only from real sources and return `unresolved` when the source is not
  fetchable (never a fabricated distance); every distance is labelled straight-line vs network.
  Access-road width comes from the planning `road_width_resolver` (reused, not reimplemented).
  Emits `connectivity_signal` + access flags (narrow-approach, no-metro-within-5km, highway-adjacent)
  for the US-092 GO/NO-GO engine. Gated by the existing `feature.infrastructure.connectivity`.
- **planning `AirportRestriction` — height-cap only** — `distance_km`, `lat`, `lon` REMOVED (and
  dropped from `required`). Planning keeps the ICAO/OLS surface + max-height for the envelope; the
  airport DISTANCE reporting moved to `/infrastructure/connectivity`. Breaking for consumers reading
  `distance_km` from planning — read it from connectivity instead.

## 2.20.0 — 2026-07-23

### Added — infrastructure.yaml (v1.0.0 → v1.1.0) + geo.yaml (v1.8.0 → v1.9.0), US-087 utilities + overlay reclassification
- **`POST /infrastructure/utilities`** (`UtilitiesResult`) — water/telecom AVAILABILITY as an
  inferred OSM proximity proxy (never a connection claim); BWSSB water/sewer trunk-main presence at
  AUTHORITATIVE confidence ONLY (official BWSSB/KGIS mains layer), otherwise `unknown` + "verify
  with BWSSB" (OSM cannot assert a main exists); a structured NOC checklist (BWSSB, BESCOM/CEA-2010
  ROW, KSPCB CTE 15 yr / CTO, Fire per RMP reg 3.12 for ≥24 m, AAI NOCAS, PNGRB gas, telecom RoW),
  each with authority + rule citation + typical validity + deep link; and an `infra_readiness`
  signal (water known/unknown, telecom score, noc_pending, overall) for the US-092 GO/NO-GO engine.
  Gated by the new flag `feature.infrastructure.utilities` (default-off).
- **Overlay RECLASSIFICATION** (`OverlayResult.noc_checklist` + `OverlayNocChecklistItem`) —
  overlays are now split into SCORED (data exists or could exist; absence → `unresolved` → BLOCKS a
  clean GO — rajakaluve, lakes, wetland, ramsar, forest, ESZ, airport-OLS, flood) vs NOC CHECKLIST
  (no obtainable public geometry BY NATURE — **gas** [no public alignment dataset] and
  **HT-distribution feeders** [BESCOM geometry non-public]). Checklist items are surfaced with their
  rule citation + a `reclass_reason` (WHY unobtainable), are NOT scored R/A/G, and do NOT affect the
  verdict. `verdict.blocks_clean_go` now reflects ONLY scored overlays, so a clean parcel with the
  flood layer present can return `blocks_clean_go=false`. A SEAM is kept: if HT-transmission geometry
  is ever bundled (VEDAS/OSM), it flips back to a scored overlay. Additive — no field removed.

## 2.19.0 — 2026-07-23

### Added — flood.yaml (v1.7.0 → v1.8.0), US-089 terrain + NDEM flood overlay
- **`POST /flood/terrain`** (`TerrainResult`) — slope % / HAND / cut-fill from a Copernicus GLO-30
  DEM window over the parcel polygon (reprojected to EPSG:32643 — metric CRS, never degree-spaced),
  plus a MANUAL geotech bearing-capacity tier. NODATA is masked; a window >20% nodata returns
  `unresolved`, never a phantom 0.0. Cut and fill are reported SEPARATELY. Bearing capacity is
  authoritative only when a geotechnical value is supplied — never inferred from soil type
  (SoilGrids). FABDEM (non-commercial) is not used. Gated by the new flag `feature.flood.terrain`
  (default-off).
- **`ElevationAnalysis.slope_degrees` bug fix** — was a hardcoded `0.0` that read as "flat" (a
  silent false-negative); now `nullable` (+ `slope_note`) — null at a single point, with slope
  deferred to `/flood/terrain`. Removed from the `required` list.
- **NDEM flood overlay LIVE** (geo `/geo/overlays`, no contract change) — `scripts/prep_overlay_layers.py`
  now slices the NDEM 1998-2022 inundation layer to `flood_inundation_ka.geojson`. A parcel
  intersecting an observed polygon is RED; ABSENCE is AMBER (not GREEN) — "no observed inundation
  in the 1998-2022 record" is weaker than "clear". A missing layer file stays `unresolved`
  (cardinal rule). This clears flood from `blocks_clean_go` when the layer is present; HT-line + gas
  remain unresolved, so `blocks_clean_go` stays true.

## 2.18.0 — 2026-07-23

### Added — geo.yaml (v1.7.0 → v1.8.0), US-082 ring classification + tiered zone resolver
- **`GET /geo/ring`** (`RingResult`) — RMP-2015 planning ring I/II/III (= TDR Zones A/B/C) by
  point-in-polygon against OSM-derived Core/Outer Ring Road + a municipal-boundary LPA proxy
  (EPSG:32643). Confidence is ALWAYS `inferred` (OSM-derived, never authoritative). A point beyond
  the LPA proxy, or one whose deciding polygon could not be closed reliably at prep time, is
  `unresolved` — NEVER defaulted to Ring III and never approximated with a circle. Feeds
  Additional-FAR by ring (reg 3.4.v). Karnataka-only (lat/lon swap + bounds → 422).
- **`GET /geo/zone-resolve`** (`ZoneResolution`) — tiered zone resolver: RMP seam (authoritative) >
  user-confirmed (authoritative-on-attestation, tagged `source="user-confirmed"`, kept VISIBLY
  DISTINCT from an RMP read) > OSM/Bhuvan (inferred HINT with an "unverified — confirm before
  relying" note) > unresolved. `far_zone_confidence` propagates the ceiling into the FAR assembly
  so an inferred zone can never mint an authoritative FAR (the US-088 P0 contract). An absent
  sub_zone stays `unresolved` — never defaulted to Main.
- Both gated by the new flag **`feature.geo.zone-resolver`** (default-off). Ring geometry is
  produced dev-time by `scripts/prep_ring_polygons.py` (OSM Overpass); the runtime is GeoJSON-only
  and returns `unresolved` when the polygons are not bundled. Additive — no field removed.

## 2.17.0 — 2026-07-22

### Changed — geo.yaml (v1.6.0 → v1.7.0) + planning.yaml (v1.2.0 → v1.3.0), US-088 dry-run P0 fix
- **geo `SourceConfidence` enum unified** `["authoritative", "community"]` →
  `["authoritative", "derived", "inferred", "unresolved"]` — the ONE ladder used across overlays
  + parcel provenance + planning FAR. An OSM/Bhuvan-derived zone is now `inferred` (never
  `authoritative`); a `ZoneResult` with `source_confidence="authoritative"` and a non-RMP
  `zone_authority` now FAILS validation (only `BDA-RMP-2015` may mint authoritative). Fixes the
  P0 where a wrong OSM zone shipped wearing a trusted "authoritative" label.
- **planning `FarAssemblyRequest.zone`** relaxed from the `ZoneClass` enum to `string`: it now
  accepts the geo `zone_class` vocabulary. `far_assembly` maps it (`zone_map.map_geo_zone`); a
  non-developable zone (Water Body / Green Belt / Agricultural / Restricted / Unknown) returns a
  clean `unresolved` "no FAR table applies — not developable under RMP" result instead of a **422
  crash**, and is never coerced to a nearest developable zone.
- **planning FAR: missing `sub_zone` no longer silently defaults to the first table.** A zone with
  multiple RMP sub-zones (Residential Main/Mixed, Commercial Central/Business/Mutation, Industrial
  General/Hi-Tech) now returns `unresolved` with a next_action naming the choices — a silent Main
  default was a confidently-wrong FAR (plot-size vs road-width keying). FAR output also carries an
  explicit note when it rests on an inferred zone (confidence propagation already caps such a FAR
  at ≤ derived; the note makes the dependency visible). Additive; no field removed.

## 2.16.0 — 2026-07-22

### Added — geo.yaml (v1.5.0 → v1.6.0, unified deal-killer overlay engine, US-088)
- New `GET /geo/overlays` → `OverlayResult`. Consolidates the rajakaluve/waterbody/flood/forest/
  airport-OLS/HT-line overlay logic previously scattered across geo/flood/infrastructure/planning
  into ONE dated-config registry (other services keep their endpoints; this is the single
  deal-killer view the future US-092 GO/NO-GO engine reads).
- **CARDINAL RULE encoded in the contract**: an overlay with no bundled AUTHORITATIVE clearing
  layer returns `status: unresolved`, NEVER `G`/clear — absence of data is not absence of hazard.
  Only `rajakaluve/drains` and `airport-OLS` (bundled geometry/coords) can return `G`. `lakes`,
  `wetland`, `flood`, `forest`, `HT-line`, `gas` are PENDING → `unresolved` (loud) until their
  layers are bundled; a trustworthy PRESENCE probe may still fire `R`, but silence never clears.
- **Buffers are dated config, not constants**: each overlay carries the STRICTEST in-force regime
  (`buffer_m`) plus `buffer_range_m` when regimes disagree, `reference_point` (centre vs
  periphery — regimes differ), `rule_citation`, `effective_date`, `litigation_status`. A
  proposed/stayed regime (e.g. rajakaluve 2025 draft 30 m) is surfaced in the range but never
  governs.
- All distances in **EPSG:32643** (UTM 43N metres, hand-rolled TM projection — never degrees);
  Karnataka lat/lon order + bounds asserted (422 on swap/out-of-bounds). `verdict.hard_no_go`
  (any RED) and `verdict.blocks_clean_go` (any unresolved) exposed as booleans.
- New schemas `OverlayProvenance`, `OverlayItem`, `OverlayVerdict`, `OverlayResult`. Gated by
  new flag `feature.geo.overlays`. Additive; no existing geo field changed.

## 2.15.0 — 2026-07-21

### Added — planning.yaml (v1.1.0 → v1.2.0, permissible-vs-achievable FAR, US-084)
- New `POST /planning/far` → `FarAssemblyResult`. The moat: `permissible_far` (RMP table via
  lookup_far + far_modifiers) plus a **TWO-LINE achievable**: `achievable_base` (table FAR after
  the reg-3.4.iii road-band constraint + envelope — build by right) and
  `achievable_with_entitlements` (base + QUALIFYING modifiers, each labelled in `entitlements[]`
  with its condition). reg 3.4.v Additional-FAR is a rule-based entitlement (fixed uplift, no
  discretion clause) → included when the plot qualifies, so achievable is not understated; metro
  reg 3.16.ix is a conditional entitlement (added only when BMRCL-confirmed).
- **Invariant `achievable_base <= achievable_with_entitlements <= permissible_far`** asserted on
  every line (incl. matrix rows); a breach returns 422, never a laundered number.
- A band-edge road width returns `achievable_matrix` — each row carries BOTH lines + `option_value`,
  never a single picked side. Confidence PROPAGATES: an inferred road width or inferred zone never
  yields an authoritative FAR (both lines typically `derived`, carrying the road-width error_band);
  a metro-applied or PENDING line is capped at derived/conditional. A PENDING modifier (Additional-FAR
  Ring II >4000 sqm, blank in source) is surfaced + EXCLUDED from the value — never assumed 0. Every
  value carries rule_citation + a "subject to authority sanction" disclaimer.
- New schemas `FarAssemblyRequest` (extends `RoadWidthRequest`), `FarValue`, `EntitlementLabel`,
  `GroundCoverageValue`, `SetbackSet`, `FarBandOption`, `AchievableMatrix`, `FarAssemblyResult`.
  Gated by new flag `feature.planning.far-assembly`. Additive; no existing planning field changed.

## 2.14.0 — 2026-07-21

### Added — planning.yaml (v1.0.0 → v1.1.0, road-width resolver, US-084)
- New `POST /planning/road-width` → `RoadWidthResult`. Feeds US-084 FAR. There is NO
  authoritative queryable road source (RMP reg 3.2 = surveyed right-of-way), so the resolver
  returns a `band` (or `band_range` when the width sits within ~1 m of a band edge) with a
  `confidence` tier — never a false-authoritative point. When it straddles an edge it sets
  `survey_required=true` + an `option_value` (FAR delta × plot area vs survey cost).
- Best-available input tier wins (`RoadWidthRequest`): surveyed→authoritative,
  MapTiler measurement→inferred (default), probe-confirmed KGIS (Phase-0-gated), lane
  estimate→inferred; none → `status:"unresolved"` (never a default number).
- reg-3.2 rules applied: service-road aggregation (3.2.ii), corner/multi-frontage two-wider
  (3.1/3.16.ix), narrower-drops-FAR / wider-no-bonus (3.4.iii/iv), <3.5 m access floor-area
  cap (3.8.i). `max_far_confidence` propagates: an inferred width can only yield a derived FAR.
- Gated by new flag `feature.planning.road-width-resolver` (403 when disabled). Additive; no
  existing planning field changed.

## 2.13.0 — 2026-07-21

### Changed — geo.yaml (v1.4.0 → v1.5.0, fallback wire-in, US-080/US-093)
- **Additive only — no breaking change.** New optional/nullable `provenance` object on
  `ParcelGeometry` and `AuthorityResult`, plus a new `Provenance` schema
  (`tier` authoritative|inferred|unresolved, `mode` kgis-live|inferred-fallback|unresolved,
  `data_source`, `data_vintage`, `reason`, `next_action`). No existing field is removed,
  renamed, or retyped; existing consumers keep working unchanged.
- `/geo/authority`: resolution order is now KGIS-live first; **only** when KGIS returns no
  context does it fall to the inferred tier — the committed GBA wards layer (2025, urban)
  then the fetch-on-setup LGD villages layer (LGD-2024, rural), both `tier=inferred`. When
  neither answers → `Unknown` + `provenance.tier=unresolved` (never a guess). A KGIS-live
  answer is identical to before **plus** `provenance` = authoritative/kgis-live.
- `/geo/parcel`: KGIS-live remains the only source of a parcel polygon. On a KGIS miss the
  response is unchanged (`resolved=false`, `geometry=null`) **plus** `provenance` =
  unresolved/unresolved with a `next_action` (draw boundary + Bhoomi RTC cross-check +
  Dishaank) — honest degradation, no synthesized/inferred boundary.
- Performance: the 30,416-feature villages layer is queried through a load-once uniform
  grid spatial index (candidate bucket ≪ full layer); no linear PIP over all villages.
- Still gated by the existing `feature.geo.authority` / `feature.geo.parcel-geometry` flags.

## 2.12.0 — 2026-07-02

### Added — geo.yaml (v1.3.0 → v1.4.0, authority auto-detect, US-093)
- New `GET /geo/authority?lat&lon` → `AuthorityResult` (governing authority, jurisdiction
  type, planning authority, approval track, bye-law reference, portal, confidence).
- Gated by new flag `feature.geo.authority` (403 when disabled).
- GBA-aware: encodes the BBMP → Greater Bengaluru Authority transition (15-May-2025).
  Best-effort from KGIS `getlocationdetails` context + a static ruleset; the authoritative
  Boundaries/LPA point-in-polygon check is deferred (`live_verified=false`) until KGIS
  access lands. `authority="Unknown"` (low confidence) when context is unavailable — no
  fabrication.

## 2.11.0 — 2026-07-02

### Changed — geo.yaml (v1.2.0 → v1.3.0, SAT-19 parcel resolver, US-080)
- `/geo/parcel` now resolves the KGIS village id from `village_code` (or from new
  optional `lat`/`lon` via KGIS reverse geocode) and falls back to a direct KGIS
  Cadastral-layer query by village code + survey number when `geomForSurveyNum` returns
  nothing. Previously the resolver was a stub that always returned `resolved=false`.
- Added optional `lat`, `lon` query params and echoed `lat`, `lon` response fields on
  `ParcelGeometry`. No breaking changes; still gated by `feature.geo.parcel-geometry`;
  honest `resolved=false` + `geometry=null` when KGIS is unreachable (no fabrication).
- Data source: public token-free KGIS Cadastral MapServer (layer 5) +
  `getlocationdetails` + `geomForSurveyNum`. Live field-match pending Phase-0 KGIS access.

## 2.1.0 — 2026-06-20

### Added — planning.yaml (new service, SAT-10 build-capacity)
- New `services/planning` in the monorepo; `planning.yaml` (v1.0.0) documents:
  - `POST /planning/analyze` → `PlanningResult` (FAR, ground coverage, setbacks, max
    height, buildable area, TOD metro bonus, ICAO airport height restriction, score).
  - Gated by `feature.planning.site-capacity` (403 when disabled).
- Schemas: `PlanningRequest`, `PlanningResult`, `AirportRestriction`, `ZoneClass`,
  `Severity`, `RoadWidthSource`.
- Data sources: NBC 2016 Table 15, BDA CDP 2031, BDA TOD Notification 2020, ICAO
  Annex 14, AAI airport coordinates, live OSM road-width/metro lookups. Deterministic
  ruleset — no synthetic data.
## 2.2.0 — 2026-06-20

### Added — infrastructure.yaml (new service, SAT-11 connectivity)
- New `services/infrastructure`; `infrastructure.yaml` (v1.0.0):
  - `POST /infrastructure/analyze` → `InfraResult` (road access, transit stops,
    utility presence, road/transit/power sub-scores, overall connectivity score).
  - Gated by `feature.infrastructure.connectivity` (403 when disabled).
- Schemas: `InfraRequest`, `InfraResult`, `RoadAccess`, `TransitStop`,
  `UtilityPresence`, `InfraSubScores`.
- Data source: OpenStreetMap (Overpass API) — roads, transit, power. Water/telecom
  detected but not scored (OSM India coverage <20%); honest `data_disclaimer`.
## 2.3.0 — 2026-06-20

### Added — future-infra.yaml (new service, SAT-12 growth pipeline)
- New `services/future-infra`; `future-infra.yaml` (v1.0.0):
  - `GET /future-infra/pipeline?lat&lon&radius_km` → `PipelineResult` (planned/under-
    construction infrastructure — metro, expressway, ring road, IT park, SEZ, etc. —
    within radius, with status, expected completion, distance, source).
  - Gated by `feature.context.growth-pipeline` (403 when disabled).
- Schemas: `PipelineResult`, `PipelineItem`, `PipelineType`, `PipelineStatus`.
- Data source: curated public announcements (BMRCL, BDA, NHAI, KIADB, MoCI, 2024-Q4)
  bundled as JSON; honest `data_disclaimer` (approximate centroids, verify with agency).
## 2.4.0 — 2026-06-20

### Added — land-records.yaml (new service, SAT-13 land records)
- New `services/land-records`; `land-records.yaml` (v1.0.0):
  - `POST /land-records/lookup` → `LandRecordsResult` (Bhoomi RTC placeholder,
    court-case list, government-portal deep links, completeness score + notes).
  - Gated by `feature.land.records` (403 when disabled).
- Schemas: `LandRecordsRequest`, `LandRecordsResult`, `BhoomiRecord`, `CourtCase`,
  `DeepLink`.
- **Portal-only by design:** no automated retrieval — Karnataka portals (Bhoomi,
  KAVERI, eCourts) require CAPTCHA/session auth. Returns empty records + deep links
  for the user to verify directly. Honest `data_source` + `notes`; no scraping.
## 2.5.0 — 2026-06-20

### Added — geo.yaml (new service, SAT-14 geo / land-use / environment)
- `services/geo` app code delivered (main only had README/AGENTS placeholders);
  `geo.yaml` (v1.0.0) documents four endpoints:
  - `GET /geo/zone` → `ZoneResult` (OSM land-use + ISRO Bhuvan LULC + optional KGIS admin
    context). Gated by `feature.zoning.land-use` (+ `feature.geo.kgis-context` opt-in).
  - `GET /geo/soil` → `SoilResult` (texture, bearing capacity, foundation notes).
    Gated by `feature.environment.soil`.
  - `GET /geo/water-constraints` → `WaterConstraintResult` (water-body buffers / NGT
    setbacks). Gated by `feature.environment.water-constraints`.
  - `GET /geo/amenities` → `AmenitiesResult` (7 amenity categories with counts/nearest).
    Gated by `feature.geo.amenities`.
- Schemas: `ZoneResult`, `SoilResult`, `WaterConstraintResult`, `AmenitiesResult`,
  `KgisContext`, `NearbyFeature`, `WaterBody`, `AmenityCategory`, `AmenityItem`.
- Sources: OpenStreetMap (Overpass), ISRO NRSC Bhuvan LULC, KGIS admin layers; honest
  `data_disclaimer` (OSM-inferred zoning is not official BDA/BBMP zoning).
## 2.6.0 — 2026-06-20

### Added — sunpath.yaml (SAT-04 3D study; `core/flags.py`, `routers/sunpath.py`)
- **Version**: 1.5.1 → 1.6.0
- New `GET /sunpath/solar-day?lat&lon&date` → per-date hourly azimuth/elevation +
  sunrise/solar-noon/sunset via pvlib SPA (exact selected date, not interpolated).
  Drives the 3D sun-path study (sun light, marker, shadow direction, day arc).
- Gated by new flag `feature.sunpath.solar-day` (403 when disabled);
  `FeatureFlag.SUNPATH_SOLAR_DAY` registered. Existing endpoints unchanged.
- **Not ported:** the Fallback `osm_extractor.py` hunk that drops the Overpass
  `User-Agent` header — `main` (CHANGELOG 1.5.1) added it to fix Overpass 406, so it
  is intentionally retained. Only the additive flag + endpoint are migrated.
## 2.7.0 — 2026-06-21

### Changed — flood.yaml (live-data scoring; `flood_service.py` rewrite)
- **Version**: 1.6.0 → 1.7.0
- `flood_service.py` rewritten (SAT-Fallback `141ef0c`): replaces the deterministic
  `math.sin(seed)` placeholder with **live data** — Open-Meteo SRTM elevation +
  5-year ERA5 daily precipitation, and OSM Overpass water-body proximity (haversine
  to nearest river/water within the search radius).
- Response schema unchanged (`FloodReport` / `FloodComponentScores` / `ElevationAnalysis`
  / `HydrologyAnalysis` / `FloodHistory` / `LowLyingAreaIndex` / `FloodMetadata`).
- `metadata.data_source` now names Open-Meteo + OSM; `gee_enabled=false`. Conservative
  fallbacks on upstream failure (no fabricated provider claims).
## 2.8.0 — 2026-06-21

### Changed — wind.yaml (live-data analysis; `wind_service.py` rewrite)
- **Version**: 1.1.0 → 1.2.0
- `wind_service.py` rewritten (SAT-Fallback `141ef0c`): replaces the deterministic
  placeholder with **live data** — Open-Meteo Archive (ERA5 reanalysis, 10 m wind,
  5-year daily): mean/max speed, gusts, 8-point prevailing direction, India seasonal
  breakdown (summer/monsoon/winter), comfort + building-impact scoring.
- Response schema unchanged (`WindAnalysis` and nested models).
- `metadata.data_source` names Open-Meteo ERA5. Raises on no upstream data (no
  fabricated values).
## 2.9.0 — 2026-06-23

### Added — geo.yaml (SAT-19 Builders View: survey-number parcel geometry)
- **Version**: geo 1.0.0 → 1.1.0
- New `GET /geo/parcel?survey_no&village_code&kgis_village_id&crs` → `ParcelGeometry`
  (GeoJSON Polygon, WGS84) for a Karnataka rural survey number via KGIS
  `geomForSurveyNum` (forward survey→polygon — the Builders View core).
- Gated by new flag `feature.geo.parcel-geometry` (`FeatureFlag.GEO_PARCEL_GEOMETRY`,
  403 when disabled).
- Schemas: `ParcelGeometry`, `GeoJsonPolygon`; `KgisContext.village_code` added
  (reverse lookup now surfaces `villageCode`).
- **Spike-backed scaffold (FVD SAT-19):** `KGISVillageId` ≠ reverse-lookup `villageCode`
  (numeric master id, pending KSRSAC). `resolve_kgis_village_id()` is seamed; until the
  mapping lands the endpoint returns `resolved=false` + `geometry=null` (no fabrication).
- Indicative only — KGIS data not for legal use; non-commercial until KGIS license.
## 2.10.0 — 2026-06-24

### Added — geo.yaml (SAT-20 Builders View: authoritative BDA RMP-2015 land-use)
- **Version**: geo 1.1.0 → 1.2.0
- `GET /geo/zone` now returns authoritative `zone_class` from the **KGIS BDA Revised
  Master Plan 2015** land-use layer when configured + the point is inside the BDA Local
  Planning Area; otherwise it stays OSM-inferred.
- New `ZoneResult.zone_authority` field: `"BDA-RMP-2015"` (authoritative) vs
  `"OSM-inferred"` (preliminary) — provenance is first-class.
- Source: KGIS ArcGIS REST `CITYGIS/BDA_Plans` MapServer (point `query`, intersects).
  RMP zone codes (R/C/I/PSP/OS/AG/…) map to `ZoneClass`. Authoritative zone feeds the
  existing `/planning/analyze` FAR/setback engine via `zone_class` (no planning change).
- **Spike-backed scaffold (FVD SAT-20):** the published KGIS layer id + zone field name
  are confirmed at license go-live; `fetch_landuse_zone()` is seamed + env-configurable
  (`KGIS_LANDUSE_URL`, `KGIS_LANDUSE_ZONE_FIELD`). Until set it returns None → OSM
  fallback (no fabricated authoritative labels). Gated by existing `feature.zoning.land-use`.
- Indicative until KGIS license signed; non-commercial.

## 1.5.1 — 2026-06-09

### Fixed — sunpath service (`osm_extractor.py`)
- Added `User-Agent` header to all Overpass API `requests.post()` calls.
  Overpass API rejects headerless requests with `406 Not Acceptable`, which
  caused `POST /shadow/calculate/*` to fail for every request.
  No contract change; shadow endpoints behave identically.
## 2.0.0 — 2026-06-08

### Changed — rainfall.yaml (production-grade climate intelligence)
- **Version**: 1.1.0 → 2.0.0
- **New endpoints**:
  - `GET /rainfall/climate-profile` → 30-year climate analysis (Köppen-Geiger, reliability, monsoon strength)
  - `GET /rainfall/anomaly` → rainfall anomaly detection (vs 10-year average)
  - `GET /rainfall/seasonality` → seasonal distribution analysis (summer/monsoon/winter/spring)
  - `POST /rainfall/site-analysis` → SAT-specific comprehensive site analysis
- **Enhanced schemas**: ClimateProfileResponse, AnomalyResponse, SeasonalityResponse, SiteAnalysisResponse, SuitabilityScores
- **Production requirements**: Missing GEE credentials now returns HTTP 503 (no synthetic fallback in production)
- **Analytics**: Trend analysis (5yr/10yr), drought risk, runoff potential, flood susceptibility, multi-factor suitability scoring
- **Data sources**: CHIRPS Daily (primary), with documented fallback strategy for testing

## 1.7.0 — 2026-06-08

### Changed — rainfall.yaml
- Updated rainfall data source from synthetic to CHIRPS Daily via Google Earth Engine
- Updated service description to note GEE as primary source with synthetic fallback
- Version bumped to 1.1.0

## 1.6.0 — 2026-06-07

### Added — flood.yaml (SAT-07 service delivered)
- Flood service now in the monorepo (`services/flood`); `flood.yaml` updated to the
  expanded contract the earlier `1.3.0` entry described: 0–100 component scoring
  (`elevation`, `hydrology`, `flood_history`, `llai`), `metadata`, and the
  `feature.flood.risk-analysis` 403 gate on `POST /flood/analyze`.

## 1.5.0 — 2026-06-07

### Added (sunpath.yaml — SAT-226 migration)
- `GET /sunpath/diagram.svg` → Andrew Marsh-style polar diagram as `image/svg+xml`
- `GET /sunpath/orientation` → `OrientationResponse` (optimal facade azimuth + overhang projection factor)
- `POST /shadow/calculate/{polygon,radius}` → `ShadowResponse` (buildings + shadow FeatureCollections)
- `POST /shadow/timeseries/polygon` → `ShadowTimeseriesResponse`
- `GET /shadow/sunlight-hours` → `SunlightHoursResponse` (ground/roof sunshine grid; method ported from pybdshadow, BSD-3, pvlib-driven)
- `POST /buildings/extract` → building `FeatureCollection` (OSM/GEE)
- Schemas: `OrientationResponse`, `ShadowPolygonRequest`, `ShadowRadiusRequest`, `ShadowTimeseriesRequest`, `ShadowResponse`, `ShadowTimeseriesResponse`, `SunlightHoursResponse`, `FeatureCollection`

### Note
- Existing `GET /sunpath/{summer|winter|annual|events}` unchanged. Service moves from prototype `POST /api/v1/solar/*` to these root GET paths; `hour` field sourced from tz-aware local time.

## 1.4.0 — 2026-06-06

### Changed — wind.yaml
- Updated wind response schema: simplified to POST `/wind/analyze` endpoint
- Added comfort_analysis and building_impact sections
- Added seasonal breakdown (summer/monsoon/winter)
- Added 403 response for feature-flag gating

## 1.3.0 — 2026-06-04

### Changed — flood.yaml
- Expanded flood response schema (0-100 scoring, component analyses, metadata)
- Updated request shape to latitude/longitude + radius_meters
- Added 403 response for feature-flag gating

## 1.2.0 — 2026-06-03

### Added — rainfall.yaml
- Added `GET /rainfall/archive`, `POST /rainfall/summary`, and `GET /health`
- Added schemas for `RainfallArchiveResponse`, `RainfallSummaryRequest`, `RainfallSummaryResponse`

## 1.1.0 — 2026-06-02

### Changed — temperature.yaml
- Added live endpoints: `GET /weather/climate-archive`, `POST /weather/thermal-grid`, `GET /weather/analyze-wind`
- Added `GET /health` endpoint
- Marked `GET /weather/thermal-profile` as **deprecated** (zero frontend call sites; use `climate-archive` instead)
- Extended `ClimateRecommendations` schema: added optional `climate_zone` and `cdd_hdd_ratio` fields
- Extended `thermal_comfort_status` enum to include estimated-fallback variants (`Hot / Estimated`, etc.)
- Added `ThermalGridRequest`, `ThermalGridResponse`, `OpenMeteoArchiveResponse` schemas
- Corrected `year` parameter default: `today.year - 1` (was incorrectly documented as `2023`)
- Relaxed `ClimateReport.monthly_data` array constraint: `minItems: 1` (was `12`, too strict for estimated fallback)

## 1.0.0 — 2026-05-25

### Added
- `temperature.yaml` — `GET /weather/thermal-profile` → `ClimateReport` (12 months, summary, recommendations)
- `sunpath.yaml` — `GET /sunpath/{summer|winter|annual|events}` → pvlib SPA solar position data
- `flood.yaml` — `POST /flood/analyze` → 4-component flood risk score + risk tier
- `wind.yaml` — `GET /analysis/wind/climatology` → 16-sector wind rose, 4 IMD seasons, orientation advice