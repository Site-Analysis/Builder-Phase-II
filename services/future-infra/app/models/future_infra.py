# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, model_validator

PipelineType = Literal[
    "metro",
    "expressway",
    "ring_road",
    "it_park",
    "sez",
    "township",
    "bus_terminal",
    "railway",
    "airport",
    "industrial_area",
]
# US-090: added "Cancelled" and "Tendered". A cancelled/stalled project is a real accuracy hazard —
# it must be visible AND excluded from any score / price upside, never counted as "upcoming".
PipelineStatus = Literal[
    "Operational", "Under Construction", "Approved", "Planned", "Proposed", "Tendered", "Cancelled",
]
Severity = Literal["low", "moderate", "high", "none"]

# Statuses that may contribute to price upside / a positive growth score. A project that is only
# Approved/Planned/Proposed is a future prospect (not built value); Cancelled/Tendered contribute
# NOTHING. Kept here so every consumer filters identically.
UPSIDE_STATUSES: frozenset[str] = frozenset({"Operational", "Under Construction"})
DEAD_STATUSES: frozenset[str] = frozenset({"Cancelled", "Tendered"})


class PipelineItem(BaseModel):
    type: PipelineType
    name: str
    description: str | None = None
    status: PipelineStatus
    expected_completion: str | None = None
    distance_km: float
    source: str
    source_date: str
    status_as_of: str | None = None      # US-090: when the status was last verified
    contributes_to_upside: bool = False  # True only for Operational / Under Construction


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


# ── US-090 PART 2: curated metro proximity (fills the US-086 metro seam) ──────────────────────────
class MetroNearest(BaseModel):
    """Nearest curated metro-corridor node to a point, EPSG:32643 straight-line. This is the
    `metro_fetched` record the infrastructure /connectivity endpoint consumes. Confidence is
    INFERRED — curated approximate alignment vertices, NOT live BMRCL GTFS station points."""
    status: Literal["resolved", "unresolved"]
    name: str | None = None
    ref: str | None = None
    corridor_status: str | None = None        # the corridor's own pipeline status
    distance_m: float | None = None
    distance_type: Literal["straight-line"] = "straight-line"
    confidence: Literal["inferred", "unresolved"] = "unresolved"
    crs: Literal["EPSG:32643"] = "EPSG:32643"
    data_source: str = "future-infra curated metro alignment (approximate)"
    vintage: str | None = None
    reason: str | None = None


# ── US-090 PART 3: indicative price upside — a RANGE, never a scalar ──────────────────────────────
class PriceUpside(BaseModel):
    """Indicative price-upside RANGE from hedonic distance-decay off the nearest qualifying infra
    node. There is DELIBERATELY no single scalar price field — a point estimate would masquerade as
    a valuation. Both bounds are required and low <= high is enforced."""
    low: float
    high: float
    unit: str = "INR/sqm (uplift over guidance value)"
    node_name: str | None = None
    node_type: str | None = None
    node_status: str | None = None
    node_distance_m: float | None = None
    premium_low_pct: float | None = None
    premium_high_pct: float | None = None
    method: str
    confidence: Literal["inferred"] = "inferred"
    as_of: str

    @model_validator(mode="after")
    def _check_range(self) -> PriceUpside:
        if self.low > self.high:
            raise ValueError(f"price_upside low ({self.low}) must be <= high ({self.high})")
        return self


class PriceUpsideRequest(BaseModel):
    lat: float
    lon: float
    guidance_value_per_sqm: float | None = None   # caller-supplied / Kaveri seam; None -> unresolved


class PriceUpsideResult(BaseModel):
    status: Literal["resolved", "unresolved"]
    upside: PriceUpside | None = None          # None when unresolved — NEVER a zero-filled scalar
    guidance_value_per_sqm: float | None = None
    reason: str | None = None
    disclaimer: str = (
        "INDICATIVE range only — a hedonic distance-decay estimate (MPRA 124686 method), NOT a "
        "valuation. It does not account for parcel-specific factors, encumbrances, or current market "
        "conditions. Consult a registered valuer before any transaction."
    )
