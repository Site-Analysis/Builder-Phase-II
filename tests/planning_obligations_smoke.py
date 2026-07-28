# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-083 development-obligations smoke (mixed-use % + parking ECS + TIA).

  (a) residential parking ECS computed + CITED (Table 23, p.48);
  (b) mixed-use % computed where the RMP specifies it, else a checklist item;
  (c) unverified commercial ECS / TIA -> checklist item, NEVER a fabricated number;
  (d) access-road adequacy REUSES road_width_resolver (below the use minimum is flagged);
  (e) computed vs unverified are visibly distinguished in the output.

Pure builder (no network). One file per process. Run: pytest tests/planning_obligations_smoke.py
"""

from __future__ import annotations

import sys
from pathlib import Path

_PLANNING = Path(__file__).resolve().parents[1] / "services" / "planning"
if str(_PLANNING) in sys.path:
    sys.path.remove(str(_PLANNING))
sys.path.insert(0, str(_PLANNING))
sys.modules.pop("app", None)

from app.config.rmp_loader import load_config  # noqa: E402
from app.services.development_obligations import build_obligations  # noqa: E402

_CFG = load_config(_PLANNING / "app" / "config" / "rmp_2015.json")


def _ob(**kw):
    return build_obligations(kw, cfg=_CFG)


def test_residential_parking_ecs_computed_and_cited():
    """(a)"""
    r = _ob(zone="Residential", sub_zone="Mixed", use_type="residential_multi_dwelling",
            built_up_area_sqm=10000.0)
    p = r["parking"]
    assert p["status"] == "resolved"
    assert p["ecs_main"] == 100.0 and p["ecs_visitor"] == 10.0    # ~1/100 sqm + 10% visitor
    assert p["ecs_total"] == 110
    assert "Table 23" in p["citation"] and "p.48" in p["citation"]
    assert p["confidence"] == "derived"                          # per-area proxy of the per-DU rule
    # exact per-DU basis when avg dwelling size supplied -> authoritative
    r2 = _ob(zone="Residential", sub_zone="Mixed", use_type="residential_multi_dwelling",
             built_up_area_sqm=10000.0, avg_dwelling_size_sqm=100.0)
    assert r2["parking"]["confidence"] == "authoritative"


def test_nonresidential_ecs_authoritative_from_table23():
    """(a cont.) retail keys by floor area (1/50 sqm) -> authoritative."""
    r = _ob(zone="Commercial", sub_zone="Business", use_type="retail", built_up_area_sqm=5000.0)
    p = r["parking"]
    assert p["confidence"] == "authoritative"
    assert p["ecs_main"] == 100.0                                # 5000 / 50
    assert "row 2" in p["citation"]


def test_mixed_use_pct_computed_else_checklist():
    """(b)"""
    mixed = _ob(zone="Residential", sub_zone="Mixed", built_up_area_sqm=10000.0)["mixed_use"]
    assert mixed["status"] == "resolved" and mixed["non_residential_max_pct"] == 0.30
    assert mixed["confidence"] == "authoritative" and "4.2.2" in mixed["citation"]
    assert mixed["non_residential_max_sqm"] == 3000.0
    # a zone with no RMP-stated split -> checklist, no fabricated %
    res = _ob(zone="Commercial", sub_zone="Business", built_up_area_sqm=10000.0)
    assert res["mixed_use"] is None
    assert any("Mixed-use split" in c["item"] and c["status"] == "unverified"
               for c in res["checklist"])


def test_tia_and_uncovered_use_are_checklist_not_numbers():
    """(c)"""
    r = _ob(zone="Commercial", sub_zone="Mutation Corridor",
            use_type="commercial_mutation_corridor", built_up_area_sqm=30000.0)
    # TIA is always a checklist obligation, labelled unverified, with NO threshold number
    tia = next(c for c in r["checklist"] if "TIA" in c["item"] or "Traffic Impact" in c["item"])
    assert tia["status"] == "unverified"
    assert "no TIA threshold" in tia["citation_gap"].lower() or "no tia" in tia["citation_gap"].lower()
    # a use with no Table 23 row -> parking is a checklist item, not a fabricated rate
    assert r["parking"] is None
    assert any("Parking ECS for use" in c["item"] and c["status"] == "unverified"
               for c in r["checklist"])


def test_access_adequacy_reuses_road_width_resolver():
    """(d)"""
    r = _ob(zone="Residential", sub_zone="Mixed", use_type="residential_multi_dwelling",
            built_up_area_sqm=10000.0, surveyed_width_m=6.0)          # apartments need > 9 m
    a = r["access_adequacy"]
    assert a["status"] == "resolved" and a["confidence"] == "authoritative"  # surveyed tier
    assert a["adequate"] is False and a["min_required_m"] == 9.0
    assert a["band"] is not None                                    # resolver produced the band
    assert any("reg 3.2" in b for b in a["reg_basis"])              # resolver's reg basis, reused


def test_computed_vs_unverified_visibly_distinguished():
    """(e)"""
    r = _ob(zone="Residential", sub_zone="Mixed", use_type="office", built_up_area_sqm=8000.0)
    assert r["computed_count"] >= 2                                 # parking + mixed-use both resolved
    assert r["checklist_count"] >= 1                                # at least the TIA obligation
    assert r["parking"]["confidence"] in ("authoritative", "derived")
    assert r["parking"]["citation"] and r["mixed_use"]["citation"]
    for c in r["checklist"]:
        assert c["status"] == "unverified"                         # never scored as known
        # a checklist item carries NO numeric obligation field — only the unverified prose keys.
        assert set(c.keys()) == {"item", "status", "reason", "citation_gap", "next_action"}


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
