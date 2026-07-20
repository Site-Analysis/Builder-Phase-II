# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""RMP-2015 / NBCS-2026 buildable-envelope config: loader + strict validator.

Sprint-0 B/C CONTAINER — holds NO authoritative values yet. The shipped configs are empty
templates; cells are transcribed from the primary RMP-2015 Vol-III / SP 7:2026 PDFs later
(see ``app/config/README.md``).

Provenance is SPLIT so the confidence ladder cannot be laundered:
  * ``regulatory_source``   = the PRIMARY citation ({doc, page_ref, url}) (RMP-2015 Vol-III /
                              gazette).
  * ``transcription_origin``= where the value was actually read THIS time ({source,
                              confidence, url}). MAY be OpenCity, which is ``inferred``.

Block↔cell precedence: an ``authoritative`` cell resolves its ``regulatory_source`` from the
CELL if present, else INHERITED from the config block. If BOTH are null/sentinel the cell is
rejected. Cell-level overrides the block; block-level applies only where the cell omits it.

The validator's whole job is to make a GUESS — or a laundered fallback — fail loud: it
REJECTS (raises RMPConfigError, never defaults). An OpenCity-only source can be ``inferred``
but NEVER ``authoritative``. Not yet wired into ``planning_service`` — that is US-084.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

# Strings that mean "not transcribed / guessed", never a real datum.
_SENTINEL_STRINGS = {
    "", "TODO", "TBD", "XXX", "FIXME", "PENDING", "PLACEHOLDER",
    "UNVERIFIED", "N/A", "NA", "?", "-",
}
# Numbers used as "no data" flags — never a real FAR / coverage / setback.
_SENTINEL_NUMBERS = {-1, -1.0, 999, -999, 9999, -9999}

_ZONES = {
    "Residential", "Commercial", "Industrial", "Mixed Use", "Institutional",
    "Agricultural", "Green Belt", "Water Body", "Restricted",
}
_RINGS = {"I", "II", "III"}
_TIERS = {"authoritative", "inferred"}
_REQUIRED_META = ("config_version", "status", "cells", "transcription_origin")


class RMPConfigError(ValueError):
    """A config/cell is missing provenance, carries a sentinel, or launders confidence."""


def _is_sentinel_str(v: Any) -> bool:
    return isinstance(v, str) and v.strip().upper() in {s.upper() for s in _SENTINEL_STRINGS}


def _nonempty(v: Any) -> bool:
    return bool(v) and not _is_sentinel_str(v)


def _check_number(
    cid: str, field: str, v: Any, *,
    lo: float | None = None, hi: float | None = None, allow_none: bool = False,
) -> None:
    if v is None:
        if allow_none:
            return
        raise RMPConfigError(f"{cid}: {field} is null (no data — cannot default)")
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise RMPConfigError(f"{cid}: {field} must be a number, got {v!r}")
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        raise RMPConfigError(f"{cid}: {field} is NaN/Inf")
    if v in _SENTINEL_NUMBERS:
        raise RMPConfigError(f"{cid}: {field}={v} is a sentinel placeholder")
    if lo is not None and v < lo:
        raise RMPConfigError(f"{cid}: {field}={v} < {lo}")
    if hi is not None and v > hi:
        raise RMPConfigError(f"{cid}: {field}={v} > {hi}")


def _check_band(cid: str, field: str, band: Any) -> None:
    if not isinstance(band, dict) or "min" not in band or "max" not in band:
        raise RMPConfigError(f"{cid}: {field} must be an object {{min,max}}")
    _check_number(cid, f"{field}.min", band["min"], lo=0)
    _check_number(cid, f"{field}.max", band["max"], lo=0, allow_none=True)  # null = open-ended


def _regulatory_source_ok(reg: Any) -> bool:
    """True only if reg is an object with a non-null, non-sentinel doc + page_ref."""
    return (
        isinstance(reg, dict)
        and _nonempty(reg.get("doc"))
        and _nonempty(reg.get("page_ref"))
    )


def _check_origin_and_confidence(cid: str, obj: dict) -> None:
    """transcription_origin required (non-sentinel source + valid tier); confidence, if
    present, must be a valid tier. Does NOT check regulatory_source — that is resolved with
    block↔cell inheritance by the caller."""
    origin = obj.get("transcription_origin")
    if not isinstance(origin, dict) or not _nonempty(origin.get("source")):
        raise RMPConfigError(f"{cid}: transcription_origin.source missing/sentinel")
    if origin.get("confidence") not in _TIERS:
        raise RMPConfigError(
            f"{cid}: transcription_origin.confidence must be one of {sorted(_TIERS)}"
        )
    conf = obj.get("confidence")
    if conf is not None and conf not in _TIERS:
        raise RMPConfigError(f"{cid}: confidence must be one of {sorted(_TIERS)}, got {conf!r}")


