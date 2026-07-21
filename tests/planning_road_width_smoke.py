# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Road-width resolver smoke (US-084 feeder).

Proves the band-vs-range + tier + reg-3.2 logic with ZERO reliance on the transcribed FAR
values (structure only), plus the flag gate:
  (a) surveyed width      -> authoritative single band;
  (b) MapTiler mid-band   -> inferred single band;
  (c) within 1 m of edge  -> band_range + survey_required + option_value (never picks a side);
  (d) no input            -> unresolved (not a default);
  (e) service-road aggregation (reg 3.2.ii) applied;
  (f) access < 3.5 m      -> floor-area cap (reg 3.8.i);
  (g) confidence propagation: an inferred width never yields an authoritative FAR.

Imports the resolver directly + the planning app (flag gate). One file per process:
self-inserts services/planning and pops a stale `app`.

Run:  pytest tests/planning_road_width_smoke.py -v
"""

from __future__ import annotations

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
from app.services import road_width_resolver as rwr  # noqa: E402

_CFG = load_config(_PLANNING / "app" / "config" / "rmp_2015.json")

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

_FLAG = "feature.planning.road-width-resolver"
_BIZ = {"zone": "Commercial", "sub_zone": "Business"}


# ── (a) surveyed -> authoritative single band ───────────────────────────────
def test_surveyed_width_authoritative_band():
    r = rwr.resolve_road_width(
        {"surveyed_width_m": 20.0, **_BIZ}, cfg=_CFG, zone="Commercial", sub_zone="Business"
    )
    assert r["status"] == "resolved"
    assert r["confidence"] == "authoritative"
    assert r["band"] == {"min": 18.0, "max": 24.0}
    assert r["survey_required"] is False
    assert r["max_far_confidence"] == "authoritative"


# ── (b) MapTiler measurement mid-band -> inferred single band ───────────────
def test_maptiler_measurement_inferred_band():
    r = rwr.resolve_road_width(
        {"measured_width_m": 20.0, **_BIZ}, cfg=_CFG, zone="Commercial", sub_zone="Business"
    )
    assert r["confidence"] == "inferred"
    assert r["band"] == {"min": 18.0, "max": 24.0}
    assert r["survey_required"] is False
    assert r["error_band_m"] == [3.0, 10.0]
    assert any("carriageway" in n for n in r["notes"])


# ── (c) within 1 m of a band edge -> range + survey_required + option_value ──
def test_edge_straddle_returns_range_and_option_value():
    r = rwr.resolve_road_width(
        {"measured_width_m": 18.5, "plot_area_sqm": 800.0, **_BIZ},
        cfg=_CFG, zone="Commercial", sub_zone="Business",
    )
    assert r["survey_required"] is True
    assert r["band_range"] == [{"min": 12.0, "max": 18.0}, {"min": 18.0, "max": 24.0}]
    ov = r["option_value"]
    # FAR values ARE transcribed for Commercial-Business -> delta computable.
    assert ov["far_low"] == 2.25 and ov["far_high"] == 2.50
    assert ov["far_delta"] == 0.25
    assert ov["extra_buildable_sqm"] == 200.0  # 0.25 * 800


# ── (d) no input -> unresolved (never a default number) ─────────────────────
def test_no_input_unresolved():
    r = rwr.resolve_road_width({"zone": "Residential"}, cfg=_CFG, zone="Residential")
    assert r["status"] == "unresolved"
    assert r["value_m"] is None
    assert r["confidence"] == "unresolved"
    assert r["max_far_confidence"] == "unresolved"
    assert "measure" in r["next_action"]


# ── (e) service-road aggregation (reg 3.2.ii) ───────────────────────────────
def test_service_road_aggregation():
    r = rwr.resolve_road_width(
        {"measured_width_m": 10.0, "service_road_widths_m": [5.0], **_BIZ},
        cfg=_CFG, zone="Commercial", sub_zone="Business",
    )
    assert r["value_m"] == 15.0  # 10 + 5
    assert any("3.2.ii" in n for n in r["notes"])
    assert r["band"] == {"min": 12.0, "max": 18.0}


# ── (f) access < 3.5 m -> floor-area cap (reg 3.8.i) ────────────────────────
def test_narrow_access_floor_area_cap():
    r = rwr.resolve_road_width({"surveyed_width_m": 3.0}, cfg=_CFG, zone="Residential")
    cap = r["floor_area_cap"]
    assert cap["residential_sqm"] == 150.0 and cap["commercial_sqm"] == 50.0
    assert "3.8.i" in cap["reg_basis"]


# ── (g) confidence propagation: inferred width never yields authoritative FAR ─
def test_confidence_propagation_inferred_never_authoritative():
    inferred = rwr.resolve_road_width({"lane_count": 4}, cfg=_CFG, zone="Residential")
    assert inferred["confidence"] == "inferred"
    assert inferred["max_far_confidence"] == "derived"  # never "authoritative"
    surveyed = rwr.resolve_road_width({"surveyed_width_m": 20.0}, cfg=_CFG, zone="Residential")
    assert surveyed["max_far_confidence"] == "authoritative"


# ── flag gate (endpoint) ────────────────────────────────────────────────────
@skip_no_app
def test_endpoint_flag_off_403(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.post("/planning/road-width", json={"measured_width_m": 20.0, **_BIZ})
    assert resp.status_code == 403


@skip_no_app
def test_endpoint_flag_on_returns_band(monkeypatch):
    monkeypatch.setenv("FLAGS", _FLAG)
    resp = CLIENT.post(
        "/planning/road-width", json={"measured_width_m": 20.0, **_BIZ},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["confidence"] == "inferred"
    assert body["band"] == {"min": 18.0, "max": 24.0}
    assert body["max_far_confidence"] == "derived"
