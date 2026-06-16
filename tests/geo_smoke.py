"""
Geo service smoke tests.

Run:
    pytest tests/geo_smoke.py -m "not integration" -v
    pytest tests/geo_smoke.py -v  # includes real OSM calls
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_GEO_SERVICE = Path(__file__).resolve().parents[1] / "services" / "geo"
_GEO_PATH = str(_GEO_SERVICE)
if _GEO_PATH in sys.path:
    sys.path.remove(_GEO_PATH)
sys.path.insert(0, _GEO_PATH)

for mod in list(sys.modules.keys()):
    if mod == "app" or mod.startswith("app."):
        sys.modules.pop(mod)

APP_AVAILABLE = False
CLIENT = None  # type: ignore[assignment]
_APP_IMPORT_ERROR: str = ""

try:
    from app.main import app  # noqa: E402
    from fastapi.testclient import TestClient

    CLIENT = TestClient(app)
    APP_AVAILABLE = True
except Exception as _exc:  # noqa: BLE001
    _APP_IMPORT_ERROR = f"{type(_exc).__name__}: {_exc}"


skip_no_app = pytest.mark.skipif(
    not APP_AVAILABLE, reason=f"app/ not importable: {_APP_IMPORT_ERROR}"
)


@skip_no_app
def test_health():
    resp = CLIENT.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("status") == "ok"
    assert body.get("service") == "geo"


@skip_no_app
def test_zone_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.get("/geo/zone?lat=12.97&lon=77.59")
    assert resp.status_code == 403


@skip_no_app
@pytest.mark.integration
def test_zone_flag_on(monkeypatch):
    monkeypatch.setenv("FLAGS", "feature.zoning.land-use")
    resp = CLIENT.get("/geo/zone?lat=12.9716&lon=77.5946")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["zone_class"], str)
    assert 0 <= body["score"] <= 100
    assert body["severity"] in ["low", "moderate", "high", "none"]
    # data_source is "OpenStreetMap (Overpass API)" optionally + ISRO Bhuvan LULC
    assert "OpenStreetMap" in body["data_source"]
    # lulc_vintage is None or the SISDP Phase-2 vintage string when Bhuvan returns a class
    assert body.get("lulc_vintage") in (None, "2016-2019")
    # nearby features carry coordinates for map markers (nullable but key present)
    for feat in body.get("nearby_features", []):
        assert "lat" in feat and "lon" in feat
    # kgis context key always present; null unless feature.geo.kgis-context flag is on
    assert "kgis" in body


@skip_no_app
def test_rajakaluve_authoritative_buffer():
    # 4C: bundled BBMP primary SWD GeoJSON loads + precise point-to-line works
    from app.services.water_service import _load_rajakaluve, _nearest_rajakaluve
    assert len(_load_rajakaluve()) > 0
    # central Bengaluru → near a primary drain (finite distance)
    d = _nearest_rajakaluve(12.97, 77.59)
    assert d is not None and d >= 0
    # far outside Bengaluru → no authoritative data
    assert _nearest_rajakaluve(28.61, 77.20) is None


@skip_no_app
def test_soil_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.get("/geo/soil?lat=12.97&lon=77.59")
    assert resp.status_code == 403


@skip_no_app
@pytest.mark.integration
def test_soil_flag_on(monkeypatch):
    monkeypatch.setenv("FLAGS", "feature.environment.soil")
    resp = CLIENT.get("/geo/soil?lat=12.9716&lon=77.5946")
    assert resp.status_code == 200
    body = resp.json()
    assert 0 <= body["score"] <= 100
    assert body["severity"] in ["low", "moderate", "high", "none"]
    assert isinstance(body["texture_class"], str)


@skip_no_app
def test_water_constraints_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.get("/geo/water-constraints?lat=12.97&lon=77.59")
    assert resp.status_code == 403


@skip_no_app
@pytest.mark.integration
def test_water_constraints_flag_on(monkeypatch):
    monkeypatch.setenv("FLAGS", "feature.environment.water-constraints")
    resp = CLIENT.get("/geo/water-constraints?lat=12.9716&lon=77.5946&radius_m=500")
    assert resp.status_code == 200
    body = resp.json()
    assert 0 <= body["score"] <= 100
    assert isinstance(body["water_bodies"], list)
    assert isinstance(body["construction_restricted"], bool)


@skip_no_app
def test_amenities_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.get("/geo/amenities?lat=12.97&lon=77.59")
    assert resp.status_code == 403


@skip_no_app
@pytest.mark.integration
def test_amenities_flag_on(monkeypatch):
    monkeypatch.setenv("FLAGS", "feature.geo.amenities")
    resp = CLIENT.get("/geo/amenities?lat=12.9716&lon=77.5946&radius_m=5000")
    assert resp.status_code == 200
    body = resp.json()
    assert 0 <= body["score"] <= 100
    assert body["severity"] in ["low", "moderate", "high", "none"]
    assert isinstance(body["total_count"], int)
    assert "healthcare" in body
    assert "education" in body
    # Dense map markers: every category exposes `points` (all located amenities,
    # ≤40) — a superset of `top_5`; located items carry lat/lon for markers.
    for cat in ("healthcare", "education", "retail", "finance", "recreation", "religious", "transport"):
        c = body[cat]
        assert isinstance(c["points"], list)
        assert len(c["points"]) >= len(c["top_5"])
        assert len(c["points"]) <= 40
        for it in c["points"]:
            assert it["lat"] is not None and it["lon"] is not None
