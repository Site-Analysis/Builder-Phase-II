# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Tiered zone resolver (US-082 Part 2) — makes the RMP land-use zone HONEST + improvable.

CORE PRINCIPLE (mirrors the road-width resolver): there is no free authoritative queryable RMP
zone-polygon source (OpenCity RMP district maps are raster; KGIS BDA_Plans is licensed +
egress-blocked). So the zone is resolved from the best-available TIER, each carrying its own
confidence + data_source + data_vintage, and the OSM/Bhuvan tier — known WRONG on real parcels —
is demoted to a HINT that must be confirmed, never a silent FAR driver.

Tier order (best-available wins):
  1. rmp_zone            -> ``authoritative`` — the SAT-20 KGIS_LANDUSE_URL seam, IF configured.
                            Inert otherwise; NEVER guessed. (source: "BDA-RMP-2015")
  2. user_confirmed_zone -> ``authoritative`` ON USER ATTESTATION — the builder supplies the zone
                            after checking the official source. Authoritative for the calc but kept
                            VISIBLY DISTINCT from an RMP-sourced zone (source: "user-confirmed").
  3. osm_bhuvan          -> ``inferred`` — current OSM behaviour. KNOWN WRONG (Jayanagar->Industrial,
                            MG Road->Residential). A HINT only: it PROPOSES a zone to confirm/correct
                            and carries an explicit "unverified — confirm before relying" note. Never
                            drives a FAR headline without the P0 caveat.
  none                   -> unresolved (reason + next_action).

sub_zone follows the SAME tiering; an absent sub_zone stays `unresolved` (P0 fix) — never Main.

