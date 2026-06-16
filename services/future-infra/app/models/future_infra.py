from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel


PipelineType = Literal["metro", "expressway", "ring_road", "it_park", "sez", "township", "bus_terminal", "railway", "airport", "industrial_area"]
PipelineStatus = Literal["Operational", "Under Construction", "Approved", "Planned", "Proposed"]
Severity = Literal["low", "moderate", "high", "none"]


class PipelineItem(BaseModel):
    type: PipelineType
    name: str
    description: Optional[str] = None
    status: PipelineStatus
    expected_completion: Optional[str] = None
    distance_km: float
    source: str
    source_date: str


class PipelineResult(BaseModel):
    within_radius_km: float
    pipeline_items: list[PipelineItem]
    score: float
    severity: Severity
    data_source: str
    data_as_of: str
    data_disclaimer: str = (
        "Curated from public announcements (BMRCL, BDA, NHAI, KIADB, MoCI) as of 2024-Q4. "
        "Project alignments are approximate centroids — not official DPR shapefiles. "
        "Statuses may have changed. Verify with the originating agency before investment decisions."
    )
