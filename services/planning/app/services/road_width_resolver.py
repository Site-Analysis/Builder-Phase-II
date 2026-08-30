# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Road-width resolver (feeds US-084 FAR).

CORE PRINCIPLE: there is NO authoritative queryable road-width source. Per RMP-2015 reg 3.2
road width is the right-of-way (carriageway + footpath + drains) measured at right angles at
the plot centre — only a physical survey establishes it authoritatively. So this resolver
returns a BAND (or a RANGE across two bands) with a confidence tier; it never emits a
false-authoritative point, and it surfaces uncertainty rather than hiding it.

Best-available input tier wins, each carrying confidence + data_source + data_vintage:
  1. surveyed / manual entry       -> ``authoritative``
  2. MapTiler satellite measurement -> ``inferred`` + error_band_m (3-10 m; may be carriageway
                                       not RoW). THE DEFAULT when nothing better exists.
  3. KGIS road-layer width          -> only if a Phase-0-probe-confirmed field is populated;
                                       until the probe lands this tier returns nothing (never a guess).
  4. lane-count estimate            -> ``inferred`` (weakest): lanes*3.25 m + footpath/drain allowance.
  none -> unresolved (reason + next_action), never a default number.

Band structure comes from the Gate-0 config (``far_tables`` road-width rows), so it stays
correct once FAR values are filled; it does NOT need the transcribed FAR values to run.

