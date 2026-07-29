# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class LandRecordsRequest(BaseModel):
    district: str = Field(..., examples=["Bengaluru Urban"])
    taluk: str = Field(..., examples=["Bengaluru North"])
    hobli: str = Field(..., examples=["Jala"])
    village: str = Field(..., examples=["Yelahanka"])
    survey_number: str = Field(..., examples=["123/4"])
    state: str = "Karnataka"


class BhoomiRecord(BaseModel):
    owner_name: str | None = None
    survey_number: str | None = None
    area_acres: float | None = None
    land_type: str | None = None
    encumbrance_present: bool = False
    mutation_number: str | None = None
    raw_data_available: bool = False


class DeepLink(BaseModel):
    label: str
    url: str
    description: str


class CourtCase(BaseModel):
    case_number: str | None = None
    court: str | None = None
    status: str | None = None
    parties: str | None = None
    filing_date: str | None = None


OwnConfidence = Literal["authoritative", "inferred", "unresolved"]
FlagStatus = Literal["resolved", "unresolved", "checklist"]
# US-092 C1: canonical confidence ladder (mirrors packages/confidence; locked by the cross-service
# confidence guard). Includes `derived` for the Dishaank-visual restricted gate.
LadderConfidence = Literal["authoritative", "derived", "inferred", "unresolved"]


class GateSignal(BaseModel):
    """A Tier-1 gate as a MACHINE-READABLE boolean the verdict reads WITHOUT parsing prose (US-092
    C1). `tripped=True` => the gate fires (non-saleable Kharab, confirmed restricted tenure).
    `tripped=False` with `confidence='unresolved'` means NOT confirmed clear either — the verdict
    must treat that as CAUTION, never a silent pass (C2)."""

    gate_name: str
    tripped: bool
    basis: str
    citation: str | None = None
    confidence: LadderConfidence


class OwnershipRequest(LandRecordsRequest):
    """US-091 ownership snapshot inputs. The KGIS cadastral L5 field + Dishaank classification are
    passed in from the geo parcel resolution (cross-service seam) — absent them, the derived flags
    are UNRESOLVED (never 'clean'). No RTC/owner data is ever fetched."""

    parcel_resolved: bool = False       # did geo /geo/parcel return a real KGIS polygon?
    cadastral_l5: str | None = None     # KGIS Cadastral L5 land-classification field, if resolved
    dishaank_class: str | None = None   # Dishaank visual classification, if obtainable


class KharabFlag(BaseModel):
    """Kharab from the KGIS Cadastral L5 field. Kharab-B = government land (NON-SALEABLE).
    `status=unresolved` when the parcel did not resolve — absence is NOT 'no kharab'."""

    status: FlagStatus
    is_kharab: bool | None = None
    kharab_type: str | None = None       # "Kharab-A" | "Kharab-B"
    non_saleable: bool | None = None
    area_affected: str | None = None
    source: str
    note: str
    next_action: str | None = None


class RestrictedFlag(BaseModel):
    """Gomala / restricted tenure. From Dishaank classification if obtainable, else a CHECKLIST
    item (never a silent pass). `status=unresolved` when the parcel did not resolve."""

    status: FlagStatus
    is_restricted: bool | None = None
    restriction_type: str | None = None  # "Gomala" | "Grant land" | "Inam" | ...
    source: str
    note: str
    next_action: str | None = None


class OwnershipFeasibility(BaseModel):
    """Flag-driven signal for the US-092 GO/NO-GO engine — replaces the old fixed score of 50.
    Title verification is ALWAYS manual-required (no bulk/public ownership API exists)."""

    kharab_flag: bool | None = None       # None = unresolved
    restricted_flag: bool | None = None
    title_verification: Literal["manual-required"] = "manual-required"
    confidence: OwnConfidence
    next_action: str


class OwnershipSnapshot(BaseModel):
    kharab: KharabFlag
    restricted: RestrictedFlag
    ownership_feasibility: OwnershipFeasibility
    # US-092 C1: the Tier-1 ownership gates as machine-readable booleans — Kharab-B non-saleable +
    # confirmed restricted tenure — {gate_name, tripped, basis, citation, confidence}.
    gates: list[GateSignal] = Field(default_factory=list)
    deep_links: list[DeepLink] = Field(default_factory=list)
    handoff_note: str = (
        "SCREENING SIGNAL ONLY — full title verification requires an advocate's opinion + a Kaveri "
        "encumbrance-certificate search. No owner name, RTC, or title is fetched or inferred here."
    )
    data_source: str
    data_disclaimer: str = (
        "No bulk/public ownership API exists (Bhoomi RTC, e-Aasthi/e-Swathu, Kaveri EC are "
        "CAPTCHA/OTP-gated; DigiLocker is per-citizen consent). Ownership is NOT retrieved. Kharab/"
        "restricted flags are derived ONLY when the KGIS parcel resolved; otherwise UNRESOLVED — "
        "absence of an RTC read is NEVER 'clear title'."
    )


class LandRecordsResult(BaseModel):
    bhoomi: BhoomiRecord
    court_cases: list[CourtCase] = Field(default_factory=list)
    deep_links: list[DeepLink] = Field(default_factory=list)
    score: float = Field(..., ge=0, le=100)
    severity: Literal["low", "moderate", "high", "none"]
    data_source: str
    notes: str | None = None
