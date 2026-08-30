# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Sprint-0 B/C harness smoke — RMP/NBCS config validator + golden-fixture guards.

Proves the guardrails with ZERO authoritative data:
  - the shipped RMP/NBCS templates are empty + valid; lookup on an empty config → None;
  - the validator REJECTS sentinels, nulls, and laundered confidence;
  - split-provenance ladder + block↔cell inheritance;
  - derived (NBCS fallback) cells require a regulatory_source AND a karnataka_adoption_status;
  - dated amendment overlays validate structurally (sentinel status rejected);
  - golden fixtures never carry a filled 'expected' without a 'source' (guess = P0);
  - untranscribed fixtures are surfaced loudly (skip w/ reason), never silently green.

This file imports only stdlib + the loader (no fastapi). One file per process.

Run:  pytest tests/planning_rmp_smoke.py -v
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# Put services/planning on sys.path so 'app' resolves to the planning app.
_PLANNING = Path(__file__).resolve().parents[1] / "services" / "planning"
_P = str(_PLANNING)
if _P in sys.path:
    sys.path.remove(_P)
sys.path.insert(0, _P)
sys.modules.pop("app", None)

from app.config.rmp_loader import (  # noqa: E402
    RMPConfigError,
    governing_setbacks,
    load_config,
    lookup_cell,
    lookup_far,
    validate_config,
)

_CONFIG = _PLANNING / "app" / "config"
_FIX = Path(__file__).resolve().parents[1] / "tests" / "fixtures"


def _meta(cells: list, block_reg: dict | None = None) -> dict:
    m = {
        "config_version": "TEST-ONLY",
        "status": "partial-unverified",
        "transcription_origin": {"source": "TEST-ONLY", "confidence": "inferred"},
        "cells": cells,
    }
    if block_reg is not None:
        m["regulatory_source"] = block_reg
    return m


def _cell_body() -> dict:
    """Non-provenance part of a valid cell. Values are TEST-ONLY synthetic (NOT RMP data)."""
    return {
        "zone": "Residential",
        "ring": "II",
        "road_width_band_m": {"min": 12, "max": 18},
        "plot_size_band_sqm": {"min": 0, "max": None},
        "far": 1.23,
        "ground_coverage": 0.5,
        "setbacks": {"front_m": 3.0, "rear_m": 1.5, "side_m": 1.0},
        "ecs": {"basis": "TEST-ONLY synthetic", "value_per_100sqm": 1.0, "visitor_pct": 0.1},
        "mixed_use_pct": None,
    }


def _authoritative_cell() -> dict:
    return {
        **_cell_body(),
        "confidence": "authoritative",
        "regulatory_source": {"doc": "TEST-ONLY primary (not RMP)", "page_ref": "Tbl X p.99"},
        "transcription_origin": {"source": "TEST-ONLY primary PDF", "confidence": "authoritative"},
    }


def _authoritative_cell_no_reg() -> dict:
    return {
        **_cell_body(),
        "confidence": "authoritative",
        "transcription_origin": {"source": "TEST-ONLY primary PDF", "confidence": "authoritative"},
    }


def _opencity_cell() -> dict:
    return {
        **_cell_body(),
        "confidence": "inferred",
        "regulatory_source": None,
        "transcription_origin": {
            "source": "OpenCity bda-revised-master-plan-2015",
            "confidence": "inferred",
        },
    }


def _derived_cell() -> dict:
    """NBCS-2026 fallback cell: confidence='derived', SP7 regulatory_source + adoption status."""
    return {
        **_cell_body(),
        "confidence": "derived",
        "karnataka_adoption_status": "not_adopted_as_of:2026-06",
        "regulatory_source": {"doc": "SP 7:2026 (NBCS 2026) TEST-ONLY", "page_ref": "TEST-ONLY p.1"},
        "transcription_origin": {"source": "TEST-ONLY SP7 PDF", "confidence": "derived"},
    }


def _amendment() -> dict:
    """Well-formed dated overlay (TEST-ONLY synthetic; no real values)."""
    return {
        "id": "test-amendment",
        "effective_date": "2025-11-11",
        "applies_to": "plots <= 4000 sqm brackets",
        "supersedes": "cell:Residential/II/12-18m/0-open",
        "status": "notified",
        "confidence": "authoritative",
        "regulatory_source": {"doc": "UDD amendment TEST-ONLY", "page_ref": "TEST-ONLY"},
        "transcription_origin": {"source": "TEST-ONLY UDD PDF", "confidence": "authoritative"},
    }


