# FVD — SAT-19 Builders View: Survey-Number Site Search

**Jira Ticket:** SAT-19
**Status:** Phase 1 **landed** (banked, pre-commit) · resolver + direct KGIS Cadastral-L5 fallback implemented · live field-match pending Phase-0 (see `docs/phase-0-kgis-verification.md`)
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

## Phase 1 — Implementation Landed (2026-07-02, banked pre-commit)

The `KGISVillageId` blocker was resolved **without** the village-master email — via the
public KGIS Cadastral layer:

- **`resolve_kgis_village_id(village_code, client)`** — now **async + real**: queries the
  public KGIS Cadastral **layer 5** (`CadastralData_Admin/…/MapServer/5/query`) by
  `KGISVillageCode` (base + `_n`-suffixed form) → returns `KGISVillageID`. Fails soft to
  `None` (unreachable / no match / parse error) → `resolved=false`, never a fabricated id.
- **`fetch_parcel_geometry_direct(village_code, survey_no, client)`** — fallback when
  `geomForSurveyNum` yields nothing: queries layer 5 directly by `KGISVillageCode` +
  `surveynumberi`, `outSR=4326`, ESRI `rings` → GeoJSON (`_esri_rings_to_geojson`).
- **`get_parcel` resolution order:** explicit `kgis_village_id` → resolve from
  `village_code` → (if absent) reverse-geocode from `lat`/`lon` → `geomForSurveyNum` →
  direct L5 fallback. Nothing resolves → `resolved=false` + `geometry=None`.
- Added optional `lat`/`lon` params + echoed `lat`/`lon` on `ParcelGeometry`.
- Contract `geo.yaml` 1.2.0 → **1.3.0**; `CHANGELOG` **2.11.0**.
- Smoke: `tests/geo_smoke.py` `test_parcel_flag_off` / `_resolved` / `_unresolved` (mocked).
  ⚠ **Overlaps the pre-existing `tests/geo_parcel_smoke.py`** — consolidate at the PR split
  (do not ship duplicate parcel smoke across two process files; see § Gotchas in `CLAUDE.md`).
- **Flag reconciliation pending:** rename `feature.geo.parcel-geometry` → canonical
  **`feature.geo.parcel`** (Sprint-0 A) — lands with the split commit.

### Duplicate-smoke overlap (mechanical merge map — do NOT delete either file now)

Parcel smoke currently lives in **two** process files: committed `tests/geo_parcel_smoke.py`
and the banked additions in `tests/geo_smoke.py`. The later one-file merge is mechanical:

| Intent | `geo_parcel_smoke.py` (committed) | `geo_smoke.py` (banked) | Relationship / action |
|---|---|---|---|
| WKT→GeoJSON parser | `test_wkt_parser` | — | **UNIQUE** — keep (only copy) |
| flag-off → 403 | `test_parcel_flag_off` (survey `88`) | `test_parcel_flag_off` (survey `45/2`) | **DUPLICATE** intent — keep one |
| resolved path | `test_parcel_flag_on_resolved` — mocks resolver **sync 1-arg** `lambda _vc:` | `test_parcel_resolved` — mocks resolver **async 2-arg** `(_vc,_client)` + `fetch_parcel_geometry` | **DUPLICATE**; committed is **STALE** vs banked async signature → keep banked, drop committed |
| unresolved path | `test_parcel_flag_on_unresolved` — sync mock; **does NOT patch `fetch_parcel_geometry_direct`** → live-egress risk | `test_parcel_unresolved` — async mock **+** patches `fetch_parcel_geometry_direct` | **DUPLICATE**; committed **STALE + unsafe** → keep banked, drop committed |

**Merge target:** keep the dedicated `geo_parcel_smoke.py`; port the banked (correct, async)
`flag_off`/`resolved`/`unresolved` into it, keep `test_wkt_parser`, delete the 3 stale
committed versions **and** remove the 3 parcel tests from `geo_smoke.py`. Net: parcel smoke
in one process file; `geo_smoke.py` keeps only zone/authority tests. This is dedup, **not a
re-derivation** — the banked async versions already encode the correct signatures.

