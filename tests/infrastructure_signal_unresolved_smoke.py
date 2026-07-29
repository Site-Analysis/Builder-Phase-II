# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-092 C2 — unresolved can NEVER score as a partial pass (the cardinal verdict-safety fix).

  (a) connectivity with ALL sources unresolved -> status=unresolved, NO score (null), unknowns listed;
  (b) infra_readiness with water UNKNOWN -> status=unresolved, no resolved_score, unknowns listed;
  (c) a PARTIALLY resolved signal -> resolved_score over KNOWN inputs + unresolved_count>0 + unknowns,
      never a blended number that hides the unknowns;
  (d) a fully-resolved signal -> normal score, status=resolved.

Pure builders (no network). One file per process. Run: pytest tests/infrastructure_signal_unresolved_smoke.py
"""

from __future__ import annotations

import sys
from pathlib import Path

_INFRA = Path(__file__).resolve().parents[1] / "services" / "infrastructure"
if str(_INFRA) in sys.path:
    sys.path.remove(str(_INFRA))
sys.path.insert(0, str(_INFRA))
sys.modules.pop("app", None)

from app.models.infrastructure import ConnectivityResult, InfraReadiness  # noqa: E402
from app.services.connectivity_service import build_connectivity  # noqa: E402
from app.services.utilities_service import (  # noqa: E402
    availability_from_osm,
    build_readiness,
    resolve_main,
)

_TEL = availability_from_osm("telecom availability", detected=True, nearest_m=100.0)


def test_connectivity_all_unresolved_is_not_a_pass():
    """(a) all sources unresolved (offline) -> no misleading score."""
    result = build_connectivity(12.9345, 77.6100)  # metro/rail/highway/road_width all unresolved
    assert result["connectivity_score"] is None            # score SUPPRESSED, not a number
    sig = result["connectivity_signal"]
    assert sig["status"] == "unresolved"
    assert sig["resolved_score"] is None
    assert sig["confidence"] == "unresolved"
    assert sig["unresolved_count"] == 4
    assert {u["name"] for u in sig["unknowns"]} == {"metro", "rail", "highway", "road_width"}
    assert all(u["next_action"] for u in sig["unknowns"])
    # model round-trips with a null score (contract allows it)
    assert ConnectivityResult(**result).connectivity_score is None


def test_readiness_water_unknown_is_not_a_pass():
    """(b) water presence unknown (no authoritative BWSSB layer) -> unresolved."""
    water_unknown = resolve_main("water", None)             # -> present="unknown"
    r = build_readiness(water_unknown, _TEL, 7)
    assert r["status"] == "unresolved"
    assert r["resolved_score"] is None
    assert r["confidence"] == "unresolved"
    assert any(u["name"] == "water_main" for u in r["unknowns"])
    assert InfraReadiness(**r).status == "unresolved"


def test_partial_signal_scores_only_known_and_surfaces_unknowns():
    """(c) partial -> score over KNOWN inputs only; unknowns explicit, never blended away."""
    conn = build_connectivity(
        12.9345, 77.6100,
        metro_fetched={"name": "M", "distance_m": 800.0, "distance_type": "straight-line",
                       "confidence": "inferred"},
    )
    sig = conn["connectivity_signal"]
    assert sig["status"] == "partial"
    assert sig["resolved_score"] is not None                # a real number...
    assert conn["connectivity_score"] == sig["resolved_score"]
    assert sig["unresolved_count"] == 3                      # ...but the 3 unknowns are surfaced
    assert {u["name"] for u in sig["unknowns"]} == {"rail", "highway", "road_width"}
    assert sig["confidence"] != "unresolved"                # partial carries a real confidence


def test_fully_resolved_signal_is_normal():
    """(d) all inputs known -> normal score, status=resolved, no unknowns."""
    water_present = resolve_main("water", {"distance_m": 50.0, "diameter_mm": 300.0,
                                           "data_source": "BWSSB mains layer"})
    r = build_readiness(water_present, _TEL, 7, power_score=60.0, road_score=70.0)
    assert r["status"] == "resolved"
    assert r["resolved_score"] is not None
    assert r["unresolved_count"] == 0 and r["unknowns"] == []
    assert r["confidence"] in ("authoritative", "derived", "inferred")   # never unresolved


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
