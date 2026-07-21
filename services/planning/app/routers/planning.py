# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.config.rmp_loader import load_config
from app.models.planning import (
    PlanningRequest,
    PlanningResult,
    RoadWidthRequest,
    RoadWidthResult,
)
from app.services import road_width_resolver as rwr
from app.services.planning_service import PlanningService

_PLANNING_FLAG = "feature.planning.site-capacity"
_ROAD_WIDTH_FLAG = "feature.planning.road-width-resolver"
_RMP_CONFIG = Path(__file__).resolve().parents[1] / "config" / "rmp_2015.json"


def _enabled_flags() -> set[str]:
    return {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}


def _require_flag(flag: str = _PLANNING_FLAG) -> None:
    if flag not in _enabled_flags():
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {flag}")


router = APIRouter(prefix="/planning", tags=["planning"])
planning_router = router
_service = PlanningService()
# Band structure is loaded once; a broken/absent config degrades to the canonical RMP edges.
try:
    _rmp_cfg: dict | None = load_config(_RMP_CONFIG)
except Exception:  # noqa: BLE001 — resolver falls back to canonical band edges
    _rmp_cfg = None


@router.post("/analyze", response_model=PlanningResult)
async def analyze_planning(request: PlanningRequest) -> PlanningResult:
    _require_flag()
    return await _service.analyze(request)


@router.post("/road-width", response_model=RoadWidthResult)
async def resolve_road_width(request: RoadWidthRequest) -> RoadWidthResult:
    """Resolve a road width to a FAR band (or edge-straddling range) + confidence tier (US-084).

    No authoritative queryable road source exists (reg 3.2 = surveyed RoW), so this returns a
    BAND with a tier, never a false-authoritative point. Gated by ``feature.planning.road-width-resolver``.
    """
    _require_flag(_ROAD_WIDTH_FLAG)
    out = rwr.resolve_road_width(
        request.model_dump(exclude_none=True),
        cfg=_rmp_cfg,
        zone=request.zone,
        sub_zone=request.sub_zone,
    )
    return RoadWidthResult(**out)
