# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-091 ownership snapshot — HONEST SCOPE.

There is NO bulk/public ownership API: Bhoomi RTC, e-Aasthi/e-Swathu (Khata), and Kaveri EC are
CAPTCHA/OTP-gated; DigiLocker is per-citizen consent. So this module:
  * NEVER scrapes, NEVER fabricates an owner, NEVER infers ownership from anything;
  * emits DEEP-LINKS (pre-filled where the portal URL supports it) so the user completes the read;
  * derives the flags we genuinely CAN — Kharab (KGIS Cadastral L5) and Gomala/restricted (Dishaank)
    — ONLY when the parcel resolved. If the parcel did not resolve, those flags are UNRESOLVED, not
    'clean' (absence of an RTC read is NEVER 'clear title');
  * replaces the old fixed score of 50 with a flag-driven `ownership_feasibility` signal for US-092.

Pure + dependency-free — the KGIS L5 field + Dishaank class are passed IN from the geo parcel
resolution (cross-service seam), so this is deterministically testable offline.
"""

from __future__ import annotations

from typing import Any

_HANDOFF = (
    "SCREENING SIGNAL ONLY — full title verification requires an advocate's opinion + a Kaveri "
    "encumbrance-certificate search."
)


def _classify_kharab(parcel_resolved: bool, l5: str | None) -> dict[str, Any]:
    src = "KGIS Cadastral L5 (land classification)"
    if not parcel_resolved:
        return {
            "status": "unresolved", "is_kharab": None, "kharab_type": None,
            "non_saleable": None, "area_affected": None, "source": src,
            "note": "parcel did not resolve in KGIS — Kharab status UNKNOWN. Absence of a read is "
            "NOT 'no kharab'.",
            "next_action": "resolve the parcel (survey no + village) in KGIS Cadastral / Dishaank, "
            "then re-check the L5 classification.",
        }
    text = (l5 or "").strip().lower()
    if not text:
        return {
            "status": "resolved", "is_kharab": False, "kharab_type": None,
            "non_saleable": False, "area_affected": None, "source": src,
            "note": "parcel resolved; KGIS L5 shows no Kharab classification. Still verify against "
            "the RTC column 3 (Kharab area) before purchase.",
            "next_action": "confirm Kharab area on the certified RTC.",
        }
    # Kharab-B = government/public-purpose land -> NON-SALEABLE. Kharab-A = assessment waste within
    # the holding (non-cultivable, usually part of the grant) -> caution, verify usability.
    # NOTE: test the TYPE SUFFIX after "kharab" — "b" appears inside the word "kharab" itself, so a
    # naive `"b" in text` would mis-flag Kharab-A as Kharab-B.
    suffix = ""
    if "kharab" in text:
        suffix = text[text.find("kharab") + len("kharab"):].lstrip(" -_")
    if "kharab" in text and suffix.startswith("b"):
        return {
            "status": "resolved", "is_kharab": True, "kharab_type": "Kharab-B",
            "non_saleable": True, "area_affected": l5, "source": src,
            "note": "Kharab-B = government / public-purpose land — NON-SALEABLE. It cannot be "
            "conveyed; any built area over it is at risk of demolition.",
            "next_action": "exclude the Kharab-B extent; verify the saleable area with the RTC + a "
            "surveyor before purchase.",
        }
    if "kharab" in text:
        return {
            "status": "resolved", "is_kharab": True, "kharab_type": "Kharab-A",
            "non_saleable": False, "area_affected": l5, "source": src,
            "note": "Kharab-A = assessment waste within the holding (non-cultivable) — usually part "
            "of the grant but confirm developable extent.",
            "next_action": "confirm the Kharab-A extent + developability with the RTC + a surveyor.",
        }
    return {
        "status": "resolved", "is_kharab": False, "kharab_type": None,
        "non_saleable": False, "area_affected": None, "source": src,
        "note": "parcel resolved; L5 present but no Kharab classification detected.",
        "next_action": "confirm Kharab area on the certified RTC.",
    }


def _classify_restricted(parcel_resolved: bool, dishaank_class: str | None) -> dict[str, Any]:
    src = "Dishaank visual classification"
    if not parcel_resolved:
        return {
            "status": "unresolved", "is_restricted": None, "restriction_type": None, "source": src,
            "note": "parcel did not resolve — Gomala/restricted status UNKNOWN; absence is not an "
            "unrestricted read.",
            "next_action": "resolve the parcel, then check Dishaank + the RTC tenure column.",
        }
    text = (dishaank_class or "").strip().lower()
    if not text:
        # Obtainable-in-principle but not supplied -> CHECKLIST item, never a silent pass.
        return {
            "status": "checklist", "is_restricted": None, "restriction_type": None, "source": src,
            "note": "Dishaank classification not supplied — MANUALLY confirm the tenure is not "
            "Gomala / grant land / Inam (restricted transfer). Do not assume unrestricted.",
            "next_action": "open the parcel in Dishaank + read the RTC tenure/mutation columns.",
        }
    restricted_terms = ("gomala", "gomal", "grant", "inam", "restrict", "government", "reserve")
    hit = next((t for t in restricted_terms if t in text), None)
    if hit:
        return {
            "status": "resolved", "is_restricted": True,
            "restriction_type": dishaank_class, "source": src,
            "note": f"Dishaank classification '{dishaank_class}' indicates restricted tenure — "
            "transfer/development is regulated.",
            "next_action": "confirm the tenure + any grant conditions / non-alienation clause with "
            "the RTC + revenue authority before purchase.",
        }
    return {
        "status": "resolved", "is_restricted": False, "restriction_type": dishaank_class,
        "source": src,
        "note": f"Dishaank classification '{dishaank_class}' shows no restricted tenure marker — "
        "still confirm on the RTC.",
        "next_action": "confirm tenure on the certified RTC.",
    }


def _deep_links(district: str, taluk: str, hobli: str, village: str, survey_number: str) -> list[dict]:
    """Ownership-verification deep links. Pre-fill the description with the exact inputs to type
    (the portals are CAPTCHA/session-gated, so a query-string pre-fill is not honoured)."""
    inputs = f"District={district}, Taluk={taluk}, Hobli={hobli}, Village={village}, Survey={survey_number}"
    return [
        {"label": "Bhoomi RTC (Service2 — I-RTC)", "url": "https://landrecords.karnataka.gov.in/Service2/",
         "description": f"Certified RTC (ownership, Kharab col.3, tenure). Enter: {inputs}"},
        {"label": "e-Aasthi (urban Khata — BBMP/GBA)", "url": "https://eaasthi.karnataka.gov.in/",
         "description": f"Urban property Khata / ownership record. Enter: {inputs}"},
        {"label": "e-Swathu (rural Khata — Gram Panchayat)", "url": "https://eswathu.karnataka.gov.in/",
         "description": f"Rural (GP) property record (Form 9/11). Enter: {inputs}"},
        {"label": "Kaveri Online (Encumbrance Certificate)", "url": "https://kaverionline.karnataka.gov.in/",
         "description": f"EC — 30-yr encumbrance / prior transactions. Enter: {inputs}"},
        {"label": "Dishaank (visual survey verification)", "url": "https://dishaank.karnataka.gov.in/",
         "description": f"Map the survey number; check Kharab / Gomala / boundary visually. Enter: {inputs}"},
    ]


def build_ownership_snapshot(
    *, district: str, taluk: str, hobli: str, village: str, survey_number: str,
    parcel_resolved: bool, cadastral_l5: str | None, dishaank_class: str | None,
) -> dict[str, Any]:
    kharab = _classify_kharab(parcel_resolved, cadastral_l5)
    restricted = _classify_restricted(parcel_resolved, dishaank_class)

    # confidence: authoritative only when the parcel resolved AND we have a KGIS L5 read; unresolved
    # when the parcel didn't resolve; else inferred.
    if not parcel_resolved:
        confidence = "unresolved"
        next_action = ("resolve the parcel in KGIS/Dishaank first; then pull the RTC + EC. Absence "
                       "of a record does NOT confirm marketable title.")
    elif kharab["status"] == "resolved" and cadastral_l5:
        confidence = "authoritative"
        next_action = "verify the Kharab area + tenure on the certified RTC and run a Kaveri EC."
    else:
        confidence = "inferred"
        next_action = "pull the certified RTC + Kaveri EC; confirm Kharab + tenure manually."

    feasibility = {
        "kharab_flag": kharab["is_kharab"],
        "restricted_flag": restricted["is_restricted"],
        "title_verification": "manual-required",
        "confidence": confidence,
        "next_action": next_action,
    }
    return {
        "kharab": kharab,
        "restricted": restricted,
        "ownership_feasibility": feasibility,
        "deep_links": _deep_links(district, taluk, hobli, village, survey_number),
        "handoff_note": _HANDOFF,
        "data_source": "KGIS Cadastral L5 + Dishaank (flags) + Karnataka portals (deep-links) — "
        "no ownership data retrieved",
    }
