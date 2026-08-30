# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Query

from app.models.future_infra import (
    MetroNearest,
    PipelineResult,
    PriceUpsideRequest,
    PriceUpsideResult,
)
from app.services.pipeline_service import PipelineService
from app.services.price_service import build_price_upside

_GROWTH_FLAG = "feature.context.growth-pipeline"


def _require_flag() -> None:
    enabled = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}
    if _GROWTH_FLAG not in enabled:
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {_GROWTH_FLAG}")


router = APIRouter(prefix="/future-infra", tags=["future-infra"])
future_infra_router = router
_service = PipelineService()


@router.get("/pipeline", response_model=PipelineResult)
def get_pipeline(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_km: float = Query(10.0),
) -> PipelineResult:
    _require_flag()
    return _service.get_pipeline(lat, lon, radius_km)


@router.get("/metro-nearest", response_model=MetroNearest)
def get_metro_nearest(
    lat: float = Query(...),
    lon: float = Query(...),
) -> MetroNearest:
    """US-090 PART 2 — nearest curated metro-corridor node (EPSG:32643, straight-line, INFERRED).
    Fills the US-086 metro seam; consumed by /infrastructure/connectivity as `metro_fetched`."""
    _require_flag()
    return MetroNearest(**_service.nearest_metro(lat, lon))


@router.post("/price-upside", response_model=PriceUpsideResult)
def get_price_upside(request: PriceUpsideRequest) -> PriceUpsideResult:
    """US-090 PART 3 — indicative price-upside RANGE (never a scalar). Absent guidance value ->
    unresolved (not zero). Only operational/under-construction nodes contribute premium."""
    _require_flag()
    return PriceUpsideResult(**build_price_upside(
        request.lat, request.lon,
        guidance_value_per_sqm=request.guidance_value_per_sqm,
        features=_service.features(),
    ))
