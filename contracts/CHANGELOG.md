# Contract Changelog

## [Unreleased]
### Added
- geo.yaml v1.6.0: AmenityCategory extended with `points` array (all located amenities in the category, ≤40, sorted by distance) so the Zoning map can render dense, per-location amenity markers instead of only the 5 nearest. `top_5` retained for the detail cards. Overpass result cap raised 200→500. Additive, optional — no breaking change.
- geo.yaml v1.5.0: ZoneResult extended with nullable `kgis` (KgisContext) — authoritative Karnataka-GIS admin context (Urban: district/town/zone/ward; Rural: taluk/hobli/village/survey_number). Gated by new flag `feature.geo.kgis-context` (default off); null when flag off or KGIS unreachable. admin_zone is the BBMP administrative zone, NOT the RMP land-use zone. Additive, optional — no breaking change.
- packages/flags: new `GEO_KGIS_CONTEXT = "feature.geo.kgis-context"` flag.
- geo.yaml v1.4.0: NearbyFeature + AmenityItem extended with nullable lat/lon (feature/amenity coordinates) so the frontend can place map markers for the Zoning module. Additive, optional — no breaking change.
- planning.yaml v1.2.0: AirportRestriction extended with nullable lat/lon (nearest airport coordinates for site→airport map waypoint); PlanningResult extended with metro_lat/metro_lon (nearest metro coordinates for map marker + 500m TOD ring). Additive, optional — no breaking change.

### Changed
- geo /geo/water-constraints: now overlays the authoritative **primary rajakaluve** network (BBMP SWD 2022 / KSRSAC via OpenCity, bundled GeoJSON) using precise point-to-line distance for the 50m Karnataka-HC buffer — supersedes the sparse OSM drain proxy inside Bengaluru. WaterBody schema unchanged (new `type` value "rajakaluve" + authoritative `buffer_source`); `data_source` notes the added layer. No breaking change.

### Fixed
- geo LULC service: corrected Bhuvan WMS layer names to the published SISDP Phase-2 layers (`sisdp_phase2:SISDP_P2_LULC_10K_2016_2019_KA` + India fallback); the previous `lulc50k:India_LULC_20XX` names returned LayerNotDefined, so lulc_class/na_order_required/forest_clearance_required were silently always empty/false. No schema change.

### Added
- geo.yaml v1.0.0: /geo/zone endpoint for OSM-backed zoning and land-use classification
- geo.yaml v1.1.0: /geo/soil (SoilGrids v2.0) + /geo/water-constraints (OSM)
- geo.yaml v1.2.0: /geo/zone extended with Bhuvan ISRO LULC fields (lulc_class, na_order_required, forest_clearance_required, source_confidence); /geo/amenities (OSM 5km amenity coverage, 7 categories)
- geo.yaml v1.3.0: lulc_vintage field added to ZoneResult; LULC service now tries 2022-23 dataset first, falls back to 2019-20; data_disclaimer updated with vintage caveat
- infrastructure.yaml v1.2.0: scoring rebalanced — road 0-50 (adds surface quality ±5), transit 0-30 (linear decay replaces step function), power 0-20 (distance-decayed); water and telecom always 0 (OSM coverage <20% in India — detected but not scored); aerodromes removed from transit query (covered by Planning/ICAO module); data_disclaimer updated
- planning.yaml v1.0.0: /planning/analyze for NBC 2016 FAR/setback/height + ICAO airport OLS
- planning.yaml v1.1.0: road_width_m now optional (auto-detected from OSM if null); BDA TOD Notification 2020 FAR 4.0 near metro; tod_applicable, road_width_source, metro fields added
- infrastructure.yaml v1.0.0: /infrastructure/analyze OSM connectivity analysis
- infrastructure.yaml v1.1.0: RoadAccess extended (ref, surface, lanes, width, maxspeed); UtilityPresence extended (power_line, telecom_tower); InfraSubScores component breakdown added
- future-infra.yaml v1.0.0: /future-infra/pipeline curated infrastructure pipeline
- land-records.yaml v1.0.0: /land-records/lookup Karnataka RTC + eCourts + deep links

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
