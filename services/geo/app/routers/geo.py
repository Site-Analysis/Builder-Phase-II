# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.models.geo import (
    AmenitiesResult,
    AuthorityResult,
    OverlayResult,
    ParcelGeometry,
    Provenance,
    RingResult,
    SoilResult,
    TransportAccessResult,
    WaterConstraintResult,
    ZoneResolution,
    ZoneResult,
)
from app.services import kgis_service
from app.services.amenities_service import AmenitiesService
from app.services.transport_service import fetch_transport_access
from app.services.authority_service import detect_authority
from app.services.geo_service import GeoService
from app.services.soil_service import SoilService
from app.services.water_service import WaterService

_ZONE_FLAG = "feature.zoning.land-use"
_SOIL_FLAG = "feature.environment.soil"
_WATER_FLAG = "feature.environment.water-constraints"
_AMENITY_FLAG = "feature.geo.amenities"
_KGIS_FLAG = "feature.geo.kgis-context"
_PARCEL_FLAG = "feature.geo.parcel-geometry"
_AUTHORITY_FLAG = "feature.geo.authority"
_OVERLAYS_FLAG = "feature.geo.overlays"
_ZONE_RESOLVER_FLAG = "feature.geo.zone-resolver"
_TRANSPORT_FLAG = "feature.geo.transport-access"


def _enabled_flags() -> set[str]:
    return {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}


def _require_flag(flag: str) -> None:
    if flag not in _enabled_flags():
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {flag}")


router = APIRouter(prefix="/geo", tags=["geo"])
geo_router = router
_service = GeoService()
_soil_service = SoilService()
_water_service = WaterService()
_amenities_service = AmenitiesService()


@router.get("/zone", response_model=ZoneResult)
async def get_zone(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_m: float = Query(500),
) -> ZoneResult:
    _require_flag(_ZONE_FLAG)
    return await _service.analyze_zone(
        lat, lon, radius_m, kgis_enabled=_KGIS_FLAG in _enabled_flags()
    )


@router.get("/soil", response_model=SoilResult)
async def get_soil(
    lat: float = Query(...),
    lon: float = Query(...),
) -> SoilResult:
    _require_flag(_SOIL_FLAG)
    async with httpx.AsyncClient(
        timeout=25, headers={"User-Agent": "SAT-SiteAnalysisTool/1.0"}
    ) as client:
        return await _soil_service.get_soil(lat, lon, client)


@router.get("/water-constraints", response_model=WaterConstraintResult)
async def get_water_constraints(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_m: float = Query(500),
) -> WaterConstraintResult:
    _require_flag(_WATER_FLAG)
    async with httpx.AsyncClient(
        timeout=25, headers={"User-Agent": "SAT-SiteAnalysisTool/1.0"}
    ) as client:
        return await _water_service.get_water_constraints(lat, lon, radius_m, client)


@router.get("/amenities", response_model=AmenitiesResult)
async def get_amenities(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_m: float = Query(5000),
) -> AmenitiesResult:
    _require_flag(_AMENITY_FLAG)
    return await _amenities_service.get_amenities(lat, lon, radius_m)


@router.get("/transport-access", response_model=TransportAccessResult)
async def get_transport_access(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_m: int = Query(10000),
) -> TransportAccessResult:
    """Nearest metro/rail/highway/airport access points with coordinates (US-transport-layer).

    Metro and rail from OSM Overpass (osm-derived). Airport hardcoded BLR ARP (authoritative).
    Highway: motorway junctions + nearest node on trunk/motorway ways. Gated by
    `feature.geo.transport-access`.
    """
    _require_flag(_TRANSPORT_FLAG)
    return await fetch_transport_access(lat, lon, radius_m)


@router.get("/parcel", response_model=ParcelGeometry)
async def get_parcel(
    survey_no: str = Query(..., min_length=1),
    village_code: str | None = Query(None),
    kgis_village_id: str | None = Query(None),
    lat: float | None = Query(None),
    lon: float | None = Query(None),
    crs: str = Query("DD"),
) -> ParcelGeometry:
    """Survey-number → parcel polygon (KGIS, SAT-19).

    Resolution order:
    1. explicit `kgis_village_id`, else resolve it from `village_code`;
    2. if `village_code` is absent but `lat`/`lon` are given, derive it via KGIS
       reverse geocode (`getlocationdetails`);
    3. fetch the polygon via `geomForSurveyNum`; if that yields nothing, fall back to a
       direct KGIS Cadastral-layer query by village code + survey number.

    When nothing resolves, returns `resolved=False` + `geometry=None` (no fabrication).
    """
    _require_flag(_PARCEL_FLAG)
    geometry = None
    village_code_eff = village_code
    vid = kgis_village_id
    async with httpx.AsyncClient(
        timeout=12, headers={"User-Agent": "SAT-SiteAnalysisTool/1.0"}
    ) as client:
        if not village_code_eff and lat is not None and lon is not None:
            ctx = await kgis_service.fetch_kgis_context(lat, lon, client)
            if ctx:
                village_code_eff = ctx.get("village_code")
        if not vid:
            vid = await kgis_service.resolve_kgis_village_id(village_code_eff, client)
        if vid:
            geometry = await kgis_service.fetch_parcel_geometry(vid, survey_no, client, crs=crs)
        if geometry is None and village_code_eff:
            geometry = await kgis_service.fetch_parcel_geometry_direct(
                village_code_eff, survey_no, client
            )
    # KGIS-live is the ONLY source of a parcel polygon. There is no public vector-parcel
    # equivalent, so a KGIS miss is honest degradation → unresolved (no synthesized
    # boundary, no inferred polygon). resolved / geometry are unchanged from before.
    if geometry is not None:
        provenance = Provenance(
            tier="authoritative", mode="kgis-live",
            data_source="KGIS geomForSurveyNum (KSRSAC)", data_vintage=None,
        )
    else:
        provenance = Provenance(
            tier="unresolved", mode="unresolved",
            data_source="KGIS geomForSurveyNum (KSRSAC)", data_vintage=None,
            reason="KGIS returned no parcel polygon; there is no public vector-parcel "
            "fallback to infer a boundary from.",
            next_action="draw the site boundary; cross-check area against the Bhoomi RTC; "
            "open the parcel in Dishaank.",
        )
    return ParcelGeometry(
        survey_number=survey_no,
        village_code=village_code_eff,
        kgis_village_id=vid,
        geometry=geometry,
        resolved=geometry is not None,
        provenance=provenance,
        lat=lat,
        lon=lon,
    )