Dependency-free (stdlib). The OSM proposal is passed IN (from geo_service.analyze_zone) so this
resolver stays a pure, testable function that mirrors resolve_road_width.
"""

from __future__ import annotations

from typing import Any

ZONE_AUTHORITATIVE = "authoritative"
ZONE_INFERRED = "inferred"
ZONE_UNRESOLVED = "unresolved"

# source labels — kept distinct so an RMP zone and a user-attested zone never look identical.
SRC_RMP = "BDA-RMP-2015"
SRC_USER = "user-confirmed"
SRC_OSM = "OSM/Bhuvan (inferred)"

_UNVERIFIED_NOTE = (
    "UNVERIFIED — this zone is inferred from OpenStreetMap / Bhuvan land cover, NOT the RMP "
    "land-use zone, and is KNOWN to be wrong on many real parcels. Confirm or correct it against "
    "the BDA/GBA land-use map before relying on any FAR."
)
_ATTEST_NOTE = (
    "USER-CONFIRMED — attested by the user after checking the official land-use source. "
    "Authoritative for this calculation but NOT an RMP-layer read; it remains distinct from a "
    "BDA-RMP-2015-sourced zone and is only as reliable as the user's verification."
)
_NEXT_UNRESOLVED = (
    "confirm the zone via the BDA/GBA land-use portal or the RMP-2015 planning-district map "
    "(and Khata e-Aasthi / e-Swathu + DC conversion status for the parcel)"
)


def _unresolved(reason: str, next_action: str, *, sub_reason: str | None = None) -> dict[str, Any]:
    return {
        "status": ZONE_UNRESOLVED,
        "zone": None,
        "sub_zone": None,
        "confidence": ZONE_UNRESOLVED,
        "source": None,
        "data_source": None,
        "data_vintage": None,
        "unverified": False,
        "attested": False,
        "proposed_zone": None,
        "proposed_sub_zone": None,
        "reason": reason,
        "next_action": next_action,
        "notes": [],
        # what planning should carry into FarAssemblyRequest.zone_confidence.
        "far_zone_confidence": "inferred",
        "sub_zone_status": ZONE_UNRESOLVED,
        "sub_zone_reason": sub_reason,
    }


def _sub_zone_tiered(inp: dict, *, tier: str) -> tuple[str | None, str, str | None]:
    """Resolve sub_zone at the SAME tier the zone resolved at. Returns
    (sub_zone, status, reason). Absent sub_zone -> unresolved (never defaulted to Main, P0)."""
    if tier == "rmp":
        sz = inp.get("rmp_sub_zone")
    elif tier == "user":
        sz = inp.get("user_sub_zone")
    else:
        sz = inp.get("osm_sub_zone")
    if sz:
        return sz, "resolved", None
    return None, ZONE_UNRESOLVED, (
        "sub_zone is required — it selects the RMP FAR table and each keys FAR differently; "
        "not defaulted. Confirm the sub-zone with the zone."
    )


def resolve_zone(inp: dict) -> dict[str, Any]:
    """Resolve the best-available zone tier. ``inp`` keys (all optional):

      rmp_zone / rmp_sub_zone / rmp_vintage      -> tier 1 (authoritative, RMP seam)
      user_zone / user_sub_zone / user_attested  -> tier 2 (authoritative-on-attestation)
      osm_zone / osm_sub_zone / osm_vintage       -> tier 3 (inferred HINT)
    """
    # ── tier 1: RMP seam (authoritative) ─────────────────────────────────────
    if inp.get("rmp_zone"):
        sub, sub_status, sub_reason = _sub_zone_tiered(inp, tier="rmp")
        return {
            "status": "resolved",
            "zone": inp["rmp_zone"],
            "sub_zone": sub,
            "confidence": ZONE_AUTHORITATIVE,
            "source": SRC_RMP,
            "data_source": "KGIS BDA Revised Master Plan 2015 land-use layer",
            "data_vintage": inp.get("rmp_vintage") or "RMP-2015",
            "unverified": False,
            "attested": False,
            "proposed_zone": None,
            "proposed_sub_zone": None,
            "reason": None,
            "next_action": None,
            "notes": ["Zone from the authoritative BDA RMP-2015 land-use layer."],
            "far_zone_confidence": "authoritative",
            "sub_zone_status": sub_status,
            "sub_zone_reason": sub_reason,
        }

    # ── tier 2: user-confirmed (authoritative on attestation, but visibly distinct) ──
    if inp.get("user_zone"):
        if not inp.get("user_attested"):
            return _unresolved(
                "a user-supplied zone was given but not attested — set user_attested=true only "
                "after checking the official BDA/GBA land-use source",
                _NEXT_UNRESOLVED,
            )
        sub, sub_status, sub_reason = _sub_zone_tiered(inp, tier="user")
        return {
            "status": "resolved",
            "zone": inp["user_zone"],
            "sub_zone": sub,
            "confidence": ZONE_AUTHORITATIVE,
            "source": SRC_USER,
            "data_source": "user-confirmed (attested against official land-use source)",
            "data_vintage": inp.get("user_confirmed_date"),
            "unverified": False,
            "attested": True,
            "proposed_zone": inp.get("osm_zone"),
            "proposed_sub_zone": inp.get("osm_sub_zone"),
            "reason": None,
            "next_action": None,
            "notes": [_ATTEST_NOTE],
            # authoritative for the calc — but tagged user-confirmed downstream, not RMP.
            "far_zone_confidence": "authoritative",
            "sub_zone_status": sub_status,
            "sub_zone_reason": sub_reason,
        }

    # ── tier 3: OSM/Bhuvan (inferred HINT — never a silent FAR driver) ────────
    if inp.get("osm_zone"):
        sub, sub_status, sub_reason = _sub_zone_tiered(inp, tier="osm")
        return {
            "status": "resolved",
            "zone": inp["osm_zone"],
            "sub_zone": sub,
            "confidence": ZONE_INFERRED,
            "source": SRC_OSM,
            "data_source": inp.get("osm_data_source") or "OpenStreetMap (Overpass) / ISRO Bhuvan LULC",
            "data_vintage": inp.get("osm_vintage"),
            "unverified": True,
            "attested": False,
            "proposed_zone": inp["osm_zone"],
            "proposed_sub_zone": inp.get("osm_sub_zone"),
            "reason": None,
            "next_action": (
                "confirm or correct this zone against the BDA/GBA land-use map; on confirmation the "
                "FAR confidence lifts from inferred"
            ),
            "notes": [_UNVERIFIED_NOTE],
            "far_zone_confidence": "inferred",
            "sub_zone_status": sub_status,
            "sub_zone_reason": sub_reason,
        }

    # ── none -> unresolved ───────────────────────────────────────────────────
    return _unresolved(
        "no zone from any tier (RMP seam not configured, no user-confirmed zone, no OSM proposal)",
        _NEXT_UNRESOLVED,
    )
