from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException

from app.models.infrastructure import InfraRequest, InfraResult
from app.services.infrastructure_service import InfrastructureService

_INFRA_FLAG = "feature.infrastructure.connectivity"


def _require_flag() -> None:
    enabled = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}
    if _INFRA_FLAG not in enabled:
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {_INFRA_FLAG}")


router = APIRouter(prefix="/infrastructure", tags=["infrastructure"])
infra_router = router
_service = InfrastructureService()


@router.post("/analyze", response_model=InfraResult)
async def analyze_infrastructure(request: InfraRequest) -> InfraResult:
    _require_flag()
    return await _service.analyze(request.latitude, request.longitude, request.radius_m)
