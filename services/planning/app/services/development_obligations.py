# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-083 development obligations: mixed-use % + parking (ECS) + TIA flag.

COMPUTE ONLY WHAT RMP-2015 GIVES (each figure cites its table/reg/page from the primary PDF):
  * Parking ECS from the built-up area (achievable_far x plot) via Table 23 (Ch.8, p.48). Non-
    residential uses key by floor area (retail/office 50 sqm, restaurant 75, hotel 80, hospital 100,
    …) -> AUTHORITATIVE. Residential multi-dwelling is per-DU (row 13: 1 ECS / DU of 50-150 sqm +
    10% visitor); the ~1 ECS/100 sqm figure is a DERIVED proxy of that per-DU rule.
  * Mixed-use % from the zone's RMP-stated non-residential share (Residential-Main 20% reg 4.1.2 p.27;
    Residential-Mixed 30% reg 4.2.2 p.28; Integrated Township 40/60 reg 7.3 p.47).
  * Access-road adequacy by REUSING road_width_resolver (never recomputed) against the RMP minimum
    for the use.

NEVER FABRICATE. A use/zone the RMP does not cover, and the TIA trigger threshold (absent from
RMP-2015 Vol-III entirely), are surfaced as CHECKLIST items labelled 'unverified — confirm with
authority / bye-laws' — never a computed number. A guessed ECS rate is the same class of error as a
guessed FAR cell.

