# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-092 verdict engine — the two-tier GO / CAUTION / NO-GO aggregator.

TIER 1 (gates, boolean — C1): read `is_killer` / gate `tripped` ONLY, never parse prose. ANY tripped
gate -> hard NO-GO regardless of everything else.

TIER 2 (gate-clear only): an UNRESOLVED decision-relevant input can NEVER yield GO (C2) — it forces
CAUTION and lands in the "confirm to upgrade" list with its next_action. GO requires no tripped gate
AND no unresolved decision input AND no recoverable-but-costly condition.

VERDICT CONFIDENCE (C4 weakest): the verdict's own confidence = weakest of its decision-driving
inputs. An inferred zone (the common case) yields an inferred verdict, said prominently.

Pure — operates on the already-fetched signal dicts. Deterministic + offline-testable.
"""

from __future__ import annotations

from typing import Any

_RANK = {"authoritative": 3, "derived": 2, "inferred": 1, "unresolved": 0}
_SEV_RANK = {"critical": 3, "high": 2, "moderate": 1, "low": 0}

# Gate severity for RED-FLAGS-FIRST sorting. Non-saleable land + environmental/buffer kills are
# critical (cannot build / demolition risk); restricted tenure is high (regulated, not always fatal).
_GATE_SEVERITY = {
    "kharab-non-saleable": "critical",
    "restricted-tenure": "high",
    "forest": "critical",
    "wetland": "critical",
    "wetland-ramsar": "critical",
    "eco-sensitive-zone": "critical",
    "rajakaluve/drains": "critical",
    "lakes/waterbodies": "critical",
    "flood": "critical",
    "airport-OLS": "high",
}
_SANCTION = "subject to authority sanction"


def _weakest(confs: list[str]) -> str:
    return min(confs, key=lambda c: _RANK.get(c, 0)) if confs else "unresolved"


def _row(section: str, label: str, value: str, confidence: str, *, citation: str | None = None,
         vintage: str | None = None, as_of: str | None = None, severity: str | None = None,
         next_action: str | None = None) -> dict[str, Any]:
    return {
        "section": section, "label": label, "value": value, "citation": citation,
        "confidence": confidence, "data_vintage": vintage, "as_of": as_of,
        "severity": severity, "next_action": next_action, "sanction_note": _SANCTION,
    }


# ── TIER 1 ───────────────────────────────────────────────────────────────────
def _tier1_gates(overlays: dict, ownership: dict) -> list[dict[str, Any]]:
    """Every tripped gate as a RED-FLAG row, severity-sorted (critical first)."""
    flags: list[dict[str, Any]] = []
    for g in list(overlays.get("gates", [])) + list(ownership.get("gates", [])):
        if not g.get("tripped"):
            continue
        name = g.get("gate_name", "gate")
        sev = _GATE_SEVERITY.get(name, "high")
        flags.append(_row(
            "red_flag", f"DEAL-KILLER: {name}", g.get("basis", "gate tripped"),
            g.get("confidence", "unresolved"), citation=g.get("citation"), severity=sev))
    flags.sort(key=lambda r: _SEV_RANK.get(r["severity"], 0), reverse=True)
    return flags


# ── TIER 2 per-signal evaluators: append to clear / confirm and yield a confidence ─
def _eval_overlays(overlays: dict, clear: list, confirm: list) -> list[str]:
    confs: list[str] = []
    verdict = overlays.get("verdict") or {}
    for name in verdict.get("unresolved_overlays", []):
        confirm.append(_row(
            "confirm_to_upgrade", f"overlay: {name}",
            "UNRESOLVED — no bundled clearing layer (absence is NOT clear)", "unresolved",
            next_action=f"prep/verify the {name} layer, then re-run"))
        confs.append("unresolved")
    # G overlays are confirmed-clear (only a bundled authoritative layer can clear one)
    for o in overlays.get("overlays", []):
        if o.get("status") == "G":
            prov = o.get("provenance") or {}
            clear.append(_row(
                "confirmed_clear", f"{o.get('name')}: clear",
                f"clear at {o.get('distance_m')} m (buffer {o.get('buffer_m')} m)",
                prov.get("confidence", "inferred"), citation=o.get("rule_citation"),
                vintage=prov.get("vintage"), as_of=o.get("as_of")))
            confs.append(prov.get("confidence", "inferred"))
    return confs


def _eval_ownership(ownership: dict, clear: list, confirm: list) -> list[str]:
    feas = ownership.get("ownership_feasibility") or {}
    conf = feas.get("confidence", "unresolved")
    if conf == "unresolved":
        confirm.append(_row(
            "confirm_to_upgrade", "ownership (Kharab / tenure)",
            "UNRESOLVED — parcel not resolved in KGIS/Dishaank", "unresolved",
            next_action=feas.get("next_action", "resolve the parcel; pull RTC + Kaveri EC")))
    else:
        clear.append(_row(
            "confirmed_clear", "ownership screening",
            "no non-saleable Kharab / confirmed restriction detected (screening only)", conf,
            citation="KGIS Cadastral L5 + Dishaank"))
    return [conf]


def _eval_far(far: dict, clear: list, confirm: list) -> list[str]:
    if not far or far.get("status") != "resolved":
        confirm.append(_row(
            "confirm_to_upgrade", "FAR (build capacity)",
            far.get("reason", "UNRESOLVED") if far else "UNRESOLVED — not computed", "unresolved",
            next_action=(far.get("next_action") if far else None) or "resolve zone + road width, re-run"))
        return ["unresolved"]
    perm = far.get("permissible_far") or {}
    conf = perm.get("confidence", "inferred")
    citation = perm.get("rule_citation")
    if far.get("achievable_matrix"):
        confirm.append(_row(
            "confirm_to_upgrade", "FAR — band-edge road width",
            "achievable FAR straddles two road bands (recoverable — survey to resolve)", conf,
            citation=citation, next_action="survey the road right-of-way to pick the band"))
    else:
        ach = far.get("achievable_with_entitlements") or far.get("achievable_base") or {}
        clear.append(_row(
            "confirmed_clear", "FAR (build capacity)",
            f"permissible {perm.get('value')} · achievable {ach.get('value')}", conf,
            citation=citation, vintage=perm.get("data_vintage")))
    return [conf]


def _eval_c2_signal(sig: dict, label: str, clear: list, confirm: list) -> list[str]:
    """Shared for connectivity + infra_readiness (both C2 known-vs-unknown signals)."""
    status = sig.get("status", "unresolved")
    conf = sig.get("confidence", "unresolved")
    if status == "unresolved":
        for u in sig.get("unknowns", []) or [{"name": label, "next_action": "resolve this input"}]:
            confirm.append(_row(
                "confirm_to_upgrade", f"{label}: {u.get('name')}",
                "UNRESOLVED decision input (not scored — never averaged into a pass)", "unresolved",
                next_action=u.get("next_action")))
        return ["unresolved"]
    if status == "partial":
        for u in sig.get("unknowns", []):
            confirm.append(_row(
                "confirm_to_upgrade", f"{label}: {u.get('name')}",
                "recoverable — resolve to strengthen the signal", conf, next_action=u.get("next_action")))
        clear.append(_row(
            "confirmed_clear", f"{label} (partial)",
            f"score {sig.get('resolved_score')}/100 over KNOWN inputs", conf))
        return [conf]
    clear.append(_row(
        "confirmed_clear", label, f"score {sig.get('resolved_score')}/100", conf))
    return [conf]


def _eval_price(price: dict, clear: list, confirm: list) -> list[str]:
    if not price or price.get("status") != "resolved" or not price.get("upside"):
        confirm.append(_row(
            "confirm_to_upgrade", "price upside",
            "UNRESOLVED — no Kaveri guidance value supplied (indicative only, not a valuation)",
            "unresolved", next_action="supply the sub-registrar guidance value (₹/sqm)"))
        return ["unresolved"]
    u = price["upside"]
    clear.append(_row(
        "confirmed_clear", "price upside (indicative range)",
        f"₹{u.get('low')}–₹{u.get('high')}/sqm ({u.get('premium_low_pct')}–{u.get('premium_high_pct')}%)",
        u.get("confidence", "inferred"), citation=u.get("method"), vintage=u.get("as_of")))
    return [u.get("confidence", "inferred")]


def _eval_terrain(terrain: dict, clear: list, confirm: list) -> list[str]:
    if not terrain or terrain.get("status") != "resolved":
        confirm.append(_row(
            "confirm_to_upgrade", "terrain (slope / HAND / geotech)",
            "UNRESOLVED — DEM window / geotech unavailable (slope NOT assumed 0)", "unresolved",
            next_action="run with GEE credentials + parcel polygon, or supply a surveyed slope"))
        return ["unresolved"]
    slope = terrain.get("slope") or {}
    conf = slope.get("confidence", "inferred")
    clear.append(_row("confirmed_clear", "terrain", f"slope {slope.get('value')}%", conf))
    return [conf]


def _eval_zone(zone: dict, confirm: list) -> tuple[list[str], bool]:
    """Zone drives FAR + the whole verdict's confidence. Returns (confs, zone_is_weak)."""
    far_conf = (zone or {}).get("far_zone_confidence", "inferred")
    status = (zone or {}).get("status", "unresolved")
    weak = far_conf != "authoritative"
    if status != "resolved" or weak:
        confirm.append(_row(
            "confirm_to_upgrade", "zone (RMP land-use)",
            "UNCONFIRMED — verdict rests on an inferred/unresolved zone; confirm to strengthen it",
            far_conf if status == "resolved" else "unresolved",
            citation="RMP-2015 planning-district map",
            next_action="confirm the RMP zone with the authority / user attestation"))
    return [far_conf if status == "resolved" else "unresolved"], weak


