# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Non-KGIS inferred-tier fallback engine + Phase-0 probe-capture harness — smoke.

Synthetic-polygon tests prove the PATH with ZERO real data:
  (a) fallback ANSWERS at 'inferred' confidence when a layer contains the point;
  (b) absent file / point outside all polygons → 'unresolved' — never 'clear' / a default;
  (c) the 'mode' flag distinguishes inferred-fallback / kgis-live / unresolved;
  + point-in-hole reads as outside.
Real-file tests (skip if the layers aren't bundled) validate the two ingested layers:
  wards_bengaluru_gba.geojson (369, coord_order=latlon) + lgd_villages.geojson (30416,
  coord_order=lonlat), the lat/lon-swap canary, and a Bengaluru point resolving inferred.
Probe-capture: PENDING flagged loud; captured KGISVillageID equivalence validates or FAILS LOUD.

Imports only stdlib + the geo modules (no fastapi). One file per process.
Run:  pytest tests/geo_fallback_smoke.py -v
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_GEO = Path(__file__).resolve().parents[1] / "services" / "geo"
_P = str(_GEO)
if _P in sys.path:
    sys.path.remove(_P)
sys.path.insert(0, _P)
sys.modules.pop("app", None)

from app.services import fallback_geojson as fb  # noqa: E402
from app.services import probe_capture as pc  # noqa: E402

_FIX = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
_DATA = _GEO / "app" / "data"
_WARDS = _DATA / "wards_bengaluru_gba.geojson"
_VILLAGES = _DATA / "lgd_villages.geojson"
_BLR_LAT, _BLR_LON = 12.9716, 77.5946  # Bengaluru (Vidhana Soudha area)

# Synthetic layers are non-Karnataka on purpose → bounds_check off for these.
_KW = {
    "layer_name": "TEST-ONLY synthetic",
    "data_source": "TEST-ONLY synthetic (not real boundary data)",
    "data_vintage": "1991",
    "next_action_absent": "bundle the DataMeet villages GeoJSON",
    "next_action_no_match": "verify manually / draw the site boundary",
    "bounds_check": False,
}


def _square() -> dict:
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"name": "TEST", "village": "Synthetic"},
            "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
        }],
    }


def _square_with_hole() -> dict:
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"name": "TEST"},
            "geometry": {"type": "Polygon", "coordinates": [
                [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
                [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]],
            ]},
        }],
    }


def _write(tmp_path: Path, fc: dict) -> Path:
    p = tmp_path / "layer.geojson"
    p.write_text(json.dumps(fc), encoding="utf-8")
    return p


# ── (a) inferred answer ─────────────────────────────────────────────────────
def test_fallback_inferred_hit(tmp_path):
    r = fb.locate(_write(tmp_path, _square()), lat=0.5, lon=0.5, **_KW)
    assert r["status"] == "resolved"
    assert r["mode"] == fb.MODE_FALLBACK
    assert r["confidence"] == "inferred"
    assert r["data_vintage"] == "1991"
    assert r["properties"]["village"] == "Synthetic"


# ── (b) no data → unresolved, never a default ───────────────────────────────
def test_fallback_absent_file_unresolved(tmp_path):
    r = fb.locate(tmp_path / "not_bundled.geojson", lat=0.5, lon=0.5, **_KW)
    assert r["status"] == "unresolved"
    assert r["mode"] == fb.MODE_UNRESOLVED
    assert r["value"] is None
    assert "PENDING" in r["reason"]
    assert r["next_action"] == _KW["next_action_absent"]


def test_fallback_no_match_unresolved(tmp_path):
    r = fb.locate(_write(tmp_path, _square()), lat=9.0, lon=9.0, **_KW)
    assert r["status"] == "unresolved"  # outside all polygons → NOT clear/default
    assert r["value"] is None
    assert r["next_action"] == _KW["next_action_no_match"]


def test_point_in_hole_is_outside(tmp_path):
    p = _write(tmp_path, _square_with_hole())
    assert fb.locate(p, lat=0.5, lon=0.5, **_KW)["status"] == "resolved"   # solid part
    assert fb.locate(p, lat=2.0, lon=2.0, **_KW)["status"] == "unresolved"  # in the hole


# ── (c) mode flag distinguishes tiers ───────────────────────────────────────
def test_mode_flags_distinct():
    assert len({fb.MODE_KGIS, fb.MODE_FALLBACK, fb.MODE_UNRESOLVED}) == 3


