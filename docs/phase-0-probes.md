# Phase-0 KGIS live-probe checklist (executable → capture → validate)

**The build agent cannot run these — KGIS egress is blocked.** A human on a KGIS-whitelisted
IP / browser runs them, pastes raw output into `tests/fixtures/kgis_probe_capture.json`, and
the validator (`services/geo/app/services/probe_capture.py`, exercised by
`tests/geo_fallback_smoke.py`) either **validates or fails loud**. No fabricated sample
responses — every slot is `null` + PENDING until a real capture lands.

Companion to `docs/phase-0-kgis-verification.md` (the full P1–P13 rationale). This file is the
**executable** subset that feeds a machine-checked capture.

Helper: `python scripts/kgis_probe.py --village-code <code> --survey-no <no>` attempts P1/P2
and writes the capture; P3 and P4–P6 are partly manual (below).

---

## P1 / P2 — Cadastral L5 `KGISVillageID` ↔ `geomForSurveyNum` (gates US-080)
**Run:**
1. `GET https://kgis.ksrsac.in/kgismaps/rest/services/CadastralData_Admin/Dynamic_CadastralData_Admin/MapServer/5/query?where=KGISVillageCode='<code>'&outFields=KGISVillageID&returnGeometry=false&f=json`
2. Take the returned integer `KGISVillageID`, then
   `GET https://kgis.ksrsac.in:9000/genericwebservices/ws/geomForSurveyNum/<KGISVillageID>/<survey_no>/DD`

**Capture into `probes.P1_villageid_equivalence`:** `l5_KGISVillageID`, `geom_accepted_id`
(the id you passed that returned a polygon), `geom_status` (`"200"` on success), `raw`.
**Capture into `probes.P2_field_names`:** is `KGISVillageCode` the correct field? is
`surveynumberi` numeric or string? `raw`.
**PASS:** `KGISVillageID` == the id `geomForSurveyNum` accepted AND `geom_status == "200"`.
**FAIL (loud):** ids differ, or non-200 → the id-equivalence assumption is wrong; US-080's L5
resolver path is invalid and must be reworked.

## P3 — Cadastral overlay vs satellite offset (gates US-081) — *manual*
Open the KGIS Cadastral overlay over satellite at **≥10 parcels** (CORE BBMP/BDA +
OUTSKIRT/BMRDA); cross-check each survey number against **Dishaank**.
**Capture:** `parcels_checked` (count + list), `measured_offset_m_range` (state the measured
range within the known **3–10 m**; **never** claim sub-metre), `bmrda_coverage` (which
outskirt/BMRDA areas return empty tiles).
**PASS:** offset within 3–10 m on the checked parcels; coverage gaps enumerated.

## P4–P6 — Boundaries / LPA availability + PIP (gates US-093) — *partly manual*
Enumerate the KGIS Boundaries/LPA services under
`https://kgis.ksrsac.in/kgismaps/rest/services`; for GBA-corporations, BDA-LPA, BMRDA,
BIAAPA, panchayat: record service path, whether it's queryable, and the dataset **vintage**.
**Capture into `probes.P4_P6_boundaries`:** `gba_available`, `bda_lpa_available`,
`bmrda_available`, `biaapa_available`, `panchayat_available`, `vintage`.
**PASS:** each layer present + queryable AND `vintage >= 2025-05-15` (post-GBA).
**FAIL (loud):** vintage `< 2025-05-15` → stale pre-GBA wards; must fall to the OpenCity
inferred tier, not treated as authoritative.

---

## After capture
1. Paste the values into `tests/fixtures/kgis_probe_capture.json`, set `captured: true` on
   each filled probe + `captured_by` / `captured_at`.
2. Run `pytest tests/geo_fallback_smoke.py` — the probe-capture tests turn from PENDING-skip
   into pass/fail. A wrong `KGISVillageID` equivalence **fails loud** here.