**Commit-time gate (before deleting any committed coverage):** verify the banked async
`{resolved, unresolved}` **assert everything** the committed sync versions assert — not just
a nicer-mock happy path. e.g. committed `test_parcel_flag_on_resolved` also asserts
`survey_number == "88"` and `kgis_village_id == "123"` echo back; the banked `test_parcel_resolved`
must assert the equivalent echoes. Port any missing assertion into the banked test **first**;
delete the committed sync tests only after assertion parity is proven.

### Parity ledger (FIX-2 — resolved 2026-07-20; merge now unblocked)

**Update:** PR1 (`d0d1093`) aligned `geo_parcel_smoke.py` to the **async** resolver signature
(+ patched `fetch_parcel_geometry_direct`). Both parcel smokes are now async, so the "STALE
sync" rows above are historical — the remaining question is pure **assertion coverage**.

Assertion-by-assertion, committed `geo_parcel_smoke.py` (`d0d1093`) vs banked `geo_smoke.py`:

| Assertion | geo_parcel_smoke.py | geo_smoke.py (banked) | Status |
|---|---|---|---|
| flag-off `status == 403` | ✓ | ✓ | COVERED |
| resolved `status == 200` | ✓ | ✓ | COVERED |
| resolved `resolved is True` | ✓ | ✓ | COVERED |
| resolved `geometry["type"] == "Polygon"` | ✓ | ✓ | COVERED |
| resolved `kgis_village_id` echo | ✓ (`"123"`) | ✓ (`"12345"`) | COVERED |
| resolved `survey_number` echo | ✓ (`"88"`) | ✗ | **GAP (banked lacks)** |
| unresolved `status == 200` | ✓ | ✓ | COVERED |
| unresolved `resolved is False` | ✓ | ✓ | COVERED |
| unresolved `geometry is None` | ✓ | ✓ | COVERED |
| `test_wkt_parser` (5 asserts) | ✓ | ✗ | **GAP (banked lacks; unique)** |

**Direction (post-PR1):** `geo_parcel_smoke.py` is the **superset** — it asserts `survey_number`
AND everything banked asserts, and it owns `test_wkt_parser`. Banked asserts **nothing** that
`geo_parcel_smoke.py` lacks (no extra coverage).

**Merge, mechanical — pick base:**
- **Base = `geo_parcel_smoke.py` (RECOMMENDED, ZERO ports):** delete the 3 parcel tests from
  `geo_smoke.py`; leave `geo_parcel_smoke.py` unchanged. Supersedes the "keep banked" note above.
- Base = banked `geo_smoke.py` (2 ports required before deleting `geo_parcel_smoke.py`):
  1. in `geo_smoke.py::test_parcel_resolved`, after the `kgis_village_id` assert, add
     `assert body["survey_number"] == "45/2"`
  2. copy `test_wkt_parser` (verbatim) into the survivor file.

**Shared gaps (in NEITHER file — optional adds during merge, NOT parity blockers):**
- direct-L5-fallback **success** path is untested (both unresolved tests mock
  `fetch_parcel_geometry_direct` → `None`); no test drives it to return a polygon.
- provenance fields (`data_source`, `crs`, `data_disclaimer`) asserted by neither.

**Verdict:** merge is **mechanical once a commit window opens — no decision needed from you.**
The recommended base (`geo_parcel_smoke.py`) needs **zero ports**; the banked-base alternative
needs the 2 listed ports. Either way, no re-derivation.

## Accuracy Report

- **Golden set:** none hand-verified against **live** KGIS — egress was blocked during the
  spike. The live field-match (`KGISVillageCode` / `KGISVillageID` / `surveynumberi` type)
  is Phase-0 (`docs/phase-0-kgis-verification.md`, probes **P1/P2/P3**).
- **Measured error:** unmeasured; survey-to-physical offset **3–10 m** per KGIS terms (not
  independently measured).
- **Known limitations:** (1) L5 `KGISVillageID`↔`geomForSurveyNum` equivalence + resolver /
  direct-fallback field names = **PENDING LIVE VERIFICATION — KGIS egress blocked** (NOT
  validated) — guarded by fail-soft to `resolved=false`; (2) BBMP/urban points return **no parcel** (khata/ward-
  based) by design; (3) BMRDA/outskirt coverage unproven (see SAT-21 / US-081); (4) **not
  legal title**.
- **Regression:** mocked smoke asserts the `resolved=true` path **and** the honest
  `resolved=false` path (no fabricated geometry).

---

## Code Traceability Matrix (Phase 1 — planned; see Phase 1 section above for landed deltas)

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
