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

    # `str`, not the planning Literal: accepts the geo `zone_class` vocabulary (Water Body,
    # Green Belt, Agricultural, …). far_assembly maps it via zone_map.map_geo_zone and returns a
    # clean "not developable" result for non-developable zones instead of a 422 (US-088 G2).
    zone: str = "Residential"
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


class FarAssemblyRequest(RoadWidthRequest):
    """US-084 inputs: RoadWidthRequest (road-width tiers) + the zone/ring/height context that
    drives permissible-vs-achievable FAR."""

    zone_confidence: Literal["authoritative", "inferred"] = "inferred"
    ring: Literal["I", "II", "III"] | None = None
    site_dim_m: float | None = Field(default=None, gt=0)          # low-rise Table 8 setback key
    building_height_m: float | None = Field(default=None, gt=0)
    additional_far_eligible: bool = False                         # Ring I/II, amalgamated post-RMP
    within_metro_150m: bool = False
    metro_bmrcl_confirmed: bool = False


class FarValue(BaseModel):
    value: float | None = None
    confidence: Literal["authoritative", "derived", "inferred", "unresolved"]
    data_source: str | None = None
    data_vintage: str | None = None
    rule_citation: str
    notes: list[str] = []
    disclaimer: str
    modifier_pending: bool | None = None
    road_width_m: float | None = None
    error_band_m: list[float] | None = None
    next_action: str | None = None


class GroundCoverageValue(BaseModel):
    value: float
    rule_citation: str
    disclaimer: str


class SetbackSet(BaseModel):
    front: float | str  # Table 8 >9 m band is a '%'-of-dimension string; Table 9 is metres
    rear: float | str
    left: float | str
    right: float | str
    rule_citation: str
    disclaimer: str


class EntitlementLabel(BaseModel):
    """A far_modifier and the condition it requires. status: applied (in the with-entitlements
    value), conditional (labelled, NOT added — e.g. metro unconfirmed), pending (blank in source,
    NOT added). additional_far is the uplift when additive (null for metro override / pending)."""

    name: str
    additional_far: float | None = None
    status: Literal["applied", "conditional", "pending"]
    condition: str
    citation: str | None = None


class FarBandOption(BaseModel):
    band: RoadWidthBand
    achievable_base: FarValue
    achievable_with_entitlements: FarValue


class AchievableMatrix(BaseModel):
    rows: list[FarBandOption]
    option_value: RoadWidthOptionValue | None = None


class FarAssemblyResult(BaseModel):
    """Permissible-vs-achievable FAR (US-084). TWO-LINE achievable: achievable_base (build by
    right) and achievable_with_entitlements (base + qualifying modifiers, each labelled). Invariant
    achievable_base <= achievable_with_entitlements <= permissible_far (asserted). A band-edge road
    width yields achievable_matrix (both lines per band), never a single picked side."""

    status: Literal["resolved", "unresolved"]
    permissible_far: FarValue | None = None
    achievable_base: FarValue | None = None
    achievable_with_entitlements: FarValue | None = None
    achievable_matrix: AchievableMatrix | None = None
    entitlements: list[EntitlementLabel] = []
    ground_coverage: GroundCoverageValue | None = None
    setbacks: SetbackSet | None = None
    road_width: RoadWidthResult | None = None
    invariant_ok: bool
    reason: str | None = None
    next_action: str | None = None
    notes: list[str] = []
    disclaimer: str


UseType = Literal[
    "residential_multi_dwelling", "retail", "office", "restaurant", "hotel", "hospital",
    "nursing_home", "educational", "industrial", "other_public_semipublic",
    "commercial_mutation_corridor", "integrated_township",
]


class MixedUseParkingRequest(RoadWidthRequest):
    """US-083 inputs: road-width tiers (RoadWidthRequest, reused for access adequacy) + the built-up
    context that drives parking ECS + mixed-use %. Provide built_up_area_sqm OR (achievable_far +
    plot_area_sqm)."""

    use_type: UseType = "residential_multi_dwelling"
    achievable_far: float | None = Field(default=None, gt=0)     # from /planning/far
    built_up_area_sqm: float | None = Field(default=None, gt=0)  # overrides achievable_far x plot
    avg_dwelling_size_sqm: float | None = Field(default=None, gt=0)  # exact per-DU residential ECS


class ParkingECS(BaseModel):
    status: Literal["resolved", "unresolved"]
    use: str
    ecs_total: int | None = None
    ecs_main: float | None = None
    ecs_visitor: float | None = None
    basis: str | None = None
    confidence: Literal["authoritative", "derived", "unresolved"]
    citation: str
    built_up_area_sqm: float | None = None
    notes: list[str] = []
    next_action: str | None = None


class MixedUseShare(BaseModel):
    status: Literal["resolved"]
    zone: str | None = None
    sub_zone: str | None = None
    non_residential_max_pct: float
    non_residential_max_sqm: float | None = None
    residential_pct: float | None = None
    split: dict[str, float] | None = None
    basis: str | None = None
    confidence: Literal["authoritative"]
    citation: str | None = None


class AccessAdequacy(BaseModel):
    status: Literal["resolved", "unresolved"]
    width_m: float | None = None
    band: RoadWidthBand | None = None
    confidence: WidthConfidence
    adequate: bool | None = None       # None = unresolved width -> cannot judge
    min_required_m: float
    min_citation: str
    floor_area_cap: RoadWidthFloorCap | None = None
    reg_basis: list[str] = []
    reason: str | None = None
    next_action: str | None = None


class ObligationChecklistItem(BaseModel):
    """An obligation the RMP does NOT quantify — surfaced explicitly, NEVER a fabricated number."""

    item: str
    status: Literal["unverified"]
    reason: str
    citation_gap: str
    next_action: str


class DevelopmentObligationsResult(BaseModel):
    """US-083: mixed-use % + parking ECS + access adequacy (computed + cited) and a checklist of the
    obligations RMP-2015 does not quantify (TIA thresholds, uncovered uses/zones). Computed items
    carry their citation; checklist items are labelled unverified and carry no number."""

    status: Literal["resolved"]
    built_up_area_sqm: float | None = None
    parking: ParkingECS | None = None
    mixed_use: MixedUseShare | None = None
    access_adequacy: AccessAdequacy
    checklist: list[ObligationChecklistItem] = []
    computed_count: int
    checklist_count: int
    data_source: str
    disclaimer: str


class AirportRestriction(BaseModel):
    """HEIGHT-CAP ONLY (US-086 consolidation). Planning keeps the ICAO/OLS surface + max-height it
    needs for the building envelope; the airport DISTANCE reporting moved to the infrastructure
    connectivity endpoint (one service owns connectivity). `distance_km`/lat/lon were removed here."""

    nearest_airport: str
    iata_code: str
    max_height_m: float | None = None
    restriction_surface: str
    dgca_noc_required: bool


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
