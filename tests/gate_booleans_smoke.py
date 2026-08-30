# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-092 C1 — Tier-1 gates are machine-readable booleans.

Proves the verdict engine can determine NO-GO from booleans alone, never string-matching:
  * a forest/RED overlay sets OverlayItem.is_killer = true and its gate tripped = true;
  * a Kharab-B parcel sets the `kharab-non-saleable` gate tripped = true;
  * an unresolved gate is tripped=false WITH confidence=unresolved (NOT a silent pass — C2);
  * every gate across both services shares the exact {gate_name, tripped, basis, citation,
    confidence} contract (locked cross-service so the shape can't drift).

Each service package is `app`, so the two services run in SUBPROCESSES (like the confidence guard).
Run: pytest tests/gate_booleans_smoke.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
_GATE_KEYS = {"gate_name", "tripped", "basis", "citation", "confidence"}

_GEO = """
import sys, json; sys.path.insert(0, "services/geo")
from app.models.geo import OverlayItem, OverlayProvenance
from app.services.overlay_engine import evaluate_overlays
prov = OverlayProvenance(source="s", confidence="inferred")
forest_r = OverlayItem(name="forest", status="R", as_of="2026", provenance=prov).model_dump()
clear_g = OverlayItem(name="forest", status="G", as_of="2026", provenance=prov).model_dump()
res = evaluate_overlays(12.9345, 77.6100).model_dump()
gates = res["gates"]
print(json.dumps({
    "forest_R_is_killer": forest_r["is_killer"],
    "clear_G_is_killer": clear_g["is_killer"],
    "all_items_have_is_killer": all("is_killer" in o for o in res["overlays"]),
    "n_gates": len(gates),
    "gate_keys": sorted(set().union(*[set(g) for g in gates])) if gates else [],
    "unresolved_gate_tripped_false": all(
        (not g["tripped"]) for g in gates if g["confidence"] == "unresolved"),
}))
"""

_LAND = """
import sys, json; sys.path.insert(0, "services/land-records")
from app.services.ownership_service import build_ownership_snapshot
def gate(snap, name): return next(g for g in snap["gates"] if g["gate_name"] == name)
kb = build_ownership_snapshot(district="d", taluk="t", hobli="h", village="v",
    survey_number="1/1", parcel_resolved=True, cadastral_l5="Kharab-B", dishaank_class="Gomala")
un = build_ownership_snapshot(district="d", taluk="t", hobli="h", village="v",
    survey_number="1/1", parcel_resolved=False, cadastral_l5=None, dishaank_class=None)
print(json.dumps({
    "kharab_b_tripped": gate(kb, "kharab-non-saleable")["tripped"],
    "kharab_b_conf": gate(kb, "kharab-non-saleable")["confidence"],
    "restricted_tripped": gate(kb, "restricted-tenure")["tripped"],
    "unresolved_kharab_tripped": gate(un, "kharab-non-saleable")["tripped"],
    "unresolved_kharab_conf": gate(un, "kharab-non-saleable")["confidence"],
    "gate_keys": sorted(set().union(*[set(g) for g in kb["gates"]])),
}))
"""


def _run(script: str) -> dict:
    proc = subprocess.run([sys.executable, "-c", script], cwd=str(_ROOT),
                          capture_output=True, text=True, timeout=120)
    assert proc.returncode == 0, f"subprocess failed:\n{proc.stderr[-1500:]}"
    return json.loads(proc.stdout.strip().splitlines()[-1])


def test_overlay_is_killer_boolean():
    r = _run(_GEO)
    assert r["forest_R_is_killer"] is True          # forest RED -> machine-readable killer
    assert r["clear_G_is_killer"] is False
    assert r["all_items_have_is_killer"] is True
    assert r["n_gates"] >= 1
    assert set(r["gate_keys"]) == _GATE_KEYS
    assert r["unresolved_gate_tripped_false"] is True   # unresolved never tripped (C2 pre-wire)


def test_ownership_kharab_b_gate_tripped():
    r = _run(_LAND)
    assert r["kharab_b_tripped"] is True             # Kharab-B -> non-saleable gate fires
    assert r["kharab_b_conf"] == "authoritative"
    assert r["restricted_tripped"] is True           # Gomala -> restricted gate fires
    assert set(r["gate_keys"]) == _GATE_KEYS


def test_unresolved_ownership_gate_not_a_silent_pass():
    r = _run(_LAND)
    assert r["unresolved_kharab_tripped"] is False   # not tripped...
    assert r["unresolved_kharab_conf"] == "unresolved"  # ...but flagged unresolved, NOT cleared


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
