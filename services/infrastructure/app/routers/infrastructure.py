# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, HTTPException

from app.models.infrastructure import (
    ConnectivityRequest,
    ConnectivityResult,
    InfraRequest,
    InfraResult,
    UtilitiesResult,
)
from app.services.infrastructure_service import InfrastructureService

_INFRA_FLAG = "feature.infrastructure.connectivity"
_UTILITIES_FLAG = "feature.infrastructure.utilities"
_PLANNING_URL = os.getenv("PLANNING_API_URL", "http://localhost:8006")


def _require_flag(flag: str = _INFRA_FLAG) -> None:
    enabled = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}
    if flag not in enabled:
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {flag}")


router = APIRouter(prefix="/infrastructure", tags=["infrastructure"])
infra_router = router
_service = InfrastructureService()


@router.post("/analyze", response_model=InfraResult)
async def analyze_infrastructure(request: InfraRequest) -> InfraResult:
    _require_flag()
    return await _service.analyze(request.latitude, request.longitude, request.radius_m)


@router.post("/utilities", response_model=UtilitiesResult)
async def analyze_utilities(request: InfraRequest) -> UtilitiesResult:
    """US-087 — water/telecom availability (inferred OSM proxy) + BWSSB main tier
    (authoritative-only; 'unknown' without the BWSSB layer) + NOC checklist + infra_readiness for
    US-092. Gated by `feature.infrastructure.utilities`."""
    _require_flag(_UTILITIES_FLAG)
    return UtilitiesResult(**await _service.get_utilities(
        request.latitude, request.longitude, request.radius_m))


@router.post("/connectivity", response_model=ConnectivityResult)
async def analyze_connectivity(request: ConnectivityRequest) -> ConnectivityResult:
    """US-086 — connectivity owner: airport (straight-line, EPSG:32643, bundled AAI ARP) + metro/
    rail/highway seams (unresolved when the source is not fetchable — never fabricated) + the
    access-road width from the planning road_width_resolver. Emits a connectivity_signal for
    US-092. Gated by `feature.infrastructure.connectivity`."""
    _require_flag(_INFRA_FLAG)
    from app.services.connectivity_service import build_connectivity

    # ROAD WIDTH — reuse the planning road_width_resolver (do NOT reimplement). Fetch over HTTP;
    # if the tiers are absent / planning is unreachable, the resolver/seam yields unresolved.
    road_width_result: dict | None = None
    rw_inputs = {k: v for k, v in {
        "surveyed_width_m": request.surveyed_width_m,
        "measured_width_m": request.measured_width_m,
        "lane_count": request.lane_count,
    }.items() if v is not None}
    if rw_inputs:
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                resp = await c.post(f"{_PLANNING_URL}/planning/road-width", json=rw_inputs)
                if resp.status_code == 200:
                    road_width_result = resp.json()
        except Exception:
            road_width_result = None  # planning unreachable -> unresolved (never fabricated)

    # metro/rail/highway sources are not fetchable in this environment -> inert seams (unresolved).
    result = build_connectivity(
        request.latitude, request.longitude,
        metro_fetched=None, rail_fetched=None, highway_fetched=None,
        road_width_result=road_width_result,
    )
    return ConnectivityResult(**result)
