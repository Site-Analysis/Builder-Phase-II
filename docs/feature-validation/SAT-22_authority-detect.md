# FVD — SAT-22 Builders View: Governing-Authority Auto-Detect (scaffold)

**Jira Ticket:** SAT-22 (confirm number) · Story **US-093**
**Status:** Scaffold landed behind flag (banked, pre-commit) · `live_verified=false` (KGIS admin-context + static ruleset only) · **verified point-in-polygon deferred** to the US-093-verified story
**Type:** Story
**Target repo/branch:** fallback repo → `Builders`

---

## Feature Overview

**User Story:** As a builder/land buyer, I want to know the governing local authority and
the applicable building bye-laws / approval track for a site, so I know **who sanctions the
build and under which rules** before I commit.

**Business Value:** Routes the builder to the correct authority — the entry point for the
whole approvals path. Encodes the **GBA transition** (BBMP dissolved **15-May-2025** →
Greater Bengaluru Authority, up to 5 city corporations) plus the BDA / BMRDA / BIAAPA
planning-area tracks.

**Positioning:** **Indicative only** — best-effort from the KGIS reverse-geocode admin
context + a static ruleset. **Not a jurisdiction certification.** `live_verified=false`
until the KGIS Boundaries / LPA point-in-polygon check lands (Phase-0). When context is
unavailable the result is honestly `Unknown` / low confidence — never fabricated.

---

## Implementation Landed (scaffold)

- **Endpoint** `GET /geo/authority?lat&lon` → `AuthorityResult`
  (`services/geo/app/routers/geo.py::get_authority`). Gated by **`feature.geo.authority`**
  → 403 when the flag is absent.
- **`authority_service.detect_authority`** — calls `kgis_service.fetch_kgis_context`
  (`getlocationdetails`), then a static classifier:
  - Urban + Bengaluru (district/town/admin_zone match) → **Greater Bengaluru Authority
    (GBA)**, planning authority BDA-LPA, BPAS/AutoDCR track, BBMP/Model bye-laws.
  - Urban non-Bengaluru → **ULB** (low confidence, verify LPA).
  - Rural → **Gram Panchayat** + verify LPA (BMRDA/BIAAPA/BDA green-belt).
  - No context → **`Unknown`** / low, `live_verified=false` (no fabrication).
- Honest `data_source` + `data_disclaimer` naming the GBA transition and the deferred PIP.

---

## Scope boundary — scaffold vs verified

This FVD covers the **scaffold** only. The **US-093-verified** story (planned separately)
upgrades this to:
- real **point-in-polygon** over KGIS Boundaries/LPA (authoritative) or digitized OpenCity
  GeoJSON (`inferred`), `live_verified=true` when inside a notified boundary;
- **layered** roles (`planning_authority` **and** `local_body`, never collapsed);
- **50 m boundary ambiguity** (return both candidates + "verify with authority");
- confidence swapped from `high/medium/low` → the **ladder** (`authoritative/derived/
  inferred/unresolved`) + `data_vintage`.

Those requirements are **out of scope here** and are tracked by the verified story.

---

## Code Traceability Matrix

| # | Acceptance Criterion | File | Symbol |
|---|---|---|---|
| 1 | `GET /geo/authority` → typed `AuthorityResult`; 403 when flag off | `services/geo/app/routers/geo.py` | `get_authority()` |
| 2 | Classify authority from KGIS admin context | `services/geo/app/services/authority_service.py` | `detect_authority()` |
| 3 | GBA branch (BBMP → GBA, 15-May-2025) | `services/geo/app/services/authority_service.py` | `_is_bengaluru()` + Urban branch |
| 4 | No context → honest `Unknown` / low (no fabrication) | `services/geo/app/services/authority_service.py` | early-return branch |
| 5 | `live_verified` + provenance on the response | `services/geo/app/models/geo.py` + `contracts/geo.yaml` | `AuthorityResult` |

---

## Contract / Flag / Tests

- `contracts/geo.yaml` 1.3.0 → **1.4.0** (`AuthorityResult` + `GET /geo/authority`);
  `contracts/CHANGELOG.md` → **2.12.0**.
- Flag **`feature.geo.authority`** (`FeatureFlag.GEO_AUTHORITY`, default off) — already
  canonical (no rename needed).
- `tests/geo_smoke.py` — `test_authority_flag_off`, `test_authority_bengaluru`,
  `test_authority_no_context` (KGIS context mocked).

---

## Accuracy Report

- **Golden set:** **NONE** — the scaffold does **no** geometric containment, so there is
  nothing to measure against ground truth. The ≥ 8 labelled lat/lons (GBA / BDA-LPA /
  BMRDA / BIAAPA / panchayat) belong to the **verified** story.
- **Measured error:** unmeasured by design — `live_verified` is always `false` here.
- **Known limitations (honest, by scaffold design):**
  1. Classification is **string-matching on admin context**, not a boundary test — a point
     near a jurisdiction edge can be misclassified; there is **no** 50 m ambiguity output.
  2. Confidence is `high/medium/low`, **not** the Accuracy-Contract ladder.
  3. No `local_body` / layered role; no `data_vintage`.
  4. Boundary polygons (GBA/BDA/BMRDA/BIAAPA) availability + point-in-polygon correctness =
     **PENDING LIVE VERIFICATION — KGIS egress blocked** (NOT validated) — see
     `docs/phase-0-kgis-verification.md`, probes **P4–P6**. The verified story owns the
     measured error; the scaffold has none to report.
- **Regression:** mocked smoke asserts the GBA branch + the honest `Unknown`/low path.

---

## Security note

Read-only public KGIS GET; no credentials. `lat/lon` numeric. Non-commercial until KGIS
license signed; no commercial flag-enable before then.
