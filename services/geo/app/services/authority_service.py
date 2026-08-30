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
confidence on the canonical ladder (US-092 C4: authoritative/derived/inferred/unresolved —
KGIS admin-context is `derived`, open-data fallback is `inferred`). No fabrication: when
context is unavailable the result is `Unknown`/`unresolved`.
"""

from __future__ import annotations

from pathlib import Path

import httpx

from app.models.geo import AuthorityResult, KgisContext, Provenance
from app.services import fallback_geojson as fb
from app.services.kgis_service import fetch_kgis_context

_BBMP_BYELAWS = "BBMP Building Bye-laws 2003 / Karnataka Model Building Bye-laws 2017"
_BPAS_PORTAL = "https://bpas.bbmpgov.in (BPAS / AutoDCR)"

# ── inferred fallback tier (loaded once, cached) ────────────────────────────
# Strictly BELOW the KGIS-live seam: consulted only when KGIS returns no context. The
# GBA wards layer is committed; the LGD villages layer is fetch-on-setup (may be absent →
# that tier simply doesn't answer). A bad file trips the canary and is treated as absent.
_DATA = Path(__file__).resolve().parents[1] / "data"
_WARDS_PATH = _DATA / "wards_bengaluru_gba.geojson"
_VILLAGES_PATH = _DATA / "lgd_villages.geojson"
_WARDS_SOURCE = "OpenCity GBA wards (ODbL)"
_WARDS_VINTAGE = "2025"
_VILLAGES_SOURCE = "LGD via ramSeraph/bharatlas (CC0)"
_VILLAGES_VINTAGE = "LGD-2024"
_wards_cache: dict = {"loaded": False, "feats": None}
_villages_cache: dict = {"loaded": False, "index": None}

_KGIS_PROV = Provenance(
    tier="authoritative", mode=fb.MODE_KGIS,
    data_source="KGIS getlocationdetails (KSRSAC)", data_vintage=None,
)


def _wards() -> list | None:
    if not _wards_cache["loaded"]:
        _wards_cache["loaded"] = True
        try:
            if _WARDS_PATH.exists():
                _wards_cache["feats"] = fb.load(_WARDS_PATH, coord_order="latlon")
        except (fb.FallbackLayerError, OSError, ValueError):
            _wards_cache["feats"] = None
    return _wards_cache["feats"]


def _villages_index() -> dict | None:
    if not _villages_cache["loaded"]:
        _villages_cache["loaded"] = True
        try:
            if _VILLAGES_PATH.exists():
                feats = fb.load(_VILLAGES_PATH, coord_order="lonlat")
                _villages_cache["index"] = fb.build_grid_index(feats)
        except (fb.FallbackLayerError, OSError, ValueError):
            _villages_cache["index"] = None
    return _villages_cache["index"]


def _is_bengaluru(ctx: dict) -> bool:
    blob = " ".join(str(ctx.get(k) or "") for k in ("district", "town", "admin_zone")).lower()
    return any(t in blob for t in ("bengaluru", "bangalore", "bbmp"))


async def detect_authority(
    lat: float, lon: float, client: httpx.AsyncClient
) -> AuthorityResult:
    ctx = await fetch_kgis_context(lat, lon, client)
    if not ctx:
        # KGIS-live gave nothing → drop to the inferred fallback tier (never a guess).
        return _fallback_authority(lat, lon)

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
            confidence="derived",  # KGIS admin-context; authoritative only after KGIS PIP (Phase-0)
            live_verified=False,
            kgis=kgis,
            provenance=_KGIS_PROV,
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
            confidence="inferred",  # KGIS admin-context, non-Bengaluru — best-effort
            live_verified=False,
            kgis=kgis,
            provenance=_KGIS_PROV,
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
        confidence="inferred",  # KGIS admin-context, rural — best-effort
        live_verified=False,
        kgis=kgis,
        provenance=_KGIS_PROV,
        notes="Rural point — the governing planning authority (BMRDA/BIAAPA/BDA) needs a "
        "KGIS LPA-boundary check; deferred until KGIS access.",
    )


def _fallback_authority(lat: float, lon: float) -> AuthorityResult:
    """Inferred fallback tier — consulted ONLY when KGIS-live returns no context.

    Tries the committed GBA wards layer (urban Bengaluru), then the fetch-on-setup LGD
    villages layer (rural), both at ``inferred`` tier. If neither contains the point (or
    neither is bundled) the answer is honestly ``unresolved`` — never a default/guess.
    """
    wards = _wards()
    if wards is not None:
        w = fb.locate_features(
            wards, lat, lon, name_field="ward_name",
            layer_name="GBA wards", data_source=_WARDS_SOURCE,
            data_vintage=_WARDS_VINTAGE, next_action_no_match="verify with authority",
        )
        if w["status"] == "resolved":
            p = w["properties"]
            return AuthorityResult(
                authority="Greater Bengaluru Authority (GBA)",
                jurisdiction_type="Urban",
                planning_authority="Bengaluru Development Authority (BDA) — Local Planning Area",
                approval_track="GBA / city-corporation BPAS (AutoDCR); Sakala 30-day",
                bye_law_reference=_BBMP_BYELAWS,
                portal=_BPAS_PORTAL,
                confidence="inferred",  # from an open-data ward boundary, not KGIS
                live_verified=False,
                notes=(
                    "KGIS unavailable — ward inferred from the OpenCity GBA layer: "
                    f"{p.get('ward_name')} (Corporation {p.get('Corporation')}). "
                    "Confirm the corporation + ward via KGIS Boundaries point-in-polygon (Phase-0)."
                ),
                provenance=Provenance(
                    tier="inferred", mode=fb.MODE_FALLBACK,
                    data_source=_WARDS_SOURCE, data_vintage=_WARDS_VINTAGE,
                    next_action="confirm via KGIS Boundaries point-in-polygon (Phase-0)",
                ),
            )

    index = _villages_index()
    if index is not None:
        v = fb.locate_indexed(
            index, lat, lon, name_field="vilname11",
            layer_name="LGD villages", data_source=_VILLAGES_SOURCE,
            data_vintage=_VILLAGES_VINTAGE, next_action_no_match="verify",
        )
        if v["status"] == "resolved":
            p = v["properties"]
            return AuthorityResult(
                authority="Gram Panchayat (rural)",
                jurisdiction_type="Rural",
                planning_authority="Verify LPA: BMRDA / BIAAPA / BDA green-belt (point-in-polygon, Phase-0)",
                approval_track="Gram Panchayat + RDPR; NA conversion if agricultural",
                bye_law_reference="Karnataka Panchayat Raj building rules / applicable LPA regulations",
                portal=None,
                confidence="inferred",  # from the open-data LGD village layer, not KGIS
                live_verified=False,
                notes=(
                    "KGIS unavailable — village inferred from the LGD layer: "
                    f"{p.get('vilname11')} (LGD {p.get('vil_lgd')}). Verify the governing LPA."
                ),
                provenance=Provenance(
                    tier="inferred", mode=fb.MODE_FALLBACK,
                    data_source=_VILLAGES_SOURCE, data_vintage=_VILLAGES_VINTAGE,
                    next_action="verify the governing LPA (BMRDA/BIAAPA/BDA) — Phase-0",
                ),
            )

    # Neither KGIS nor any bundled fallback layer answered → honest unresolved.
    return AuthorityResult(
        authority="Unknown",
        jurisdiction_type="Unknown",
        confidence="unresolved",  # no KGIS + no fallback layer answered — honest no-answer
        live_verified=False,
        notes="KGIS reverse geocode returned no context and no bundled fallback layer "
        "contains this point (service unreachable or point outside coverage). Verify "
        "jurisdiction manually.",
        provenance=Provenance(
            tier="unresolved", mode=fb.MODE_UNRESOLVED,
            data_source="none", data_vintage=None,
            reason="KGIS unavailable and the point is outside all bundled fallback layers",
            next_action="verify jurisdiction manually / draw the site boundary",
        ),
    )
