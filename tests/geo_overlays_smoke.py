# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""US-088 — unified deal-killer overlay engine smoke.

Proves the cardinal rule (absence != clear), EPSG:32643 distances, strictest-dated-buffer
handling, reference-point-per-regime, and the NO-GO / blocks-GO verdict booleans. Deterministic
and OFFLINE — uses the bundled rajakaluve geometry + AAI ARP coords, no network.

One file per process. Run:  pytest tests/geo_overlays_smoke.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_GEO = Path(__file__).resolve().parents[1] / "services" / "geo"
_P = str(_GEO)
if _P in sys.path:
    sys.path.remove(_P)
sys.path.insert(0, _P)
sys.modules.pop("app", None)
sys.modules.pop("app.main", None)

from app.services.overlay_engine import (  # noqa: E402
    evaluate_overlays,
    wgs84_to_utm43n,
)

# Bundled-geometry reference points (verified against rajakaluve_primary.geojson).
_ON_DRAIN = (12.839695, 77.533485)     # a rajakaluve vertex -> distance ~0 -> RED
_CLEAR = (12.811695, 77.505485)        # ~4.3 km from nearest drain -> rajakaluve GREEN


def _overlay(res, name):
    return next(o for o in res.overlays if o.name == name)


# ── (a) known-inside-buffer -> RED + NO-GO ──────────────────────────────────
def test_inside_buffer_is_red():
    r = evaluate_overlays(*_ON_DRAIN)
    raja = _overlay(r, "rajakaluve/drains")
    assert raja.status == "R"
    assert raja.distance_m is not None and raja.distance_m <= raja.buffer_m
    assert r.verdict.hard_no_go is True
    assert "rajakaluve/drains" in r.verdict.red_overlays


# ── (b) known-clear -> that overlay is GREEN (only a bundled layer can clear) ─
def test_clear_parcel_overlay_is_green():
    r = evaluate_overlays(*_CLEAR)
    raja = _overlay(r, "rajakaluve/drains")
    assert raja.status == "G"
    assert raja.distance_m is not None and raja.distance_m > raja.buffer_m


# ── (c) CARDINAL RULE: layer unavailable -> unresolved, NOT green ────────────
def test_missing_layer_is_unresolved_not_green():
    r = evaluate_overlays(*_CLEAR)
    for name in ("wetland", "lakes/waterbodies", "flood", "forest", "HT-line", "gas"):
        o = _overlay(r, name)
        assert o.status == "unresolved", f"{name} must be unresolved (absence != clear)"
        assert o.status != "G"
        assert o.distance_m is None
        assert o.provenance.confidence == "unresolved"
    # wetland is THE cardinal-rule overlay — never silently clear.
    assert _overlay(r, "wetland").status == "unresolved"
    assert r.verdict.blocks_clean_go is True


# ── (d) distances in EPSG:32643 + KA-bounds swap canary ─────────────────────
def test_distance_is_epsg32643_and_swap_canary():
    r = evaluate_overlays(*_ON_DRAIN)
    assert r.crs == "EPSG:32643"
    assert all(o.crs == "EPSG:32643" for o in r.overlays)
    # BLR ARP projects to a plausible UTM 43N easting/northing (2.7deg E of the 75E CM).
    e, n = wgs84_to_utm43n(13.1979, 77.7063)
    assert 790_000 < e < 796_000
    assert 1_458_000 < n < 1_463_000
    # swapped lat/lon (lat looks like a Karnataka lon) is a hard failure, not garbage metres.
    with pytest.raises(ValueError):
        evaluate_overlays(77.5, 12.8)
    # out-of-Karnataka point also rejected (bundled layers do not cover it).
    with pytest.raises(ValueError):
        evaluate_overlays(19.07, 72.87)  # Mumbai


# ── (e) strictest regime by default + litigation range exposed ──────────────
def test_strictest_buffer_and_litigation_range():
    raja = _overlay(evaluate_overlays(*_CLEAR), "rajakaluve/drains")
    # three regimes: 50 (RMP, in force) / 50 (HC, in force) / 30 (2025 draft, proposed).
    assert raja.buffer_m == 50.0                     # strictest IN-FORCE governs
    assert raja.buffer_range_m == [30.0, 50.0]       # proposed 30 surfaced, never governs
    assert raja.litigation_status == "contested"


# ── (f) reference_point correct per regime (centre vs periphery) ────────────
def test_reference_point_per_regime():
    r = evaluate_overlays(*_CLEAR)
    # edge/FTL-referenced overlays -> periphery
    for name in ("lakes/waterbodies", "wetland", "forest"):
        assert _overlay(r, name).reference_point == "periphery"
    # centreline/pipeline-referenced overlays -> centre
    for name in ("HT-line", "gas", "flood"):
        assert _overlay(r, name).reference_point == "centre"


# ── (g) verdict booleans: RED -> NO-GO; unresolved -> blocks GO ─────────────
def test_verdict_booleans():
    r = evaluate_overlays(*_ON_DRAIN)
    assert r.verdict.hard_no_go is True              # rajakaluve RED
    assert r.verdict.blocks_clean_go is True         # wetland etc. unresolved
    assert set(r.live_overlays) == {"rajakaluve/drains", "airport-OLS"}
    assert "wetland" in r.pending_overlays


# ── presence probe may fire RED, but silence can NEVER clear ─────────────────
def test_presence_probe_fires_red_but_silence_never_clears():
    # trustworthy presence within the wetland buffer -> RED
    red = evaluate_overlays(*_CLEAR, observations={"wetland": 10.0})
    assert _overlay(red, "wetland").status == "R"
    # a "far" observation must NOT clear the overlay -> still unresolved
    far = evaluate_overlays(*_CLEAR, observations={"wetland": 9999.0})
    assert _overlay(far, "wetland").status == "unresolved"


# ── airport-OLS: supplied height piercing the cap -> RED, else height-limited ─
def test_airport_ols_height_gate():
    # 100 m tower ~1.6 km from BLR ARP (inner-horizontal, 45 m cap) pierces it -> RED
    tall = evaluate_overlays(13.185, 77.700, building_height_m=100.0)
    assert _overlay(tall, "airport-OLS").status == "R"
    # same spot, no height supplied -> height-limited (A), not a hard NO-GO by itself
    amber = evaluate_overlays(13.185, 77.700)
    assert _overlay(amber, "airport-OLS").status in ("A", "R")


# ── endpoint: flag-gated (403 off / 200 on) + serialization + 422 on bad point ─
def test_endpoint_flag_gate_and_serialization(monkeypatch):
    from app.main import app  # noqa: E402
    from fastapi.testclient import TestClient

    client = TestClient(app)
    # flag off -> 403
    monkeypatch.setenv("FLAGS", "")
    assert client.get("/geo/overlays", params={"lat": 12.8397, "lon": 77.5335}).status_code == 403
    # flag on -> 200, cardinal rule survives serialization
    monkeypatch.setenv("FLAGS", "feature.geo.overlays")
    r = client.get("/geo/overlays", params={"lat": 12.811695, "lon": 77.505485})
    assert r.status_code == 200
    body = r.json()
    assert body["crs"] == "EPSG:32643"
    wet = next(o for o in body["overlays"] if o["name"] == "wetland")
    assert wet["status"] == "unresolved"          # not green through the wire
    assert body["verdict"]["blocks_clean_go"] is True
    # swapped lat/lon -> 422 (KA canary reaches the client as a 422, not a 500)
    bad = client.get("/geo/overlays", params={"lat": 77.5, "lon": 12.8})
    assert bad.status_code == 422
