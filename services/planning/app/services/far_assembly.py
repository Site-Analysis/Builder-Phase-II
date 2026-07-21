# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-084 final assembly: permissible-vs-achievable FAR (two-line achievable).

The moat. A builder commits crores to this number, so the output is never a single figure:
  * permissible_far              — what the RMP table ALLOWS (lookup_far by the zone's key) plus
                                   applicable far_modifiers. "The rules permit."
  * achievable_base              — the table FAR after the road-band constraint (reg 3.4.iii) +
                                   envelope, what you build BY RIGHT today.
  * achievable_with_entitlements — achievable_base + QUALIFYING modifiers, each labelled with the
                                   condition it needs (Additional-FAR reg 3.4.v is a rule-based
                                   entitlement — fixed uplift, no discretion clause — conditioned on
                                   amalgamation/reconstitution approval; metro reg 3.16.ix is a
                                   conditional entitlement gated by station completion + BMRCL
                                   confirmation). A modifier joins the VALUE only when its eligibility
                                   inputs are satisfied; otherwise it is a labelled condition, not added.

HARD INVARIANT: achievable_base <= achievable_with_entitlements <= permissible_far on EVERY case —
asserted, fails loud (never silently clamped).

Confidence propagation (anti-laundering): permissible is authoritative only if the cell + modifiers
AND the zone are authoritative; an inferred zone or a PENDING modifier degrades it. achievable is no
more confident than its weakest input — an inferred road width (typical MapTiler measurement) makes
both lines at most derived, carrying the road-width error_band. A metro-applied or PENDING line is
capped at derived/conditional, never authoritative.

Composes PR-1 (lookup_far, governing_setbacks, far_modifiers) + PR-2 (road_width_resolver).
"""

from __future__ import annotations

from typing import Any

from app.config.rmp_loader import governing_setbacks, lookup_far
from app.services import road_width_resolver as rwr

_RANK = {"authoritative": 3, "derived": 2, "inferred": 1, "unresolved": 0}
_SANCTION = "subject to authority sanction — achievable FAR is what the authority approves"


def _weakest(*confs: str) -> str:
    return min(confs, key=lambda c: _RANK.get(c, 0))


def _in_band(value: float, band: dict) -> bool:
    lo, hi = band.get("min"), band.get("max")
    if value < lo:
        return False
    return hi is None or value < hi


def _citation(table: dict) -> str:
    reg = table.get("regulatory_source") or {}
    return f"{reg.get('doc', 'RMP-2015 Vol-III')} {reg.get('page_ref', '')}".strip()


def _road_bracket_far(cfg: dict, zone: str, sub_zone: str | None, width: float | None) -> float | None:
    """reg 3.4.iii: the FAR bracket for the ACTUAL road width in this zone's table, or None
    when the table carries no road bands (no road-based reduction modelled for that zone)."""
    if width is None:
        return None
    for t in cfg.get("far_tables", []):
        if t.get("zone") == zone and (sub_zone is None or t.get("sub_zone") == sub_zone):
            rows = [r for r in t.get("rows", []) if r.get("road_width_band_m")]
            if not rows:
                return None
            for r in rows:
                if _in_band(width, r["road_width_band_m"]):
                    return float(r["far"])
            return min(float(r["far"]) for r in rows)  # narrower than all listed -> lowest bracket
    return None


# ── entitlement evaluation (shared by permissible + every achievable line) ───
def _evaluate_entitlements(
    cfg: dict, *, ring: str | None, plot_area: float,
    additional_eligible: bool, within_metro_150m: bool, metro_confirmed: bool,
) -> dict[str, Any]:
    """Evaluate far_modifiers ONCE. Returns per-modifier labels + the additive uplift that is
    APPLIED (eligibility satisfied) + metro-applied flag + a has_pending flag. A conditional or
    PENDING modifier is labelled, NEVER added to the value."""
    mods = cfg.get("far_modifiers") or {}
    labels: list[dict[str, Any]] = []
    applied_additive = 0.0
    metro_applied = False
    metro_max = None
    has_pending = False

    # Additional-FAR by ring (reg 3.4.v): rule-based entitlement, fixed uplift.
    add = mods.get("additional_far_by_ring") or {}
    add_cite = _citation(add) if add.get("regulatory_source") else "reg 3.4.v"
    cond_addl = ("requires amalgamation/reconstitution approval, Ring I/II, "
                 "after the date of RMP-2015 approval")
    if additional_eligible and ring in ("I", "II"):
        matched = next((row for row in add.get("rows", [])
                        if row.get("ring") == ring and _in_band(plot_area, row["plot_size_band_sqm"])), None)
        if matched is not None:
            uplift = float(matched["additional_far"])
            applied_additive += uplift
            labels.append({"name": f"Additional-FAR (Ring {ring})", "additional_far": uplift,
                           "status": "applied", "condition": cond_addl, "citation": add_cite})
        else:
            has_pending = True  # e.g. Ring II >4000 sqm — blank in source
            labels.append({"name": f"Additional-FAR (Ring {ring})", "additional_far": None,
                           "status": "pending",
                           "condition": f"uplift for Ring {ring} at {plot_area} sqm is NOT specified "
                           "in the source — confirm with authority; NOT assumed as 0",
                           "citation": add_cite})
    elif additional_eligible and ring == "III":
        labels.append({"name": "Additional-FAR (Ring III)", "additional_far": 0.0, "status": "applied",
                       "condition": "as-per-existing FAR and Norms (no additional)", "citation": add_cite})

    # Metro-terminal override (reg 3.16.ix): conditional entitlement (station complete + BMRCL).
    override = mods.get("metro_terminal_override") or {}
    if within_metro_150m and override.get("max_far") is not None:
        mcite = _citation(override) if override.get("regulatory_source") else "reg 3.16.ix"
        if metro_confirmed:
            metro_applied = True
            metro_max = float(override["max_far"])
            labels.append({"name": "Metro-terminal override", "additional_far": None,
                           "status": "applied", "citation": mcite,
                           "condition": f"BMRCL-confirmed + station complete -> max FAR {metro_max}"})
        else:
            labels.append({"name": "Metro-terminal override", "additional_far": None,
                           "status": "conditional", "citation": mcite,
                           "condition": "requires BMRCL confirmation + station completion; "
                           "till then existing regulations apply (NOT added)"})

    return {"labels": labels, "applied_additive": applied_additive,
            "metro_applied": metro_applied, "metro_max": metro_max, "has_pending": has_pending}


def _far_after(base_line: float, ent: dict) -> float:
    """Apply the APPLIED entitlements to a base FAR line: additive uplift, then the metro flat
    override (max FAR, irrespective of table). Conditional/pending modifiers are excluded."""
    v = base_line + ent["applied_additive"]
    if ent["metro_applied"] and ent["metro_max"] is not None:
        v = max(v, ent["metro_max"])
    return v


def _unresolved(reason: str, next_action: str) -> dict[str, Any]:
    return {
        "status": "unresolved", "permissible_far": None, "achievable_base": None,
        "achievable_with_entitlements": None, "achievable_matrix": None, "entitlements": [],
        "ground_coverage": None, "setbacks": None, "road_width": None, "invariant_ok": True,
        "reason": reason, "next_action": next_action, "notes": [], "disclaimer": _SANCTION,
    }


def _far_value(value: float | None, confidence: str, *, source: str | None, vintage: str | None,
               citation: str, notes: list[str], **extra: Any) -> dict[str, Any]:
    return {
        "value": None if value is None else round(value, 4),
        "confidence": confidence, "data_source": source, "data_vintage": vintage,
        "rule_citation": citation, "notes": notes, "disclaimer": _SANCTION, **extra,
    }


def assemble_far(inp: dict, *, cfg: dict) -> dict[str, Any]:
    """Compose permissible + two-line achievable. See module docstring for the invariants."""
    zone = inp.get("zone")
    sub_zone = inp.get("sub_zone")
    plot_area = inp.get("plot_area_sqm")
    if not zone or plot_area is None:
        return _unresolved("zone and plot_area_sqm are required to resolve FAR",
                           "supply the zone (authoritative if possible) and plot area")
    zone_conf = inp.get("zone_confidence") or "inferred"

    rw = rwr.resolve_road_width(inp, cfg=cfg, zone=zone, sub_zone=sub_zone)
    width = rw.get("value_m")

    base_row = lookup_far(cfg, zone, sub_zone, road_width_m=width, plot_size_sqm=plot_area)
    if base_row is None:
        if rw.get("status") == "unresolved":
            return _unresolved(f"{zone}/{sub_zone}: FAR is road-keyed but road width is unresolved",
                               rw.get("next_action") or "measure or survey the road width")
        return _unresolved(
            f"no RMP FAR row for {zone}/{sub_zone} at plot {plot_area} sqm / road {width} m "
            "(PENDING cell or unmapped zone)",
            "confirm the zone + its RMP table with the authority")
    base_far = float(base_row["far"])
    gc = float(base_row["ground_coverage"])
    table = base_row["_table"]
    base_conf = table.get("confidence", "inferred")
    citation = _citation(table)
    source = (table.get("transcription_origin") or {}).get("source", "RMP-2015 Vol-III")
    vintage = (table.get("regulatory_source") or {}).get("page_ref")

    ent = _evaluate_entitlements(
        cfg, ring=inp.get("ring"), plot_area=plot_area,
        additional_eligible=bool(inp.get("additional_far_eligible")),
        within_metro_150m=bool(inp.get("within_metro_150m")),
        metro_confirmed=bool(inp.get("metro_bmrcl_confirmed")),
    )
    ent_labels = ent["labels"]
    ent_cites = "; ".join(sorted({lbl["citation"] for lbl in ent_labels if lbl.get("citation")}))

    # ── permissible (table + APPLIED modifiers; PENDING excluded but flagged) ─
    perm_far = _far_after(base_far, ent)
    perm_conf = _weakest(zone_conf, base_conf, "derived" if ent["has_pending"] else "authoritative")
    perm_notes = [f"ground coverage cap {int(gc * 100)}% ({citation})"]
    perm_notes += [f"{lbl['name']}: {lbl['status']} — {lbl['condition']}" for lbl in ent_labels]
    if ent["has_pending"]:
        perm_notes.append("permissible upper bound INCOMPLETE — a required modifier is PENDING.")
    permissible = _far_value(
        perm_far, perm_conf, source=source, vintage=vintage,
        citation="; ".join([c for c in (citation, ent_cites) if c]), notes=perm_notes,
        modifier_pending=ent["has_pending"])

    # ── ground coverage + setbacks (envelope constraints) ────────────────────
    ground_coverage = {"value": gc, "rule_citation": citation, "disclaimer": _SANCTION}
    height = inp.get("building_height_m")
    setbacks = None
    setback_note = None
    if height is not None:
        sb = governing_setbacks(cfg, height_m=float(height), plot_size_sqm=plot_area,
                                site_dim_m=inp.get("site_dim_m"))
        if sb is not None:
            setbacks = {"front": sb["front"], "rear": sb["rear"], "left": sb["left"], "right": sb["right"],
                        "rule_citation": f"RMP-2015 Vol-III {sb['_source']}", "disclaimer": _SANCTION}
        else:
            setback_note = "setbacks need building height + (for low-rise <=11.5 m) the site width/depth"
    else:
        setback_note = "provide building_height_m (+ site_dim_m for low-rise) to resolve setbacks"

    # ── two-line achievable, reusable per road width (single OR matrix band) ──
    ach_base_conf = _weakest(zone_conf, base_conf, rw.get("max_far_confidence", "unresolved"))
    with_cap = _weakest(
        "derived" if ent["metro_applied"] else "authoritative",
        "derived" if ent["has_pending"] else "authoritative",
    )

    def _lines(w: float | None, band_note: str | None = None) -> tuple[dict, dict]:
        bracket = _road_bracket_far(cfg, zone, sub_zone, w)
        base_line = base_far if bracket is None else min(base_far, bracket)
        base_notes = []
        if bracket is not None and bracket < base_far:
            base_notes.append(f"reg 3.4.iii: road {w} m -> narrower bracket (FAR {bracket}) than the plot "
                              f"entitlement ({base_far}) -> achievable_base capped at {base_line}.")
        elif bracket is None:
            base_notes.append("no road-band FAR reduction modelled for this zone; setbacks/coverage/height "
                              "still constrain the massing.")
        if band_note:
            base_notes.append(band_note)
        base_val = _far_value(base_line, ach_base_conf, source="RMP-2015 Vol-III + road-width resolver",
                              vintage=vintage, citation=f"{citation}; reg 3.4.iii",
                              notes=base_notes, road_width_m=w, error_band_m=rw.get("error_band_m"))

        with_line = _far_after(base_line, ent)
        with_notes = [f"achievable_base {base_line} + qualifying entitlements"]
        with_notes += [f"{lbl['name']}: {lbl['status']} — {lbl['condition']}" for lbl in ent_labels]
        if ent["has_pending"]:
            with_notes.append("with-entitlements value EXCLUDES the PENDING modifier — confirm with authority.")
        with_conf = _weakest(ach_base_conf, with_cap)
        with_val = _far_value(with_line, with_conf, source="RMP-2015 Vol-III + entitlements",
                              vintage=vintage, citation="; ".join([c for c in (citation, ent_cites) if c]),
                              notes=with_notes, road_width_m=w, error_band_m=rw.get("error_band_m"),
                              modifier_pending=ent["has_pending"])
        return base_val, with_val

    achievable_base = None
    achievable_with = None
    achievable_matrix = None

    if rw.get("status") == "unresolved":
        un = _far_value(None, "unresolved", source="road-width resolver", vintage=None,
                        citation="reg 3.4.iii (road width required)",
                        notes=["achievable needs a road width; permissible may still resolve for plot-keyed/flat zones."],
                        road_width_m=None, error_band_m=None, next_action=rw.get("next_action"))
        achievable_base, achievable_with = un, un
    elif rw.get("survey_required") and rw.get("band_range"):
        # Band edge: each matrix row carries BOTH lines. No side picked, entitlement line kept.
        rows = []
        for b in rw["band_range"]:
            rep = (b["min"] + (b["max"] if b["max"] is not None else b["min"] + 6)) / 2.0
            bv, wv = _lines(rep, band_note=f"candidate band {b['min']}–{b['max'] or '∞'} m")
            rows.append({"band": b, "achievable_base": bv, "achievable_with_entitlements": wv})
        achievable_matrix = {"rows": rows, "option_value": rw.get("option_value")}
    else:
        achievable_base, achievable_with = _lines(width)

    # ── HARD INVARIANT: base <= with <= permissible on EVERY resolved line ────
    perm_val = permissible["value"]

    def _check(bv: dict, wv: dict) -> None:
        b, w, p = bv.get("value"), wv.get("value"), perm_val
        if b is not None and w is not None and b > w + 1e-9:
            raise AssertionError(f"INVARIANT: achievable_base {b} > achievable_with_entitlements {w}")
        if w is not None and p is not None and w > p + 1e-9:
            raise AssertionError(f"INVARIANT: achievable_with_entitlements {w} > permissible {p}")

    if achievable_matrix:
        for r in achievable_matrix["rows"]:
            _check(r["achievable_base"], r["achievable_with_entitlements"])
    elif achievable_base and achievable_with:
        _check(achievable_base, achievable_with)

    result_notes = []
    if setback_note:
        result_notes.append(setback_note)
    if ent["has_pending"]:
        result_notes.append("a required Additional-FAR modifier is PENDING — with-entitlements upper bound incomplete.")

    return {
        "status": "resolved",
        "permissible_far": permissible,
        "achievable_base": achievable_base,
        "achievable_with_entitlements": achievable_with,
        "achievable_matrix": achievable_matrix,
        "entitlements": ent_labels,
        "ground_coverage": ground_coverage,
        "setbacks": setbacks,
        "road_width": rw,
        "invariant_ok": True,
        "reason": None,
        "next_action": None,
        "notes": result_notes,
        "disclaimer": _SANCTION,
    }
