# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-090 growth-pipeline + price-upside smoke.

  (a) PRR is flagged Cancelled and contributes NO upside (and does not raise the score);
  (b) metro distance now RESOLVES from curated data and flows into the US-086 connectivity_signal;
  (c) price_upside is a RANGE — the schema forbids a scalar and enforces low <= high;
  (d) absent guidance value -> price UNRESOLVED, never 0;
  (e) only Operational / Under-Construction nodes contribute premium;
  (f) every pipeline entry carries a status + an as-of date.

Pure builders (no network). One file per process. The future-infra package is imported as `app`;
the infrastructure connectivity_service is loaded STANDALONE via importlib (it is stdlib-only) to
prove the cross-service metro wire-up without the `app` name collision.

Run: pytest tests/future_infra_pipeline_smoke.py
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[1]
_FUTURE = _ROOT / "services" / "future-infra"
if str(_FUTURE) in sys.path:
    sys.path.remove(str(_FUTURE))
sys.path.insert(0, str(_FUTURE))
sys.modules.pop("app", None)
sys.modules.pop("app.services", None)

from app.models.future_infra import (  # noqa: E402
    DEAD_STATUSES,
    UPSIDE_STATUSES,
    PriceUpside,
)
from app.services.pipeline_service import PipelineService  # noqa: E402
from app.services.price_service import (  # noqa: E402
    _qualifying_nodes,
    build_price_upside,
    nearest_qualifying_node,
)


def _load_connectivity():
    """Load infrastructure/connectivity_service.py standalone (stdlib-only) under a non-`app` name."""
    path = _ROOT / "services" / "infrastructure" / "app" / "services" / "connectivity_service.py"
    spec = importlib.util.spec_from_file_location("_conn_us090", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


_SVC = PipelineService()
_FEATURES = _SVC.features()

# UC metro corridor start vertex (P2A) and a nearby test point.
_NEAR_METRO = (12.9180, 77.6195)
# A PRR ring vertex + a point on it, far from any operational/UC node.
_PRR_VERTEX = (13.0500, 77.4800)


def _find(name_frag: str) -> dict:
    for f in _FEATURES:
        if name_frag.lower() in f.get("properties", {}).get("name", "").lower():
            return f["properties"]
    raise AssertionError(f"no curated feature matching {name_frag!r}")


def test_prr_cancelled_contributes_no_upside():
    """(a)"""
    prr = _find("Peripheral Ring Road")
    assert prr["status"] == "Cancelled", f"PRR must be Cancelled, got {prr['status']}"
    # never selected as a price node
    for node in _qualifying_nodes(_FEATURES):
        assert "peripheral ring road" not in (node["name"] or "").lower()
    # pipeline item carries the honest flags (wide radius — the ring centroid sits mid-city)
    res = _SVC.get_pipeline(12.97, 77.59, radius_km=50.0)
    prr_item = next(i for i in res.pipeline_items if "Peripheral Ring Road" in i.name)
    assert prr_item.status == "Cancelled" and prr_item.contributes_to_upside is False


def test_cancelled_does_not_raise_score():
    """(a cont.) a Cancelled-only neighbourhood scores the base 50 — no proximity bonus."""
    res = _SVC.get_pipeline(_PRR_VERTEX[0], _PRR_VERTEX[1], radius_km=1.0)
    statuses = {i.status for i in res.pipeline_items}
    assert statuses <= DEAD_STATUSES or not res.pipeline_items  # only dead (or none) in this radius
    assert res.score == 50, f"cancelled project must not raise score, got {res.score}"


def test_metro_resolves_and_flows_into_connectivity_signal():
    """(b)"""
    metro = _SVC.nearest_metro(*_NEAR_METRO)
    assert metro["status"] == "resolved"
    assert metro["confidence"] == "inferred"           # curated, not live GTFS
    assert metro["distance_m"] is not None and metro["distance_m"] < 5000
    assert metro["corridor_status"] in UPSIDE_STATUSES  # skipped Cancelled corridors

    conn = _load_connectivity()
    fetched = {
        "name": metro["name"], "ref": metro["corridor_status"],
        "distance_m": metro["distance_m"], "distance_type": metro["distance_type"],
        "confidence": metro["confidence"],
    }
    result = conn.build_connectivity(*_NEAR_METRO, metro_fetched=fetched)
    sig = result["connectivity_signal"]
    assert result["metro"]["status"] == "resolved"
    assert sig["metro_status"] == "resolved"
    assert "no-metro-within-5km" not in sig["access_flags"]


def test_price_is_a_range_scalar_forbidden():
    """(c)"""
    fields = set(PriceUpside.model_fields)
    assert {"low", "high"} <= fields
    assert not ({"price", "value", "estimate", "amount"} & fields), "scalar price field leaked"
    with pytest.raises(Exception):
        PriceUpside(low=100.0, high=50.0, method="x", as_of="2024-Q4")  # low > high rejected
    r = build_price_upside(*_NEAR_METRO, guidance_value_per_sqm=100000.0, features=_FEATURES)
    assert r["status"] == "resolved"
    assert r["upside"]["low"] <= r["upside"]["high"]


def test_absent_guidance_is_unresolved_not_zero():
    """(d)"""
    r = build_price_upside(*_NEAR_METRO, guidance_value_per_sqm=None, features=_FEATURES)
    assert r["status"] == "unresolved"
    assert r["upside"] is None                 # NOT a zero-filled scalar
    assert "guidance" in (r["reason"] or "").lower()


def test_only_operational_or_uc_nodes_contribute():
    """(e)"""
    for node in _qualifying_nodes(_FEATURES):
        assert node["status"] in UPSIDE_STATUSES, f"non-qualifying node leaked: {node['status']}"
    node, dist = nearest_qualifying_node(*_NEAR_METRO, _FEATURES)
    assert node is not None and node["status"] in UPSIDE_STATUSES


def test_every_entry_carries_status_and_as_of():
    """(f)"""
    res = _SVC.get_pipeline(12.97, 77.59, radius_km=50.0)
    assert res.pipeline_items
    for item in res.pipeline_items:
        assert item.status
        assert item.status_as_of or item.source_date, f"{item.name} missing as-of date"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
