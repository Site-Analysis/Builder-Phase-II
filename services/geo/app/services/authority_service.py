# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""
Authority auto-detect (US-093).

Given a coordinate, classify the governing local authority + the applicable building
bye-laws and approval track. Starts from the KGIS reverse-geocode context
(`getlocationdetails`) and applies a static ruleset that encodes the **GBA transition**
(BBMP was dissolved 15-May-2025 → Greater Bengaluru Authority + up to 5 city
corporations) and the BDA / BMRDA / BIAAPA planning-area tracks.

Authoritative jurisdiction requires a point-in-polygon test over the KGIS Boundaries /
LPA layers — that is **deferred** until KGIS access lands (Phase-0). Until then this is
best-effort from the admin context, returned with `live_verified=false` and an honest
confidence. No fabrication: when context is unavailable the result is `Unknown`/low.
"""

from __future__ import annotations

import httpx

from app.models.geo import AuthorityResult, KgisContext
from app.services.kgis_service import fetch_kgis_context

_BBMP_BYELAWS = "BBMP Building Bye-laws 2003 / Karnataka Model Building Bye-laws 2017"
_BPAS_PORTAL = "https://bpas.bbmpgov.in (BPAS / AutoDCR)"


def _is_bengaluru(ctx: dict) -> bool:
    blob = " ".join(str(ctx.get(k) or "") for k in ("district", "town", "admin_zone")).lower()
    return any(t in blob for t in ("bengaluru", "bangalore", "bbmp"))


async def detect_authority(
    lat: float, lon: float, client: httpx.AsyncClient
) -> AuthorityResult:
    ctx = await fetch_kgis_context(lat, lon, client)
    if not ctx:
        return AuthorityResult(
            authority="Unknown",
            jurisdiction_type="Unknown",
            confidence="low",
            live_verified=False,
            notes="KGIS reverse geocode returned no context (service unreachable or "
            "point outside Karnataka). Verify jurisdiction manually.",
        )

    kgis = KgisContext(**ctx)
    jtype = ctx.get("type") or "Unknown"

    if jtype == "Urban" and _is_bengaluru(ctx):
        return AuthorityResult(
            authority="Greater Bengaluru Authority (GBA)",
            jurisdiction_type="Urban",
            planning_authority="Bengaluru Development Authority (BDA) — Local Planning Area",
            approval_track="GBA / city-corporation BPAS (AutoDCR); Sakala 30-day",
            bye_law_reference=_BBMP_BYELAWS,
            portal=_BPAS_PORTAL,
            confidence="medium",
            live_verified=False,
            kgis=kgis,
            notes="BBMP was dissolved on 15-May-2025 and replaced by the Greater "
            "Bengaluru Authority (up to 5 city corporations). Confirm the exact "
            "corporation + ward via KGIS Boundaries point-in-polygon (Phase-0).",
        )

    if jtype == "Urban":
        town = ctx.get("town") or "Urban Local Body"
        return AuthorityResult(
            authority=f"{town} (Urban Local Body)",
            jurisdiction_type="Urban",
            planning_authority="Town/Urban Planning Authority (confirm LPA)",
            approval_track="ULB BPAS / DPMS; Sakala",
            bye_law_reference="Karnataka Municipal Building Bye-laws / Model Bye-laws 2017",
            portal=None,
            confidence="low",
            live_verified=False,
            kgis=kgis,
            notes="Non-Bengaluru ULB — verify the local planning authority and bye-laws.",
        )

    # Rural
    return AuthorityResult(
        authority="Gram Panchayat (rural)",
        jurisdiction_type="Rural",
        planning_authority="Verify LPA: BMRDA / BIAAPA / BDA green-belt (point-in-polygon, Phase-0)",
        approval_track="Gram Panchayat + RDPR; NA conversion if agricultural",
        bye_law_reference="Karnataka Panchayat Raj building rules / applicable LPA regulations",
        portal=None,
        confidence="low",
        live_verified=False,
        kgis=kgis,
        notes="Rural point — the governing planning authority (BMRDA/BIAAPA/BDA) needs a "
        "KGIS LPA-boundary check; deferred until KGIS access.",
    )
