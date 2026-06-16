from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel


class NearbyFeature(BaseModel):
    type: str
    value: str
    name: Optional[str] = None
    distance_m: float
    lat: Optional[float] = None
    lon: Optional[float] = None


class KgisContext(BaseModel):
    """Authoritative administrative context from KGIS. `admin_zone` is the BBMP
    administrative zone, NOT the RMP land-use zone."""
    type: Optional[str] = None            # "Urban" | "Rural"
    district: Optional[str] = None
    town: Optional[str] = None
    admin_zone: Optional[str] = None
    ward: Optional[str] = None
    taluk: Optional[str] = None
    hobli: Optional[str] = None
    village: Optional[str] = None
    survey_number: Optional[str] = None


ZoneClass = Literal[
    "Residential", "Commercial", "Industrial", "Agricultural",
    "Green Belt", "Water Body", "Institutional", "Mixed Use", "Restricted", "Unknown"
]
Severity = Literal["low", "moderate", "high", "none"]
SourceConfidence = Literal["authoritative", "community"]
BearingCapacityClass = Literal["Good (>150 kN/m²)", "Moderate (100–150 kN/m²)", "Poor (<100 kN/m²)"]


class ZoneResult(BaseModel):
    zone_class: ZoneClass
    zone_code: Optional[str] = None
    permitted_uses: list[str] = []
    base_far: Optional[float] = None
    permissible_ground_coverage: Optional[float] = None
    primary_landuse: str
    nearby_features: list[NearbyFeature] = []
    # Bhuvan ISRO LULC fields
    lulc_class: Optional[str] = None
    lulc_code: Optional[int] = None
    lulc_vintage: Optional[str] = None   # e.g. "2022-23" or "2019-20"
    na_order_required: bool = False
    forest_clearance_required: bool = False
    source_confidence: SourceConfidence = "community"
    kgis: Optional[KgisContext] = None    # authoritative admin context (flag-gated)
    score: float
    severity: Severity
    data_source: str
    data_disclaimer: str = (
        "Zone class inferred from OpenStreetMap tags — not official BDA/BBMP zoning. "
        "LULC (land cover) from ISRO NRSC Bhuvan when available — vintage shown in lulc_vintage. "
        "Verify with BDA Zoning Map or BBMP before any development decisions. "
        "na_order_required flag is indicative — verify current land use status with revenue records."
    )


class SoilResult(BaseModel):
    clay_pct: float
    sand_pct: float
    silt_pct: float
    bulk_density_gcm3: float
    ph: float
    texture_class: str
    bearing_capacity_class: BearingCapacityClass
    foundation_notes: str
    score: float
    severity: Severity
    data_source: str


class WaterBody(BaseModel):
    type: str
    name: Optional[str] = None
    distance_m: float
    buffer_zone_m: float
    buffer_source: str
    site_within_buffer: bool


class WaterConstraintResult(BaseModel):
    water_bodies: list[WaterBody] = []
    nearest_distance_m: Optional[float] = None
    construction_restricted: bool
    restriction_reason: Optional[str] = None
    score: float
    severity: Severity
    data_source: str
    data_disclaimer: str = (
        "Water bodies sourced from OpenStreetMap — coverage may be incomplete. "
        "Buffer distances per Karnataka/NGT regulations; verify exact FTL boundary "
        "with BBMP/local authority before construction. OSM 'not detected' does not confirm absence."
    )


class AmenityItem(BaseModel):
    name: str
    type: str
    distance_m: float
    lat: Optional[float] = None
    lon: Optional[float] = None


class AmenityCategory(BaseModel):
    count: int = 0
    nearest_m: float = float("inf")
    top_5: list[AmenityItem] = []
    # All located amenities in this category (capped, sorted by distance) for
    # dense map rendering. top_5 is retained for the detail cards.
    points: list[AmenityItem] = []


class AmenitiesResult(BaseModel):
    radius_m: float
    healthcare: AmenityCategory
    education: AmenityCategory
    retail: AmenityCategory
    finance: AmenityCategory
    recreation: AmenityCategory
    religious: AmenityCategory
    transport: AmenityCategory
    total_count: int
    score: float
    severity: Severity
    data_source: str
