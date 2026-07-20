# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class NearbyFeature(BaseModel):
    type: str
    value: str
    name: str | None = None
    distance_m: float
    lat: float | None = None
    lon: float | None = None


class KgisContext(BaseModel):
    """Authoritative administrative context from KGIS. `admin_zone` is the BBMP
    administrative zone, NOT the RMP land-use zone."""

    type: str | None = None  # "Urban" | "Rural"
    district: str | None = None
    town: str | None = None
    admin_zone: str | None = None
    ward: str | None = None
    taluk: str | None = None
    hobli: str | None = None
    village: str | None = None
    village_code: str | None = None  # KGIS villageCode (e.g. "2905030017_1")
    survey_number: str | None = None


ZoneClass = Literal[
    "Residential",
    "Commercial",
    "Industrial",
    "Agricultural",
    "Green Belt",
    "Water Body",
    "Institutional",
    "Mixed Use",
    "Restricted",
    "Unknown",
]
Severity = Literal["low", "moderate", "high", "none"]
SourceConfidence = Literal["authoritative", "community"]
BearingCapacityClass = Literal["Good (>150 kN/m²)", "Moderate (100–150 kN/m²)", "Poor (<100 kN/m²)"]


class ZoneResult(BaseModel):
    zone_class: ZoneClass
    zone_code: str | None = None
    permitted_uses: list[str] = []
    base_far: float | None = None
    permissible_ground_coverage: float | None = None
    primary_landuse: str
    nearby_features: list[NearbyFeature] = []
    # Bhuvan ISRO LULC fields
    lulc_class: str | None = None
    lulc_code: int | None = None
    lulc_vintage: str | None = None  # e.g. "2022-23" or "2019-20"
    na_order_required: bool = False
    forest_clearance_required: bool = False
    source_confidence: SourceConfidence = "community"
    # Provenance of zone_class: "BDA-RMP-2015" (authoritative master-plan land-use)
    # or "OSM-inferred" (preliminary). SAT-20.
    zone_authority: str | None = None
    kgis: KgisContext | None = None  # authoritative admin context (flag-gated)
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
    name: str | None = None
    distance_m: float
    buffer_zone_m: float
    buffer_source: str
    site_within_buffer: bool


class WaterConstraintResult(BaseModel):
    water_bodies: list[WaterBody] = []
    nearest_distance_m: float | None = None
    construction_restricted: bool
    restriction_reason: str | None = None
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
    lat: float | None = None
    lon: float | None = None


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


class ParcelGeometry(BaseModel):
    """Forward survey-number → parcel boundary (KGIS geomForSurveyNum).

    `resolved` is True only when KGIS returned a real polygon. When the KGIS village id
    cannot be resolved (SAT-19 blocker) `resolved=False` and `geometry=None` — never a
    fabricated boundary.
    """

    survey_number: str
    village_code: str | None = None
    kgis_village_id: str | None = None
    ulpin: str | None = None
    lat: float | None = None  # echoes the reverse-geocode point, when supplied
    lon: float | None = None
    resolved: bool = False
    geometry: dict[str, Any] | None = None  # GeoJSON Polygon, WGS84 (lng, lat)
    crs: str = "EPSG:4326"
    data_source: str = "KGIS (KSRSAC)"
    data_disclaimer: str = (
        "Parcel boundary from KGIS geomForSurveyNum — indicative only, NOT a legal "
        "survey (KGIS data may not be used for legal purposes; survey-to-physical "
        "offset 3-10 m). When resolved=false the KGIS village id is pending (SAT-19) "
        "and no geometry is returned."
    )


class AuthorityResult(BaseModel):
    """Governing local authority + building bye-law / approval track for a point (US-093).

    `live_verified=False` until the KGIS Boundaries / LPA point-in-polygon check lands
    (Phase-0); values are best-effort from the KGIS admin context. `authority="Unknown"`
    with low confidence when context is unavailable — never fabricated.
    """

    authority: str
    jurisdiction_type: str  # "Urban" | "Rural" | "Unknown"
    planning_authority: str | None = None
    approval_track: str | None = None
    bye_law_reference: str | None = None
    portal: str | None = None
    confidence: str = "low"  # "high" | "medium" | "low"
    live_verified: bool = False
    kgis: KgisContext | None = None
    notes: str | None = None
    data_source: str = "KGIS getlocationdetails + SAT authority ruleset (GBA-aware)"
    data_disclaimer: str = (
        "Indicative jurisdiction from KGIS admin context + a static ruleset encoding the "
        "GBA transition (BBMP dissolved 15-May-2025). Authoritative authority/LPA requires "
        "a KGIS Boundaries point-in-polygon check (pending). Verify before relying on it."
    )
