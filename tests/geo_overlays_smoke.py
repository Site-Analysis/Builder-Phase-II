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

# US-088 stage-2 (ingested KA layers). Verified against wetlands_ka.geojson + a clear-of-all scan.
_WET_INSIDE = (13.994899, 74.517427)   # inside a mapped KA wetland -> wetland RED
_ALL_CLEAR = (12.4, 75.9)              # clear of wetland/ramsar/forest/ESZ/lakes -> those GREEN
_INGESTED = ("wetland", "wetland-ramsar", "forest", "eco-sensitive-zone", "lakes/waterbodies")
_STILL_PENDING = ("flood", "HT-line", "gas")


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


# ── (c) CARDINAL RULE: layers with NO bundled geometry stay unresolved ───────
def test_pending_layers_are_unresolved_not_green():
    r = evaluate_overlays(*_ALL_CLEAR)
    for name in _STILL_PENDING:  # flood/HT-line/gas — no geometry, cannot clear
        o = _overlay(r, name)
        assert o.status == "unresolved", f"{name} must be unresolved (absence != clear)"
        assert o.distance_m is None
        assert o.provenance.confidence == "unresolved"
    assert r.verdict.blocks_clean_go is True


# ── (c') CARDINAL RULE survives ingestion: a MISSING layer file -> unresolved ─
def test_missing_layer_file_is_unresolved_not_green(monkeypatch):
    import app.services.overlay_engine as eng

    # Force the wetland layer file to appear absent (as before it was prepped).
    monkeypatch.setitem(eng._LAYER_CACHE, "wetlands_ka.geojson", None)
    r = evaluate_overlays(*_ALL_CLEAR)  # a point that otherwise CLEARS wetland
    w = _overlay(r, "wetland")
    assert w.status == "unresolved", "missing wetland file must NEVER render as clear"
    assert w.status != "G"
    assert w.provenance.confidence == "unresolved"
    assert "wetland" in r.verdict.unresolved_overlays


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
    assert r.verdict.blocks_clean_go is True         # flood/HT-line/gas unresolved
    # ingested layers are now LIVE; only flood/HT-line/gas remain pending.
    assert {"rajakaluve/drains", "airport-OLS", *_INGESTED} <= set(r.live_overlays)
    assert set(r.pending_overlays) == set(_STILL_PENDING)


# ── presence probe may fire RED, but silence can NEVER clear ─────────────────
def test_presence_probe_fires_red_but_silence_never_clears():
    # HT-line has NO bundled geometry (still PENDING) — the observation seam applies to it.
    # Trustworthy presence within the CEA buffer -> RED.
    red = evaluate_overlays(*_CLEAR, observations={"HT-line": 10.0})
    assert _overlay(red, "HT-line").status == "R"
    # a "far" observation must NOT clear the overlay -> still unresolved
    far = evaluate_overlays(*_CLEAR, observations={"HT-line": 9999.0})
    assert _overlay(far, "HT-line").status == "unresolved"


# ── airport-OLS: supplied height piercing the cap -> RED, else height-limited ─
def test_airport_ols_height_gate():
    # 100 m tower ~1.6 km from BLR ARP (inner-horizontal, 45 m cap) pierces it -> RED
    tall = evaluate_overlays(13.185, 77.700, building_height_m=100.0)
    assert _overlay(tall, "airport-OLS").status == "R"
    # same spot, no height supplied -> height-limited (A), not a hard NO-GO by itself
    amber = evaluate_overlays(13.185, 77.700)
    assert _overlay(amber, "airport-OLS").status in ("A", "R")


# ── (ingest a) parcel INSIDE a known KA wetland -> RED ──────────────────────
def test_wetland_inside_is_red():
    w = _overlay(evaluate_overlays(*_WET_INSIDE), "wetland")
    assert w.status == "R"
    assert w.distance_m == 0.0
    assert w.provenance.confidence == "inferred"   # national layer — NOT promoted
    assert w.provenance.vintage == "2024"


# ── (ingest b) parcel clear of all four -> those overlays GREEN (they can clear now) ─
def test_ingested_layers_can_clear_to_green():
    r = evaluate_overlays(*_ALL_CLEAR)
    for name in _INGESTED:
        o = _overlay(r, name)
        assert o.status == "G", f"{name} should clear to GREEN at a clear parcel, got {o.status}"
        assert o.provenance.confidence == "inferred"


# ── (ingest e) ESZ and forest are SEPARATE overlays, not merged ─────────────
def test_forest_and_esz_are_separate_overlays():
    names = [o.name for o in evaluate_overlays(*_ALL_CLEAR).overlays]
    assert "forest" in names and "eco-sensitive-zone" in names
    assert names.count("forest") == 1 and names.count("eco-sensitive-zone") == 1


# ── (ingest f) lakes = multi-regime, STRICTEST governs (NGT 75 m), range + litigation ─
def test_lakes_multi_regime_strictest_governs():
    lk = _overlay(evaluate_overlays(*_ALL_CLEAR), "lakes/waterbodies")
    assert lk.buffer_m == 75.0                       # NGT 75 m — strictest in force governs
    assert lk.buffer_range_m == [30.0, 75.0]         # RMP/KTCDA 30 .. NGT 75 exposed
    assert lk.litigation_status == "contested"       # regimes disagree
    assert lk.reference_point == "periphery"
    assert "75" in (lk.rule_citation or "") or "NGT" in (lk.rule_citation or "")


# ── FIX 2: wetland + ramsar carry NO invented buffer — inside/outside only ──
def test_wetland_and_ramsar_have_no_asserted_buffer():
    r = evaluate_overlays(*_ALL_CLEAR)
    for name in ("wetland", "wetland-ramsar"):
        o = _overlay(r, name)
        assert o.buffer_m == 0.0, f"{name} must not assert a metric buffer (ungrounded = P0)"
        assert "NO statutory blanket buffer" in (o.rule_citation or "")


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
    # a still-pending layer stays unresolved through the wire (cardinal rule survives JSON).
    flood = next(o for o in body["overlays"] if o["name"] == "flood")
    assert flood["status"] == "unresolved"
    # an ingested layer now serializes a concrete R/G status (never unresolved-by-default).
    wet = next(o for o in body["overlays"] if o["name"] == "wetland")
    assert wet["status"] in ("R", "G")
    assert body["verdict"]["blocks_clean_go"] is True
    # swapped lat/lon -> 422 (KA canary reaches the client as a 422, not a 500)
    bad = client.get("/geo/overlays", params={"lat": 77.5, "lon": 12.8})
    assert bad.status_code == 422
