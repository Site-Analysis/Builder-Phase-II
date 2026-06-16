from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Query

from app.models.future_infra import PipelineResult
from app.services.pipeline_service import PipelineService

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
