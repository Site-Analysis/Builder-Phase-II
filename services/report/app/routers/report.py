# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import os
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException

from app.models.report import ReportRequest, ReportResponse, ReportVerdict
from app.services import report_service as rs
from app.services import verdict_engine as ve

_REPORT_FLAG = "feature.report.go-no-go"


def _require_flag() -> None:
    enabled = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}
    if _REPORT_FLAG not in enabled:
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {_REPORT_FLAG}")


router = APIRouter(prefix="/report", tags=["report"])
report_router = router


@router.post("/go-no-go", response_model=ReportResponse)
def go_no_go(request: ReportRequest) -> ReportResponse:
    """US-092 — one-screen GO / CAUTION / NO-GO verdict + shareable report.

    Two-tier HONEST TRIAGE (never a weighted average): Tier-1 gate booleans -> any tripped = NO-GO;
    Tier-2 (gate-clear) -> GO only if no unresolved decision input, else CAUTION with a confirm-list.
    The verdict carries its own confidence (weakest decision input). The PDF renders from the LIVE
    aggregated values; a read-only snapshot + signed link is persisted (Supabase seam). Gated by
    `feature.report.go-no-go`.
    """
    _require_flag()
    generated_at = request.generated_at or datetime.now(UTC).isoformat()
    parcel = request.parcel.model_dump()
    verdict_dict = ve.compose(request.signals.model_dump(), parcel=parcel, generated_at=generated_at)
    verdict = ReportVerdict(**verdict_dict)

    report_id = rs.report_id_for(parcel, generated_at)
    pdf = rs.render_pdf(verdict_dict, enabled=request.render_pdf)
    share = rs.persist_and_share(verdict_dict, report_id, enabled=request.persist)
    return ReportResponse(report_id=report_id, verdict=verdict, share=share, pdf=pdf)
