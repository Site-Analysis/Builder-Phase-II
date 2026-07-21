# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-084 permissible-vs-achievable FAR (two-line achievable) smoke — correctness proofs.

  (a) qualifying Ring-I plot -> with_entitlements = base + 0.25 (or +0.50 >4000), labelled;
  (b) non-qualifying plot   -> with_entitlements == base (no phantom uplift);
  (c) PENDING Ring-II >4000 -> base resolves; with_entitlements EXCLUDES it (not inflated), pending;
  (d) metro unconfirmed -> conditional label, not added; confirmed -> added, capped conditional;
  (e) band edge + entitlement -> matrix rows each carry base + with_entitlements, no side picked;
  (f) INVARIANT base <= with_entitlements <= permissible on every case;
  (g) inferred road -> neither line authoritative;
  (h) worked example reproduces (Res-Main 1000-2000 -> permissible 2.50).

One file per process. Run:  pytest tests/planning_far_smoke.py -v
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
sys.modules.pop("app.main", None)

from app.config.rmp_loader import load_config  # noqa: E402
from app.services import far_assembly as fa  # noqa: E402

_CFG = load_config(_PLANNING / "app" / "config" / "rmp_2015.json")
_FIX = Path(__file__).resolve().parents[1] / "tests" / "fixtures"

APP_AVAILABLE = False
CLIENT = None  # type: ignore[assignment]
_ERR = ""
try:
    from app.main import app  # noqa: E402
    from fastapi.testclient import TestClient

    CLIENT = TestClient(app)
    APP_AVAILABLE = True
except Exception as _exc:  # noqa: BLE001
    _ERR = f"{type(_exc).__name__}: {_exc}"

skip_no_app = pytest.mark.skipif(not APP_AVAILABLE, reason=f"app not importable: {_ERR}")
_FLAG = "feature.planning.far-assembly"


def _assemble(**inp):
    return fa.assemble_far(inp, cfg=_CFG)


def _assert_invariant(r):
    """(f) base <= with_entitlements <= permissible on every resolved line."""
    if r["status"] != "resolved" or not r.get("permissible_far") or r["permissible_far"]["value"] is None:
        return
    perm = r["permissible_far"]["value"]
    pairs = []
    if r.get("achievable_base") and r["achievable_base"]["value"] is not None:
        pairs.append((r["achievable_base"], r["achievable_with_entitlements"]))
    if r.get("achievable_matrix"):
        pairs += [(m["achievable_base"], m["achievable_with_entitlements"]) for m in r["achievable_matrix"]["rows"]]
    for base, went in pairs:
        b, w = base["value"], went["value"]
        if b is not None and w is not None:
            assert b <= w + 1e-9, f"base {b} > with {w}"
            assert w <= perm + 1e-9, f"with {w} > permissible {perm}"
    assert r["invariant_ok"] is True


# ── (a) qualifying Ring-I -> with = base + uplift, labelled ──────────────────
def test_ring1_qualifying_uplift_applied():
    r = _assemble(zone="Residential", sub_zone="Main", plot_area_sqm=1500, measured_width_m=20.0,
                  ring="I", additional_far_eligible=True, zone_confidence="authoritative")
    assert r["achievable_base"]["value"] == 2.50
    assert r["achievable_with_entitlements"]["value"] == 2.75   # +0.25 (Ring I, 360-4000)
    assert r["permissible_far"]["value"] == 2.75
    lbl = next(e for e in r["entitlements"] if "Additional-FAR" in e["name"])
    assert lbl["status"] == "applied" and lbl["additional_far"] == 0.25
    assert "amalgamation" in lbl["condition"]
    _assert_invariant(r)


def test_ring1_over_4000_uplift_half():
    r = _assemble(zone="Residential", sub_zone="Main", plot_area_sqm=6000, measured_width_m=32.0,
                  ring="I", additional_far_eligible=True, zone_confidence="authoritative")
    assert r["achievable_base"]["value"] == 3.25
    assert r["achievable_with_entitlements"]["value"] == 3.75   # +0.50 (Ring I, >4000)
    _assert_invariant(r)


# ── (b) non-qualifying -> with == base (no phantom uplift) ───────────────────
def test_non_qualifying_no_uplift():
    r = _assemble(zone="Residential", sub_zone="Main", plot_area_sqm=1500, measured_width_m=20.0,
                  zone_confidence="authoritative")  # additional_far_eligible defaults False
    assert r["achievable_with_entitlements"]["value"] == r["achievable_base"]["value"] == 2.50
    assert r["entitlements"] == []
    _assert_invariant(r)


# ── (c) PENDING Ring-II >4000 -> base resolves, with EXCLUDES it, not inflated ─
def test_ring2_over_4000_pending_not_inflated():
    r = _assemble(zone="Residential", sub_zone="Main", plot_area_sqm=6000, measured_width_m=32.0,
                  ring="II", additional_far_eligible=True, zone_confidence="authoritative")
    assert r["achievable_base"]["value"] == 3.25
    assert r["achievable_with_entitlements"]["value"] == 3.25   # pending uplift NOT added
    assert r["achievable_with_entitlements"]["modifier_pending"] is True
    lbl = next(e for e in r["entitlements"] if "Additional-FAR" in e["name"])
    assert lbl["status"] == "pending" and lbl["additional_far"] is None
    assert r["permissible_far"]["confidence"] == "derived"  # degraded by pending
    _assert_invariant(r)


