# Phase-0 KGIS Verification Checklist

**Status:** OPEN — all probes PENDING (KGIS egress was blocked during the spike)
**Created:** 2026-07-19
**Owner:** Builder-feasibility epic (Sprint 0, Part D)
**Feeds:** FVDs for US-080/081/082/086/087/088/089/093 · Accuracy report sections
**Related:** `docs/spikes/`, FVD `SAT-19` (parcel), FVD `SAT-20` (RMP land-use)

---

## Why this doc exists

Phase 2+ accuracy assumes specific KGIS field names, id semantics, layer coverage, and
polygon availability. **None of these were confirmable during the spike** — KGIS
(`kgis.ksrsac.in` / KSRSAC) rejected egress from the build environment. Every assumption
below is currently unverified and is guarded in code by graceful-degradation (returns
`None` / `resolved=false` / `inferred` / `unresolved`, never a fabricated value).

This checklist is the **one place** those live probes are recorded. Fill it by hand from a
whitelisted environment; the results promote the dependent checks from `inferred`/
`unresolved` to `authoritative`.

### Rules
- **Needs a whitelisted IP or a browser session on the KSRSAC allowlist.** Probe by hand.
- **DO NOT run these in CI. DO NOT fake or mock them.** A green CI probe against KGIS would
  be a lie — the whole point is a real, dated, human-verified answer.
- **Confidence gate (Accuracy Contract A/B):** until a probe PASSES, the dependent output
  MUST stay `inferred` or `unresolved`. A pending probe is **not** permission to emit
  `authoritative`.
- **Absence ≠ clear (Accuracy Contract C):** if a probe shows a layer is unavailable, the
  dependent check returns `unresolved`, never "none"/"clear"/`0`.

### How to run a probe
- **ArcGIS REST (kgismaps):** open the layer URL with `?f=json` for its **schema** (field
  names + types + extent); append `/query?where=1=1&outFields=*&returnGeometry=false&f=json`
  for sample rows. Record the **raw JSON**.
- **Generic web services (`:9000`):** hit the documented endpoint; record raw response +
  HTTP status (spike saw `HTTP 404` on the id probes — see P1).
- KGIS REST catalog root: `https://kgis.ksrsac.in/kgismaps/rest/services`

---

## A · Cadastral — parcel resolver + overlay  (gates US-080, US-081)

| ID | Probe | Exact request | PASS criterion |
|----|-------|---------------|----------------|
| **P1** | Does `geomForSurveyNum` accept the integer `KGISVillageID` from Cadastral L5? (the SAT-19 blocker) | `GET https://kgis.ksrsac.in:9000/genericwebservices/ws/geomForSurveyNum/{KGISVillageID}/{survey_no}/DD` using a `KGISVillageID` read from P2 | Returns `[{"message":"200","geom":"POLYGON ((lng lat, …))"}]` — **not** HTTP 404 |
| **P2** | Cadastral L5 field names + types: is it `KGISVillageCode`, `KGISVillageID`, `surveynumberi`? Is `surveynumberi` numeric or string? | `…/CadastralData_Admin/Dynamic_CadastralData_Admin/MapServer/5?f=json` (schema), then `/5/query?where=KGISVillageCode='<code>'&outFields=KGISVillageID,surveynumberi&returnGeometry=false&f=json` | Field names confirmed; `surveynumberi` match type (num vs str) recorded; a known survey returns 1 feature |
| **P3** | Cadastral L5 **coverage extent**: CORE (BBMP/BDA) vs OUTSKIRT/BMRDA — do BMRDA survey numbers return features, or empty? | Query P2 pattern at ≥3 BMRDA/outskirt survey numbers + ≥3 CORE | Record which return features. **Empty ≠ vacant** — drives US-081 honest-degrade path |

**Code refs:** `kgis_service.resolve_kgis_village_id`, `kgis_service.fetch_parcel_geometry_direct`, `_CADASTRAL_L5_URL`. Reverse-geocode `village_code` (e.g. `"2905030017_1"`, `_n` suffix) from `getlocationdetails` — P2 must confirm whether the base form (`2905030017`) or suffixed form matches `KGISVillageCode`.

---

## B · Admin / authority boundaries  (gates US-093)

| ID | Probe | Exact request | PASS criterion |
|----|-------|---------------|----------------|
| **P4** | **GBA-corporation** polygons available? Vintage **≥ 2025-05-15** (GBA notification; BBMP abolished)? | Locate the Boundaries service under the REST root; open `?f=json`; record service path, layer id, name field, and any `notified_date`/vintage attr | Up-to-5 GBA city-corporation polygons present **and** dataset vintage ≥ 2025-05-15 (else stale — treat as `inferred` + caveat, never authoritative) |
| **P5** | **LPA** polygons: BDA / BMRDA / BIAAPA planning-area boundaries available? | Locate LPA/planning-area service; `?f=json` schema + extents | Each of BDA-LPA, BMRDA, BIAAPA present as queryable polygons with a name/authority field |
| **P6** | Rural **local-body** (gram panchayat) polygons available? | Locate panchayat/village-boundary service; `?f=json` | Panchayat polygons present (needed for the layered `local_body` role) |

**Story impact:** P4–P6 decide whether US-093 can run **authoritative** point-in-polygon, or must fall back to digitized OpenCity GeoJSON (`inferred`). **Code ref:** `authority_service.detect_authority` (currently `live_verified=false`, context-only).

---

## C · Land-use + ring  (gates US-082)

