# Contract Changelog

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