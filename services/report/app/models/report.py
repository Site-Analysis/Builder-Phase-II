# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-092 GO / CAUTION / NO-GO verdict + shareable report models.

HONEST TRIAGE, not a confidence score. Two-tier: Tier-1 boolean gates (any tripped -> hard NO-GO);
Tier-2 (gate-clear only) -> GO vs CAUTION, where an unresolved decision-relevant input can NEVER
yield GO. The verdict carries its OWN confidence = weakest of its decision-driving inputs (an inferred
zone yields an inferred verdict, stated prominently)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

VerdictLevel = Literal["GO", "CAUTION", "NO_GO"]
LadderConfidence = Literal["authoritative", "derived", "inferred", "unresolved"]
RowSeverity = Literal["critical", "high", "moderate", "low"]
RowSection = Literal["red_flag", "confirmed_clear", "confirm_to_upgrade"]

_SANCTION = "subject to authority sanction"


class ReportRow(BaseModel):
    """One line of the one-screen report. EVERY row carries a measured value + rule citation +
    confidence badge + data_vintage + the mandatory sanction note (+ buffer as-of where relevant)."""

    section: RowSection
    label: str
    value: str
    citation: str | None = None
    confidence: LadderConfidence
    data_vintage: str | None = None
    as_of: str | None = None                       # buffer/overlay as-of where relevant
    severity: RowSeverity | None = None            # set on red_flag rows for sorting
    next_action: str | None = None                 # set on confirm_to_upgrade rows
    sanction_note: str = _SANCTION


class ParcelRef(BaseModel):
    lat: float
    lon: float
    survey_number: str | None = None
    village: str | None = None
    label: str | None = None


class SignalBundle(BaseModel):
    """The already-fetched LIVE signal outputs the verdict aggregates. Each is optional — an absent
    signal is treated as an unresolved decision input (forces CAUTION), never a silent pass. Held as
    open dicts: the aggregator reads the C1 gate booleans + C2 status/confidence fields it needs."""

    overlays: dict[str, Any] | None = None
    ownership: dict[str, Any] | None = None
    far: dict[str, Any] | None = None
    connectivity: dict[str, Any] | None = None
    infra_readiness: dict[str, Any] | None = None
    price: dict[str, Any] | None = None
    terrain: dict[str, Any] | None = None
    zone: dict[str, Any] | None = None
    authority: dict[str, Any] | None = None


class ReportRequest(BaseModel):
    parcel: ParcelRef
    signals: SignalBundle = Field(default_factory=SignalBundle)
    generated_at: str | None = None                # ISO; server fills when absent
    persist: bool = True                           # persist a snapshot + return a share link
    render_pdf: bool = True


class ReportVerdict(BaseModel):
    verdict: VerdictLevel
    confidence: LadderConfidence
    headline: str
    confidence_note: str                           # prominent when inferred/unresolved
    red_flags: list[ReportRow] = []                # tripped gates, severity-sorted (top of screen)
    confirmed_clear: list[ReportRow] = []
    confirm_to_upgrade: list[ReportRow] = []        # unresolved/condition inputs + next_action
    rows: list[ReportRow] = []                      # the full ordered list (red -> clear -> confirm)
    generated_at: str
    parcel: ParcelRef
    disclaimer: str = (
        "HONEST TRIAGE, not a valuation or an approval. Tier-1 gates are read from machine-readable "
        "booleans; an unresolved input forces CAUTION and is listed to confirm — it never silently "
        "passes. Every figure is subject to authority sanction. Verify each cited rule + buffer with "
        "the originating authority before any commitment."
    )


class ShareResult(BaseModel):
    status: Literal["ready", "pending-supabase", "disabled"]
    report_id: str
    share_link: str | None = None
    reason: str | None = None


class PdfResult(BaseModel):
    status: Literal["rendered", "unavailable", "disabled"]
    media_type: str | None = None
    byte_len: int | None = None
    html_fallback: str | None = None               # honest fallback when WeasyPrint is absent
    reason: str | None = None


class ReportResponse(BaseModel):
    report_id: str
    verdict: ReportVerdict
    share: ShareResult
    pdf: PdfResult
    data_source: str = "US-092 verdict aggregator over live signal outputs"
