# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""RMP-2015 / NBCS-2026 buildable-envelope config: loader + strict validator.

Sprint-0 B/C CONTAINER — holds NO authoritative values yet. The shipped configs are empty
templates; cells are transcribed from the primary RMP-2015 Vol-III (IndiaCode) / SP 7:2026
(BIS gazette) PDFs later (see ``app/config/README.md``).

Provenance is SPLIT so the confidence ladder cannot be laundered:
  * ``regulatory_source``   = the PRIMARY citation ({doc, page_ref, url}).
  * ``transcription_origin``= where the value was actually read THIS time ({source,
                              confidence, url}). MAY be OpenCity, which is ``inferred``.

Block↔cell precedence: an ``authoritative``/``derived`` cell resolves its ``regulatory_source``
from the CELL if present, else INHERITED from the config block. Both null/sentinel -> reject.

Tiers (config-cell subset of the Accuracy-Contract ladder):
  * ``authoritative`` — transcribed from the primary RMP-2015 tables. Requires regulatory_source.
  * ``derived``       — NBCS-2026 fallback (SP 7:2026): a national standard, ADVISORY in
                        Karnataka until adopted into bye-laws. Requires regulatory_source +
                        a ``karnataka_adoption_status``. Never label a fallback authoritative.
  * ``inferred``      — OpenCity / non-primary digitization. No regulatory_source required.

Dated overlays (Part B): ``amendments[]`` model a dated modification of a base cell (e.g. the
11-Nov-2025 UDD small-plot setback amendment) — current/strictest governs; the base cell is
never overwritten. The validator checks structure; values still come from the primary.

