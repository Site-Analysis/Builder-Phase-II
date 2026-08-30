# Geo Service

OSM feature extraction, GEE vegetation + administrative boundaries, Bhuvan India-specific GIS layers (LULC, elevation, routing, geocoding).

## Status
Partial. GEE functions at `SiteAnalysis_GEE` commits `0815bc7`, `13afab7`, `edd4c29`. Bhuvan integration at `SiteAnalysisV2` commit `0ba0e17`.

## Port
8004 (TBD — no local service yet)

## Contract
TBD — write `contracts/geo.yaml` before integration.

## Feature flag
TBD — define when contract is written.

## Integration checklist
- [ ] Write `contracts/geo.yaml`
- [ ] Port `SiteAnalysis_GEE/app/gee_utils.py` functions
- [ ] Port `SiteAnalysisV2/app/services/bhuvan_service.py`
- [ ] Add `pyproject.toml` + `requirements.txt`
- [ ] Wire feature flags
- [ ] Add `Dockerfile`
- [ ] Add service block to root `docker-compose.yml`
- [ ] Add smoke test to `tests/geo_smoke.py`

## Fallback data (download-on-setup)
Non-KGIS inferred-tier layers live in `app/data/` (provenance in `app/data/FALLBACK_SOURCES.md`).
The large `lgd_villages.geojson` (65 MB) is **gitignored** — fetch + validate it at setup:

    python scripts/fetch_fallback_data.py

It asserts 30,416 features + EPSG:4326 + the lat/lon KA-bounds canary (wrong/corrupt download
fails loud). `wards_bengaluru_gba.geojson` (2.9 MB, ODbL) is committable and stays tracked.
