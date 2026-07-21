# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Phase-0 KGIS live-probe runner — RUN ONLY ON A KGIS-WHITELISTED IP / BROWSER HOST.

The build/CI agent CANNOT run this (KGIS egress is blocked); it is for a human with access.
It attempts P1/P2 (the KGISVillageID <-> geomForSurveyNum equivalence) and writes the raw
results into tests/fixtures/kgis_probe_capture.json. It fabricates nothing: on any error it
records the failure and leaves the probe not-passed. P3 (offset) and P4-P6 (boundaries) are
partly manual — see docs/phase-0-probes.md — and are left for manual capture.

Usage (on a whitelisted host):
    python scripts/kgis_probe.py --village-code 2905030017_1 --survey-no 88
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import urllib.parse
import urllib.request
from pathlib import Path

_CAPTURE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "kgis_probe_capture.json"
_L5 = (
    "https://kgis.ksrsac.in/kgismaps/rest/services/CadastralData_Admin/"
    "Dynamic_CadastralData_Admin/MapServer/5/query"
)
_GEOM = "https://kgis.ksrsac.in:9000/genericwebservices/ws/geomForSurveyNum"


def _get(url: str, timeout: int = 15) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "SAT-Phase0Probe/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        return resp.status, resp.read().decode("utf-8", "replace")


def probe_p1_p2(village_code: str, survey_no: str) -> dict:
    """Resolve KGISVillageID from L5, then check geomForSurveyNum accepts it."""
    base = village_code.split("_")[0]
    where = f"KGISVillageCode='{village_code}' OR KGISVillageCode='{base}'"
    q = urllib.parse.urlencode(
        {"where": where, "outFields": "KGISVillageID", "returnGeometry": "false", "f": "json"}
    )
    p1 = {"captured": False, "l5_KGISVillageID": None, "geom_accepted_id": None, "geom_status": None, "raw": None}
    p2 = {"captured": False, "KGISVillageCode_field_present": None, "surveynumberi_match_type": None, "raw": None}
    try:
        status, body = _get(f"{_L5}?{q}")
        p2["captured"] = True
        p2["raw"] = body[:2000]
        feats = (json.loads(body).get("features") or []) if status == 200 else []
        p2["KGISVillageCode_field_present"] = bool(feats)
        vid = feats[0].get("attributes", {}).get("KGISVillageID") if feats else None
        p1["l5_KGISVillageID"] = vid
        if vid not in (None, ""):
            gstatus, gbody = _get(f"{_GEOM}/{vid}/{survey_no}/DD")
            p1["captured"] = True
            p1["geom_accepted_id"] = vid
            p1["geom_status"] = str(gstatus)
            p1["raw"] = gbody[:2000]
    except Exception as exc:  # noqa: BLE001 — record the failure honestly, never fake a pass
        note = f"PROBE ERROR (likely egress blocked / not whitelisted): {type(exc).__name__}: {exc}"
        p1["raw"] = note
        p2["raw"] = p2["raw"] or note
    return {"P1_villageid_equivalence": p1, "P2_field_names": p2}


def main() -> None:
    ap = argparse.ArgumentParser(description="Phase-0 KGIS probe (whitelisted IP only)")
    ap.add_argument("--village-code", required=True)
    ap.add_argument("--survey-no", required=True)
    ap.add_argument("--by", default="unknown")
    args = ap.parse_args()

    cap = json.loads(_CAPTURE.read_text(encoding="utf-8"))
    cap["probes"].update(probe_p1_p2(args.village_code, args.survey_no))
    any_captured = cap["probes"]["P1_villageid_equivalence"]["captured"]
    cap["status"] = "PARTIAL_CAPTURE" if any_captured else "PENDING_LIVE_CAPTURE"
    cap["captured_by"] = args.by
    cap["captured_at"] = _dt.datetime.now(_dt.timezone.utc).isoformat()
    _CAPTURE.write_text(json.dumps(cap, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {_CAPTURE}. P1 captured={any_captured}. "
          f"Now run: pytest tests/geo_fallback_smoke.py")


if __name__ == "__main__":
    main()
