# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ZoneClass = Literal["Residential", "Commercial", "Industrial", "Mixed Use", "Institutional"]
Severity = Literal["low", "moderate", "high", "none"]
RoadWidthSource = Literal["user_input", "osm_detected", "default_9m"]


class PlanningRequest(BaseModel):
    latitude: float
    longitude: float
    plot_area_sqm: float = Field(..., ge=1)
    zone_class: ZoneClass = "Residential"
    road_width_m: float | None = None  # None → auto-detect from OSM


WidthConfidence = Literal["authoritative", "inferred", "unresolved"]


class RoadWidthBand(BaseModel):
    min: float
    max: float | None = None  # null = open-ended top band


class RoadWidthRequest(BaseModel):
    """Best-available road-width inputs. All optional; the best tier present wins (surveyed >
    MapTiler measurement > probe-confirmed KGIS > lane estimate)."""

    zone: ZoneClass = "Residential"
    sub_zone: str | None = None
    plot_area_sqm: float | None = Field(default=None, ge=1)
    surveyed_width_m: float | None = Field(default=None, gt=0)      # tier 1 -> authoritative
    survey_date: str | None = None
    measured_width_m: float | None = Field(default=None, gt=0)      # tier 2 -> inferred (default)
    imagery_date: str | None = None
    kgis_width_m: float | None = Field(default=None, gt=0)          # tier 3 -> probe-gated
    kgis_probe_confirmed: bool = False
    kgis_vintage: str | None = None
    lane_count: int | None = Field(default=None, ge=1)              # tier 4 -> inferred (weakest)
    service_road_widths_m: list[float] | None = None               # reg 3.2.ii aggregation
    frontage_roads_m: list[float] | None = None                    # corner/multi-frontage
    saleable_value_per_sqm: float | None = Field(default=None, ge=0)
    survey_cost: float | None = Field(default=None, ge=0)


class RoadWidthOptionValue(BaseModel):
    far_low: float | None = None
    far_high: float | None = None
    far_delta: float | None = None
    extra_buildable_sqm: float | None = None
    extra_value: float | None = None
    survey_cost: float | None = None
    note: str


class RoadWidthFloorCap(BaseModel):
    residential_sqm: float
    commercial_sqm: float
    reg_basis: str


class RoadWidthResult(BaseModel):
    """A road-width BAND (or edge-straddling RANGE) + confidence tier — never a
    false-authoritative point. ``max_far_confidence`` propagates the ceiling downstream: an
    inferred width can only yield a derived FAR."""

    status: Literal["resolved", "unresolved"]
    value_m: float | None = None
    band: RoadWidthBand | None = None
    confidence: WidthConfidence
    data_source: str | None = None
    data_vintage: str | None = None
    error_band_m: list[float] | None = None
    reg_basis: list[str] = []
    survey_required: bool
    band_range: list[RoadWidthBand] | None = None
    option_value: RoadWidthOptionValue | None = None
    floor_area_cap: RoadWidthFloorCap | None = None
    max_far_confidence: Literal["authoritative", "derived", "unresolved"]
    reason: str | None = None
    next_action: str | None = None
    notes: list[str] = []


class AirportRestriction(BaseModel):
    nearest_airport: str
    iata_code: str
    distance_km: float
    max_height_m: float | None = None
    restriction_surface: str
    dgca_noc_required: bool
    lat: float | None = None
    lon: float | None = None


class PlanningResult(BaseModel):
    far_applicable: float
    far_source: str
    ground_coverage_max: float
    setback_front_m: float
    setback_rear_m: float
    setback_side_m: float
    max_height_m: float
    height_limiting_factor: str
    buildable_area_sqm: float
    road_width_used_m: float
    road_width_source: RoadWidthSource
    tod_applicable: bool = False
    metro_station_name: str | None = None
    metro_distance_m: float | None = None
    metro_lat: float | None = None
    metro_lon: float | None = None
    airport_restriction: AirportRestriction
    score: float
    severity: Severity
    data_source: str
    data_disclaimer: str = (
        "FAR and setbacks sourced from NBC 2016 Table 15 and BDA CDP 2031 Regulation 8. "
        "BDA TOD Notification 2020: FAR 4.0 applies within 500m of metro stations (Residential/Mixed Use). "
        "Road width auto-detected from OSM when not provided; verify with site measurement. "
        "ICAO Annex 14 surfaces are approximated for Code 4 airports. "
        "Obtain DGCA / AAI NOC clearance and verify with BDA/BBMP before design."
    )
