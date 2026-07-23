# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException

from app.models.infrastructure import InfraRequest, InfraResult, UtilitiesResult
from app.services.infrastructure_service import InfrastructureService

_INFRA_FLAG = "feature.infrastructure.connectivity"
_UTILITIES_FLAG = "feature.infrastructure.utilities"


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