# ── REAL ingested layers (skip if not bundled) ──────────────────────────────
@pytest.fixture(scope="module")
def wards():
    if not _WARDS.exists():
        pytest.skip("wards_bengaluru_gba.geojson not bundled")
    return fb.load(_WARDS, coord_order="latlon")  # KML-derived [lat,lon] → normalized


@pytest.fixture(scope="module")
def villages():
    if not _VILLAGES.exists():
        pytest.skip("lgd_villages.geojson not bundled")
    return fb.load(_VILLAGES, coord_order="lonlat")  # standard [lon,lat]


def test_real_wards_count_and_bounds(wards):
    assert len(wards) == 369
    lon, lat = fb._first_point(wards[0]["geometry"])  # normalized to [lon,lat]
    assert fb.KA_LON[0] <= lon <= fb.KA_LON[1] and fb.KA_LAT[0] <= lat <= fb.KA_LAT[1]


def test_real_wards_wrong_order_fails_loud():
    """Regression: loading the [lat,lon] wards as 'lonlat' must trip the swap canary."""
    if not _WARDS.exists():
        pytest.skip("wards not bundled")
    with pytest.raises(fb.FallbackLayerError):
        fb.load(_WARDS, coord_order="lonlat")


def test_real_bengaluru_resolves_ward(wards):
    r = fb.locate_features(
        wards, lat=_BLR_LAT, lon=_BLR_LON, name_field="ward_name",
        layer_name="GBA wards", data_source="OpenCity GBA wards (ODbL)",
        data_vintage="2025", next_action_no_match="verify with authority",
    )
    assert r["status"] == "resolved"
    assert r["mode"] == fb.MODE_FALLBACK
    assert r["confidence"] == "inferred"
    assert r["data_vintage"] == "2025"
    assert r["name"]
    print("BLR ward:", r["name"], "| Corporation:", r["properties"].get("Corporation"))


def test_real_villages_count(villages):
    assert len(villages) == 30416


def test_real_bengaluru_resolves_village(villages):
    r = fb.locate_features(
        villages, lat=_BLR_LAT, lon=_BLR_LON, name_field="vilname11",
        layer_name="LGD villages", data_source="LGD via ramSeraph/bharatlas (CC0)",
        data_vintage="LGD-2024", next_action_no_match="verify",
    )
    # Urban BBMP core may not be a revenue village — resolve OR honest-unresolved, never a guess.
    if r["status"] == "resolved":
        assert r["confidence"] == "inferred"
        print("BLR village:", r["name"], "| vil_lgd:", r["properties"].get("vil_lgd"))
    else:
        assert r["value"] is None
        print("BLR village: UNRESOLVED —", r["reason"])


def test_real_midocean_unresolved(wards):
    r = fb.locate_features(
        wards, lat=0.0, lon=0.0, name_field="ward_name",
        layer_name="GBA wards", data_source="OpenCity GBA wards",
        data_vintage="2025", next_action_no_match="verify",
    )
    assert r["status"] == "unresolved"  # not a nearest-match guess
    assert r["value"] is None


# ── probe-capture harness ───────────────────────────────────────────────────
def _blank_cap() -> dict:
    return json.loads((_FIX / "kgis_probe_capture.json").read_text(encoding="utf-8"))


def test_probe_capture_structure_and_all_pending():
    cap = _blank_cap()
    pc.validate_structure(cap)
    pending = pc.pending_probes(cap)
    assert set(pending) == {
        "P1_villageid_equivalence", "P2_field_names", "P3_cadastral_offset", "P4_P6_boundaries"
    }
    pytest.skip(f"KGIS probes PENDING LIVE CAPTURE (run scripts/kgis_probe.py on a whitelisted IP): {pending}")


def test_probe_p1_equivalence_pass():
    cap = _blank_cap()
    cap["probes"]["P1_villageid_equivalence"].update(
        {"captured": True, "l5_KGISVillageID": "12345", "geom_accepted_id": "12345", "geom_status": "200"}
    )
    assert pc.evaluate(cap)["P1_villageid_equivalence"]["state"] == "pass"


def test_probe_p1_equivalence_fails_loud_on_mismatch():
    cap = _blank_cap()
    cap["probes"]["P1_villageid_equivalence"].update(
        {"captured": True, "l5_KGISVillageID": "12345", "geom_accepted_id": "99999", "geom_status": "200"}
    )
    assert pc.evaluate(cap)["P1_villageid_equivalence"]["state"] == "fail"


def test_probe_p4_stale_boundary_fails_loud():
    cap = _blank_cap()
    cap["probes"]["P4_P6_boundaries"].update({"captured": True, "vintage": "2019-01-01"})
    assert pc.evaluate(cap)["P4_P6_boundaries"]["state"] == "fail"
