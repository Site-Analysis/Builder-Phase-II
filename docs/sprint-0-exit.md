# Sprint-0 Exit Ledger

**Date:** 2026-07-20 · **Gate:** this ledger is the Sprint-0 exit. No commit has been opened.

Status legend:
- **DONE-no-commit** — produced in the working tree, not committed.
- **DEFERRED-commit-time** — designed/mapped; execution is an atomic commit-time change (needs the commit sequence opened).
- **BLOCKED-phase-0-egress** — needs a live probe from a whitelisted IP/browser, or a primary source doc. Cannot be faked in CI.

## Ledger

| Item | Status | Unblocking action |
|---|---|---|
| **A · Banked-tree FVDs** — SAT-19 updated (Phase-1 + Accuracy report + overlap map); SAT-21 (US-081) & SAT-22 (US-093) created; index backfilled SAT-19/20/21/22 | **DONE-no-commit** | — |
| **A · Flag-rename plan** (`feature.geo.parcel-geometry`→`feature.geo.parcel`; add `feature.geo.cadastral-layer`) | **DONE-no-commit** (`docs/flag-rename-plan.md`) | — |
| **A · Flag-rename execution** | **DEFERRED-commit-time** | Open commit seq → new CHANGELOG entry + `flags.py` + `geo.py:31` + `geo.yaml:119` + smokes + `analysis.ts:1442` + `.vscode/tasks.json`; **deploy same window:** Mumbai `FLAGS` flip + **Vercel rebuild** (`NEXT_PUBLIC_ENABLE_CADASTRAL` is build-time) |
| **A · Smoke-merge map** (`geo_parcel_smoke.py` ↔ banked `geo_smoke.py`) | **DONE-no-commit** (overlap table in SAT-19) | — |
| **A · Smoke-merge execution** | **DEFERRED-commit-time** | FIX-2 gate first: prove banked async `{resolved,unresolved}` assert **everything** committed sync asserts (survey_number/kgis_village_id echoes); then delete stale committed + drop `geo_smoke.py` parcel dupes |
| **B · RMP config scaffold** — schema + strict validator + split-provenance + block↔cell inheritance + harness (13 smoke, green) | **DONE-no-commit** | — |
| **B · RMP cell transcription** | **BLOCKED** | **RMP-2015 Vol-III PDF** + resolve the "RMP-2026 vs RMP-2015" doc inconsistency; transcribe 2–3 cells, verify vs printed worked examples |
| **C · NBCS-2026 fallback container** (empty template, same validator) | **DONE-no-commit** | — |
| **C · NBCS cell transcription** | **BLOCKED** | **SP 7:2026 (NBCS 2026)** acquisition |
| **D · Phase-0 KGIS checklist doc** | **DONE-no-commit** (`docs/phase-0-kgis-verification.md`, P1–P13) | — |
| **US-084/085 golden-fixture values** (stubs scaffolded, `expected` empty, fail-loud on guess) | **BLOCKED** | RMP-2015 Vol-III PDF (US-084) + primary gazette PDF UDD 78 MNJ 2024(E) (US-085) |
| **Phase-0 KGIS live verifications** | **BLOCKED-phase-0-egress** | see verbatim rows below |

## BLOCKED-phase-0-egress rows (verbatim — these decide commit-vs-wait)

- **L5 `KGISVillageID` ↔ `geomForSurveyNum` integer equivalence** (+ `KGISVillageCode` / `surveynumberi` field names & match type) — gates **US-080** parcel resolver. Probes **P1/P2**. **Unblock:** whitelisted-IP/browser query of KGIS Cadastral MapServer/5 + `geomForSurveyNum` (`docs/phase-0-kgis-verification.md`).
- **Cadastral survey-to-physical offset** (state measured 3–10 m range, never sub-metre) **+ BMRDA/outskirt coverage extent** — gates **US-081** validation. Probe **P3**. **Unblock:** whitelisted-IP/browser overlay-vs-satellite + Dishaank cross-check on ≥10 parcels.
- **Boundary polygon availability + point-in-polygon correctness** (GBA/BDA/BMRDA/BIAAPA/panchayat; vintage ≥ 2025-05-15) — gates **US-093** verified authority. Probes **P4–P6**. **Unblock:** whitelisted-IP/browser probe of KGIS Boundaries/LPA services (or acquire digitized OpenCity GeoJSON, labelled inferred).

## Exit decision
- **DEFERRED-commit-time** items (flag-rename, smoke-merge) are **independent of KGIS egress** — the commit sequence can open as soon as you authorise commits.
- **BLOCKED** items split two ways: **cell transcription** waits on the RMP-2015 Vol-III + SP 7:2026 PDFs; **live verifications** wait on a whitelisted-IP/browser probe. Neither can be faked in CI.
- Net: **opening the commit sequence needs only your go-ahead** (not KGIS). Accurate *output* for the moat (US-082/084/085) and the live-verified stories (US-080/081/093) waits on the BLOCKED unblocks above.
