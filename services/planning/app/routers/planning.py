from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException

from app.models.planning import PlanningRequest, PlanningResult
from app.services.planning_service import PlanningService

_PLANNING_FLAG = "feature.planning.site-capacity"


def _require_flag() -> None:
    enabled = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}
    if _PLANNING_FLAG not in enabled:
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {_PLANNING_FLAG}")


router = APIRouter(prefix="/planning", tags=["planning"])
planning_router = router
_service = PlanningService()


@router.post("/analyze", response_model=PlanningResult)
async def analyze_planning(request: PlanningRequest) -> PlanningResult:
    _require_flag()
    return await _service.analyze(request)
