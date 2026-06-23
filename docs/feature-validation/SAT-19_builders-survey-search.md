# FVD — SAT-19 Builders View: Survey-Number Site Search

**Jira Ticket:** SAT-19
**Status:** Spike complete · FVD-first (no product code yet) · Phase 1 blocked on `KGISVillageId` resolution
**Type:** Story
**Target repo/branch:** fallback repo → `feat/geo-parcel-geometry`

---

## Feature Overview

**User Story:** As a builder/land buyer, I want to type a survey number (or click a
rural plot) and see the exact land parcel drawn on the map, so I can locate and assess a
site that ordinary OSM/Google search cannot pinpoint.

**Business Value:** The core Builders View differentiator and the gap vs TalkingLands.
SAT already has reverse coord→survey lookup; this adds the **forward survey→polygon**
render. Karnataka-first, KGIS-backed.

**Positioning:** Indicative/preliminary only — **not legal title verification** (KGIS
terms forbid legal use; survey-to-physical offset 3–10 m).

---

## Spike Findings (validated live against KGIS, 2026-06-23)

### Reverse lookup — already in code (`services/geo/app/services/kgis_service.py`)
`GET …/genericwebservices/ws/getlocationdetails?coordinates=<lat>,<lon>&type=dd`
- **Urban (BBMP, 12.9716,77.5946):** `district/town/zoneName(admin)/ward` — **no survey, no village.**
- **Rural (12.6500,77.4200):** `districtName, talukName, hobliName, villageName=Cheelur, villageCode="2905030017_1", LGD_VillageCode="626378", surveynum="88"`.
- ⇒ **Survey search is rural/revenue-land only.** BBMP land is khata/ward-based — show ward/zone context, no parcel.
- Current code keeps `villageName`/`surveynum` and **drops** `villageCode`/`LGD_VillageCode` (`kgis_service.py:44-54`) — Phase 1 must surface `villageCode`.

### Forward geometry — exact spec (KGIS webapi.aspx)
`GET …/genericwebservices/ws/geomForSurveyNum/{KGISVillageId}/{SurveyNumber}/{type}` (path-style; type `DD`|`UTM`)
- DD response: `[{"message":"200","geom":"POLYGON ((74.2908198 15.8114947, …))"}]`
- **CRS:** DD = WGS84 decimal degrees, **lng lat** order → parse WKT → GeoJSON directly, **no reprojection**. (UTM would be EPSG:32643; prefer DD.)

### Zonation (#12) — corrected
"Fetching Zonation Data" = `POST …/getKGISAdminCodes2` `{Gps_Lat, Gps_Lon}` → **administrative** codes (`Type:Urban/Rural`, district/taluk…). **NOT RMP land-use zoning.** Confirms `kgis_service.py:15-16`.
- ⇒ **Phase 2 correction:** KGIS cannot supply land-use `zone_class`. RMP/CDP land-use must come from **BDA/BMRDA master plan** (separate source, later). Planning stays user-supplied `zone_class` until then.

---

## ⛔ Blocker (gates Phase 1 end-to-end)

`geomForSurveyNum` needs **`KGISVillageId`** — a numeric master id (doc sample `1`). It is
**not** any id returned by reverse lookup. Three informed forward probes all returned
**HTTP 404**:
- `…/geomForSurveyNum/2905030017_1/88/DD` (full `villageCode`)
- `…/geomForSurveyNum/2905030017/88/DD` (10-digit, `_1` stripped)
- `…/geomForSurveyNum/?KGISVillageId=…&SurveyNumber=…&type=DD` (query-style)

**`villageCode` (2905030017_1) ≠ `LGD_VillageCode` (626378) ≠ `KGISVillageId` (numeric master).** No coordinate-path service is known to return `KGISVillageId`.

**Resolution options (Phase 0 close-out — needs KSRSAC, no brute-forcing):**
1. Email `kgissupport@ksrsac.in`: ask for the `KGISVillageId` ↔ `villageCode` mapping, or a coord/villageCode→`KGISVillageId` service.
2. Investigate the **`boundarywebservices/ws/`** base for a village-master/boundary service exposing `KGISVillageId`.
3. Check whether the `surveyno` (#3) service or an admin-hierarchy service returns `KGISVillageId`.
4. Acquire the **KGIS village master** (bulk) under the data-sharing license (see `docs/KGIS_License_Acquisition_Plan.docx`) and resolve locally.

---

## Decisions

- **Urban UX:** BBMP point → no parcel; surface ward/zone context + "survey lookup unavailable in BBMP (khata/ward-based)".
- **CRS:** request `DD`; WKT POLYGON → GeoJSON (lng/lat), no reprojection.
- **Village-id:** introduce a `resolve_kgis_village_id(village_code)` seam now; back it with the mapping/service from the blocker resolution. Phase 1 code + smoke proceed with this seam **mocked**; flag stays off until real resolver lands.
- **Zonation:** drop KGIS as land-use source; revisit via BDA/BMRDA in a later phase.

---

## Code Traceability Matrix (Phase 1 — planned)

| # | Acceptance Criterion | File (planned) | Function / Class |
|---|---|---|---|
| 1 | `GET /geo/parcel` returns typed `ParcelGeometry` (GeoJSON polygon) | `services/geo/app/routers/geo.py` | `get_parcel()` |
| 2 | Gated by `feature.geo.parcel-geometry` → 403 when off | `services/geo/app/routers/geo.py` | flag check (mirror `/geo/zone`) |
| 3 | Forward call to `geomForSurveyNum/{id}/{survey}/DD` | `services/geo/app/services/kgis_service.py` | `fetch_parcel_geometry()` |
| 4 | WKT `POLYGON` (DD) → GeoJSON WGS84 | `services/geo/app/services/kgis_service.py` | `_wkt_to_geojson()` |
| 5 | `KGISVillageId` resolution seam (mock until KSRSAC) | `services/geo/app/services/kgis_service.py` | `resolve_kgis_village_id()` |
| 6 | Reverse lookup also surfaces `villageCode` | `services/geo/app/services/kgis_service.py` | `fetch_kgis_context()` (+`village_code`) |
| 7 | Urban/no-survey → ward/zone fallback, no parcel | frontend survey-search panel | — |
| 8 | Honest `data_source="KGIS"` + indicative-not-legal note | `services/geo/app/services/kgis_service.py` | `fetch_parcel_geometry()` |
| 9 | Polygon rendered on map | `apps/web/.../SiteBoundaryOverlay.tsx` (reuse) | — |

---

## Contract

`contracts/geo.yaml` — add `ParcelGeometry` schema + `GET /geo/parcel`. CHANGELOG: next free version.

## Flag

`feature.geo.parcel-geometry` → `FeatureFlag.GEO_PARCEL_GEOMETRY`, default off.

## Tests

`tests/geo_parcel_smoke.py` — health, flag-off 403, flag-on 200 with **mocked** KGIS
(`fetch_parcel_geometry` + `resolve_kgis_village_id` patched; deterministic GeoJSON).

## Security note

Read-only public KGIS GET; no credentials. User-supplied `survey_no`/`village_code`
validated + URL-path-encoded before interpolation. Non-commercial spike use only — no
commercial flag-enable before KGIS license.
