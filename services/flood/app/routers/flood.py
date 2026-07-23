# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import os

from app.models.flood import FloodReport, FloodRequest, TerrainRequest, TerrainResult
from app.services.flood_service import FloodRiskService
from fastapi import APIRouter, HTTPException

_FLOOD_FLAG = "feature.flood.risk-analysis"
_TERRAIN_FLAG = "feature.flood.terrain"


def _require_flag(flag: str = _FLOOD_FLAG) -> None:
    enabled = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}
    if flag not in enabled:
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {flag}")


service = FloodRiskService()
router = APIRouter(prefix="/flood", tags=["flood"])
flood_router = router


@router.post("/analyze", response_model=FloodReport)
def analyze_flood(request: FloodRequest) -> FloodReport:
    _require_flag()
    return service.analyze(request)


@router.post("/terrain", response_model=TerrainResult)
def analyze_terrain(request: TerrainRequest) -> TerrainResult:
    """US-089 — slope / HAND / cut-fill (GLO-30 DEM window) + manual geotech bearing capacity.

    Slope is COMPUTED in a metric CRS with nodata masked; a >20%-nodata window returns
    `unresolved`, never a phantom 0.0. Bearing capacity is authoritative only when a manual
    geotechnical value is supplied (never inferred from soil type). Gated by
    `feature.flood.terrain`.
    """
    _require_flag(_TERRAIN_FLAG)
    from app.services.terrain_service import analyze_terrain as _analyze

    return TerrainResult(**_analyze(request.model_dump()))
