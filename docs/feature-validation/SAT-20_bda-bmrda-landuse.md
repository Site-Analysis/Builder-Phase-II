# FVD — SAT-20 Builders View: Authoritative RMP Land-Use → Planning

**Jira Ticket:** SAT-20 (confirm number)
**Status:** Spike complete · feature built behind seam + flag · authoritative layer pending KGIS license go-live
**Type:** Story
**Target repo/branch:** fallback repo → `Builders`

---

## Feature Overview

**User Story:** As a builder/land buyer, I want the site's zoning to reflect the **official BDA Revised Master Plan land-use** (not just an OSM guess), so FAR/setback/permitted-use outputs are trustworthy for a purchase decision.

**Business Value:** Turns the zoning module from indicative (OSM-inferred) into authoritative for the BDA Local Planning Area — the credibility bar for Builders View. The mechanism (zone → planning → HUDs) already exists; this swaps the *source*.

**Positioning:** Indicative for planning, **not legal zoning certification** — verify exact zoning + local amendments with BDA. KGIS data may not be used for legal purposes.

---

## Spike Findings (live research, 2026-06-24)

### Original Phase-2 premise was wrong (carried over from SAT-19)
KGIS Web API #12 (`getKGISAdminCodes2`) returns **administrative** codes only (Urban/Rural, district/taluk) — **not RMP land-use**. `admin_zone` = BBMP administrative zone. So KGIS's *point web-service* cannot supply `zone_class`. Authoritative land-use lives in KGIS's **ArcGIS map services**, separately.

### Source discovery (KGIS ArcGIS REST)
Enumerated `https://kgis.ksrsac.in/kgismaps/rest/services`:
- Folder **`CITYGIS`** → service **`CITYGIS/BDA_Plans` (MapServer)** — the authoritative BDA master-plan service.
  - `spatialReference wkid = 32643` (UTM 43N); `capabilities` includes **Query**; `supportedQueryFormats: JSON, geoJSON, PBF`.
  - **Public layer list is empty** (`/MapServer/layers` + `/legend` → `layers:[]`) — the populated land-use layer is served under the **KGIS data-sharing license** (being secured). The exact published **layer id** + **zone attribute field** are confirmed at go-live.
- Other instances exist (`kgismaps1/2`, `dev.ksrsac.in/maps`, BBMP `gisapp.bbmpgov.in/arcgis`) — same pattern; BDA_Plans is the canonical home.

### Alternative sources (rejected for live querying)
- **OpenCity** `bda-revised-master-plan-2015` — **PDF only** (48 planning-district maps), no vectors, license unspecified. Useful as a human cross-check, not machine-queryable.
- **1acre.in / Landeed** — digitized RMP layers, but **proprietary** third-party.

### Decision
- Authoritative source = **KGIS `CITYGIS/BDA_Plans` MapServer** (BDA RMP-2015), ArcGIS point `query` (intersects, `inSR=4326` so no local reprojection).
- Build the full path now behind a **seam** (`fetch_landuse_zone`) that is **env-configurable** + inert until `KGIS_LANDUSE_URL` is set → OSM fallback, no fabricated authoritative labels.
- **BMRDA** (region outside the BDA LPA) deferred — same seam extends later.

---

## Query Spec (KGIS BDA_Plans, once licensed)
```
GET {KGIS_LANDUSE_URL}/query
  ?geometry={lon},{lat}
  &geometryType=esriGeometryPoint
  &inSR=4326
  &spatialRel=esriSpatialRelIntersects
  &outFields=*
  &returnGeometry=false
  &f=json
→ features[0].attributes[{KGIS_LANDUSE_ZONE_FIELD}]  = RMP land-use code/label
```
- `KGIS_LANDUSE_URL` = the published MapServer *layer* URL (e.g. `…/CITYGIS/BDA_Plans/MapServer/0`).
- `KGIS_LANDUSE_ZONE_FIELD` = attribute holding the land-use value (default `LANDUSE`).
- No feature → point outside BDA LPA → `None` → OSM fallback.

