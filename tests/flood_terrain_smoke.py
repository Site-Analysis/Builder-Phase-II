# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-089 terrain smoke — slope / HAND / cut-fill / geotech correctness.

  (a) sloped window   -> slope non-zero, within tolerance of a HAND-computed ground truth;
  (b) flat window     -> slope near zero;
  (c) DEM nodata >20% -> unresolved, NOT a 0-derived value;
  (d) HAND computed on a sloped window;
  (e) cut AND fill reported separately;
  (f) bearing capacity absent manual input -> unresolved, never from SoilGrids;
  (g) manual geotech  -> authoritative;
  (h) GLO-30 used, FABDEM absent from the codebase;
  (+) the flood_service slope=0.0 bug is dead (slope_degrees is None, not a fake 0.0).

Pure math on synthetic DEM windows (no GEE) — the GEE fetch is inert here, so analyze_terrain
returns `unresolved` rather than a fabricated slope. One file per process.
Run:  pytest tests/flood_terrain_smoke.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

_FLOOD = Path(__file__).resolve().parents[1] / "services" / "flood"
if str(_FLOOD) in sys.path:
    sys.path.remove(str(_FLOOD))
sys.path.insert(0, str(_FLOOD))
sys.modules.pop("app", None)
sys.modules.pop("app.main", None)

from app.services import terrain_service as ts  # noqa: E402

_PX = 10.0  # 10 m pixels for deterministic hand-computed slopes


def test_sloped_window_slope_nonzero_within_tolerance():
    """(a) a ramp rising 1 m every 10 m east -> dz/dx = 0.1 -> slope 10% / atan(0.1)=5.71 deg."""
    z = np.array([[float(j) for j in range(5)] for _ in range(5)])  # +1 m per col
    r = ts.slope_from_window(z, px_m=_PX, py_m=_PX)
    assert r["status"] == "resolved"
    assert r["slope_pct_mean"] != 0.0
    assert abs(r["slope_pct_mean"] - 10.0) < 0.5           # ground truth 10%
    assert abs(r["slope_deg_mean"] - 5.7106) < 0.3          # atan(0.1) deg
    assert r["confidence"] == "inferred"


def test_flat_window_slope_near_zero():
    """(b)"""
    z = np.full((5, 5), 42.0)
    r = ts.slope_from_window(z, px_m=_PX, py_m=_PX)
    assert r["status"] == "resolved"
    assert abs(r["slope_pct_mean"]) < 1e-6


def test_nodata_over_threshold_is_unresolved_not_zero():
    """(c) >20% nodata -> unresolved (never nodata-read-as-0)."""
    z = np.zeros((5, 5))
    mask = np.zeros((5, 5), dtype=bool)
    mask[:, :2] = True  # 40% nodata
    r = ts.slope_from_window(z, px_m=_PX, py_m=_PX, nodata_mask=mask)
    assert r["status"] == "unresolved"
    assert "nodata" in r["reason"].lower()
    assert "slope_pct_mean" not in r  # no partial value emitted


def test_hand_computed_on_sloped_window():
    """(d) HAND = height above the window drainage minimum."""
    z = np.array([[float(j) for j in range(5)] for _ in range(5)])
    r = ts.hand_from_window(z)
    assert r["status"] == "resolved"
    assert r["drainage_elev_m"] == 0.0
    assert r["hand_m_mean"] > 0.0 and r["hand_m_max"] == 4.0
    assert "approximation" in r["method_note"].lower()


def test_cut_and_fill_reported_separately():
    """(e) a ramp about its mean -> both cut and fill are positive and distinct."""
    z = np.array([[float(j) for j in range(5)] for _ in range(5)])
    r = ts.cut_fill(z, cell_area_m2=100.0)  # target defaults to mean (=2.0)
    assert r["status"] == "resolved"
    assert r["cut_m3"] > 0.0 and r["fill_m3"] > 0.0
    assert "cut_m3" in r and "fill_m3" in r and "net_m3" in r
    # symmetric ramp -> cut ~= fill -> net ~= 0
    assert abs(r["net_m3"]) < 1e-6


def test_cut_fill_target_pad_supplied():
    z = np.array([[float(j) for j in range(5)] for _ in range(5)])
    r = ts.cut_fill(z, cell_area_m2=100.0, target_pad_m=0.0)  # pad at the low point -> all CUT
    assert r["cut_m3"] > 0.0 and r["fill_m3"] == 0.0
    assert "user-supplied" in r["target_source"]


def test_bearing_capacity_absent_is_unresolved_never_soilgrids():
    """(f)"""
    r = ts.resolve_bearing_capacity({})
    assert r["status"] == "unresolved" and r["value_kpa"] is None
    assert r["confidence"] == "unresolved"
    assert "soilgrids" in r["reason"].lower() and "not bearing capacity" in r["reason"].lower()


def test_manual_geotech_is_authoritative():
    """(g)"""
    r = ts.resolve_bearing_capacity({"bearing_capacity_kpa": 180.0, "geotech_method": "IS 6403 SBC"})
    assert r["status"] == "resolved" and r["value_kpa"] == 180.0
    assert r["confidence"] == "authoritative"
    assert "6403" in r["method"]


def test_glo30_used_fabdem_absent_from_codebase():
    """(h) GLO-30 is the DEM; FABDEM (non-commercial) must not appear in the terrain module."""
    src = (_FLOOD / "app" / "services" / "terrain_service.py").read_text(encoding="utf-8")
    assert "COPERNICUS/DEM/GLO30" in src and ts._DEM_ASSET == "COPERNICUS/DEM/GLO30"
    # FABDEM may be NAMED, but only to BAN it (documented non-commercial), and it must never be
    # used as a DEM asset id.
    assert "non-commercial" in src.lower() and "FABDEM" in src   # the ban is documented
    assert "FABDEM/" not in src and 'Image("' + "FABDEM" not in src  # never used as an asset


def test_analyze_terrain_dem_unavailable_is_unresolved_not_zero():
    """(+) with GEE inert, the orchestrator returns unresolved slope — NEVER a fabricated 0.0."""
    out = ts.analyze_terrain({"parcel_geojson": {"type": "Polygon", "coordinates": [
        [[77.59, 12.97], [77.60, 12.97], [77.60, 12.98], [77.59, 12.98], [77.59, 12.97]]]}})
    assert out["status"] == "unresolved"
    assert out["slope"]["status"] == "unresolved"
    assert "slope_pct_mean" not in out["slope"] or out["slope"].get("slope_pct_mean") is None
    # bearing still resolves independently if supplied
    out2 = ts.analyze_terrain({"parcel_geojson": {"type": "Polygon", "coordinates": []},
                               "bearing_capacity_kpa": 200.0})
    assert out2["bearing_capacity"]["confidence"] == "authoritative"
