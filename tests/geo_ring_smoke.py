# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-082 Part 1 — ring classification smoke.

  (a) point in each ring -> Ring I / II / III; beyond the LPA proxy -> unresolved (NOT defaulted);
  (g) ring geometry unavailable -> unresolved, ring is None, never approximated;
      swapped lat/lon -> ValueError (router surfaces 422).

The POSITIVE cases (a) inject SYNTHETIC concentric square rings into the loader cache — this
proves the point-in-polygon + ordering logic without shipping any fabricated real-world ring
geometry (the real OSM rings are produced by scripts/prep_ring_polygons.py and, when they cannot
be closed reliably, are omitted -> the runtime returns `unresolved`, tested in (g)).

One file per process. Run:  pytest tests/geo_ring_smoke.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_GEO = Path(__file__).resolve().parents[1] / "services" / "geo"
if str(_GEO) in sys.path:
    sys.path.remove(str(_GEO))
sys.path.insert(0, str(_GEO))
sys.modules.pop("app", None)
sys.modules.pop("app.main", None)

from app.services import ring_service as rs  # noqa: E402

# Concentric closed squares centred on (lon=77.59, lat=12.97) — SYNTHETIC test fixtures.
_CX, _CY = 77.59, 12.97


def _square(half: float) -> list[list[float]]:
    return [
        [_CX - half, _CY - half], [_CX + half, _CY - half], [_CX + half, _CY + half],
        [_CX - half, _CY + half], [_CX - half, _CY - half],  # closed (first == last)
    ]


@pytest.fixture
def synthetic_rings(monkeypatch):
    monkeypatch.setattr(rs, "_CACHE_LOADED", True)
    monkeypatch.setattr(rs, "_CACHE", {
        "_meta": {"built": "2026-07-23"},
        "core": {"exterior": _square(0.02), "meta": {}},
        "outer": {"exterior": _square(0.06), "meta": {}},
        "lpa": {"exterior": _square(0.12), "meta": {}},
    })


def test_ring_i_inside_core(synthetic_rings):
    r = rs.classify_ring(_CY, _CX)  # dead centre
    assert r["status"] == "resolved" and r["ring"] == "I" and r["tdr_zone"] == "A"
    assert r["confidence"] == "inferred"  # OSM-derived, never authoritative


def test_ring_ii_between_core_and_outer(synthetic_rings):
    r = rs.classify_ring(_CY, _CX + 0.04)  # outside core (0.02), inside outer (0.06)
    assert r["status"] == "resolved" and r["ring"] == "II" and r["tdr_zone"] == "B"


def test_ring_iii_beyond_orr_within_lpa(synthetic_rings):
    r = rs.classify_ring(_CY, _CX + 0.09)  # outside outer (0.06), inside lpa (0.12)
    assert r["status"] == "resolved" and r["ring"] == "III" and r["tdr_zone"] == "C"


def test_outside_lpa_is_unresolved_not_ring_iii(synthetic_rings):
    r = rs.classify_ring(_CY, _CX + 0.16)  # outside the LPA proxy (0.12)
    assert r["status"] == "unresolved" and r["ring"] is None
    assert "not assume" in (r["next_action"] or "").lower() or "outside the LPA" in (r["reason"] or "")


def test_geometry_unavailable_is_unresolved(monkeypatch):
    """(g) no bundled ring polygons -> unresolved, ring None — never Ring III by default."""
    monkeypatch.setattr(rs, "_CACHE_LOADED", True)
    monkeypatch.setattr(rs, "_CACHE", None)
    r = rs.classify_ring(_CY, _CX)
    assert r["status"] == "unresolved" and r["ring"] is None
    assert r["confidence"] == "inferred"
    assert "not bundled" in (r["reason"] or "") or "unavailable" in (r["reason"] or "")


def test_swapped_latlon_raises(synthetic_rings):
    """A lat/lon swap must fail loud (router -> 422), never project to a garbage classification."""
    with pytest.raises(ValueError):
        rs.classify_ring(_CX, _CY)  # lat=77.59 is outside Karnataka's latitude range


def test_ring_values_match_far_modifier_contract():
    """(b) the ring strings this service emits are exactly the values far_assembly's
    Additional-FAR-by-ring (reg 3.4.v) matches on — I/II are uplift-eligible, III is the 0.0
    baseline. Guards against a vocabulary drift between the two services."""
    assert set(rs._RING_TO_TDR) == {"I", "II", "III"}