# ── (d) metro unconfirmed -> conditional; confirmed -> added, capped ─────────
def test_metro_unconfirmed_conditional_not_added():
    r = _assemble(zone="Residential", sub_zone="Main", plot_area_sqm=1500, measured_width_m=20.0,
                  within_metro_150m=True, zone_confidence="authoritative")
    assert r["achievable_with_entitlements"]["value"] == 2.50  # metro NOT added
    lbl = next(e for e in r["entitlements"] if "Metro" in e["name"])
    assert lbl["status"] == "conditional" and "BMRCL" in lbl["condition"]
    _assert_invariant(r)


def test_metro_confirmed_added_capped():
    r = _assemble(zone="Residential", sub_zone="Main", plot_area_sqm=1500, measured_width_m=20.0,
                  within_metro_150m=True, metro_bmrcl_confirmed=True, zone_confidence="authoritative")
    assert r["achievable_with_entitlements"]["value"] == 4.0   # override to 4
    assert r["achievable_with_entitlements"]["confidence"] != "authoritative"  # capped conditional/derived
    assert r["permissible_far"]["value"] == 4.0
    lbl = next(e for e in r["entitlements"] if "Metro" in e["name"])
    assert lbl["status"] == "applied"
    _assert_invariant(r)


# ── (e) band edge + entitlement -> matrix rows carry base + with, no side ────
def test_band_edge_matrix_two_lines_no_side():
    r = _assemble(zone="Commercial", sub_zone="Business", plot_area_sqm=800, measured_width_m=18.5,
                  ring="I", additional_far_eligible=True)
    assert r["achievable_base"] is None and r["achievable_with_entitlements"] is None  # no side picked
    m = r["achievable_matrix"]
    assert m is not None and len(m["rows"]) == 2
    for row in m["rows"]:
        assert "achievable_base" in row and "achievable_with_entitlements" in row
        assert row["achievable_with_entitlements"]["value"] >= row["achievable_base"]["value"]
    bases = sorted(row["achievable_base"]["value"] for row in m["rows"])
    assert bases == [2.25, 2.50]
    withs = sorted(row["achievable_with_entitlements"]["value"] for row in m["rows"])
    assert withs == [2.50, 2.75]  # each + 0.25 Ring-I
    assert m["option_value"]["far_delta"] == 0.25
    _assert_invariant(r)


# ── (g) inferred road -> neither line authoritative ─────────────────────────
def test_inferred_road_neither_line_authoritative():
    r = _assemble(zone="Residential", sub_zone="Main", plot_area_sqm=1500, measured_width_m=20.0,
                  zone_confidence="authoritative")
    assert r["road_width"]["confidence"] == "inferred"
    assert r["achievable_base"]["confidence"] == "derived"
    assert r["achievable_with_entitlements"]["confidence"] == "derived"
    assert r["achievable_base"]["error_band_m"] == [3.0, 10.0]
    # surveyed lifts both lines
    r2 = _assemble(zone="Residential", sub_zone="Main", plot_area_sqm=1500, surveyed_width_m=20.0,
                   zone_confidence="authoritative")
    assert r2["achievable_base"]["confidence"] == "authoritative"
    assert r2["achievable_with_entitlements"]["confidence"] == "authoritative"


# ── unresolved zone -> no default ───────────────────────────────────────────
def test_unresolved_zone_no_default():
    r = fa.assemble_far({"plot_area_sqm": 1000, "measured_width_m": 20.0}, cfg=_CFG)
    assert r["status"] == "unresolved" and r["permissible_far"] is None and r["next_action"]


# ── (h) worked example reproduces ───────────────────────────────────────────
def test_worked_example_reproduces():
    data = json.loads((_FIX / "us084_far.json").read_text(encoding="utf-8"))
    wex = next(c for c in data["worked_examples"] if c["id"] == "rmp-residential-main-1000-2000")
    r = _assemble(zone="Residential", sub_zone="Main",
                  plot_area_sqm=wex["inputs"]["plot_area_sqm"],
                  measured_width_m=wex["inputs"]["road_width_m"], zone_confidence="authoritative")
    assert r["permissible_far"]["value"] == wex["expected"]["permissible_far"]  # 2.50


# ── flag gate (endpoint) ────────────────────────────────────────────────────
@skip_no_app
def test_endpoint_flag_off_403(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.post("/planning/far", json={"zone": "Residential", "sub_zone": "Main",
                                              "plot_area_sqm": 1500, "measured_width_m": 20.0})
    assert resp.status_code == 403


@skip_no_app
def test_endpoint_flag_on_two_lines(monkeypatch):
    monkeypatch.setenv("FLAGS", _FLAG)
    resp = CLIENT.post("/planning/far", json={
        "zone": "Residential", "sub_zone": "Main", "plot_area_sqm": 1500, "measured_width_m": 20.0,
        "ring": "I", "additional_far_eligible": True, "zone_confidence": "authoritative",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["achievable_base"]["value"] == 2.50
    assert body["achievable_with_entitlements"]["value"] == 2.75
    assert body["achievable_base"]["value"] <= body["achievable_with_entitlements"]["value"] <= body["permissible_far"]["value"]
    assert "sanction" in body["disclaimer"]
