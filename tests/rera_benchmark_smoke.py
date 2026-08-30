# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-084 RERA benchmark harness — validate far_assembly against REAL sanctioned projects.

Ground-truth check no internal test replaces: run each real RERA case through far_assembly and
compare the RIGHT achievable line to the sanctioned FAR.

MATCH RULE — sanctioned_far is what the authority APPROVED on that plot, so it compares to:
  * achievable_with_entitlements  when the project amalgamated (entitlement claimed);
  * achievable_base               otherwise.
Match within +/- 0.05. A mismatch WITHOUT an explanation is a RED flag (fails loud) — that is how
a composition bug is caught. Tolerance is NOT tuned to hide mismatches.

Honest design: the harness can FAIL. The self-tests below prove it passes on a match AND red-flags
an unexplained mismatch — using clearly-labelled SYNTHETIC inputs, NOT invented RERA projects. The
real fixture ships EMPTY (cases: []) -> the real-case test SKIPS LOUD until data is supplied.

One file per process. Run:  pytest tests/rera_benchmark_smoke.py -v
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_PLANNING = Path(__file__).resolve().parents[1] / "services" / "planning"
_P = str(_PLANNING)
if _P in sys.path:
    sys.path.remove(_P)
sys.path.insert(0, _P)
sys.modules.pop("app", None)

from app.config.rmp_loader import load_config  # noqa: E402
from app.services import far_assembly as fa  # noqa: E402

_CFG = load_config(_PLANNING / "app" / "config" / "rmp_2015.json")
_FIX = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "rera_benchmark.json"
_TOL = 0.05


def _evaluate_case(case: dict, cfg: dict) -> dict:
    """Run one benchmark case through far_assembly and classify: pass | explained_mismatch |
    red_flag | needs_data. Picks the achievable line the sanctioned FAR should match."""
    line_field = "achievable_with_entitlements" if case.get("amalgamated") else "achievable_base"
    r = fa.assemble_far(
        {
            "zone": case["zone"], "sub_zone": case.get("sub_zone"), "ring": case.get("ring"),
            "plot_area_sqm": case["plot_area_sqm"], "building_height_m": case.get("building_height_m"),
            "surveyed_width_m": case["road_width_m"],  # RERA filing = surveyed/authoritative
            "additional_far_eligible": bool(case.get("amalgamated")),
            "zone_confidence": "authoritative",
        },
        cfg=cfg,
    )
    base = {"project_id": case.get("project_id"), "line": line_field,
            "sanctioned": case.get("sanctioned_far")}
    if r["status"] != "resolved":
        return {**base, "status": "needs_data", "computed": None, "delta": None,
                "reason": r.get("reason")}
    line = r.get(line_field)
    if not line or line.get("value") is None:
        return {**base, "status": "needs_data", "computed": None, "delta": None,
                "reason": f"{line_field} did not resolve (band-edge? missing input?)"}
    computed = line["value"]
    delta = round(case["sanctioned_far"] - computed, 4)
    if abs(delta) <= _TOL:
        status = "pass"
    elif case.get("explanation"):
        status = "explained_mismatch"
    else:
        status = "red_flag"
    return {**base, "status": status, "computed": computed, "delta": delta,
            "explanation": case.get("explanation")}


def _load() -> dict:
    return json.loads(_FIX.read_text(encoding="utf-8"))


# ── zero fabrication: example rows carry NO real values ─────────────────────
def test_example_shape_rows_are_not_real():
    data = _load()
    for row in data.get("example_shape", []):
        assert row["sanctioned_far"] is None, "example_shape must not carry a real sanctioned FAR"
        assert row["source_url"] == "", "example_shape must not carry a real source_url"
        assert "EXAMPLE" in row["project_id"]


# ── real benchmark: loud skip until data supplied; else validate + match rate ─
def test_rera_benchmark_cases():
    data = _load()
    cases = data.get("cases", [])
    if not cases:
        pytest.skip("PENDING real RERA data — rera_benchmark.json cases[] is empty; supply "
                    "sanctioned filings (source_url + sanctioned_far) to run the ground-truth check")
    for c in cases:  # a real case with a value must cite its filing
        assert c.get("source_url"), f"{c.get('project_id')}: real case needs a source_url (RERA filing)"

    results = [_evaluate_case(c, _CFG) for c in cases]
    passed = [r for r in results if r["status"] == "pass"]
    explained = [r for r in results if r["status"] == "explained_mismatch"]
    red = [r for r in results if r["status"] == "red_flag"]
    needs = [r for r in results if r["status"] == "needs_data"]
    print(f"RERA benchmark: {len(passed)}/{len(results)} matched "
          f"(explained={len(explained)}, needs_data={len(needs)})")
    for r in explained + red:
        print(f"  {r['status'].upper()} {r['project_id']}: sanctioned {r['sanctioned']} vs "
              f"{r['line']} {r['computed']} (delta {r['delta']}) — {r.get('explanation') or 'NO EXPLANATION'}")
    assert not red, f"UNEXPLAINED FAR mismatches (RED — likely a composition bug): {[r['project_id'] for r in red]}"


# ── harness self-tests: it can PASS and it can FAIL (SYNTHETIC, not RERA data) ─
def _synthetic(sanctioned: float, *, amalgamated: bool = False, explanation: str | None = None) -> dict:
    return {"project_id": "SYNTHETIC-HARNESS-SELFTEST", "source_url": "n/a-synthetic",
            "zone": "Residential", "sub_zone": "Main", "ring": "I" if amalgamated else None,
            "road_width_m": 20.0, "plot_area_sqm": 1500, "building_height_m": None,
            "amalgamated": amalgamated, "sanctioned_far": sanctioned, "explanation": explanation}


def test_harness_passes_on_match():
    # Res-Main 1500 sqm, road 20 m -> achievable_base 2.50
    assert _evaluate_case(_synthetic(2.50), _CFG)["status"] == "pass"


def test_harness_matches_with_entitlements_when_amalgamated():
    # amalgamated Ring I -> achievable_with_entitlements 2.75
    assert _evaluate_case(_synthetic(2.75, amalgamated=True), _CFG)["status"] == "pass"


def test_harness_red_flags_unexplained_mismatch():
    r = _evaluate_case(_synthetic(3.50), _CFG)  # far off, no explanation
    assert r["status"] == "red_flag" and abs(r["delta"]) > _TOL


def test_harness_records_explained_mismatch():
    r = _evaluate_case(_synthetic(3.50, explanation="premium/purchasable FAR (US-085) — not a bug"), _CFG)
    assert r["status"] == "explained_mismatch"
