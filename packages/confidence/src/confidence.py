# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Canonical confidence ladder — the ONE vocabulary every SAT signal must speak (US-092 C4).

The US-092 composition dry-run found THREE confidence vocabularies across services (the same
divergent-vocabulary class as the P0 zone bug): the FAR/road-width ladder
{authoritative, derived, inferred, unresolved}, the authority service's off-ladder
{high, medium, low}, and the overlay STATUS axis {R, A, G, unresolved}. A verdict engine cannot
aggregate three vocabularies without silently mis-ranking a signal.

This module is the single source of truth for the ladder. Like `packages/flags`, services do NOT
import it at runtime (it is outside each service's Docker build context) — each service emits the
string values directly, and the cross-service guard `tests/confidence_vocabulary_guard.py` imports
THIS module and fails if any signal emits a value outside the ladder. That is what stops a fourth
vocabulary from ever appearing again.

CONFIDENCE and OVERLAY STATUS are DELIBERATELY separate axes:
  * Confidence  = how sure we are of an answer (the ladder below).
  * OverlayStatus (R/A/G/unresolved) = the deal-killer signal of a single overlay. RED is not a
    "confidence" — a RED buffer can be an AUTHORITATIVE answer. Never collapse status into confidence.
"""

from __future__ import annotations

from enum import StrEnum


class Confidence(StrEnum):
    """The accuracy ladder, strongest → weakest. `unresolved` = value withheld, never a guess."""

    AUTHORITATIVE = "authoritative"   # primary source / KGIS-live PIP / surveyed
    DERIVED = "derived"               # computed from an authoritative source, not directly verified
    INFERRED = "inferred"             # open-data / OSM / heuristic best-effort
    UNRESOLVED = "unresolved"         # no answer — absence is NOT a clear/pass


class OverlayStatus(StrEnum):
    """SEPARATE axis — a deal-killer overlay's signal, NOT a confidence value."""

    RED = "R"
    AMBER = "A"
    GREEN = "G"
    UNRESOLVED = "unresolved"


CONFIDENCE_VALUES: frozenset[str] = frozenset(c.value for c in Confidence)
OVERLAY_STATUS_VALUES: frozenset[str] = frozenset(s.value for s in OverlayStatus)

# Strength rank for "weakest wins" propagation in the verdict engine (higher = stronger).
CONFIDENCE_RANK: dict[str, int] = {
    Confidence.AUTHORITATIVE: 3,
    Confidence.DERIVED: 2,
    Confidence.INFERRED: 1,
    Confidence.UNRESOLVED: 0,
}

# Migration aid: the authority service's legacy {high, medium, low} → the ladder. `low` maps to
# `inferred` (best-effort admin-context / open-data), NOT `unresolved` — a real "no answer" case
# already used its own honest unresolved path.
LEGACY_TO_LADDER: dict[str, str] = {
    "high": Confidence.AUTHORITATIVE.value,
    "medium": Confidence.DERIVED.value,
    "low": Confidence.INFERRED.value,
}


def is_confidence(value: object) -> bool:
    """True iff `value` is a valid ladder string."""
    return isinstance(value, str) and value in CONFIDENCE_VALUES


def weakest(*values: str) -> str:
    """The weakest confidence among `values` (for verdict propagation). Unknown → unresolved."""
    if not values:
        return Confidence.UNRESOLVED.value
    return min(values, key=lambda v: CONFIDENCE_RANK.get(v, 0))
