# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-082 Part 2 — tiered zone resolver smoke.

  rmp   -> authoritative, source BDA-RMP-2015;
  (d) user_confirmed (attested) -> authoritative BUT source=user-confirmed (distinct from RMP),
      far_zone_confidence lifts to authoritative; unattested user -> unresolved;
  (c) osm -> inferred + unverified note + proposed_zone; far_zone_confidence stays inferred
      (re-proves the P0: an OSM zone can NEVER mint an authoritative FAR);
  (e) no source -> unresolved with next_action;
  (f) missing sub_zone -> sub_zone_status unresolved (P0 intact), even when the zone resolves.

Pure resolver — no network. One file per process. Run:  pytest tests/geo_zone_resolver_smoke.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

_GEO = Path(__file__).resolve().parents[1] / "services" / "geo"
if str(_GEO) in sys.path:
    sys.path.remove(str(_GEO))
sys.path.insert(0, str(_GEO))
sys.modules.pop("app", None)
sys.modules.pop("app.main", None)

from app.services.zone_resolver import resolve_zone  # noqa: E402


def test_rmp_tier_authoritative():
    r = resolve_zone({"rmp_zone": "Residential", "rmp_sub_zone": "Main"})
    assert r["status"] == "resolved"
    assert r["confidence"] == "authoritative" and r["source"] == "BDA-RMP-2015"
    assert r["far_zone_confidence"] == "authoritative"
    assert r["unverified"] is False and r["attested"] is False


def test_user_confirmed_lifts_but_distinct_from_rmp():
    """(d) user-confirmed attested zone -> authoritative for the calc, tagged user-confirmed."""
    r = resolve_zone({"user_zone": "Commercial", "user_sub_zone": "Business",
                      "user_attested": True, "osm_zone": "Residential"})
    assert r["status"] == "resolved" and r["confidence"] == "authoritative"
    assert r["source"] == "user-confirmed" and r["source"] != "BDA-RMP-2015"
    assert r["attested"] is True and r["far_zone_confidence"] == "authoritative"
    assert r["zone"] == "Commercial"
    assert r["proposed_zone"] == "Residential"  # the OSM hint retained for transparency
    assert any("USER-CONFIRMED" in n for n in r["notes"])


def test_user_zone_unattested_is_unresolved():
    r = resolve_zone({"user_zone": "Commercial", "user_sub_zone": "Business", "user_attested": False})
    assert r["status"] == "unresolved" and r["next_action"]


def test_osm_tier_inferred_unverified_never_authoritative():
    """(c) + P0: OSM zone is a HINT — inferred, unverified, never an authoritative FAR."""
    r = resolve_zone({"osm_zone": "Residential", "osm_sub_zone": "Main",
                      "osm_vintage": "2022-23"})
    assert r["status"] == "resolved"
    assert r["confidence"] == "inferred" and r["source"] == "OSM/Bhuvan (inferred)"
    assert r["unverified"] is True
    assert r["far_zone_confidence"] == "inferred"
    assert r["far_zone_confidence"] != "authoritative"
    assert r["proposed_zone"] == "Residential"
    assert any("UNVERIFIED" in n for n in r["notes"])


def test_no_source_is_unresolved_with_next_action():
    """(e)"""
    r = resolve_zone({})
    assert r["status"] == "unresolved" and r["zone"] is None
    assert r["next_action"] and "portal" in r["next_action"].lower()


def test_missing_sub_zone_unresolved_even_when_zone_resolves():
    """(f) P0 intact: absent sub_zone -> sub_zone_status unresolved, never defaulted to Main."""
    r = resolve_zone({"osm_zone": "Residential"})  # no osm_sub_zone
    assert r["status"] == "resolved"          # the zone itself resolved (as an inferred hint)
    assert r["sub_zone"] is None
    assert r["sub_zone_status"] == "unresolved"
    assert "not defaulted" in (r["sub_zone_reason"] or "")
    # supplying it resolves the sub_zone tier
    ok = resolve_zone({"osm_zone": "Residential", "osm_sub_zone": "Main"})
    assert ok["sub_zone"] == "Main" and ok["sub_zone_status"] == "resolved"


def test_tier_precedence_rmp_beats_user_beats_osm():
    """Best-available wins: an RMP zone overrides a user zone overrides an OSM hint."""
    r = resolve_zone({"rmp_zone": "Industrial", "user_zone": "Commercial",
                      "user_attested": True, "osm_zone": "Residential"})
    assert r["zone"] == "Industrial" and r["source"] == "BDA-RMP-2015"
