# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-086 connectivity smoke.

  (a) airport distance is served by INFRASTRUCTURE, and absent from planning's response;
  (b) an un-fetchable source (metro/rail/highway) -> unresolved, never a made-up distance;
  (c) straight-line vs network is labelled;
  (d) road width comes from the EXISTING planning road_width_resolver (reused, not reimplemented);
  (e) merged connectivity score + access flags + US-092 signal emitted.

One file per process. Run: pytest tests/infrastructure_connectivity_smoke.py
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
_INFRA = _ROOT / "services" / "infrastructure"
if str(_INFRA) in sys.path:
    sys.path.remove(str(_INFRA))
sys.path.insert(0, str(_INFRA))
sys.modules.pop("app", None)
sys.modules.pop("app.main", None)

from app.services import connectivity_service as cs  # noqa: E402


def _load_resolver():
    """Load the planning road_width_resolver STANDALONE (by path) — it is stdlib-only, so this
    avoids the cross-service `app` collision while proving connectivity reuses the real resolver."""
    path = _ROOT / "services" / "planning" / "app" / "services" / "road_width_resolver.py"
    spec = importlib.util.spec_from_file_location("rwr_ext", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_airport_served_by_infrastructure_and_absent_from_planning():
    """(a)"""
    conn = cs.build_connectivity(12.97, 77.59)
    assert conn["airport"]["status"] == "resolved"
    assert conn["airport"]["distance_m"] is not None and conn["airport"]["distance_m"] > 0
    # planning's AirportRestriction no longer carries the distance field (consolidated out).
    # Load the planning model STANDALONE (pydantic-only) and check its actual pydantic fields.
    path = _ROOT / "services" / "planning" / "app" / "models" / "planning.py"
    spec = importlib.util.spec_from_file_location("planning_models_ext", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    fields = set(mod.AirportRestriction.model_fields)
    assert "distance_km" not in fields and "lat" not in fields and "lon" not in fields
    assert "max_height_m" in fields and "restriction_surface" in fields  # height cap kept


def test_unfetchable_source_is_unresolved_not_fabricated():
    """(b) metro/rail/highway with no fetched record -> unresolved, distance withheld."""
    conn = cs.build_connectivity(12.97, 77.59)
    for mode in ("metro", "rail", "highway"):
        m = conn[mode]
        assert m["status"] == "unresolved"
        assert m["distance_m"] is None            # NEVER a fabricated number
        assert m["confidence"] == "unresolved" and m["reason"]


def test_straight_line_vs_network_labelled():
    """(c)"""
    conn = cs.build_connectivity(12.97, 77.59)
    assert conn["airport"]["distance_type"] == "straight-line"
    assert conn["airport"]["crs"] == "EPSG:32643"
    # a fetched network record keeps its label distinct
    fetched = {"name": "Baiyappanahalli", "distance_m": 1200.0, "distance_type": "network",
               "confidence": "inferred"}
    conn2 = cs.build_connectivity(12.97, 77.59, metro_fetched=fetched)
    assert conn2["metro"]["distance_type"] == "network" and conn2["metro"]["status"] == "resolved"


def test_road_width_reuses_planning_resolver_not_reimplemented():
    """(d) the access-road width is the planning road_width_resolver's output, passed through with
    its confidence tier; connectivity_service does not reimplement band/tier math."""
    rwr = _load_resolver()
    rw = rwr.resolve_road_width({"measured_width_m": 6.0})   # inferred tier, narrow
    assert rw["status"] == "resolved" and rw["confidence"] == "inferred"
    conn = cs.build_connectivity(12.97, 77.59, road_width_result=rw)
    assert conn["road_width"]["status"] == "resolved"
    assert conn["road_width"]["confidence"] == "inferred"          # resolver's tier passes through
    assert conn["road_width"]["source"] == "planning road_width_resolver"
    assert "narrow-approach" in conn["access_flags"]              # 6 m < 9 m, from the resolver band
    # connectivity_service must NOT carry road-width band/tier math of its own
    csrc = (_INFRA / "app" / "services" / "connectivity_service.py").read_text(encoding="utf-8")
    for banned in ("_LANE_WIDTH_M", "_EDGE_MARGIN_M", "_CANONICAL_EDGES", "def _band_for"):
        assert banned not in csrc, f"connectivity reimplements road-width math: {banned}"


def test_merged_score_and_access_flags_and_signal():
    """(e)"""
    rwr = _load_resolver()
    rw = rwr.resolve_road_width({"surveyed_width_m": 12.0, "survey_date": "2025-01-01"})
    conn = cs.build_connectivity(12.97, 77.59, road_width_result=rw)
    assert isinstance(conn["connectivity_score"], float)
    assert "no-metro-within-5km" in conn["access_flags"]   # metro unresolved -> flagged
    sig = conn["connectivity_signal"]
    assert sig["metro_status"] == "unresolved"
    assert sig["airport_km"] is not None and sig["airport_distance_type"] == "straight-line"
    assert sig["road_width_confidence"] == "authoritative"  # surveyed tier
    assert sig["overall"] in ("good", "partial", "unknown")
