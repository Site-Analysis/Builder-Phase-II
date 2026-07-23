# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

RiskCategory = Literal["Very Low", "Low", "Moderate", "High", "Very High"]


class FloodRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90, description="Latitude in decimal degrees")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude in decimal degrees")
    radius_meters: float = Field(1000.0, gt=0, description="Analysis radius in meters")


class FloodComponentScores(BaseModel):
    elevation_risk: float
    hydrology_risk: float
    historical_risk: float
    llai_risk: float


class ElevationAnalysis(BaseModel):
    mean_m: float
    min_m: float
    max_m: float
    range_m: float
    # US-089 bug fix: slope CANNOT be computed from a single point — it was hardcoded 0.0, which
    # read as "flat" (a silent false-negative). Now null at a point, with a note pointing to the
    # DEM-window /flood/terrain endpoint. Never a fabricated 0.0.
    slope_degrees: float | None = None
    slope_note: str | None = None
    low_lying_area_pct: float
    terrain_classification: str


class HydrologyAnalysis(BaseModel):
    flow_accumulation: float
    nearest_river_distance_m: float
    water_occurrence_pct: float
    drainage_density: float
    river_proximity_risk: str


class FloodHistory(BaseModel):
    historical_events_count: int
    annual_rainfall_mm: float
    flood_history_score: float


class LowLyingAreaIndex(BaseModel):
    mean: float
    min: float
    max: float
    primary_risk_category: str


class FloodMetadata(BaseModel):
    latitude: float
    longitude: float
    radius_meters: float
    data_source: str
    gee_enabled: bool


Confidence = Literal["authoritative", "inferred", "unresolved"]


class TerrainRequest(BaseModel):
    """US-089 terrain inputs. `parcel_geojson` is a GeoJSON Polygon (WGS84). `target_pad_m` sets
    the cut-fill datum (defaults to parcel mean). Bearing capacity is MANUAL-only."""

    parcel_geojson: dict = Field(..., description="GeoJSON Polygon (WGS84) of the parcel")
    target_pad_m: float | None = Field(default=None, description="cut-fill target pad level (m)")
    bearing_capacity_kpa: float | None = Field(default=None, gt=0)
    geotech_method: str | None = None       # e.g. "IS 6403 SBC", "plate-load", "SPT-derived"
    geotech_source: str | None = None


class SlopeResult(BaseModel):
    status: Literal["resolved", "unresolved"]
    confidence: Confidence
    slope_pct_mean: float | None = None
    slope_pct_max: float | None = None
    slope_deg_mean: float | None = None
    nodata_pct: float | None = None
    dem_source: str | None = None
    crs: str | None = None
    reason: str | None = None
    next_action: str | None = None


class HandResult(BaseModel):
    status: Literal["resolved", "unresolved"]
    confidence: Confidence
    hand_m_mean: float | None = None
    hand_m_max: float | None = None
    drainage_elev_m: float | None = None
    method_note: str | None = None
    reason: str | None = None
    next_action: str | None = None


class CutFillResult(BaseModel):
    status: Literal["resolved", "unresolved"]
    confidence: Confidence
    target_pad_m: float | None = None
    target_source: str | None = None
    cut_m3: float | None = None
    fill_m3: float | None = None
    net_m3: float | None = None
    cell_area_m2: float | None = None
    reason: str | None = None
    next_action: str | None = None


class BearingCapacityResult(BaseModel):
    """MANUAL tier ONLY — bearing capacity cannot be inferred remotely (soil type != SBC).
    Absent a user value it is `unresolved`, never estimated from SoilGrids."""

    status: Literal["resolved", "unresolved"]
    confidence: Confidence
    value_kpa: float | None = None
    method: str | None = None
    source: str | None = None
    reason: str | None = None
    next_action: str | None = None


class TerrainResult(BaseModel):
    status: Literal["resolved", "unresolved"]
    slope: SlopeResult
    hand: HandResult
    cut_fill: CutFillResult
    bearing_capacity: BearingCapacityResult
    dem_source: str
    notes: list[str] = []
    data_disclaimer: str = (
        "Slope/HAND/cut-fill are DEM-derived (Copernicus GLO-30, inferred) — verify against a "
        "surveyed contour plan before earthwork. HAND is a parcel-window approximation. Bearing "
        "capacity is authoritative ONLY when a manual geotechnical value is supplied; it is never "
        "inferred from soil type. FABDEM (non-commercial) is not used."
    )


class FloodReport(BaseModel):
    overall_score: float
    risk_category: RiskCategory
    component_scores: FloodComponentScores
    elevation: ElevationAnalysis
    hydrology: HydrologyAnalysis
    flood_history: FloodHistory
    llai: LowLyingAreaIndex
    recommendations: list[str]
    visualization_urls: dict[str, str]
    metadata: FloodMetadata