The validator's whole job is to make a GUESS — or a laundered fallback — fail loud. Not yet
wired into ``planning_service`` — that is US-084.
"""

from __future__ import annotations

import json
import math
import re
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
_TIERS = {"authoritative", "derived", "inferred"}
_SOURCED_TIERS = {"authoritative", "derived"}  # tiers that require a regulatory_source
_REQUIRED_META = ("config_version", "status", "cells", "transcription_origin")
_REQUIRED_AMENDMENT = ("effective_date", "applies_to", "supersedes", "status")

# Gate-0: the RMP does NOT key FAR uniformly by [zone x ring x road x plot]. Base FAR comes
# from per-zone tables with DIFFERENT key shapes; ring is only a MODIFIER (Additional-FAR
# reg 3.4.v + TDR), and setbacks are a SEPARATE height/plot-keyed system (Table 8/9). The
# far_tables[] / far_modifiers / setback_rules blocks model that; the legacy cells[] block
# (rigid uniform key) is retained for back-compat but is not used by the RMP-2015 config.
_KEY_TYPES = {"plot_size", "road_width", "flat"}
_SETBACK_SIDES = ("front", "rear", "left", "right")


def _check_setback_value(cid: str, field: str, v: Any) -> None:
    """A setback is metres (number >= 0) OR a percentage string like '8%'/'12%' (Table 8
    keys the >9 m band as a percent of width/depth, not a fixed metre value)."""
    if isinstance(v, str):
        if not re.fullmatch(r"\d+(\.\d+)?%", v.strip()):
            raise RMPConfigError(f"{cid}: {field}={v!r} is neither metres nor a 'NN%' string")
        return
    _check_number(cid, field, v, lo=0.0)


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
    present, must be a valid tier. Does NOT check regulatory_source — resolved with
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


def _resolve_regulatory_source(obj: dict, block_reg: Any) -> Any:
    """Cell/amendment regulatory_source overrides; else inherit the config block."""
    own = obj.get("regulatory_source")
    return own if own is not None else block_reg


def _validate_cell(cell: Any, idx: int, block_reg: Any) -> None:
    if not isinstance(cell, dict):
        raise RMPConfigError(f"cell[{idx}] is not an object")
    zone, ring = cell.get("zone"), cell.get("ring")
    cid = f"cell[{idx}] {zone}/{ring}"
    if zone not in _ZONES:
        raise RMPConfigError(f"{cid}: unknown zone {zone!r}")
    if ring not in _RINGS:
        raise RMPConfigError(f"{cid}: ring must be I|II|III, got {ring!r}")

    conf = cell.get("confidence")
    if conf not in _TIERS:
        raise RMPConfigError(f"{cid}: cell confidence must be one of {sorted(_TIERS)}")
    _check_origin_and_confidence(cid, cell)

    if conf in _SOURCED_TIERS and not _regulatory_source_ok(_resolve_regulatory_source(cell, block_reg)):
        raise RMPConfigError(
            f"{cid}: confidence='{conf}' requires a non-null regulatory_source (doc + page_ref) "
            f"on the cell OR inherited from the config block — both are null/sentinel. An "
            f"OpenCity/inferred-only source cannot be authoritative or derived."
        )
    # A derived (NBCS fallback) cell must state its Karnataka enforceability, since SP 7:2026
    # is advisory until adopted into bye-laws.
    if conf == "derived" and not _nonempty(cell.get("karnataka_adoption_status")):
        raise RMPConfigError(
            f"{cid}: a 'derived' (NBCS fallback) cell must carry karnataka_adoption_status "
            f"(SP 7:2026 is advisory until state adoption)"
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


def _validate_amendment(a: Any, idx: int, block_reg: Any) -> None:
    """Dated overlay on a base cell (Part B). Structure-only; amended values follow the
    same rules as a cell when populated. Empty ``amendments`` is fine."""
    if not isinstance(a, dict):
        raise RMPConfigError(f"amendment[{idx}] is not an object")
    aid = a.get("id") or f"amendment[{idx}]"
    for f in _REQUIRED_AMENDMENT:
        if not _nonempty(a.get(f)):
            raise RMPConfigError(f"{aid}: missing/sentinel {f}")
    _check_origin_and_confidence(aid, a)
    if a.get("confidence") in _SOURCED_TIERS and not _regulatory_source_ok(
        _resolve_regulatory_source(a, block_reg)
    ):
        raise RMPConfigError(f"{aid}: {a.get('confidence')} amendment requires a regulatory_source")


def _validate_far_row(row: Any, tid: str, idx: int, key_type: str) -> None:
    if not isinstance(row, dict):
        raise RMPConfigError(f"{tid} row[{idx}] is not an object")
    rid = f"{tid} row[{idx}]"
    _check_number(rid, "far", row.get("far"), lo=0.0)
    if row.get("far") == 0:
        raise RMPConfigError(f"{rid}: far must be > 0")
    _check_number(rid, "ground_coverage", row.get("ground_coverage"), lo=0.0, hi=1.0)
    if row.get("ground_coverage") == 0:
        raise RMPConfigError(f"{rid}: ground_coverage must be > 0")
    # The band that KEYS this table is required; the other is optional/informational.
    if key_type == "plot_size":
        _check_band(rid, "plot_size_band_sqm", row.get("plot_size_band_sqm"))
    elif key_type == "road_width":
        _check_band(rid, "road_width_band_m", row.get("road_width_band_m"))
    # flat: no band required (single value)
    if "setbacks_inline" in row:  # e.g. Industrial (General) Table 16 carries its own setbacks
        sb = row["setbacks_inline"]
        if not isinstance(sb, dict):
            raise RMPConfigError(f"{rid}: setbacks_inline must be an object")
        for side, val in sb.items():
            _check_setback_value(rid, f"setbacks_inline.{side}", val)


def _validate_far_table(t: Any, idx: int, block_reg: Any) -> None:
    if not isinstance(t, dict):
        raise RMPConfigError(f"far_tables[{idx}] is not an object")
    tid = f"far_tables[{idx}] {t.get('zone')}/{t.get('sub_zone')}"
    if not _nonempty(t.get("zone")):
        raise RMPConfigError(f"{tid}: zone missing/sentinel")
    key_type = t.get("key_type")
    if key_type not in _KEY_TYPES:
        raise RMPConfigError(f"{tid}: key_type must be one of {sorted(_KEY_TYPES)}, got {key_type!r}")
    conf = t.get("confidence")
    if conf not in _TIERS:
        raise RMPConfigError(f"{tid}: confidence must be one of {sorted(_TIERS)}")
    _check_origin_and_confidence(tid, t)
    if conf in _SOURCED_TIERS and not _regulatory_source_ok(_resolve_regulatory_source(t, block_reg)):
        raise RMPConfigError(f"{tid}: confidence='{conf}' requires a regulatory_source (doc + page_ref)")
    rows = t.get("rows")
    if not isinstance(rows, list) or not rows:
        raise RMPConfigError(f"{tid}: rows must be a non-empty list")
    if key_type == "flat" and len(rows) != 1:
        raise RMPConfigError(f"{tid}: key_type 'flat' must have exactly one row")
    for i, row in enumerate(rows):
        _validate_far_row(row, tid, i, key_type)


def _validate_far_modifiers(mods: Any, block_reg: Any) -> None:
    if not isinstance(mods, dict):
        raise RMPConfigError("far_modifiers must be an object")
    add = mods.get("additional_far_by_ring")
    if add is not None:
        if add.get("confidence") in _SOURCED_TIERS and not _regulatory_source_ok(
            _resolve_regulatory_source(add, block_reg)
        ):
            raise RMPConfigError("far_modifiers.additional_far_by_ring: needs a regulatory_source")
        for i, row in enumerate(add.get("rows", [])):
            rid = f"additional_far_by_ring row[{i}]"
            if row.get("ring") not in _RINGS:
                raise RMPConfigError(f"{rid}: ring must be I|II|III")
            _check_band(rid, "plot_size_band_sqm", row.get("plot_size_band_sqm"))
            # additional_far may be 0 (as-per-existing) but never negative/sentinel/null
            _check_number(rid, "additional_far", row.get("additional_far"), lo=0.0)
    override = mods.get("metro_terminal_override")
    if override is not None:
        if override.get("confidence") in _SOURCED_TIERS and not _regulatory_source_ok(
            _resolve_regulatory_source(override, block_reg)
        ):
            raise RMPConfigError("far_modifiers.metro_terminal_override: needs a regulatory_source")
        _check_number("metro_terminal_override", "radius_m", override.get("radius_m"), lo=0.0)
        _check_number("metro_terminal_override", "max_far", override.get("max_far"), lo=0.0)


def _validate_setback_rules(rules: Any, block_reg: Any) -> None:
    if not isinstance(rules, dict):
        raise RMPConfigError("setback_rules must be an object")
    base = rules.get("base") or {}
    t8 = base.get("table8_low_rise")
    if t8 is not None:
        for i, row in enumerate(t8.get("rows", [])):
            rid = f"setback_rules.table8 row[{i}]"
            _check_band(rid, "site_dim_band_m", row.get("site_dim_band_m"))
            for side in _SETBACK_SIDES:
                _check_setback_value(rid, side, row.get(side))
        if "over_4000_sqm_all_sides_m" in t8:
            _check_number("setback_rules.table8", "over_4000_sqm_all_sides_m",
                          t8["over_4000_sqm_all_sides_m"], lo=0.0)
    t9 = base.get("table9_by_height")
    if t9 is not None:
        for i, row in enumerate(t9.get("rows", [])):
            rid = f"setback_rules.table9 row[{i}]"
            _check_band(rid, "height_band_m", row.get("height_band_m"))
            _check_number(rid, "all_around_m", row.get("all_around_m"), lo=0.0)


def validate_config(cfg: Any) -> dict:
    """Return ``cfg`` unchanged if valid; raise :class:`RMPConfigError` otherwise."""
    if not isinstance(cfg, dict):
        raise RMPConfigError("config root must be an object")
    for meta in _REQUIRED_META:
        if meta not in cfg:
            raise RMPConfigError(f"missing top-level '{meta}'")
    _check_origin_and_confidence("config", cfg)

    block_reg = cfg.get("regulatory_source")
    if cfg.get("confidence") in _SOURCED_TIERS and not _regulatory_source_ok(block_reg):
        raise RMPConfigError(
            f"config: confidence='{cfg.get('confidence')}' requires a non-null regulatory_source"
        )

    cells = cfg["cells"]
    if not isinstance(cells, list):
        raise RMPConfigError("cells must be a list")
    for i, cell in enumerate(cells):
        _validate_cell(cell, i, block_reg)

    # Gate-0 blocks (optional; the RMP-2015 config uses these instead of cells[]).
    far_tables = cfg.get("far_tables", [])
    if not isinstance(far_tables, list):
        raise RMPConfigError("far_tables must be a list")
    for i, t in enumerate(far_tables):
        _validate_far_table(t, i, block_reg)
    if "far_modifiers" in cfg:
        _validate_far_modifiers(cfg["far_modifiers"], block_reg)
    if "setback_rules" in cfg:
        _validate_setback_rules(cfg["setback_rules"], block_reg)

    amendments = cfg.get("amendments", [])
    if not isinstance(amendments, list):
        raise RMPConfigError("amendments must be a list")
    for i, a in enumerate(amendments):
        _validate_amendment(a, i, block_reg)
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
    tagged derived) or return unresolved. Never synthesise a default here.
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


def _find_far_table(cfg: dict, zone: str, sub_zone: str | None) -> dict | None:
    for t in cfg.get("far_tables", []):
        if t.get("zone") == zone and (sub_zone is None or t.get("sub_zone") == sub_zone):
            return t
    return None


def lookup_far(
    cfg: dict, zone: str, sub_zone: str | None = None, *,
    road_width_m: float | None = None, plot_size_sqm: float | None = None,
) -> dict | None:
    """Return the matching FAR row (dispatching on the table's key_type), or ``None``.

    ``None`` = no RMP row for this key → the caller MUST fall back (NBCS-2026, derived) or
    return unresolved. Ring is NOT a key here (it only modifies via far_modifiers).
    """
    t = _find_far_table(cfg, zone, sub_zone)
    if t is None:
        return None
    key = t["key_type"]
    for row in t["rows"]:
        if key == "flat":
            return {**row, "_table": t}
        if key == "plot_size" and plot_size_sqm is not None and _in_band(plot_size_sqm, row["plot_size_band_sqm"]):
            return {**row, "_table": t}
        if key == "road_width" and road_width_m is not None and _in_band(road_width_m, row["road_width_band_m"]):
            return {**row, "_table": t}
    return None


def governing_setbacks(
    cfg: dict, *, height_m: float, plot_size_sqm: float, site_dim_m: float | None = None,
) -> dict | None:
    """Return the IN-FORCE base setback from setback_rules for a given height/plot.

    Amendments with ``governing: false`` (the unreadable/draft 2025 overlays) are NOT applied
    — the strictest IN-FORCE overlay governs, which here is the RMP-2015 base; a draft never
    supersedes the notified base. Returns ``None`` if no rule matches (never a default guess).

    Table 8 (height <= 11.5 m & plot <= 4000 sqm) keys by site width/depth, so ``site_dim_m``
    is required to pick a row there; plots > 4000 sqm use the flat 5 m rule. Table 9 keys by
    height. Values may be metres (number) or a '%'-of-dimension string (Table 8 >9 m band).
    """
    base = (cfg.get("setback_rules") or {}).get("base") or {}
    if height_m <= 11.5 and plot_size_sqm <= 4000:
        t8 = base.get("table8_low_rise") or {}
        if site_dim_m is None:
            return None  # cannot pick a Table 8 row without the site dimension
        for row in t8.get("rows", []):
            if _in_band(site_dim_m, row["site_dim_band_m"]):
                return {s: row.get(s) for s in _SETBACK_SIDES} | {"_source": "Table 8"}
        return None
    if height_m <= 11.5:  # plot > 4000 sqm
        t8 = base.get("table8_low_rise") or {}
        if "over_4000_sqm_all_sides_m" in t8:
            v = t8["over_4000_sqm_all_sides_m"]
            return {s: v for s in _SETBACK_SIDES} | {"_source": "Table 8 (>4000 sqm)"}
        return None
    for row in (base.get("table9_by_height") or {}).get("rows", []):
        if _in_band(height_m, row["height_band_m"]):
            v = row["all_around_m"]
            return {s: v for s in _SETBACK_SIDES} | {"_source": "Table 9"}
    return None
