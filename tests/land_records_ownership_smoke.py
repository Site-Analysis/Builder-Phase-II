# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-091 ownership snapshot smoke.

  (f) Kharab parcel -> non-saleable flag fires;
  (g) Gomala/restricted -> flag (resolved) or checklist item (not silent pass);
  (h) parcel unresolved -> ownership UNRESOLVED, never 'clean';
  (i) NO fabricated owner name anywhere in the response;
  (j) deep-links present + ownership_feasibility emitted for US-092.

Pure builder (no network). One file per process. Run: pytest tests/land_records_ownership_smoke.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_LAND = Path(__file__).resolve().parents[1] / "services" / "land-records"
if str(_LAND) in sys.path:
    sys.path.remove(str(_LAND))
sys.path.insert(0, str(_LAND))
sys.modules.pop("app", None)
sys.modules.pop("app.main", None)

from app.services.ownership_service import build_ownership_snapshot  # noqa: E402

_CTX = dict(district="Bengaluru Urban", taluk="Bengaluru North", hobli="Jala",
            village="Yelahanka", survey_number="123/4")


def _snap(**kw):
    return build_ownership_snapshot(**_CTX, **kw)


def test_kharab_b_fires_non_saleable_flag():
    """(f)"""
    s = _snap(parcel_resolved=True, cadastral_l5="Kharab-B", dishaank_class=None)
    k = s["kharab"]
    assert k["status"] == "resolved" and k["is_kharab"] is True
    assert k["kharab_type"] == "Kharab-B" and k["non_saleable"] is True
    assert "NON-SALEABLE" in k["note"]
    assert s["ownership_feasibility"]["kharab_flag"] is True


def test_kharab_a_flagged_not_non_saleable():
    s = _snap(parcel_resolved=True, cadastral_l5="Kharab-A", dishaank_class=None)
    assert s["kharab"]["kharab_type"] == "Kharab-A" and s["kharab"]["non_saleable"] is False


def test_restricted_resolved_or_checklist_never_silent_pass():
    """(g) Dishaank present -> resolved restricted flag; absent -> CHECKLIST item, not a pass."""
    resolved = _snap(parcel_resolved=True, cadastral_l5="", dishaank_class="Gomala")
    assert resolved["restricted"]["status"] == "resolved"
    assert resolved["restricted"]["is_restricted"] is True
    checklist = _snap(parcel_resolved=True, cadastral_l5="", dishaank_class=None)
    assert checklist["restricted"]["status"] == "checklist"
    assert checklist["restricted"]["is_restricted"] is None      # NOT a silent False
    assert "confirm" in checklist["restricted"]["note"].lower()   # explicit manual-confirm ask


def test_parcel_unresolved_is_unresolved_never_clean():
    """(h)"""
    s = _snap(parcel_resolved=False, cadastral_l5=None, dishaank_class=None)
    assert s["kharab"]["status"] == "unresolved" and s["kharab"]["is_kharab"] is None
    assert s["restricted"]["status"] == "unresolved" and s["restricted"]["is_restricted"] is None
    fz = s["ownership_feasibility"]
    assert fz["confidence"] == "unresolved"
    assert fz["kharab_flag"] is None and fz["restricted_flag"] is None
    # never rendered as clean / clear title
    blob = json.dumps(s).lower()
    assert "clear title" not in blob and "clean" not in blob


def test_no_fabricated_owner_anywhere():
    """(i) the response must contain no owner name / RTC data — ownership is never fetched."""
    s = _snap(parcel_resolved=True, cadastral_l5="Kharab-B", dishaank_class="Gomala")
    blob = json.dumps(s).lower()
    for banned in ("owner_name", "owner:", "\"owner\"", "smt ", "sri ", "s/o", "w/o"):
        assert banned not in blob, f"possible fabricated owner leaked: {banned}"
    # handoff note makes the manual-verification hand-off explicit
    assert "advocate" in s["handoff_note"].lower()


def test_deep_links_and_feasibility_emitted():
    """(j) deep-links (Bhoomi/e-Aasthi/e-Swathu/Kaveri/Dishaank) + US-092 signal present."""
    s = _snap(parcel_resolved=True, cadastral_l5="", dishaank_class="")
    labels = " ".join(dl["label"].lower() for dl in s["deep_links"])
    for portal in ("bhoomi", "e-aasthi", "e-swathu", "kaveri", "dishaank"):
        assert portal in labels, f"missing deep-link: {portal}"
    # each deep-link carries the exact inputs to type (portals are CAPTCHA-gated)
    assert all("survey=" in dl["description"].lower() for dl in s["deep_links"])
    fz = s["ownership_feasibility"]
    assert fz["title_verification"] == "manual-required" and fz["next_action"]
