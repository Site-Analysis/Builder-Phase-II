from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class LandRecordsRequest(BaseModel):
    district: str = Field(..., examples=["Bengaluru Urban"])
    taluk: str = Field(..., examples=["Bengaluru North"])
    hobli: str = Field(..., examples=["Jala"])
    village: str = Field(..., examples=["Yelahanka"])
    survey_number: str = Field(..., examples=["123/4"])
    state: str = "Karnataka"


class BhoomiRecord(BaseModel):
    owner_name: Optional[str] = None
    survey_number: Optional[str] = None
    area_acres: Optional[float] = None
    land_type: Optional[str] = None
    encumbrance_present: bool = False
    mutation_number: Optional[str] = None
    raw_data_available: bool = False


class DeepLink(BaseModel):
    label: str
    url: str
    description: str


class CourtCase(BaseModel):
    case_number: Optional[str] = None
    court: Optional[str] = None
    status: Optional[str] = None
    parties: Optional[str] = None
    filing_date: Optional[str] = None


class LandRecordsResult(BaseModel):
    bhoomi: BhoomiRecord
    court_cases: list[CourtCase] = Field(default_factory=list)
    deep_links: list[DeepLink] = Field(default_factory=list)
    score: float = Field(..., ge=0, le=100)
    severity: Literal["low", "moderate", "high", "none"]
    data_source: str
    notes: Optional[str] = None