Reads the parking_norms + mixed_use_shares config blocks (authoritative, provenance-tracked); reuses
road_width_resolver. Pure (stdlib + config) -> deterministically testable offline.
"""

from __future__ import annotations

import math
from typing import Any

from app.services import road_width_resolver as rwr

_SANCTION = "subject to authority sanction — verify obligations with BBMP/BDA before design"
_TIA_NOTE = (
    "Traffic Impact Assessment (TIA): a TIA is LIKELY required for large / commercial / high-trip "
    "developments, but RMP-2015 Vol-III states NO trigger threshold or methodology — do NOT assume "
    "one. Confirm the trigger (built-up area / ECS / use) and scope with BBMP + DULT."
)

# RMP-stated minimum access-road width for a use/zone, with its citation. Where the RMP gives a
# minimum we can flag inadequacy; otherwise adequacy is left to the resolver's reg-3.8.i hard floor.
_USE_MIN_WIDTH_M: dict[str, tuple[float, str]] = {
    "integrated_township": (18.0, "reg 7.3, p.47 (Integrated Township min 18 m)"),
    "residential_multi_dwelling": (9.0, "reg 4.1.2 note c, p.27 (apartments need road > 9 m)"),
    "commercial_mutation_corridor": (12.0, "Table 15 min_frontage 12 m, p.32"),
}
_ACCESS_HARD_FLOOR_M = 3.5  # reg 3.8.i


def _use_spec(cfg: dict, use: str) -> dict | None:
    for u in (cfg.get("parking_norms") or {}).get("uses", []):
        if u.get("use") == use:
            return u
    return None


def _parking_citation(cfg: dict, row: int | None) -> str:
    reg = (cfg.get("parking_norms") or {}).get("regulatory_source") or {}
    base = f"{reg.get('doc', 'RMP-2015 Vol-III')} {reg.get('page_ref', 'Table 23, p.48')}".strip()
    return f"{base}" + (f", row {row}" if row else "")


def _checklist(item: str, reason: str, next_action: str, citation_gap: str) -> dict[str, Any]:
    return {
        "item": item, "status": "unverified", "reason": reason,
        "citation_gap": citation_gap, "next_action": next_action,
    }


def _parking(cfg: dict, use: str, built_up: float | None,
             avg_dwelling_size_sqm: float | None) -> tuple[dict[str, Any] | None, dict | None]:
    """Returns (parking_result, checklist_item_or_None). A use not in Table 23 -> checklist, no number."""
    if built_up is None:
        return ({
            "status": "unresolved", "use": use, "ecs_total": None, "ecs_main": None,
            "ecs_visitor": None, "basis": None, "confidence": "unresolved",
            "citation": _parking_citation(cfg, None), "built_up_area_sqm": None,
            "notes": ["provide built_up_area_sqm or (achievable_far + plot_area_sqm) to compute ECS"],
            "next_action": "resolve achievable FAR (via /planning/far) then re-run",
        }, None)

    spec = _use_spec(cfg, use)
    if spec is None:
        # Not in Table 23 -> checklist, never a fabricated rate.
        return (None, _checklist(
            f"Parking ECS for use '{use}'",
            f"use '{use}' is not one of the Table 23 parking categories — its ECS rate is not in "
            "the transcribed RMP-2015.",
            "confirm the parking standard for this use with BBMP bye-laws / Table 23 interpretation.",
            "Table 23 (Ch.8, p.48) has no row for this use",
        ))

    key = spec.get("key")
    if key == "per_floor_area_sqm":
        per = float(spec["per_sqm"])
        main = built_up / per
        visitor = main * float(cfg["parking_norms"].get("visitor_default_pct", 0.10))
        notes = [f"{spec.get('label', use)}: 1 ECS per {per:.0f} sqm floor area (Table 23 row "
                 f"{spec.get('table_row')})."]
        if spec.get("note"):
            notes.append(spec["note"])
        return ({
            "status": "resolved", "use": use,
            "ecs_main": round(main, 1), "ecs_visitor": round(visitor, 1),
            "ecs_total": math.ceil(main + visitor),
            "basis": f"1 ECS / {per:.0f} sqm floor area + {int(cfg['parking_norms'].get('visitor_default_pct',0.1)*100)}% visitor",
            "confidence": "authoritative",
            "citation": _parking_citation(cfg, spec.get("table_row")),
            "built_up_area_sqm": round(built_up, 1), "notes": notes, "next_action": None,
        }, None)

    # residential multi-dwelling (per-DU rule; per-area proxy is derived)
    proxy = float(spec.get("per_area_proxy_sqm", 100))
    visitor_pct = float(spec.get("visitor_pct", 0.10))
    main_proxy = built_up / proxy
    notes = [f"Row {spec.get('table_row')}: 1 ECS per dwelling unit of 50-150 sqm; DU < 50 sqm -> 1 "
             f"ECS per 2 DU. Modelled here as ~1 ECS / {proxy:.0f} sqm floor area (DERIVED proxy of "
             "the per-DU rule).",
             f"visitor share {int(visitor_pct*100)}% is authoritative (row 13C)."]
    confidence = "derived"
    main = main_proxy
    if avg_dwelling_size_sqm is not None and avg_dwelling_size_sqm > 0:
        n_du = built_up / avg_dwelling_size_sqm
        main = n_du if avg_dwelling_size_sqm >= 50 else n_du / 2.0
        confidence = "authoritative"
        notes.append(f"avg dwelling {avg_dwelling_size_sqm:.0f} sqm -> ~{n_du:.1f} DUs -> "
                     f"{main:.1f} ECS by the exact per-DU rule.")
    visitor = main * visitor_pct
    return ({
        "status": "resolved", "use": use,
        "ecs_main": round(main, 1), "ecs_visitor": round(visitor, 1),
        "ecs_total": math.ceil(main + visitor),
        "basis": f"~1 ECS / dwelling unit + {int(visitor_pct*100)}% visitor",
        "confidence": confidence, "citation": _parking_citation(cfg, spec.get("table_row")),
        "built_up_area_sqm": round(built_up, 1), "notes": notes, "next_action": None,
    }, None)


def _mixed_use(cfg: dict, zone: str | None, sub_zone: str | None,
               built_up: float | None) -> tuple[dict[str, Any] | None, dict | None]:
    """Zone-permitted non-residential share, or a checklist item where the RMP states none."""
    for z in (cfg.get("mixed_use_shares") or {}).get("zones", []):
        if z.get("zone") == zone and (z.get("sub_zone") == sub_zone or z.get("sub_zone") is None and sub_zone is None):
            pct = float(z["non_residential_max_pct"])
            return ({
                "status": "resolved", "zone": zone, "sub_zone": sub_zone,
                "non_residential_max_pct": pct,
                "non_residential_max_sqm": round(pct * built_up, 1) if built_up is not None else None,
                "residential_pct": z.get("residential_pct"),
                "split": z.get("split"),
                "basis": z.get("basis"), "confidence": "authoritative",
                "citation": z.get("citation"),
            }, None)
    return (None, _checklist(
        f"Mixed-use split for zone '{zone}/{sub_zone}'",
        "the RMP-2015 states no fixed non-residential % for this zone (only Residential-Main 20%, "
        "Residential-Mixed 30%, and Integrated Township 40/60 are specified).",
        "confirm the permitted mixed-use split with the authority / applicable bye-laws.",
        "no mixed_use_shares row for this zone",
    ))


def _access_adequacy(inp: dict, cfg: dict, zone: str, sub_zone: str | None,
                     use: str) -> dict[str, Any]:
    """REUSE road_width_resolver (never recompute); flag if the access road is below the RMP minimum
    for the use."""
    rw = rwr.resolve_road_width(inp, cfg=cfg, zone=zone, sub_zone=sub_zone)
    width = rw.get("value_m")
    min_key = use if use in _USE_MIN_WIDTH_M else (
        "integrated_township" if zone == "Integrated Township" else
        "commercial_mutation_corridor" if sub_zone == "Mutation Corridor" else None)
    min_m, min_cite = _USE_MIN_WIDTH_M.get(min_key, (_ACCESS_HARD_FLOOR_M, "reg 3.8.i, p.— (access hard floor 3.5 m)"))

    if rw.get("status") == "unresolved" or width is None:
        adequate: bool | None = None
        reason = "road width unresolved — access adequacy cannot be judged (absence is not adequacy)."
    else:
        adequate = width >= min_m
        reason = (None if adequate else
                  f"access width {width} m is BELOW the {min_m} m minimum for this use ({min_cite}).")
    return {
        "status": rw.get("status"), "width_m": width, "band": rw.get("band"),
        "confidence": rw.get("confidence"), "adequate": adequate,
        "min_required_m": min_m, "min_citation": min_cite,
        "floor_area_cap": rw.get("floor_area_cap"),
        "reg_basis": rw.get("reg_basis", []),
        "reason": reason, "next_action": rw.get("next_action"),
    }


def build_obligations(inp: dict, *, cfg: dict) -> dict[str, Any]:
    """Assemble mixed-use % + parking ECS + access adequacy + the checklist. See module docstring."""
    zone = inp.get("zone")
    sub_zone = inp.get("sub_zone")
    use = inp.get("use_type") or "residential_multi_dwelling"
    plot_area = inp.get("plot_area_sqm")
    achievable_far = inp.get("achievable_far")
    built_up = inp.get("built_up_area_sqm")
    if built_up is None and achievable_far is not None and plot_area is not None:
        built_up = float(achievable_far) * float(plot_area)

    checklist: list[dict[str, Any]] = []

    parking, p_check = _parking(cfg, use, built_up, inp.get("avg_dwelling_size_sqm"))
    if p_check:
        checklist.append(p_check)
    mixed, m_check = _mixed_use(cfg, zone, sub_zone, built_up)
    if m_check:
        checklist.append(m_check)
    access = _access_adequacy(inp, cfg, zone or "Residential", sub_zone, use)

    # TIA: ALWAYS a checklist obligation — threshold genuinely absent from RMP-2015 Vol-III.
    likely = (built_up is not None and built_up >= 20000) or use in (
        "retail", "office", "hotel", "hospital", "commercial_mutation_corridor")
    checklist.append(_checklist(
        "Traffic Impact Assessment (TIA)",
        _TIA_NOTE + (" This development's scale/use makes a TIA LIKELY." if likely else ""),
        "confirm the TIA trigger + scope with BBMP / DULT before sanction.",
        "RMP-2015 Vol-III states no TIA threshold",
    ))

    computed = sum(1 for x in (parking, mixed) if x and x.get("status") == "resolved")
    return {
        "status": "resolved",
        "built_up_area_sqm": round(built_up, 1) if built_up is not None else None,
        "parking": parking,
        "mixed_use": mixed,
        "access_adequacy": access,
        "checklist": checklist,
        "computed_count": computed,
        "checklist_count": len(checklist),
        "data_source": "RMP-2015 Vol-III (Table 23 parking p.48; mixed-use reg 4.1/4.2/7.3) + "
        "road_width_resolver",
        "disclaimer": _SANCTION,
    }