@router.get("/authority", response_model=AuthorityResult)
async def get_authority(
    lat: float = Query(...),
    lon: float = Query(...),
) -> AuthorityResult:
    """Governing local authority + bye-laws / approval track for a point (US-093).

    GBA-aware (BBMP dissolved 15-May-2025). Best-effort from KGIS admin context; the
    authoritative Boundaries/LPA point-in-polygon check is deferred (`live_verified=false`)
    until KGIS access lands. Gated by `feature.geo.authority`.
    """
    _require_flag(_AUTHORITY_FLAG)
    async with httpx.AsyncClient(
        timeout=10, headers={"User-Agent": "SAT-SiteAnalysisTool/1.0"}
    ) as client:
        return await detect_authority(lat, lon, client)


@router.get("/overlays", response_model=OverlayResult)
def get_overlays(
    lat: float = Query(...),
    lon: float = Query(...),
    building_height_m: float | None = Query(None),
) -> OverlayResult:
    """US-088 — unified deal-killer overlay engine.

    Every overlay (rajakaluve, airport-OLS, lakes, wetland, flood, forest, HT-line, gas) with
    its distance (EPSG:32643), strictest dated buffer, R/A/G/unresolved status, citation and
    provenance. CARDINAL RULE: an overlay with no bundled clearing layer returns `unresolved`,
    never clear — absence of data is NOT absence of hazard. `verdict.hard_no_go` (any RED) and
    `verdict.blocks_clean_go` (any unresolved) feed the US-092 GO/NO-GO engine. Gated by
    `feature.geo.overlays`. KA-only (lat/lon swap + bounds asserted → 422 on a bad point).
    """
    _require_flag(_OVERLAYS_FLAG)
    from app.services.overlay_engine import evaluate_overlays

    try:
        return evaluate_overlays(lat, lon, building_height_m=building_height_m)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/ring", response_model=RingResult)
def get_ring(
    lat: float = Query(...),
    lon: float = Query(...),
) -> RingResult:
    """US-082 Part 1 — RMP-2015 planning ring (I/II/III = TDR Zones A/B/C).

    Point-in-polygon against OSM-derived Core/Outer Ring Road + LPA-proxy polygons; ALWAYS
    `inferred`. A point beyond the LPA proxy, or one whose deciding polygon is unavailable, is
    `unresolved` — never defaulted to Ring III. Feeds Additional-FAR by ring (reg 3.4.v). Gated by
    `feature.geo.zone-resolver`. KA-only (lat/lon swap + bounds asserted → 422).
    """
    _require_flag(_ZONE_RESOLVER_FLAG)
    from app.services.ring_service import classify_ring

    try:
        return RingResult(**classify_ring(lat, lon))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/zone-resolve", response_model=ZoneResolution)
async def get_zone_resolution(
    lat: float = Query(...),
    lon: float = Query(...),
    user_zone: str | None = Query(None),
    user_sub_zone: str | None = Query(None),
    user_attested: bool = Query(False),
    user_confirmed_date: str | None = Query(None),
    include_osm_hint: bool = Query(True),
) -> ZoneResolution:
    """US-082 Part 2 — tiered zone resolver: RMP seam (authoritative) > user-confirmed
    (authoritative-on-attestation, kept distinct) > OSM/Bhuvan (inferred HINT) > unresolved.

    The OSM proposal is read from `analyze_zone` (the P0-fixed geo zone) unless `include_osm_hint`
    is false or a user/RMP tier is supplied. A user-confirmed zone LIFTS `far_zone_confidence` to
    authoritative but is tagged `source="user-confirmed"`, visibly distinct from an RMP read.
    Gated by `feature.geo.zone-resolver`.
    """
    _require_flag(_ZONE_RESOLVER_FLAG)
    from app.services.zone_resolver import resolve_zone

    inp: dict = {}
    if user_zone:
        inp.update(user_zone=user_zone, user_sub_zone=user_sub_zone,
                   user_attested=user_attested, user_confirmed_date=user_confirmed_date)
    # Fetch the OSM/Bhuvan (or RMP-seam) proposal. Never fatal — a network miss just means no hint.
    if include_osm_hint or not user_zone:
        try:
            zr = await _service.analyze_zone(
                lat, lon, kgis_enabled=_KGIS_FLAG in _enabled_flags()
            )
            if zr.zone_authority == "BDA-RMP-2015":
                inp.update(rmp_zone=zr.zone_class, rmp_vintage="RMP-2015")
            else:
                inp.update(osm_zone=zr.zone_class, osm_vintage=zr.lulc_vintage,
                           osm_data_source=zr.data_source)
        except HTTPException:
            pass  # OSM upstream down -> resolve on whatever tier remains (user / unresolved)
    return ZoneResolution(**resolve_zone(inp))
