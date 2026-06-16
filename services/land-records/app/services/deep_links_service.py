from __future__ import annotations

from urllib.parse import quote

from app.models.land_records import DeepLink


def get_deep_links(
    district: str,
    taluk: str,
    hobli: str,
    village: str,
    survey_number: str,
) -> list[DeepLink]:
    """Return deep links to government portals. User completes lookup directly."""
    bhoomi_note = (
        f"Search: District={district}, Taluk={taluk}, "
        f"Hobli={hobli}, Village={village}, Survey={survey_number}"
    )
    return [
        DeepLink(
            label="Bhoomi RTC (Karnataka Land Records)",
            url="https://landrecords.karnataka.gov.in/Service4",
            description=f"Obtain certified RTC copy — {bhoomi_note}",
        ),
        DeepLink(
            label="KAVERI (Encumbrance Certificate)",
            url="https://kaverionline.karnataka.gov.in",
            description="Check encumbrances and property registration history",
        ),
        DeepLink(
            label="eCourts Case Search",
            url=(
                "https://services.ecourts.gov.in/ecourtindia_v6/"
                f"?p_body={quote(survey_number)}&p_state=KA"
            ),
            description="Search pending litigation — enter survey number in 'Party Name' field",
        ),
        DeepLink(
            label="CERSAI (Bank Charges / Mortgages)",
            url="https://www.cersai.org.in",
            description="Central Registry — check if bank has registered charge on the property",
        ),
        DeepLink(
            label="MCA21 (Company Property Charges)",
            url="https://www.mca.gov.in/content/mca/global/en/mca/fo-llp-efiling/company-search.html",
            description="Ministry of Corporate Affairs — charges created by companies on property",
        ),
    ]