# ── shipped RMP config: now transcribed (base) + valid ──────────────────────
def test_rmp_config_loads_and_validates():
    cfg = load_config(_CONFIG / "rmp_2015.json")
    assert cfg["status"] == "partial-verified"
    # base transcribed from the primary PDF -> config carries an authoritative origin + G.O. ref
    assert cfg["transcription_origin"]["confidence"] == "authoritative"
    assert cfg["regulatory_source"]["doc"].startswith("RMP-2015")
    assert "UDD 540" in cfg["regulatory_source"]["page_ref"]  # G.O. grounded from the PDF
    assert len(cfg["far_tables"]) == 9
    assert cfg["cells"] == []  # legacy uniform-key block unused
    assert lookup_cell(cfg, "Residential", "II", 12.0, 300.0) is None  # legacy block empty


def test_rmp_far_lookup_known_answers():
    """Known-answer cells read from the primary RMP-2015 tables."""
    cfg = load_config(_CONFIG / "rmp_2015.json")
    # Residential (Main) Table 10: plot 1500 sqm -> FAR 2.50 / GC 0.60 (keyed by plot size)
    r = lookup_far(cfg, "Residential", "Main", plot_size_sqm=1500)
    assert r["far"] == 2.50 and r["ground_coverage"] == 0.60
    # Commercial (Business) Table 14: road 20 m -> FAR 2.50 / GC 0.45 (keyed by road width)
    c = lookup_far(cfg, "Commercial", "Business", road_width_m=20.0)
    assert c["far"] == 2.50 and c["ground_coverage"] == 0.45
    # Commercial (Central) Table 13: flat -> FAR 2.50 / GC 0.75
    f = lookup_far(cfg, "Commercial", "Central")
    assert f["far"] == 2.50 and f["ground_coverage"] == 0.75
    # Ring is NOT a base-FAR key: the same plot resolves without a ring argument.
    assert lookup_far(cfg, "Residential", "Main", plot_size_sqm=200)["far"] == 1.75


def test_rmp_far_lookup_miss_returns_none():
    cfg = load_config(_CONFIG / "rmp_2015.json")
    # No table for this zone -> None (caller must fall back, never a default).
    assert lookup_far(cfg, "Green Belt", None, plot_size_sqm=500) is None


def test_rmp_governing_setbacks_base_governs():
    """Table 9 (high-rise) known answers; the 2025 amendments are non-governing."""
    cfg = load_config(_CONFIG / "rmp_2015.json")
    assert governing_setbacks(cfg, height_m=14.0, plot_size_sqm=1000)["front"] == 5.00
    assert governing_setbacks(cfg, height_m=55.0, plot_size_sqm=1000)["front"] == 16.00
    # low-rise needs a site dimension (Table 8 keys by width/depth)
    assert governing_setbacks(cfg, height_m=10.0, plot_size_sqm=300) is None
    assert governing_setbacks(cfg, height_m=10.0, plot_size_sqm=300, site_dim_m=5.0)["front"] == 1.0
    # plot > 4000 sqm low-rise -> flat 5 m
    assert governing_setbacks(cfg, height_m=10.0, plot_size_sqm=5000)["front"] == 5.0


def test_rmp_amendments_present_but_non_governing():
    cfg = load_config(_CONFIG / "rmp_2015.json")
    ams = {a["id"]: a for a in cfg["amendments"]}
    assert ams["nov-2025-small-plot-setback"]["status"] == "draft"
    assert all(a["governing"] is False for a in cfg["amendments"])  # neither is applied
    assert all(a["confidence"] == "inferred" for a in cfg["amendments"])  # unread -> not authoritative


def test_nbcs_template_empty_and_valid():
    cfg = load_config(_CONFIG / "nbcs_2026_fallback.json")
    assert cfg["cells"] == []
    # fallback config states its Karnataka enforceability up front:
    assert cfg["karnataka_adoption_status"].startswith("not_adopted_as_of")


