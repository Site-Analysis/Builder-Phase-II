from __future__ import annotations

from app.models.land_records import CourtCase

# eCourts does not expose a documented public REST API for case search.
# The web portal (https://services.ecourts.gov.in) requires CAPTCHA and session auth.
# Court case lookup must be performed directly by the user via the portal link.


def search_court_cases(
    district: str,
    taluk: str,
    survey_number: str,
) -> list[CourtCase]:
    """Returns empty list. Real case search requires direct eCourts portal access."""
    return []
