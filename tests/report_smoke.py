# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-092 GO / CAUTION / NO-GO verdict smoke — the correctness proofs.

  (a) a tripped gate (forest / Kharab-B) -> NO_GO even with everything else perfect (gate dominance);
  (b) an unresolved decision-relevant input -> NEVER GO, surfaces in confirm_to_upgrade;
  (c) gate-clear + all-resolved-favourable -> GO;
  (d) gate-clear + unresolved inputs -> CAUTION with the named conditions (each has next_action);
  (e) verdict confidence = weakest input (inferred zone -> inferred verdict, stated);
  (f) red flags sorted first by severity;
  (g) PDF renders from the LIVE aggregated values, not a stale cache;
  (h) every row carries value + confidence badge + citation/vintage fields + the sanction note.

Pure builder (no network). One file per process. Run: pytest tests/report_smoke.py
"""

from __future__ import annotations

import sys
from pathlib import Path

_REPORT = Path(__file__).resolve().parents[1] / "services" / "report"
if str(_REPORT) in sys.path:
    sys.path.remove(str(_REPORT))
sys.path.insert(0, str(_REPORT))
sys.modules.pop("app", None)

from app.services import report_service as rs  # noqa: E402
from app.services.verdict_engine import compose  # noqa: E402

_PARCEL = {"lat": 12.9345, "lon": 77.6100, "survey_number": "45/2"}
_LADDER = {"authoritative", "derived", "inferred", "unresolved"}


def _perfect() -> dict:
    """A fully gate-clear, all-resolved-favourable bundle (authoritative zone)."""
    return {
        "overlays": {
            "verdict": {"hard_no_go": False, "blocks_clean_go": False, "unresolved_overlays": []},
            "gates": [
                {"gate_name": "forest", "tripped": False, "basis": "clear",
                 "citation": "FCA 1980", "confidence": "authoritative"},
                {"gate_name": "rajakaluve/drains", "tripped": False, "basis": "clear",
                 "citation": "KHC WP 817/2008", "confidence": "authoritative"},
            ],
            "overlays": [
                {"name": "forest", "status": "G", "distance_m": 5000, "buffer_m": 50,
                 "rule_citation": "FCA 1980", "as_of": "2026-07-29",
                 "provenance": {"confidence": "authoritative", "vintage": "2024"}},
            ],
        },
        "ownership": {
            "ownership_feasibility": {"confidence": "authoritative", "next_action": "run EC"},
            "gates": [
                {"gate_name": "kharab-non-saleable", "tripped": False, "basis": "no kharab",
                 "citation": "KGIS L5", "confidence": "authoritative"},
                {"gate_name": "restricted-tenure", "tripped": False, "basis": "not restricted",
                 "citation": "Dishaank", "confidence": "authoritative"},
            ],
        },
        "far": {"status": "resolved",
                "permissible_far": {"value": 2.25, "confidence": "authoritative",
                                    "rule_citation": "Table 12, p.28", "data_vintage": "Table 12, p.28"},
                "achievable_with_entitlements": {"value": 2.25}, "achievable_base": {"value": 2.25},
                "achievable_matrix": None},
        "connectivity": {"status": "resolved", "resolved_score": 80.0,
                         "confidence": "authoritative", "unknowns": []},
        "infra_readiness": {"status": "resolved", "resolved_score": 85.0,
                            "confidence": "authoritative", "unknowns": []},
        "price": {"status": "resolved",
                  "upside": {"low": 1000, "high": 2000, "premium_low_pct": 10, "premium_high_pct": 20,
                             "confidence": "inferred", "method": "MPRA 124686", "as_of": "2024-Q4"}},
        "terrain": {"status": "resolved", "slope": {"value": 5.0, "confidence": "authoritative"}},
        "zone": {"status": "resolved", "far_zone_confidence": "authoritative",
                 "confidence": "authoritative"},
        "authority": {"authority": "Greater Bengaluru Authority (GBA)", "confidence": "derived"},
    }


def _c(bundle: dict) -> dict:
    return compose(bundle, parcel=_PARCEL, generated_at="2026-07-29T00:00:00Z")


def test_a_tripped_gate_forces_no_go():
    """(a) gate dominance — forest RED / Kharab-B -> NO_GO even with everything else perfect."""
    b = _perfect()
    b["overlays"]["gates"][0]["tripped"] = True   # forest RED
    v = _c(b)
    assert v["verdict"] == "NO_GO"
    assert v["red_flags"] and "forest" in v["red_flags"][0]["label"]

    b2 = _perfect()
    b2["ownership"]["gates"][0]["tripped"] = True  # Kharab-B non-saleable
    v2 = _c(b2)
    assert v2["verdict"] == "NO_GO"
    assert any("kharab-non-saleable" in r["label"] for r in v2["red_flags"])


def test_b_unresolved_input_never_go():
    """(b) an unresolved decision input can never yield GO — it surfaces in confirm_to_upgrade."""
    b = _perfect()
    b["connectivity"] = {"status": "unresolved", "confidence": "unresolved",
                         "unknowns": [{"name": "metro", "next_action": "wire BMRCL/curated"}]}
    v = _c(b)
    assert v["verdict"] != "GO"
    assert v["verdict"] == "CAUTION"
    assert any("metro" in r["label"] for r in v["confirm_to_upgrade"])


def test_c_gate_clear_all_resolved_is_go():
    """(c)"""
    v = _c(_perfect())
    assert v["verdict"] == "GO"
    assert v["red_flags"] == [] and v["confirm_to_upgrade"] == []


def test_d_gate_clear_unresolved_is_caution_with_next_actions():
    """(d)"""
    b = _perfect()
    b["terrain"] = {"status": "unresolved"}
    b["price"] = {"status": "unresolved"}
    v = _c(b)
    assert v["verdict"] == "CAUTION"
    assert len(v["confirm_to_upgrade"]) >= 2
    assert all(r["next_action"] for r in v["confirm_to_upgrade"])


def test_e_inferred_zone_makes_inferred_verdict_stated():
    """(e) verdict confidence = weakest input; an inferred zone -> inferred verdict, said prominently."""
    b = _perfect()
    b["zone"] = {"status": "resolved", "far_zone_confidence": "inferred", "confidence": "inferred"}
    v = _c(b)
    assert v["verdict"] == "CAUTION"                 # unconfirmed zone is a confirm-to-upgrade item
    assert v["confidence"] == "inferred"             # capped at the zone's confidence
    assert "zone" in v["confidence_note"].lower() and "confirm" in v["confidence_note"].lower()


def test_f_red_flags_sorted_by_severity():
    """(f) critical before high."""
    b = _perfect()
    b["ownership"]["gates"][1]["tripped"] = True   # restricted-tenure -> high
    b["overlays"]["gates"][0]["tripped"] = True    # forest -> critical
    v = _c(b)
    sevs = [r["severity"] for r in v["red_flags"]]
    assert sevs[0] == "critical"
    assert _sev_ok(sevs)


def _sev_ok(sevs: list[str]) -> bool:
    rank = {"critical": 3, "high": 2, "moderate": 1, "low": 0}
    return all(rank[a] >= rank[b] for a, b in zip(sevs, sevs[1:]))


def test_g_pdf_renders_from_live_values():
    """(g) the rendered HTML/PDF reflects the LIVE composed verdict, not a stale template/cache."""
    v = _c(_perfect())                              # GO
    pdf = rs.render_pdf(v)
    doc = pdf.get("html_fallback") or ""
    # when WeasyPrint is absent we get the HTML fallback; either way it must carry the LIVE verdict
    assert pdf["status"] in ("rendered", "unavailable")
    if pdf["status"] == "unavailable":
        assert "GO" in doc and "77.61" in doc      # live verdict + live parcel, not a stub
    # a NO_GO verdict renders a distinct live document
    b = _perfect()
    b["overlays"]["gates"][0]["tripped"] = True
    doc2 = rs.render_pdf(_c(b)).get("html_fallback") or ""
    assert "NO-GO" in doc2 and "forest" in doc2


def test_g_share_persists_snapshot_seam():
    """(g cont.) the share link persists a SNAPSHOT (Supabase seam) — honest pending, never fake."""
    v = _c(_perfect())
    rid = rs.report_id_for(_PARCEL, "2026-07-29T00:00:00Z")
    share = rs.persist_and_share(v, rid)
    assert share["report_id"] == rid
    assert share["status"] in ("ready", "pending-supabase")
    if share["status"] == "pending-supabase":
        assert share["share_link"] is None          # no fake link without Supabase creds


def test_h_every_row_carries_provenance_fields():
    """(h) every row has a value + confidence badge + citation/vintage fields + the sanction note."""
    b = _perfect()
    b["zone"] = {"status": "resolved", "far_zone_confidence": "inferred", "confidence": "inferred"}
    v = _c(b)                                        # CAUTION -> has clear + confirm rows
    assert v["rows"]
    for r in v["rows"]:
        assert r["value"]
        assert r["confidence"] in _LADDER
        assert "citation" in r and "data_vintage" in r   # fields present (may be null where N/A)
        assert r["sanction_note"] == "subject to authority sanction"


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