# ── split-provenance ladder ─────────────────────────────────────────────────
def test_accepts_authoritative_cell_with_regulatory_source():
    validate_config(_meta([_authoritative_cell()]))


def test_opencity_origin_cannot_be_authoritative():
    c = _opencity_cell()
    c["confidence"] = "authoritative"
    with pytest.raises(RMPConfigError):
        validate_config(_meta([c]))


def test_opencity_origin_valid_as_inferred():
    validate_config(_meta([_opencity_cell()]))


# ── block↔cell inheritance ──────────────────────────────────────────────────
def test_authoritative_rejected_when_both_regs_null():
    with pytest.raises(RMPConfigError):
        validate_config(_meta([_authoritative_cell_no_reg()]))


def test_authoritative_inherits_block_regulatory_source():
    validate_config(
        _meta(
            [_authoritative_cell_no_reg()],
            block_reg={"doc": "TEST-ONLY block primary (not RMP)", "page_ref": "Tbl B p.1"},
        )
    )


def test_rejects_authoritative_without_regulatory_source():
    c = _authoritative_cell()
    c["regulatory_source"] = None
    with pytest.raises(RMPConfigError):
        validate_config(_meta([c]))


def test_rejects_sentinel_pageref():
    c = _authoritative_cell()
    c["regulatory_source"]["page_ref"] = "TODO"
    with pytest.raises(RMPConfigError):
        validate_config(_meta([c]))


def test_rejects_numeric_sentinel_far():
    c = _authoritative_cell()
    c["far"] = -1
    with pytest.raises(RMPConfigError):
        validate_config(_meta([c]))


def test_rejects_null_required_value():
    c = _authoritative_cell()
    c["ground_coverage"] = None
    with pytest.raises(RMPConfigError):
        validate_config(_meta([c]))


# ── derived (NBCS fallback) cells (Part C) ──────────────────────────────────
def test_derived_cell_wellformed_accepted():
    validate_config(_meta([_derived_cell()]))


def test_derived_cell_rejected_without_regulatory_source():
    c = _derived_cell()
    c["regulatory_source"] = None
    with pytest.raises(RMPConfigError):
        validate_config(_meta([c]))


def test_derived_cell_rejected_without_adoption_status():
    c = _derived_cell()
    c.pop("karnataka_adoption_status")
    with pytest.raises(RMPConfigError):
        validate_config(_meta([c]))


# ── dated amendment overlays (Part B) ───────────────────────────────────────
def test_amendment_wellformed_accepted():
    m = _meta([])
    m["amendments"] = [_amendment()]
    validate_config(m)


def test_amendment_sentinel_status_rejected():
    a = _amendment()
    a["status"] = "TODO"
    m = _meta([])
    m["amendments"] = [a]
    with pytest.raises(RMPConfigError):
        validate_config(m)


# ── golden-fixture guards ───────────────────────────────────────────────────
def _iter_cases(data: dict):
    for key in ("worked_examples", "band_edge_cases", "unit_conversion_cases", "rera_benchmarks", "cases"):
        yield from data.get(key, [])


@pytest.mark.parametrize("name", ["us084_far.json", "us085_premium.json"])
def test_fixture_no_unsourced_expected(name):
    """A filled expected value without a source is a guess — fail loud."""
    data = json.loads((_FIX / name).read_text(encoding="utf-8"))
    for case in _iter_cases(data):
        exp = case.get("expected") or {}
        filled = {k: v for k, v in exp.items() if v is not None}
        if filled:
            assert case.get("source") or case.get("source_url"), (
                f"{name}:{case.get('id')} has expected {list(filled)} but no source — "
                f"transcribe from the primary PDF or leave null (guess = P0)"
            )


@pytest.mark.parametrize("name", ["us084_far.json", "us085_premium.json"])
def test_fixtures_pending_are_flagged(name):
    """Untranscribed fixtures must be visibly PENDING, never silently passing."""
    data = json.loads((_FIX / name).read_text(encoding="utf-8"))
    pending = [
        c.get("id") for c in _iter_cases(data)
        if str(c.get("status", "")).upper().startswith("PENDING")
    ]
    if pending:
        pytest.skip(
            f"{name}: {len(pending)} fixtures PENDING TRANSCRIPTION from the primary PDF "
            f"before US-084/085 enable → {pending}"
        )
