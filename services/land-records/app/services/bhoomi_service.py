from __future__ import annotations

from app.models.land_records import BhoomiRecord

# Bhoomi RTC portal (https://landrecords.karnataka.gov.in) uses session-based CAPTCHA
# forms and blocks automated access. No scraping is attempted here.
# The portal URL with pre-filled params is returned to the frontend for direct user access.


def fetch_bhoomi_record(
    district: str,
    taluk: str,
    hobli: str,
    village: str,
    survey_number: str,
) -> BhoomiRecord:
    """Return empty record. Real data requires direct portal access by the user."""
    return BhoomiRecord(
        survey_number=survey_number,
        raw_data_available=False,
    )


def build_bhoomi_portal_url(
    district: str,
    taluk: str,
    hobli: str,
    village: str,
    survey_number: str,
) -> str:
    """Return base Bhoomi portal URL. User must complete lookup in the portal."""
    return "https://landrecords.karnataka.gov.in/Service4"
