# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-087 utilities + NOC checklist smoke.

  (d) BWSSB main "present" ONLY at authoritative confidence; absent the layer -> "unknown — verify";
  (e) NOC checklist complete + each item cites its rule + authority;
  (f) infra_readiness emitted for US-092 (water known/unknown, telecom score, noc_pending).

Pure builders (no network). One file per process. Run: pytest tests/infrastructure_utilities_smoke.py
"""

from __future__ import annotations

import sys
from pathlib import Path

_INFRA = Path(__file__).resolve().parents[1] / "services" / "infrastructure"
if str(_INFRA) in sys.path:
    sys.path.remove(str(_INFRA))
sys.path.insert(0, str(_INFRA))
sys.modules.pop("app", None)
sys.modules.pop("app.main", None)

from app.services import utilities_service as us  # noqa: E402


def test_bwssb_main_unknown_without_authoritative_layer():
    """(d) no authoritative hit -> 'unknown' + verify, NEVER inferred present."""
    m = us.resolve_main("water", None)
    assert m["present"] == "unknown"
    assert m["confidence"] == "unresolved"
    assert "verify" in m["next_action"].lower() and "BWSSB" in m["next_action"]


def test_bwssb_main_present_only_when_authoritative():
    """(d) present is allowed ONLY from an authoritative mains-layer hit."""
    m = us.resolve_main("water", {"distance_m": 40.0, "diameter_mm": 300.0})
    assert m["present"] == "present" and m["confidence"] == "authoritative"
    assert m["diameter_mm"] == 300.0 and "BWSSB" in m["data_source"]


def test_osm_proxy_is_inferred_never_asserts_main():
    """An OSM water_works nearby is an inferred AVAILABILITY signal — it must NOT flip the main to
    present (that would be a false authoritative claim)."""
    av = us.availability_from_osm("water availability", detected=True, nearest_m=300.0)
    assert av["confidence"] == "inferred" and av["score"] > 0
    assert "NOT a connection" in av["note"] or "not a" in av["note"].lower()
    # and the main built from a proxy-only context stays unknown
    full = us.build_utilities(water_detected=True, water_nearest_m=100.0,
                              telecom_detected=True, telecom_nearest_m=200.0)
    assert full["water_main"]["present"] == "unknown"


def test_noc_checklist_complete_and_cited():
    """(e) every mandatory authority present + each item cites its rule."""
    cl = us.build_noc_checklist()
    authorities = {c["authority"] for c in cl}
    for a in ("BWSSB", "BESCOM", "KSPCB"):
        assert a in authorities
    assert any("Fire" in c["authority"] for c in cl)
    assert any("AAI" in c["authority"] for c in cl)
    assert any("PNGRB" in c["rule_citation"] for c in cl)          # gas
    assert any("telegraph" in c["rule_citation"].lower() for c in cl)  # fibre/telecom
    for c in cl:
        assert c["rule_citation"] and c["authority"] and c["requirement"]
    # Fire NOC cites RMP reg 3.12 + the >=24 m trigger
    fire = next(c for c in cl if "Fire" in c["authority"])
    assert "3.12" in fire["rule_citation"] and "24" in fire["rule_citation"]
    # KSPCB CTE validity 15 years surfaced
    kspcb = next(c for c in cl if c["authority"] == "KSPCB")
    assert "15" in (kspcb["typical_validity"] or "")


def test_infra_readiness_emitted_for_us092():
    """(f) readiness signal: water unknown -> overall 'unknown', noc_pending counted."""
    full = us.build_utilities(water_detected=False, water_nearest_m=None,
                              telecom_detected=True, telecom_nearest_m=500.0)
    rd = full["infra_readiness"]
    assert rd["water_status"] == "unknown" and rd["water_confidence"] == "unresolved"
    assert rd["overall"] == "unknown"                       # cannot be 'ready' with water unknown
    assert rd["telecom_score"] > 0
    assert rd["noc_pending"] == len(full["noc_checklist"]) and rd["noc_pending"] >= 7


def test_readiness_ready_only_when_water_authoritatively_present():
    full = us.build_utilities(water_detected=True, water_nearest_m=50.0,
                              telecom_detected=True, telecom_nearest_m=100.0,
                              bwssb_water_hit={"distance_m": 30.0, "diameter_mm": 250.0})
    rd = full["infra_readiness"]
    assert rd["water_status"] == "present" and rd["water_confidence"] == "authoritative"
    assert rd["overall"] == "ready"
