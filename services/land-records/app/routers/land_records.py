# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException

from app.models.land_records import (
    LandRecordsRequest,
    LandRecordsResult,
    OwnershipRequest,
    OwnershipSnapshot,
)
from app.services.land_records_service import analyze

_LAND_FLAG = "feature.land.records"
_OWNERSHIP_FLAG = "feature.land.ownership"

router = APIRouter(prefix="/land-records", tags=["land-records"])
land_records_router = router


def _require_flag(flag: str = _LAND_FLAG) -> None:
    enabled = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}
    if flag not in enabled:
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {flag}")


@router.post("/lookup", response_model=LandRecordsResult)
def lookup_land_records(req: LandRecordsRequest) -> LandRecordsResult:
    _require_flag()
    return analyze(req)


@router.post("/ownership", response_model=OwnershipSnapshot)
def ownership_snapshot(req: OwnershipRequest) -> OwnershipSnapshot:
    """US-091 — ownership SCREENING snapshot: Kharab (KGIS L5) + Gomala/restricted (Dishaank) flags
    derived ONLY when the parcel resolved (else UNRESOLVED, never 'clean'); deep-links to Bhoomi/
    e-Aasthi/e-Swathu/Kaveri/Dishaank; and an ownership_feasibility signal for US-092. No owner is
    ever fetched or inferred. Gated by `feature.land.ownership`."""
    _require_flag(_OWNERSHIP_FLAG)
    from app.services.ownership_service import build_ownership_snapshot

    return OwnershipSnapshot(**build_ownership_snapshot(
        district=req.district, taluk=req.taluk, hobli=req.hobli, village=req.village,
        survey_number=req.survey_number, parcel_resolved=req.parcel_resolved,
        cadastral_l5=req.cadastral_l5, dishaank_class=req.dishaank_class,
    ))
