# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Sprint-0 B/C harness smoke — RMP/NBCS config validator + golden-fixture guards.

Proves the guardrails with ZERO authoritative data:
  - the shipped RMP/NBCS templates are empty + valid; lookup on an empty config → None;
  - the validator REJECTS a sentinel page_ref, a numeric-sentinel FAR, and a null required
    value (a guess must fail loud, never default);
  - split-provenance ladder: an OpenCity-origin cell CANNOT pass as 'authoritative', but is
    accepted as 'inferred'; an 'authoritative' cell requires a non-null regulatory_source;
  - block↔cell inheritance: an authoritative cell with no cell-level regulatory_source is
    REJECTED when the block is also null, but ACCEPTED when it inherits a block citation;
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
    load_config,
    lookup_cell,
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
    """Authoritative cell WITH its own primary regulatory_source (TEST-ONLY synthetic)."""
    return {
        **_cell_body(),
        "confidence": "authoritative",
        "regulatory_source": {"doc": "TEST-ONLY primary (not RMP)", "page_ref": "Tbl X p.99"},
        "transcription_origin": {"source": "TEST-ONLY primary PDF", "confidence": "authoritative"},
    }


def _authoritative_cell_no_reg() -> dict:
    """Authoritative cell that OMITS regulatory_source (relies on block inheritance)."""
    return {
        **_cell_body(),
        "confidence": "authoritative",
        "transcription_origin": {"source": "TEST-ONLY primary PDF", "confidence": "authoritative"},
    }


def _opencity_cell() -> dict:
    """Digitized OpenCity cell — no regulatory_source. Caller sets confidence."""
    return {
        **_cell_body(),
        "confidence": "inferred",
        "regulatory_source": None,
        "transcription_origin": {
            "source": "OpenCity bda-revised-master-plan-2015",
            "confidence": "inferred",
        },
    }


# ── shipped templates are empty + valid ─────────────────────────────────────
def test_rmp_template_empty_and_valid():
    cfg = load_config(_CONFIG / "rmp_2015.json")
    assert cfg["status"] == "template-empty"
    assert cfg["cells"] == []
    # config block is honestly 'inferred' origin (OpenCity), no primary yet:
    assert cfg["transcription_origin"]["confidence"] == "inferred"
    assert cfg["regulatory_source"] is None
    # an empty config never invents a cell:
    assert lookup_cell(cfg, "Residential", "II", 12.0, 300.0) is None


def test_nbcs_template_empty_and_valid():
    cfg = load_config(_CONFIG / "nbcs_2026_fallback.json")
    assert cfg["cells"] == []


# ── split-provenance ladder ─────────────────────────────────────────────────
def test_accepts_authoritative_cell_with_regulatory_source():
    validate_config(_meta([_authoritative_cell()]))  # must not raise


def test_opencity_origin_cannot_be_authoritative():
    """An OpenCity-only cell tagged authoritative must be REJECTED (no laundering)."""
    c = _opencity_cell()
    c["confidence"] = "authoritative"  # claim it, but there is no regulatory_source
    with pytest.raises(RMPConfigError):
        validate_config(_meta([c]))


def test_opencity_origin_valid_as_inferred():
    """The same OpenCity cell is fine at 'inferred' confidence."""
    validate_config(_meta([_opencity_cell()]))  # must not raise


# ── block↔cell regulatory_source inheritance (the HARDEN guard) ─────────────
def test_authoritative_rejected_when_both_regs_null():
    """Authoritative cell + null cell reg + null block reg → REJECTED."""
    with pytest.raises(RMPConfigError):
        validate_config(_meta([_authoritative_cell_no_reg()]))  # block reg absent → null


def test_authoritative_inherits_block_regulatory_source():
    """Authoritative cell that omits its reg is ACCEPTED when it inherits a block citation."""
    validate_config(
        _meta(
            [_authoritative_cell_no_reg()],
            block_reg={"doc": "TEST-ONLY block primary (not RMP)", "page_ref": "Tbl B p.1"},
        )
    )  # must not raise


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


# ── golden-fixture guards ───────────────────────────────────────────────────
def _iter_cases(data: dict):
    for key in ("worked_examples", "band_edge_cases", "unit_conversion_cases", "rera_benchmarks", "cases"):
        for case in data.get(key, []):
            yield case


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
