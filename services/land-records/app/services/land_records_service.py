from __future__ import annotations

from app.models.land_records import LandRecordsRequest, LandRecordsResult
from app.services.bhoomi_service import fetch_bhoomi_record
from app.services.deep_links_service import get_deep_links
from app.services.ecourts_service import search_court_cases


def analyze(req: LandRecordsRequest) -> LandRecordsResult:
    bhoomi = fetch_bhoomi_record(
        district=req.district,
        taluk=req.taluk,
        hobli=req.hobli,
        village=req.village,
        survey_number=req.survey_number,
    )
    court_cases = search_court_cases(
        district=req.district,
        taluk=req.taluk,
        survey_number=req.survey_number,
    )
    deep_links = get_deep_links(
        district=req.district,
        taluk=req.taluk,
        hobli=req.hobli,
        village=req.village,
        survey_number=req.survey_number,
    )

    # Portal-only mode: score reflects completeness of lookup, not risk.
    # User must verify via the provided deep links — no automated data is retrieved.
    score = 50.0
    severity = "none"
    notes = (
        "Automated land record retrieval is not available — government portals "
        "require CAPTCHA authentication. Use the links below to verify RTC, "
        "encumbrances, and court cases directly."
    )

    return LandRecordsResult(
        bhoomi=bhoomi,
        court_cases=court_cases,
        deep_links=deep_links,
        score=score,
        severity=severity,
        data_source="Karnataka government portals (Bhoomi, KAVERI, eCourts) — direct access required",
        notes=notes,
    )