def _eval_authority(authority: dict, clear: list, confirm: list) -> list[str]:
    conf = (authority or {}).get("confidence", "unresolved")
    if conf == "unresolved" or not authority:
        confirm.append(_row(
            "confirm_to_upgrade", "governing authority",
            "UNRESOLVED — jurisdiction not established", "unresolved",
            next_action="confirm the authority via KGIS Boundaries point-in-polygon"))
    else:
        clear.append(_row(
            "confirmed_clear", "governing authority",
            authority.get("authority", "—"), conf))
    return [conf]


def compose(bundle: dict, *, parcel: dict, generated_at: str) -> dict[str, Any]:
    """Two-tier verdict over the live signal bundle. See module docstring."""
    overlays = bundle.get("overlays") or {}
    ownership = bundle.get("ownership") or {}

    red_flags = _tier1_gates(overlays, ownership)

    if red_flags:
        confidence = _weakest([r["confidence"] for r in red_flags])
        killers = ", ".join(r["label"].replace("DEAL-KILLER: ", "") for r in red_flags)
        note = (f"NO-GO is set by {len(red_flags)} tripped gate(s): {killers}. This dominates every "
                "other signal — resolve or exclude the killer before anything else.")
        rows = red_flags
        return _finish("NO_GO", confidence, note, red_flags, [], [], rows, parcel, generated_at,
                       headline="NO-GO — a deal-killer gate is tripped")

    # TIER 2 — gate-clear
    clear: list[dict] = []
    confirm: list[dict] = []
    confs: list[str] = []
    confs += _eval_overlays(overlays, clear, confirm)
    confs += _eval_ownership(ownership, clear, confirm)
    confs += _eval_far(bundle.get("far") or {}, clear, confirm)
    confs += _eval_c2_signal(bundle.get("connectivity") or {}, "connectivity", clear, confirm)
    confs += _eval_c2_signal(bundle.get("infra_readiness") or {}, "infra readiness", clear, confirm)
    confs += _eval_price(bundle.get("price") or {}, clear, confirm)
    confs += _eval_terrain(bundle.get("terrain") or {}, clear, confirm)
    zone_confs, zone_weak = _eval_zone(bundle.get("zone") or {}, confirm)
    confs += zone_confs
    confs += _eval_authority(bundle.get("authority") or {}, clear, confirm)

    confidence = _weakest(confs)
    verdict = "CAUTION" if confirm else "GO"

    if verdict == "GO":
        headline = "GO — gate-clear and all decision inputs resolved favourably"
        note = "No tripped gate and no unresolved decision input. Still subject to authority sanction."
    else:
        n = len(confirm)
        headline = f"CAUTION — gate-clear, but {n} item(s) must be confirmed"
        note = (f"Gate-clear (no deal-killer). {n} decision input(s) are unresolved or conditional — "
                "listed below with the next action for each. This is NOT a pass; confirm them to "
                "upgrade the verdict.")
    if zone_weak:
        note = ("This verdict rests on an UNCONFIRMED zone — its confidence is capped accordingly. "
                "Confirm the RMP zone to strengthen it. " + note)

    rows = red_flags + clear + confirm
    return _finish(verdict, confidence, note, red_flags, clear, confirm, rows, parcel,
                   generated_at, headline=headline)


def _finish(verdict: str, confidence: str, note: str, red_flags: list, clear: list,
            confirm: list, rows: list, parcel: dict, generated_at: str,
            *, headline: str) -> dict[str, Any]:
    return {
        "verdict": verdict,
        "confidence": confidence,
        "headline": headline,
        "confidence_note": note,
        "red_flags": red_flags,
        "confirmed_clear": clear,
        "confirm_to_upgrade": confirm,
        "rows": rows,
        "generated_at": generated_at,
        "parcel": parcel,
    }
