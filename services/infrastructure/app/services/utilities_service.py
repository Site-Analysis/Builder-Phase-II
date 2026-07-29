# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-087 utilities + NOC checklist.

Splits utilities into what can be MEASURED and what can only be a MANDATORY OBLIGATION:

  MEASURABLE (scored, inferred):
    * water / telecom AVAILABILITY — an OSM proximity proxy (water_works / mast). A weak signal,
      scored `inferred`. It NEVER asserts a trunk main / connection exists.
  AUTHORITATIVE-ONLY (never inferred):
    * BWSSB water/sewer MAIN presence — "present" is allowed ONLY from an authoritative BWSSB/KGIS
      mains layer (env BWSSB_MAINS_URL). Absent that layer, presence is `unknown` +
      "verify with BWSSB". Inferring "main present" from an OSM water_works nearby would be a false
      authoritative claim, so it is forbidden.
  NON-MEASURABLE (NOC checklist):
    * structured mandatory obligations (BWSSB, BESCOM/CEA, KSPCB, Fire, AAI, gas, telecom), each
      with its authority + rule citation + typical validity + deep link.

Emits an `infra_readiness` signal for the US-092 GO/NO-GO engine. Pure builders (checklist,
readiness, BWSSB tier) are dependency-free + testable offline; the OSM proxy is the only network
step and is supplied by the caller.
"""

from __future__ import annotations

import os
from typing import Any

# ── BWSSB main tier — authoritative ONLY (inert without a configured layer) ──
_BWSSB_MAINS_URL = os.getenv("BWSSB_MAINS_URL", "").strip()


def resolve_main(kind: str, authoritative_hit: dict | None) -> dict[str, Any]:
    """Resolve a BWSSB trunk main. `authoritative_hit` is a record from the BWSSB/KGIS mains layer
    (present ONLY when that layer is configured + queried). Without it, presence is `unknown` —
    NEVER inferred from OSM (a nearby water_works does not prove a distribution main on the road)."""
    label = f"BWSSB {kind} main"
    if authoritative_hit is not None:
        return {
            "name": label,
            "present": "present",
            "confidence": "authoritative",
            "distance_m": authoritative_hit.get("distance_m"),
            "diameter_mm": authoritative_hit.get("diameter_mm"),
            "data_source": "BWSSB/KGIS mains layer",
            "reason": None,
            "next_action": None,
        }
    return {
        "name": label,
        "present": "unknown",
        "confidence": "unresolved",
        "distance_m": None,
        "diameter_mm": None,
        "data_source": "no authoritative BWSSB mains layer configured" if not _BWSSB_MAINS_URL
        else "BWSSB mains layer returned no main at this location",
        "reason": "trunk-main presence cannot be asserted without the authoritative BWSSB/KGIS "
        "mains layer — an OSM water_works nearby does NOT prove a distribution main on the road.",
        "next_action": f"verify the {kind} main + diameter with BWSSB (khata/plan sanction stage).",
    }


def availability_from_osm(name: str, *, detected: bool, nearest_m: float | None) -> dict[str, Any]:
    """Inferred availability score from an OSM proximity proxy. Distance-decayed 0-100; `inferred`
    confidence; explicitly NOT a connection guarantee."""
    if detected and nearest_m is not None:
        score = round(max(0.0, 100.0 * (1.0 - min(nearest_m, 3000.0) / 3000.0)), 1)
    else:
        score = 0.0
    return {
        "name": name,
        "score": score,
        "confidence": "inferred",
        "nearest_m": nearest_m,
        "detected": detected,
        "note": "inferred from OSM proximity — availability signal only, NOT a connection or a "
        "trunk main. OSM utility coverage in India is sparse; 'not detected' != absent.",
    }


# ── NOC checklist — mandatory obligations with citations (static, complete) ──
def build_noc_checklist() -> list[dict[str, Any]]:
    return [
        {
            "authority": "BWSSB",
            "requirement": "water supply + sewerage connection / no-dues + main availability",
            "rule_citation": "BWSSB Act 1964 + BBMP/BDA plan-sanction water & sanitation NOC",
            "typical_validity": "per sanction",
            "deep_link": "https://bwssb.karnataka.gov.in/",
            "applies_when": "all developments",
        },
        {
            "authority": "BESCOM",
            "requirement": "HT line clearance + electrical service feasibility",
            "rule_citation": "CEA (Measures relating to Safety & Electric Supply) Regs 2010 — ROW "
            "18/27/35/52 m for 66/132/220/400 kV + vertical clearance",
            "typical_validity": "confirm at sanction",
            "deep_link": "https://bescom.karnataka.gov.in/",
            "applies_when": "plots adjoining/under HT lines",
        },
        {
            "authority": "KSPCB",
            "requirement": "Consent for Establishment (CTE) then Consent for Operation (CTO)",
            "rule_citation": "Water Act 1974 + Air Act 1981 (KSPCB consent regime)",
            "typical_validity": "CTE valid 15 years; CTO renewed periodically",
            "deep_link": "https://kspcb.karnataka.gov.in/",
            "applies_when": "projects above the KSPCB threshold (built-up area / category)",
        },
        {
            "authority": "Karnataka State Fire & Emergency Services",
            "requirement": "Fire NOC (provisional at plan, final on completion)",
            "rule_citation": "RMP-2015 reg 3.12 — Fire NOC required for buildings >= 24 m (high-rise) "
            "+ NBC 2016 Part 4",
            "typical_validity": "provisional per sanction; final at OC",
            "deep_link": "https://ksfes.karnataka.gov.in/",
            "applies_when": "building height >= 24 m (and other NBC high-hazard occupancies)",
        },
        {
            "authority": "AAI (Airports Authority of India)",
            "requirement": "height NOC (NOCAS)",
            "rule_citation": "GSR 751(E) / Aircraft (Demolition of Obstructions) Rules — ICAO Annex 14",
            "typical_validity": "per NOCAS grant",
            "deep_link": "https://nocas2.aai.aero/",
            "applies_when": "within an aerodrome OLS (see geo /geo/overlays airport-OLS)",
        },
        {
            "authority": "PNGRB / city gas distributor",
            "requirement": "gas pipeline setback clearance",
            "rule_citation": "PNGRB T4S — min 15 m from a natural-gas pipeline",
            "typical_validity": "per project",
            "deep_link": "https://www.pngrb.gov.in/",
            "applies_when": "sites near a gas alignment (no public dataset — confirm with distributor)",
        },
        {
            "authority": "Telecom / fibre provider (BSNL / ISP)",
            "requirement": "fibre / broadband service feasibility + RoW for ducting",
            "rule_citation": "Indian Telegraph RoW Rules 2016",
            "typical_validity": "per connection",
            "deep_link": "https://www.dot.gov.in/",
            "applies_when": "all developments (service availability)",
        },
    ]


_CONF_RANK = {"authoritative": 3, "derived": 2, "inferred": 1, "unresolved": 0}


def _weakest_conf(confs: list[str]) -> str:
    return min(confs, key=lambda c: _CONF_RANK.get(c, 0)) if confs else "unresolved"


def build_readiness(
    water_main: dict, telecom: dict, noc_count: int, *,
    power_score: float | None = None, road_score: float | None = None,
) -> dict[str, Any]:
    """Compact infra-readiness signal for US-092. Water is known/unknown (never fabricated);
    telecom/power are inferred scores; `noc_pending` counts mandatory obligations.

    US-092 C2: `resolved_score` is the mean over KNOWN inputs ONLY (null when < 2 are known), so an
    unresolved input is NEVER averaged into a middling pass. Water is pivotal — if its presence is
    UNKNOWN the signal is `status=unresolved` and surfaces water in `unknowns`; the score is never a
    single number that hides the unknowns."""
    water_status = water_main["present"]
    water_conf = water_main["confidence"]
    notes: list[str] = []
    unknowns: list[dict[str, Any]] = []
    known_scores: list[float] = []

    # water: authoritatively known (present/absent) OR unknown (never fabricated)
    if water_status == "unknown":
        unknowns.append({"name": "water_main",
                         "next_action": water_main.get("next_action")
                         or "confirm the BWSSB water trunk main (authoritative mains layer)"})
        notes.append("water main presence UNKNOWN — authoritative BWSSB layer not available; "
                     "readiness cannot be 'ready' until confirmed.")
    else:
        known_scores.append(100.0 if water_status == "present" else 0.0)
    # telecom: inferred OSM proxy — a KNOWN inferred read
    known_scores.append(float(telecom["score"]))
    # power / road: known only when a score was supplied
    if power_score is None:
        unknowns.append({"name": "power", "next_action": "resolve BESCOM power proximity/score"})
    else:
        known_scores.append(float(power_score))
    if road_score is None:
        unknowns.append({"name": "road", "next_action": "resolve the access-road score"})
    else:
        known_scores.append(float(road_score))

    unresolved_count = len(unknowns)
    # score over KNOWN inputs only; null when too few (< 2) are known to be meaningful.
    resolved_score = round(sum(known_scores) / len(known_scores), 1) if len(known_scores) >= 2 else None

    # status: water unknown OR too-few-known => unresolved (never a passing score); else by unknowns.
    if water_status == "unknown" or resolved_score is None:
        status = "unresolved"
    elif unresolved_count == 0:
        status = "resolved"
    else:
        status = "partial"

    confidence = "unresolved" if status == "unresolved" else _weakest_conf([water_conf, "inferred"])

    # overall (back-compat): 'ready' only when water authoritatively present + telecom present.
    if water_status == "present" and telecom["score"] > 0:
        overall = "ready"
    elif water_status == "unknown":
        overall = "unknown"
    else:
        overall = "partial"

    return {
        "water_status": water_status,
        "water_confidence": water_conf,
        "telecom_score": telecom["score"],
        "power_score": power_score,
        "road_score": road_score,
        "noc_pending": noc_count,
        "overall": overall,
        "status": status,
        "resolved_score": resolved_score,
        "unresolved_count": unresolved_count,
        "unknowns": unknowns,
        "confidence": confidence,
        "notes": notes,
    }


_STORM_NOTE = (
    "Storm-water / rajakaluve proximity is a scored deal-killer in the geo /geo/overlays engine "
    "(BBMP SWD 2022, EPSG:32643, strictest dated buffer) — not re-scored here to avoid divergence."
)


def build_utilities(
    *, water_detected: bool, water_nearest_m: float | None,
    telecom_detected: bool, telecom_nearest_m: float | None,
    bwssb_water_hit: dict | None = None, bwssb_sewer_hit: dict | None = None,
    power_score: float | None = None, road_score: float | None = None,
    data_source: str = "OpenStreetMap (Overpass) proxy + BWSSB layer seam",
) -> dict[str, Any]:
    """Assemble the full utilities result from the (caller-supplied) OSM proxy + optional
    authoritative BWSSB hits. Pure — no network here."""
    water_main = resolve_main("water", bwssb_water_hit)
    sewer_main = resolve_main("sewer", bwssb_sewer_hit)
    water_av = availability_from_osm("water availability", detected=water_detected,
                                     nearest_m=water_nearest_m)
    telecom_av = availability_from_osm("telecom availability", detected=telecom_detected,
                                       nearest_m=telecom_nearest_m)
    checklist = build_noc_checklist()
    readiness = build_readiness(water_main, telecom_av, len(checklist),
                                power_score=power_score, road_score=road_score)
    return {
        "water_main": water_main,
        "sewer_main": sewer_main,
        "water_availability": water_av,
        "telecom_availability": telecom_av,
        "storm_water_note": _STORM_NOTE,
        "noc_checklist": checklist,
        "infra_readiness": readiness,
        "data_source": data_source,
    }
