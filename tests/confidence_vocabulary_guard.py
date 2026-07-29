# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-092 C4 — cross-service confidence-vocabulary guard.

Fails if ANY signal emits a confidence value outside the canonical ladder
(packages/confidence). This is what stops a fourth vocabulary from re-appearing (the divergent-
vocabulary class that produced the P0 zone bug and the authority high/medium/low drift).

Each service's package is `app`, so signals cannot be imported together in one process — the guard
runs each service builder in a SUBPROCESS (like the US-092 dry-run) and asserts every value under a
`*confidence*` key (or Provenance `tier`) is on the ladder. Overlay STATUS (R/A/G) is a SEPARATE axis
and is deliberately NOT checked here.

Run: pytest tests/confidence_vocabulary_guard.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "packages" / "confidence" / "src"))
from confidence import CONFIDENCE_VALUES  # noqa: E402

# Recursive collector injected into every subprocess: yields [key, value] for any str value whose
# key contains "confidence" or equals "tier" (Provenance ladder). None values are skipped.
_COLLECTOR = """
import json
def _collect(o, out):
    if hasattr(o, "model_dump"):
        o = o.model_dump()
    if isinstance(o, dict):
        for k, v in o.items():
            if isinstance(v, (dict, list)):
                _collect(v, out)
            elif isinstance(v, str) and ("confidence" in k.lower() or k == "tier"):
                out.append([k, v])
    elif isinstance(o, list):
        for x in o:
            _collect(x, out)
"""

# service dir -> python that builds the signal(s) and prints json list of [key, value] pairs.
_SIGNALS: dict[str, str] = {
    "services/geo": _COLLECTOR + """
import sys; sys.path.insert(0, "services/geo")
from app.services.authority_service import _fallback_authority
from app.services.overlay_engine import evaluate_overlays
out = []
_collect(_fallback_authority(12.9345, 77.6100), out)   # inferred + unresolved paths
_collect(evaluate_overlays(12.9345, 77.6100), out)     # overlay provenance.confidence
print(json.dumps(out))
""",
    "services/land-records": _COLLECTOR + """
import sys; sys.path.insert(0, "services/land-records")
from app.services.ownership_service import build_ownership_snapshot
out = []
# unresolved + resolved (Kharab-B) paths
_collect(build_ownership_snapshot(district="d", taluk="t", hobli="h", village="v",
    survey_number="1/1", parcel_resolved=False, cadastral_l5=None, dishaank_class=None), out)
_collect(build_ownership_snapshot(district="d", taluk="t", hobli="h", village="v",
    survey_number="1/1", parcel_resolved=True, cadastral_l5="Kharab-B", dishaank_class="Gomala"), out)
print(json.dumps(out))
""",
    "services/planning": _COLLECTOR + """
import sys; sys.path.insert(0, "services/planning")
from app.config.rmp_loader import load_config
from app.services.far_assembly import assemble_far
cfg = load_config("services/planning/app/config/rmp_2015.json")
out = []
_collect(assemble_far({"zone": "Residential", "sub_zone": "Mixed", "plot_area_sqm": 1200,
    "zone_confidence": "inferred", "measured_width_m": 15.0, "building_height_m": 18.0,
    "site_dim_m": 30.0}, cfg=cfg), out)
print(json.dumps(out))
""",
    "services/infrastructure": _COLLECTOR + """
import sys; sys.path.insert(0, "services/infrastructure")
from app.services.connectivity_service import build_connectivity
out = []
_collect(build_connectivity(12.9345, 77.6100), out)
print(json.dumps(out))
""",
    "services/future-infra": _COLLECTOR + """
import sys; sys.path.insert(0, "services/future-infra")
from app.services.pipeline_service import PipelineService
from app.services.price_service import build_price_upside
s = PipelineService(); out = []
_collect(build_price_upside(12.9345, 77.6100, guidance_value_per_sqm=100000.0, features=s.features()), out)
print(json.dumps(out))
""",
    "services/flood": _COLLECTOR + """
import sys; sys.path.insert(0, "services/flood")
from app.services.terrain_service import analyze_terrain
poly = {"type": "Polygon", "coordinates": [[[77.6098,12.9343],[77.6102,12.9343],
    [77.6102,12.9347],[77.6098,12.9347],[77.6098,12.9343]]]}
out = []
_collect(analyze_terrain({"parcel_geojson": poly}), out)
print(json.dumps(out))
""",
}


def _run(script: str) -> list[list[str]]:
    proc = subprocess.run([sys.executable, "-c", script], cwd=str(_ROOT),
                          capture_output=True, text=True, timeout=120)
    assert proc.returncode == 0, f"subprocess failed:\n{proc.stderr[-1500:]}"
    return json.loads(proc.stdout.strip().splitlines()[-1])


@pytest.mark.parametrize("service", sorted(_SIGNALS))
def test_every_signal_speaks_the_ladder(service: str):
    """Every *confidence* / tier value a signal emits must be on the canonical ladder."""
    pairs = _run(_SIGNALS[service])
    assert pairs, f"{service}: no confidence values collected — collector or builder broke"
    offenders = [(k, v) for k, v in pairs if v not in CONFIDENCE_VALUES]
    assert not offenders, f"{service} emits off-ladder confidence: {offenders}"


def test_authority_has_no_legacy_vocabulary_left():
    """Static lock: the migrated authority service must carry no high/medium/low confidence literal
    (covers the KGIS branches not reachable offline)."""
    src = (_ROOT / "services" / "geo" / "app" / "services" / "authority_service.py").read_text(
        encoding="utf-8")
    for legacy in ('confidence="high"', 'confidence="medium"', 'confidence="low"'):
        assert legacy not in src, f"legacy confidence literal still present: {legacy}"


def test_ladder_is_the_expected_four():
    assert CONFIDENCE_VALUES == {"authoritative", "derived", "inferred", "unresolved"}


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
