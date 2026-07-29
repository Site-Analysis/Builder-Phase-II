# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, computed_field, model_validator

# US-092 C1: the canonical confidence ladder (mirrors packages/confidence — services can't import
# it at runtime, so the value set is duplicated and locked by the cross-service confidence guard).
LadderConfidence = Literal["authoritative", "derived", "inferred", "unresolved"]


class GateSignal(BaseModel):
    """A Tier-1 gate as a MACHINE-READABLE boolean the verdict reads WITHOUT parsing prose (US-092
    C1). `tripped=True` => the gate fires (a hard-NO-GO contributor: RED buffer, non-saleable
    Kharab, forest, confirmed restricted). `tripped=False` with `confidence='unresolved'` means NOT
    confirmed clear either — the verdict must treat that as CAUTION, never a silent pass (C2)."""

    gate_name: str
    tripped: bool
    basis: str
    citation: str | None = None
    confidence: LadderConfidence


class Provenance(BaseModel):
    """Accuracy-ladder provenance for a resolved/unresolved answer (ADDITIVE, optional).

    `tier` is OUR confidence ladder (never an upstream "authoritative" label): KGIS-live
    answers are `authoritative`; the bundled open-data fallback is always `inferred`; when
    neither answers it is `unresolved` (value withheld, never a guess). `mode` names which
    seam produced it. Existing scalar fields (data_source, confidence, live_verified, …)
    are unchanged — this object is added alongside them, not a replacement.
    """

    tier: Literal["authoritative", "inferred", "unresolved"]
    mode: Literal["kgis-live", "inferred-fallback", "unresolved"]
    data_source: str
    data_vintage: str | None = None  # source snapshot date; null for a live service
    reason: str | None = None        # populated when unresolved
    next_action: str | None = None   # populated when unresolved / needs verification


OverlayStatus = Literal["R", "A", "G", "unresolved"]
OverlayReference = Literal["centre", "periphery"]


class OverlayProvenance(BaseModel):
    """Where an overlay answer came from + our confidence in it (US-088). `confidence` is
    never an upstream label: a bundled authoritative layer is `authoritative`; anything with
    no bundled clearing layer is `unresolved`."""

    source: str
    confidence: Literal["authoritative", "inferred", "unresolved"]
    vintage: str | None = None


class OverlayItem(BaseModel):
    """One deal-killer overlay result (US-088).

    `status`: R (inside strictest buffer / obstacle), A (inside a contested/less-strict band
    or a height-limited OLS surface), G (clear — ONLY when a bundled authoritative layer can
    clear it), unresolved (no bundled clearing layer — absence is NOT clear). `buffer_m` is
    the STRICTEST in-force regime; `buffer_range_m` exposes the span when regimes disagree.
    All distances in EPSG:32643 metres."""

    name: str
    status: OverlayStatus
    distance_m: float | None = None
    buffer_m: float | None = None
    buffer_range_m: list[float] | None = None
    reference_point: OverlayReference | None = None
    rule_citation: str | None = None
    effective_date: str | None = None
    litigation_status: str | None = None
    as_of: str
    provenance: OverlayProvenance
    reason: str | None = None
    next_action: str | None = None
    crs: str = "EPSG:32643"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_killer(self) -> bool:
        """US-092 C1: machine-readable — this overlay is a RED deal-killer (verdict reads this
        boolean, never the status string)."""
        return self.status == "R"


class OverlayVerdict(BaseModel):
    """Booleans the future US-092 GO/NO-GO engine reads. Any RED → hard NO-GO. Any
    unresolved → blocks a clean GO (forces at least CAUTION)."""

    hard_no_go: bool
    blocks_clean_go: bool
    red_overlays: list[str]
    unresolved_overlays: list[str]


class NocChecklistItem(BaseModel):
    """A mandatory obligation that has NO obtainable public geometry BY NATURE (not by
    circumstance) — so it is surfaced as a checklist item with its rule citation, but is NOT
    scored R/A/G and does NOT block a clean GO (US-087 reclassification). `reclass_reason` records
    WHY it is unobtainable so this can never be mistaken for weakening the underlying rule. If a
    geometry layer ever arrives (e.g. HT transmission via VEDAS/OSM) that item flips back to a
    scored overlay."""

    name: str
    authority: str
    requirement: str
    rule_citation: str
    typical_validity: str | None = None
    deep_link: str | None = None
    reclass_reason: str
    mandatory: bool = True


class OverlayResult(BaseModel):
    lat: float
    lon: float
    crs: str = "EPSG:32643"
    overlays: list[OverlayItem]
    verdict: OverlayVerdict
    # US-092 C1: one uniform gate per overlay — {gate_name, tripped, basis, citation, confidence}
    # — so the verdict determines NO-GO from booleans alone, never from string matching.
    gates: list[GateSignal] = []
    live_overlays: list[str]
    pending_overlays: list[str]
    # US-087: obligations with no obtainable public geometry (gas, HT-distribution). NOT scored,
    # NOT in `overlays`, do NOT affect verdict — surfaced so the builder still sees them.
    noc_checklist: list[NocChecklistItem] = []
    data_disclaimer: str = ""


