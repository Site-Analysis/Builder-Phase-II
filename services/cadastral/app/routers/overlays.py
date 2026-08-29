# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Infrastructure overlay endpoints: road widths, encroachment, water/power/gas layers.

All responses are GeoJSON FeatureCollection (application/json).
Missing source parquets return empty FeatureCollection — never crash, never fabricate geometry.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from app.services import cadastral_service as cs
from app.services import overlay_service as ov

_OVERLAY_FLAG = "feature.cadastral.overlays"

router = APIRouter(tags=["overlays"])


def _require_flag() -> None:
    enabled = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}
    if _OVERLAY_FLAG not in enabled:
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {_OVERLAY_FLAG}")


def _json(content: str) -> Response:
    return Response(content=content, media_type="application/json")


@router.get("/lgd-villages")
def lgd_villages() -> Response:
    """Karnataka village boundaries (LGD source) with covered=true where e-Chawadi data exists."""
    _require_flag()
    return _json(ov.lgd_villages_geojson(cs.RCCMS_DB))


@router.get("/road-width")
def road_width(bbox: str | None = Query(None, description="minlng,minlat,maxlng,maxlat")) -> Response:
    """Road widths (BBMP + OSM) with RMP FAR tier pre-computed as far_rmp on each feature."""
    _require_flag()
    return _json(ov.road_width_geojson(bbox))


@router.get("/encroachment")
def encroachment(bbox: str | None = Query(None, description="minlng,minlat,maxlng,maxlat")) -> Response:
    """Rajakaluve encroachment parcels (BBMP + Revenue Dept). 404 if dataset not yet built."""
    _require_flag()
    result = ov.encroachment_geojson(bbox)
    if result is None:
        raise HTTPException(status_code=404, detail="encroachment_parcels.parquet not yet built")
    return _json(result)


@router.get("/bwssb-sewerage")
def bwssb_sewerage(
    tier: str | None = Query(None, description="300+ | 150-300 | <150"),
    bbox: str | None = Query(None),
) -> Response:
    """BWSSB sewerage network by pipe diameter tier."""
    _require_flag()
    return _json(ov.bwssb_sewerage_geojson(tier, bbox))


@router.get("/osm-powerlines")
def osm_powerlines(bbox: str | None = Query(None)) -> Response:
    """OSM power lines classified EHV/HV/MV by voltage."""
    _require_flag()
    return _json(ov.osm_powerlines_geojson(bbox))


@router.get("/gas-pipelines")
def gas_pipelines(bbox: str | None = Query(None)) -> Response:
    """OSM gas pipeline network."""
    _require_flag()
    return _json(ov.gas_pipelines_geojson(bbox))


@router.get("/gas-nodes")
def gas_nodes(bbox: str | None = Query(None)) -> Response:
    """OSM gas infrastructure nodes (compressors, CNG/LNG, GAIL)."""
    _require_flag()
    return _json(ov.gas_nodes_geojson(bbox))


@router.get("/drainage")
def drainage(bbox: str | None = Query(None)) -> Response:
    """OSM waterways (drain/canal/stream) merged with HydroRIVERS (Strahler ≥3)."""
    _require_flag()
    return _json(ov.drainage_geojson(bbox))


@router.get("/wris-lakes")
def wris_lakes(bbox: str | None = Query(None)) -> Response:
    """WRIS water bodies (Govt of India Water Resources Information System)."""
    _require_flag()
    return _json(ov.wris_lakes_geojson(bbox))


@router.get("/bescom-boundaries")
def bescom_boundaries() -> Response:
    """BESCOM electricity distribution boundaries (division/section/subdivision)."""
    _require_flag()
    return _json(ov.bescom_boundaries_geojson())


@router.get("/hydrorivers")
def hydrorivers(bbox: str | None = Query(None)) -> Response:
    """HydroRIVERS river network. strahler property: ≥3 = major river, <3 = minor."""
    _require_flag()
    return _json(ov.hydrorivers_geojson(bbox))


@router.get("/bbmp-swd")
def bbmp_swd(bbox: str | None = Query(None)) -> Response:
    """BBMP storm water drain lines. tier property: primary/secondary/tertiary."""
    _require_flag()
    return _json(ov.bbmp_swd_geojson(bbox))


@router.get("/cgd-zones")
def cgd_zones() -> Response:
    """PNGRB City Gas Distribution zone boundaries. 404 if dataset not available."""
    _require_flag()
    result = ov.cgd_zones_geojson()
    if result is None:
        raise HTTPException(status_code=404, detail="pngrb_cgd_zones.geojson not found")
    return _json(result)
