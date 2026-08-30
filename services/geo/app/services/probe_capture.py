# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Validator for the Phase-0 KGIS live-probe capture fixture.

The capture (``tests/fixtures/kgis_probe_capture.json``) is EMPTY + PENDING until a human
on a KGIS-whitelisted IP runs ``scripts/kgis_probe.py`` and pastes the raw responses back.
The build agent cannot run the probes (egress blocked) — so there are NO fabricated sample
responses.

This validator:
  * checks the capture STRUCTURE;
  * for each CAPTURED probe, evaluates its pass criterion (e.g. P1: does the L5
    ``KGISVillageID`` equal the integer id ``geomForSurveyNum`` actually accepted?) →
    ``pass`` or ``fail`` (loud);
  * leaves un-captured probes ``pending`` — never silently green.
"""

from __future__ import annotations

from typing import Any

_PROBES = ("P1_villageid_equivalence", "P2_field_names", "P3_cadastral_offset", "P4_P6_boundaries")
_GBA_NOTIFICATION = "2025-05-15"  # boundaries must be >= this (post-GBA)


class ProbeCaptureError(ValueError):
    """The capture file is structurally invalid."""


def validate_structure(cap: Any) -> dict:
    if not isinstance(cap, dict):
        raise ProbeCaptureError("capture root must be an object")
    if "probes" not in cap or not isinstance(cap["probes"], dict):
        raise ProbeCaptureError("missing 'probes' object")
    for name in _PROBES:
        pr = cap["probes"].get(name)
        if not isinstance(pr, dict) or "captured" not in pr:
            raise ProbeCaptureError(f"probe '{name}' missing or has no 'captured' flag")
        if not isinstance(pr["captured"], bool):
            raise ProbeCaptureError(f"probe '{name}'.captured must be bool")
    return cap


def _eval_p1(pr: dict) -> tuple[str, str]:
    l5 = pr.get("l5_KGISVillageID")
    accepted = pr.get("geom_accepted_id")
    status = str(pr.get("geom_status") or "")
    if l5 in (None, "") or accepted in (None, ""):
        return "fail", "captured but l5_KGISVillageID / geom_accepted_id empty"
    if status != "200":
        return "fail", f"geomForSurveyNum did not return 200 (got {status!r})"
    if str(l5) != str(accepted):
        return "fail", f"KGISVillageID ({l5}) != id geomForSurveyNum accepted ({accepted}) — equivalence FALSE"
    return "pass", f"KGISVillageID {l5} == geomForSurveyNum accepted id (200)"


def _eval_p4_p6(pr: dict) -> tuple[str, str]:
    vintage = str(pr.get("vintage") or "")
    if not vintage:
        return "fail", "captured but vintage empty"
    if vintage < _GBA_NOTIFICATION:
        return "fail", f"boundary vintage {vintage} < GBA notification {_GBA_NOTIFICATION} (stale/pre-GBA)"
    return "pass", f"boundaries present, vintage {vintage} >= {_GBA_NOTIFICATION}"


_EVALUATORS = {"P1_villageid_equivalence": _eval_p1, "P4_P6_boundaries": _eval_p4_p6}


def evaluate(cap: dict) -> dict:
    """Return {probe: {state: pass|fail|pending|captured, detail}}. No fabrication."""
    validate_structure(cap)
    out: dict[str, dict] = {}
    for name in _PROBES:
        pr = cap["probes"][name]
        if not pr.get("captured"):
            out[name] = {"state": "pending", "detail": "PENDING LIVE CAPTURE (run scripts/kgis_probe.py on a whitelisted IP)"}
            continue
        evaluator = _EVALUATORS.get(name)
        if evaluator is None:
            out[name] = {"state": "captured", "detail": "captured (no automated criterion — review raw)"}
        else:
            state, detail = evaluator(pr)
            out[name] = {"state": state, "detail": detail}
    return out


def pending_probes(cap: dict) -> list[str]:
    return [n for n, r in evaluate(cap).items() if r["state"] == "pending"]
