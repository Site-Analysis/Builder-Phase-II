# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.models.geo import (
    AmenitiesResult,
    ParcelGeometry,
    SoilResult,
    WaterConstraintResult,
    ZoneResult,
)
from app.services import kgis_service
from app.services.amenities_service import AmenitiesService
from app.services.geo_service import GeoService
from app.services.soil_service import SoilService
from app.services.water_service import WaterService

_ZONE_FLAG = "feature.zoning.land-use"
_SOIL_FLAG = "feature.environment.soil"
_WATER_FLAG = "feature.environment.water-constraints"
_AMENITY_FLAG = "feature.geo.amenities"
_KGIS_FLAG = "feature.geo.kgis-context"
_PARCEL_FLAG = "feature.geo.parcel-geometry"


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


@router.get("/parcel", response_model=ParcelGeometry)
async def get_parcel(
    survey_no: str = Query(..., min_length=1),
    village_code: str | None = Query(None),
    kgis_village_id: str | None = Query(None),
    crs: str = Query("DD"),
) -> ParcelGeometry:
    """Survey-number → parcel polygon (KGIS geomForSurveyNum, SAT-19).

    `kgis_village_id` may be supplied directly; otherwise it is resolved from
    `village_code` (pending KSRSAC mapping — see `kgis_service.resolve_kgis_village_id`).
    When unresolved, returns `resolved=False` + `geometry=None` (no fabrication).
    """
    _require_flag(_PARCEL_FLAG)
    vid = kgis_village_id or kgis_service.resolve_kgis_village_id(village_code)
    geometry = None
    if vid:
        async with httpx.AsyncClient(
            timeout=10, headers={"User-Agent": "SAT-SiteAnalysisTool/1.0"}
        ) as client:
            geometry = await kgis_service.fetch_parcel_geometry(vid, survey_no, client, crs=crs)
    return ParcelGeometry(
        survey_number=survey_no,
        village_code=village_code,
        kgis_village_id=vid,
        geometry=geometry,
        resolved=geometry is not None,
    )
