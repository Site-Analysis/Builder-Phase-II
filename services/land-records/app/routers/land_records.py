from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException

from app.models.land_records import LandRecordsRequest, LandRecordsResult
from app.services.land_records_service import analyze

_LAND_FLAG = "feature.land.records"

router = APIRouter(prefix="/land-records", tags=["land-records"])
land_records_router = router


def _require_flag() -> None:
    enabled = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}
    if _LAND_FLAG not in enabled:
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {_LAND_FLAG}")


@router.post("/lookup", response_model=LandRecordsResult)
def lookup_land_records(req: LandRecordsRequest) -> LandRecordsResult:
    _require_flag()
    return analyze(req)