Dependency-free (stdlib + rmp_loader). Not wired into planning_service yet — that is US-084.
"""

from __future__ import annotations

from typing import Any

# Confidence tiers (width) — deliberately distinct from the FAR ladder they PROPAGATE into.
WIDTH_AUTHORITATIVE = "authoritative"
WIDTH_INFERRED = "inferred"
WIDTH_UNRESOLVED = "unresolved"

# Canonical RMP road-width band edges (reg 3.4 tables). Used when the zone's own table is
# plot-keyed (road width still constrains FAR via reg 3.4.iii) or the config is unavailable.
_CANONICAL_EDGES = (9.0, 12.0, 18.0, 24.0, 30.0)

_EDGE_MARGIN_M = 1.0        # within this of a band edge -> survey_required (return both bands)
_LANE_WIDTH_M = 3.25        # per-lane carriageway assumption (reg-agnostic estimate)
_LANE_ALLOWANCE_M = 2.0     # footpath + drain allowance added to a lane-count estimate
_ACCESS_HARD_FLOOR_M = 3.5  # reg 3.8.i: access narrower than this caps floor area
_MAPTILER_ERROR_BAND_M = (3.0, 10.0)  # stated survey-to-satellite offset


def _edges_for_zone(cfg: dict | None, zone: str, sub_zone: str | None) -> tuple[float, ...]:
    """Sorted unique road-width band edges from the zone's far_table (road_width key), else
    the canonical RMP edge set. Reads STRUCTURE only — never the FAR values."""
    if cfg:
        for t in cfg.get("far_tables", []):
            if t.get("zone") == zone and (sub_zone is None or t.get("sub_zone") == sub_zone):
                if t.get("key_type") != "road_width":
                    break
                edges: set[float] = set()
                for row in t.get("rows", []):
                    band = row.get("road_width_band_m") or {}
                    for key in ("min", "max"):
                        v = band.get(key)
                        if isinstance(v, (int, float)) and v > 0:
                            edges.add(float(v))
                if edges:
                    return tuple(sorted(edges))
    return _CANONICAL_EDGES


def _band_for(width: float, edges: tuple[float, ...]) -> dict[str, float | None]:
    """The [min,max) band containing ``width`` given sorted edges (max=None on the open top)."""
    lo = 0.0
    for e in edges:
        if width < e:
            return {"min": lo, "max": e}
        lo = e
    return {"min": lo, "max": None}


def _nearest_edge(width: float, edges: tuple[float, ...]) -> float | None:
    """The band edge within ``_EDGE_MARGIN_M`` of ``width``, or None (clear of all edges)."""
    near = [e for e in edges if abs(width - e) <= _EDGE_MARGIN_M]
    return min(near, key=lambda e: abs(width - e)) if near else None


def _unresolved(reason: str, next_action: str) -> dict[str, Any]:
    return {
        "status": "unresolved",
        "value_m": None,
        "band": None,
        "confidence": WIDTH_UNRESOLVED,
        "data_source": None,
        "data_vintage": None,
        "error_band_m": None,
        "reg_basis": ["RMP-2015 Vol-III reg 3.2"],
        "survey_required": True,
        "band_range": None,
        "option_value": None,
        "floor_area_cap": None,
        "max_far_confidence": WIDTH_UNRESOLVED,
        "reason": reason,
        "next_action": next_action,
        "notes": [],
    }


def _pick_tier(inp: dict) -> dict | None:
    """Best-available width tier. Returns {value, confidence, data_source, data_vintage,
    error_band_m, notes} or None if no tier yields a value."""
    notes: list[str] = []

    # Corner / multi-frontage: RMP takes the ACCESS road; for two-road frontage the TWO WIDER
    # roads (reg 3.1 corner, 3.16.ix access). We resolve the governing single width = the
    # wider of the two widest frontages' governing measure, captured by the caller as the main
    # width; here we only note when multiple frontages were supplied.
    frontages = inp.get("frontage_roads_m") or []
    if len(frontages) >= 2:
        notes.append(
            "multi-frontage plot: per reg 3.1/3.16.ix the two wider roads govern; "
            f"widest frontage {max(frontages)} m used as the main road"
        )

    # 1. surveyed / manual -> authoritative
    if inp.get("surveyed_width_m") is not None:
        return {
            "value": float(inp["surveyed_width_m"]),
            "confidence": WIDTH_AUTHORITATIVE,
            "data_source": "manual/surveyed width (user-supplied)",
            "data_vintage": inp.get("survey_date"),
            "error_band_m": None,
            "notes": notes,
        }

    # 2. MapTiler satellite measurement -> inferred (THE DEFAULT)
    if inp.get("measured_width_m") is not None:
        notes.append(
            "MapTiler satellite measurement: 3-10 m survey offset; may be carriageway, "
            "not the full right-of-way (footpath + drains). Verify with a survey."
        )
        return {
            "value": float(inp["measured_width_m"]),
            "confidence": WIDTH_INFERRED,
            "data_source": "MapTiler satellite measurement (map draw-line)",
            "data_vintage": inp.get("imagery_date"),
            "error_band_m": list(_MAPTILER_ERROR_BAND_M),
            "notes": notes,
        }

    # 3. KGIS road layer -> only if a Phase-0-probe-confirmed field is populated
    if inp.get("kgis_width_m") is not None and inp.get("kgis_probe_confirmed"):
        return {
            "value": float(inp["kgis_width_m"]),
            "confidence": WIDTH_INFERRED,
            "data_source": "KGIS road-layer width (probe-confirmed field)",
            "data_vintage": inp.get("kgis_vintage"),
            "error_band_m": None,
            "notes": notes + ["KGIS width used (Phase-0 probe confirmed the width field)."],
        }

    # 4. lane-count estimate -> inferred (weakest)
    if inp.get("lane_count") is not None:
        lanes = int(inp["lane_count"])
        est = lanes * _LANE_WIDTH_M + _LANE_ALLOWANCE_M
        return {
            "value": est,
            "confidence": WIDTH_INFERRED,
            "data_source": "lane-count estimate",
            "data_vintage": None,
            "error_band_m": None,
            "notes": notes + [
                f"ESTIMATE ONLY: {lanes} lanes x {_LANE_WIDTH_M} m + {_LANE_ALLOWANCE_M} m "
                f"footpath/drain allowance = {est:.2f} m. Weakest tier — measure or survey."
            ],
        }
    return None


def _apply_service_roads(width: float, inp: dict, notes: list[str]) -> float:
    """reg 3.2.ii: where service roads run alongside the main road, aggregate service-road
    width(s) + main-road width for the FAR-determining width."""
    svc = inp.get("service_road_widths_m") or []
    total = sum(float(s) for s in svc)
    if total > 0:
        agg = width + total
        notes.append(
            f"reg 3.2.ii service-road aggregation: main {width} m + service {svc} "
            f"= {agg} m used for FAR."
        )
        return agg
    return width


def _option_value(
    cfg: dict | None, zone: str, sub_zone: str | None,
    band_lo: dict, band_hi: dict, plot_area_sqm: float | None,
    value_per_sqm: float | None, survey_cost: float | None,
) -> dict[str, Any]:
    """Quantify the cost of NOT surveying at a band edge: the FAR delta across the edge x plot
    area (extra saleable area), optionally monetised. FAR values may be PENDING in the config
    -> then only the structure is returned (far_* null), never a fabricated delta."""
    far_lo = _far_for_road_band(cfg, zone, sub_zone, band_lo)
    far_hi = _far_for_road_band(cfg, zone, sub_zone, band_hi)
    out: dict[str, Any] = {
        "far_low": far_lo,
        "far_high": far_hi,
        "far_delta": None,
        "extra_buildable_sqm": None,
        "extra_value": None,
        "survey_cost": survey_cost,
        "note": (
            "Option value = FAR gain across the band edge x plot area (extra saleable area), "
            "vs the survey cost. Survey when the extra value exceeds the survey cost."
        ),
    }
    if far_lo is not None and far_hi is not None:
        delta = round(abs(far_hi - far_lo), 4)
        out["far_delta"] = delta
        if plot_area_sqm is not None:
            extra = round(delta * plot_area_sqm, 2)
            out["extra_buildable_sqm"] = extra
            if value_per_sqm is not None:
                out["extra_value"] = round(extra * value_per_sqm, 2)
    else:
        out["note"] += " (FAR values PENDING transcription — delta not yet computable.)"
    return out


def _far_for_road_band(cfg: dict | None, zone: str, sub_zone: str | None, band: dict) -> float | None:
    """The FAR for a road-width band from the config, or None if not present/PENDING."""
    if not cfg:
        return None
    for t in cfg.get("far_tables", []):
        if t.get("zone") == zone and (sub_zone is None or t.get("sub_zone") == sub_zone):
            if t.get("key_type") != "road_width":
                return None
            for row in t.get("rows", []):
                rb = row.get("road_width_band_m") or {}
                if rb.get("min") == band.get("min") and rb.get("max") == band.get("max"):
                    far = row.get("far")
                    return float(far) if isinstance(far, (int, float)) else None
    return None


def resolve_road_width(
    inp: dict, *, cfg: dict | None = None, zone: str = "Residential", sub_zone: str | None = None,
) -> dict[str, Any]:
    """Resolve the best-available road width to a band (or edge-straddling range) with a
    confidence tier + reg-3.2 adjustments. See module docstring for the tier order.

    ``inp`` keys (all optional): surveyed_width_m, measured_width_m, kgis_width_m +
    kgis_probe_confirmed, lane_count, service_road_widths_m[], frontage_roads_m[],
    plot_area_sqm, saleable_value_per_sqm, survey_cost, *_date/vintage.
    """
    picked = _pick_tier(inp)
    if picked is None:
        return _unresolved(
            reason="no road-width input from any tier (survey / map measurement / probe-confirmed "
            "KGIS / lane count)",
            next_action="measure on the map (draw a perpendicular line across the road at the "
            "plot frontage) or enter a surveyed width",
        )

    notes = list(picked["notes"])
    width = _apply_service_roads(picked["value"], inp, notes)
    confidence = picked["confidence"]
    plot_area = inp.get("plot_area_sqm")

    edges = _edges_for_zone(cfg, zone, sub_zone)
    band = _band_for(width, edges)
    reg_basis = ["RMP-2015 Vol-III reg 3.2 (road width = RoW incl. footpath + drains)",
                 "reg 3.4.iii/iv (narrower road drops FAR to its band; wider road no bonus)"]

    result: dict[str, Any] = {
        "status": "resolved",
        "value_m": round(width, 3),
        "band": band,
        "confidence": confidence,
        "data_source": picked["data_source"],
        "data_vintage": picked["data_vintage"],
        "error_band_m": picked["error_band_m"],
        "reg_basis": reg_basis,
        "survey_required": False,
        "band_range": None,
        "option_value": None,
        "floor_area_cap": None,
        # confidence PROPAGATION: an inferred width can only yield a DERIVED FAR downstream;
        # only a surveyed (authoritative) width can yield an authoritative-tier FAR.
        "max_far_confidence": "authoritative" if confidence == WIDTH_AUTHORITATIVE else "derived",
        "reason": None,
        "next_action": None,
        "notes": notes,
    }

    # Edge-straddle -> return BOTH adjacent bands + survey prompt + option value (never pick one).
    edge = _nearest_edge(width, edges)
    if edge is not None:
        band_lo = _band_for(edge - _EDGE_MARGIN_M, edges)
        band_hi = _band_for(edge + _EDGE_MARGIN_M, edges)
        result["survey_required"] = True
        result["band_range"] = [band_lo, band_hi]
        result["option_value"] = _option_value(
            cfg, zone, sub_zone, band_lo, band_hi, plot_area,
            inp.get("saleable_value_per_sqm"), inp.get("survey_cost"),
        )
        result["notes"].append(
            f"width {round(width, 2)} m is within {_EDGE_MARGIN_M} m of the {edge} m band edge "
            f"-> straddles two FAR bands; survey to resolve (see option_value)."
        )

    # reg 3.8.i: access narrower than 3.5 m -> hard floor-area cap.
    if width < _ACCESS_HARD_FLOOR_M:
        result["floor_area_cap"] = {
            "residential_sqm": 150.0,
            "commercial_sqm": 50.0,
            "reg_basis": "RMP-2015 Vol-III reg 3.8.i",
        }
        result["notes"].append(
            f"access width {round(width, 2)} m < {_ACCESS_HARD_FLOOR_M} m -> reg 3.8.i hard "
            "floor-area cap (150 sqm residential / 50 sqm commercial) irrespective of FAR."
        )

    return result