| ID | Probe | Exact request | PASS criterion |
|----|-------|---------------|----------------|
| **P7** | BDA_Plans **layer id** + **zone attribute field name** (is it `LANDUSE`?) | `…/CITYGIS/BDA_Plans/MapServer?f=json` (list layers), then `/{layer}?f=json` (fields); point query `…/{layer}/query?geometry=<lon>,<lat>&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&f=json` | Populated land-use layer id confirmed; zone field name confirmed (set `KGIS_LANDUSE_URL` + `KGIS_LANDUSE_ZONE_FIELD` from this) |
| **P8** | **47 planning-district** polygons + **ring attribute** (I core / II core-ORR / III beyond) available? | Locate the planning-district / RMP-district service; `?f=json`; check for a ring/zone-tier attr | 47 district polygons present with a ring attribute (else ring stays `inferred` from digitized OpenCity districts) |

**Code refs:** `landuse_service.fetch_landuse_zone` (SAT-20, env-gated on `KGIS_LANDUSE_URL`), `geo_service.analyze_zone`. Note: `getKGISAdminCodes2` (`POST …/genericwebservices/ws/getKGISAdminCodes2 {Gps_Lat, Gps_Lon}`) returns **administrative** codes only — **NOT** RMP land-use (confirmed SAT-19). Do not use it for `zone_class`.

---

## D · Water / deal-killer overlays  (gates US-087, US-088)

| ID | Probe | Exact request | PASS criterion |
|----|-------|---------------|----------------|
| **P9** | Tank / lake layer: is there an **`AREA`** attribute and a **Full-Tank-Level** attr? (lake buffer is size-based under KTCDA-Amdt-2025) | Locate Tank/lake service; `?f=json`; sample rows for `AREA`/FTL fields | `AREA` (with units) present; FTL/boundary-reference attr present or explicitly absent |
| **P10** | **WR (Water Resources) drain-class** attribute — primary/secondary/tertiary rajakaluve classification? (buffer differs by class: 50/25/15 m) | Locate WR/drain service; `?f=json`; sample the class field | A drain-class/order field present (drives the correct rajakaluve buffer in US-088) |
| **P11** | **BWSSB** folder: water/sewer **mains by diameter** present? | Locate BWSSB service; `?f=json`; check for main-line geometry + diameter attr | Water + sewer main geometry with diameter present (else US-087 proximity stays `inferred` / "verify with BWSSB") |

**Code refs:** US-088 unified overlay engine (to be built — consolidates `water_service` rajakaluve/lake + flood/forest/airport); US-087 `infrastructure_service` UtilityPresence. `water_service` already bundles `rajakaluve_primary.geojson` (BBMP SWD 2022 / OpenCity) as the **inferred** fallback for P10/P11.

---

## E · Terrain  (gates US-089, cross-check only)

| ID | Probe | Exact request | PASS criterion |
|----|-------|---------------|----------------|
| **P12** | KGIS **DEM** folder: resolution + **NODATA** value? (Indian cross-check to Copernicus GLO-30; primary DEM is GEE GLO-30) | Locate DEM/ImageServer; `?f=json`; record cell size, SR, NODATA | Resolution + NODATA recorded. **NODATA must never be read as elevation 0** — mask → `unresolved` for that cell (US-089 slope guard) |

**Note:** US-089's primary source is Copernicus **GLO-30 on GEE** (commercial-safe); FABDEM is non-commercial → BLOCKED. KGIS DEM here is a cross-check, not the primary.

---

## F · Connectivity  (gates US-086)

| ID | Probe | Exact request | PASS criterion |
|----|-------|---------------|----------------|
| **P13** | KGIS road layer: **carriageway-width** attribute present? (road-width band drives FAR in US-084; fallback chain KGIS → OSM → manual) | Locate road/street service; `?f=json`; check for a width/carriageway attr | A metric carriageway-width field present (else road width degrades to OSM, then **manual** — never a silent default) |

**Code refs:** US-086 `infrastructure_service.analyze`; US-084 `planning_service._detect_road_width` (currently OSM `width`/`lanes×3.5`, default 9 m). Confirm KGIS width **basis** (carriageway vs right-of-way) — matters for the band-edge rail.

---

## Results log  *(fill by hand from a whitelisted environment — one row per probe)*

| ID | Date probed | Result (PASS / FAIL / raw note) | Verified by | Confidence impact |
|----|-------------|----------------------------------|-------------|-------------------|
| P1 | — | PENDING | — | US-080 stays `resolved` via L5 fallback only |
| P2 | — | PENDING | — | — |
| P3 | — | PENDING | — | US-081 degrade path unproven |
| P4 | — | PENDING | — | US-093 stays `inferred` (OpenCity) |
| P5 | — | PENDING | — | US-093 stays `inferred` (OpenCity) |
| P6 | — | PENDING | — | US-093 `local_body` layer unproven |
| P7 | — | PENDING | — | US-082 zone stays `inferred` until set |
| P8 | — | PENDING | — | US-082 ring stays `inferred` (OpenCity) |
| P9 | — | PENDING | — | US-088 lake buffer basis unproven |
| P10 | — | PENDING | — | US-088 drain-class → `inferred` |
| P11 | — | PENDING | — | US-087 mains → "verify with BWSSB" |
| P12 | — | PENDING | — | US-089 uses GLO-30; KGIS DEM cross-check only |
| P13 | — | PENDING | — | US-086 width → OSM/manual |

---

## Out-of-band (not a KGIS probe — legal reading, flagged separately)
- **US-088 buffer regime**: which regime (RMP-2015 vs NGT-2016 vs 2025/26 UDD amendment) is
  enforceable per parcel today, and is there a stay on the amendment? Resolve out-of-band;
  until then US-088 exposes the **range across regimes** + `litigation_status` + `as_of`.