def _validate_cell(cell: Any, idx: int, block_reg: Any) -> None:
    if not isinstance(cell, dict):
        raise RMPConfigError(f"cell[{idx}] is not an object")
    zone, ring = cell.get("zone"), cell.get("ring")
    cid = f"cell[{idx}] {zone}/{ring}"
    if zone not in _ZONES:
        raise RMPConfigError(f"{cid}: unknown zone {zone!r}")
    if ring not in _RINGS:
        raise RMPConfigError(f"{cid}: ring must be I|II|III, got {ring!r}")

    if cell.get("confidence") not in _TIERS:
        raise RMPConfigError(f"{cid}: cell confidence must be 'authoritative'|'inferred'")
    _check_origin_and_confidence(cid, cell)

    if cell.get("confidence") == "authoritative":
        # Precedence: cell's own regulatory_source overrides; else inherit the config block.
        cell_reg = cell.get("regulatory_source")
        effective = cell_reg if cell_reg is not None else block_reg
        if not _regulatory_source_ok(effective):
            raise RMPConfigError(
                f"{cid}: confidence='authoritative' requires a non-null regulatory_source "
                f"(doc + page_ref) on the cell OR inherited from the config block — both are "
                f"null/sentinel. An OpenCity/inferred-only source cannot be authoritative."
            )

    _check_band(cid, "road_width_band_m", cell.get("road_width_band_m"))
    _check_band(cid, "plot_size_band_sqm", cell.get("plot_size_band_sqm"))
    _check_number(cid, "far", cell.get("far"), lo=0.0)
    if cell.get("far") == 0:
        raise RMPConfigError(f"{cid}: far must be > 0")
    _check_number(cid, "ground_coverage", cell.get("ground_coverage"), lo=0.0, hi=1.0)
    if cell.get("ground_coverage") == 0:
        raise RMPConfigError(f"{cid}: ground_coverage must be > 0")

    sb = cell.get("setbacks")
    if not isinstance(sb, dict):
        raise RMPConfigError(f"{cid}: setbacks missing")
    for f in ("front_m", "rear_m", "side_m"):
        _check_number(cid, f"setbacks.{f}", sb.get(f), lo=0.0)

    ecs = cell.get("ecs")
    if not isinstance(ecs, dict) or not _nonempty(ecs.get("basis")):
        raise RMPConfigError(f"{cid}: ecs.basis missing/sentinel")
    _check_number(cid, "ecs.value_per_100sqm", ecs.get("value_per_100sqm"), lo=0.0)

    _check_number(cid, "mixed_use_pct", cell.get("mixed_use_pct"), lo=0.0, hi=1.0, allow_none=True)


def validate_config(cfg: Any) -> dict:
    """Return ``cfg`` unchanged if valid; raise :class:`RMPConfigError` otherwise."""
    if not isinstance(cfg, dict):
        raise RMPConfigError("config root must be an object")
    for meta in _REQUIRED_META:
        if meta not in cfg:
            raise RMPConfigError(f"missing top-level '{meta}'")
    _check_origin_and_confidence("config", cfg)

    block_reg = cfg.get("regulatory_source")
    # A block that itself claims 'authoritative' cannot inherit from anywhere.
    if cfg.get("confidence") == "authoritative" and not _regulatory_source_ok(block_reg):
        raise RMPConfigError(
            "config: confidence='authoritative' requires a non-null regulatory_source (doc + page_ref)"
        )

    cells = cfg["cells"]
    if not isinstance(cells, list):
        raise RMPConfigError("cells must be a list")
    for i, cell in enumerate(cells):
        _validate_cell(cell, i, block_reg)
    return cfg


def load_config(path: str | Path) -> dict:
    """Load + validate a config file. Raises on any invalid / guessed / laundered cell."""
    cfg = json.loads(Path(path).read_text(encoding="utf-8"))
    return validate_config(cfg)


def _in_band(value: float, band: dict) -> bool:
    lo, hi = band.get("min"), band.get("max")
    if value < lo:
        return False
    return hi is None or value < hi


def lookup_cell(
    cfg: dict, zone: str, ring: str, road_width_m: float, plot_size_sqm: float,
) -> dict | None:
    """Return the matching cell, or ``None``.

    ``None`` means 'no RMP cell for this key' — the caller MUST fall back (NBCS-2026,
    tagged derived/fallback) or return unresolved. Never synthesise a default here.
    """
    for cell in cfg.get("cells", []):
        if (
            cell.get("zone") == zone
            and cell.get("ring") == ring
            and _in_band(road_width_m, cell["road_width_band_m"])
            and _in_band(plot_size_sqm, cell["plot_size_band_sqm"])
        ):
            return cell
    return None