## Taxonomy mapping (RMP-2015 → planning `ZoneClass`)
| RMP code / label | ZoneClass |
|---|---|
| R / Residential | Residential |
| C / Commercial | Commercial |
| I / Industrial | Industrial |
| MU / Mixed | Mixed Use |
| PSP / P&SP / Public & Semi Public / Public Utility | Institutional |
| AG / Agriculture | Agricultural |
| OS / Parks & Open Spaces / Green / Buffer / Valley / Forest | Green Belt |
| Water / Lake / Tank | Water Body |
| T&C / Transport / Railway / Defence / Military | Restricted |
| (unmatched) | Unknown |

Authoritative `zone_class` feeds the existing `/planning/analyze` FAR/setback engine via `zone_class` (non-buildable zones fall back to a Residential baseline for capacity numbers; the zone chip + NA/forest flags convey the real status). No planning-service change.

## Jurisdiction routing
KGIS `BDA_Plans` query returns a feature only inside the BDA LPA. Inside → authoritative (`zone_authority="BDA-RMP-2015"`, `source_confidence="authoritative"`). Outside / unconfigured / error → existing OSM-inferred zone (`zone_authority="OSM-inferred"`).

---

## Code Traceability Matrix
| # | Acceptance Criterion | File | Function / Symbol |
|---|---|---|---|
| 1 | Point → RMP land-use via KGIS BDA_Plans `query` (intersects, inSR=4326) | `services/geo/app/services/landuse_service.py` | `fetch_landuse_zone()` |
| 2 | RMP code/label → `ZoneClass` taxonomy | `services/geo/app/services/landuse_service.py` | `map_rmp_to_zoneclass()` |
| 3 | Env-configurable seam, inert until set (no fabrication) | `services/geo/app/services/landuse_service.py` | `_landuse_url()` / `_zone_field()` |
| 4 | Authoritative zone overrides OSM in `/geo/zone`; OSM fallback otherwise | `services/geo/app/services/geo_service.py` | `GeoService.analyze_zone()` |
| 5 | `zone_authority` provenance on the response | `services/geo/app/models/geo.py` + `contracts/geo.yaml` | `ZoneResult.zone_authority` |
| 6 | Authoritative zone flows to planning FAR/setbacks | `apps/web/lib/api/analysis.ts` | `getZoningAnalysis()` (`zone_class` passthrough) |
| 7 | Provenance surfaced in the HUD (authoritative vs preliminary) | `apps/web/components/zoning/ZoningComplianceHUD.tsx` | zone-authority `ZoneChip` |
| 8 | Smoke: taxonomy, seam, override, OSM fallback, flag-off 403 | `tests/geo_landuse_smoke.py` | 7 tests |

## Contract / Flag / Tests
- `contracts/geo.yaml` 1.1.0 → **1.2.0** (`ZoneResult.zone_authority`); `contracts/CHANGELOG.md` → **2.10.0**.
- Gated by existing `feature.zoning.land-use` (`FeatureFlag.ZONING_LAND_USE`) — `/geo/zone` already requires it; authoritative branch additionally self-gates on `KGIS_LANDUSE_URL`.
- `tests/geo_landuse_smoke.py` — 7 passing (network mocked).

## Security note
Read-only public ArcGIS GET; no credentials. `lat/lon` numeric. Non-commercial until KGIS license signed; no commercial flag-enable before then.

---

## Open discovery step (close at license go-live)
Confirm the **published layer id** + **zone attribute field name** on `CITYGIS/BDA_Plans` once KGIS publishes the licensed land-use layer, then set `KGIS_LANDUSE_URL` + `KGIS_LANDUSE_ZONE_FIELD` and run one live point→zone lookup (Bengaluru BDA-area coord) to validate before enabling. Until then the seam returns `None` → OSM fallback.