class RingResult(BaseModel):
    """RMP-2015 planning ring (US-082 Part 1). Ring I/II/III = TDR Zones A/B/C. `confidence` is
    ALWAYS `inferred` — the rings are OSM-derived, never authoritative. `ring` is null with
    status `unresolved` when the deciding polygon is unavailable or the point is beyond the LPA
    proxy — NEVER defaulted to Ring III."""

    status: Literal["resolved", "unresolved"]
    ring: Literal["I", "II", "III"] | None = None
    tdr_zone: Literal["A", "B", "C"] | None = None
    confidence: Literal["inferred"] = "inferred"
    data_source: str
    data_vintage: str | None = None
    reg_basis: str
    reason: str | None = None
    next_action: str | None = None
    notes: list[str] = []


class ZoneResolution(BaseModel):
    """Tiered zone resolution (US-082 Part 2). Best-available tier wins: rmp (authoritative) >
    user-confirmed (authoritative-on-attestation, kept distinct) > osm (inferred HINT) >
    unresolved. `far_zone_confidence` is what planning must carry into FarAssemblyRequest so an
    inferred zone can never mint an authoritative FAR (the US-088 P0 contract)."""

    status: Literal["resolved", "unresolved"]
    zone: str | None = None
    sub_zone: str | None = None
    confidence: SourceConfidence
    source: str | None = None  # "BDA-RMP-2015" | "user-confirmed" | "OSM/Bhuvan (inferred)"
    data_source: str | None = None
    data_vintage: str | None = None
    unverified: bool = False
    attested: bool = False
    proposed_zone: str | None = None      # the OSM hint even when a better tier won / none did
    proposed_sub_zone: str | None = None
    reason: str | None = None
    next_action: str | None = None
    notes: list[str] = []
    far_zone_confidence: Literal["authoritative", "inferred"] = "inferred"
    sub_zone_status: Literal["resolved", "unresolved"] = "unresolved"
    sub_zone_reason: str | None = None


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
# ONE confidence ladder across the whole service (matches overlays + parcel provenance +
# far_assembly). An OSM/Bhuvan-derived zone is ALWAYS `inferred`; only a real RMP/KGIS
# land-use source may mint `authoritative`. The old {authoritative, community} vocabulary is
# deleted — two confidence languages in one service is how a mislabel got in (US-088 dry-run P0).
SourceConfidence = Literal["authoritative", "derived", "inferred", "unresolved"]
# Only these zone_authority values are allowed to carry source_confidence="authoritative".
AUTHORITATIVE_ZONE_SOURCES = frozenset({"BDA-RMP-2015"})
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
    source_confidence: SourceConfidence = "inferred"
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

    @model_validator(mode="after")
    def _osm_zone_cannot_be_authoritative(self) -> ZoneResult:
        """P0 GUARD: an OSM/Bhuvan-inferred zone may NEVER be labelled authoritative. Only a
        real RMP/KGIS land-use source (AUTHORITATIVE_ZONE_SOURCES) may mint `authoritative`.
        Fails loud rather than ship a wrong zone wearing a trusted label (US-088 dry-run P0)."""
        if self.source_confidence == "authoritative" and self.zone_authority not in AUTHORITATIVE_ZONE_SOURCES:
            raise ValueError(
                f"zone source_confidence='authoritative' but zone_authority='{self.zone_authority}' "
                f"is not an authoritative land-use source {sorted(AUTHORITATIVE_ZONE_SOURCES)} — "
                "OSM/Bhuvan-derived zoning is 'inferred', never authoritative"
            )
        return self


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
    provenance: Provenance | None = None  # ADDITIVE: accuracy-ladder tier/mode (US-080 wire-in)
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
    # US-092 C4: unified onto the canonical confidence ladder (was off-ladder high|medium|low).
    # authoritative = KGIS-live PIP (pending); derived = KGIS admin-context (not yet PIP-verified);
    # inferred = open-data fallback / best-effort; unresolved = no answer.
    confidence: Literal["authoritative", "derived", "inferred", "unresolved"] = "unresolved"
    live_verified: bool = False
    kgis: KgisContext | None = None
    notes: str | None = None
    provenance: Provenance | None = None  # ADDITIVE: accuracy-ladder tier/mode (US-093 wire-in)
    data_source: str = "KGIS getlocationdetails + SAT authority ruleset (GBA-aware)"
    data_disclaimer: str = (
        "Indicative jurisdiction from KGIS admin context + a static ruleset encoding the "
        "GBA transition (BBMP dissolved 15-May-2025). Authoritative authority/LPA requires "
        "a KGIS Boundaries point-in-polygon check (pending). Verify before relying on it."
    )
