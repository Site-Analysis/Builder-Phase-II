from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


ZoneClass = Literal["Residential", "Commercial", "Industrial", "Mixed Use", "Institutional"]
Severity = Literal["low", "moderate", "high", "none"]
RoadWidthSource = Literal["user_input", "osm_detected", "default_9m"]


class PlanningRequest(BaseModel):
    latitude: float
    longitude: float
    plot_area_sqm: float = Field(..., ge=1)
    zone_class: ZoneClass = "Residential"
    road_width_m: Optional[float] = None  # None → auto-detect from OSM


class AirportRestriction(BaseModel):
    nearest_airport: str
    iata_code: str
    distance_km: float
    max_height_m: Optional[float] = None
    restriction_surface: str
    dgca_noc_required: bool
    lat: Optional[float] = None
    lon: Optional[float] = None


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
    metro_station_name: Optional[str] = None
    metro_distance_m: Optional[float] = None
    metro_lat: Optional[float] = None
    metro_lon: Optional[float] = None
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
