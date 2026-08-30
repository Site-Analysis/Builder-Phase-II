"""
Geo authoritative land-use smoke tests (SAT-20 Builders View Phase 2).

Authoritative BDA RMP-2015 land-use (KGIS CITYGIS/BDA_Plans) → `/geo/zone`. Network is
mocked; the KGIS land-use layer is seamed (env-configured, pending license go-live), so
both the authoritative-override and the OSM-fallback paths are exercised.

Run:
    pytest tests/geo_landuse_smoke.py -v
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

# Ensure services/geo is on sys.path so 'app' package is importable (one file per process).
_GEO_SERVICE = Path(__file__).resolve().parents[1] / "services" / "geo"
_GEO_PATH = str(_GEO_SERVICE)
if _GEO_PATH in sys.path:
    sys.path.remove(_GEO_PATH)
sys.path.insert(0, _GEO_PATH)

# Ensure we import the geo app, not another service's app.
sys.modules.pop("app", None)
sys.modules.pop("app.main", None)

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


# ── Pure taxonomy mapping (no app / network) ─────────────────────────────────
def test_map_rmp_to_zoneclass():
    from app.services.landuse_service import map_rmp_to_zoneclass

    # codes
    assert map_rmp_to_zoneclass("R") == "Residential"
    assert map_rmp_to_zoneclass("C") == "Commercial"
    assert map_rmp_to_zoneclass("I") == "Industrial"
    assert map_rmp_to_zoneclass("PSP") == "Institutional"
    assert map_rmp_to_zoneclass("P&SP") == "Institutional"
    assert map_rmp_to_zoneclass("OS") == "Green Belt"
    assert map_rmp_to_zoneclass("AG") == "Agricultural"
    # labels
    assert map_rmp_to_zoneclass("Residential (Main)") == "Residential"
    assert map_rmp_to_zoneclass("Public & Semi Public") == "Institutional"
    assert map_rmp_to_zoneclass("Parks & Open Spaces") == "Green Belt"
    assert map_rmp_to_zoneclass("Industrial Zone") == "Industrial"
    # unknown / empty
    assert map_rmp_to_zoneclass("") == "Unknown"
    assert map_rmp_to_zoneclass(None) == "Unknown"
    assert map_rmp_to_zoneclass("Zorblax") == "Unknown"


# ── fetch_landuse_zone seam (mocked ArcGIS client) ───────────────────────────
class _FakeResp:
    def __init__(self, payload):
        self._p = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._p


class _FakeArcGisClient:
    """Minimal httpx-like client whose .get returns a canned ArcGIS query response."""

    def __init__(self, payload):
        self._payload = payload

    async def get(self, url, params=None, timeout=None):
        return _FakeResp(self._payload)


def test_fetch_landuse_unconfigured(monkeypatch):
    """No KGIS_LANDUSE_URL → None (OSM fallback), never fabricated."""
    from app.services import landuse_service

    monkeypatch.delenv("KGIS_LANDUSE_URL", raising=False)
    client = _FakeArcGisClient({"features": [{"attributes": {"LANDUSE": "Commercial"}}]})
    out = asyncio.run(landuse_service.fetch_landuse_zone(12.97, 77.59, client))
    assert out is None


def test_fetch_landuse_authoritative(monkeypatch):
    from app.services import landuse_service

    monkeypatch.setenv("KGIS_LANDUSE_URL", "https://kgis.example/MapServer/0")
    monkeypatch.setenv("KGIS_LANDUSE_ZONE_FIELD", "LANDUSE")
    client = _FakeArcGisClient({"features": [{"attributes": {"LANDUSE": "Commercial"}}]})
    out = asyncio.run(landuse_service.fetch_landuse_zone(12.97, 77.59, client))
    assert out is not None
    assert out["zone_class"] == "Commercial"
    assert out["zone_code"] == "Commercial"


def test_fetch_landuse_outside_jurisdiction(monkeypatch):
    """Point with no intersecting feature (outside BDA LPA) → None."""
    from app.services import landuse_service

    monkeypatch.setenv("KGIS_LANDUSE_URL", "https://kgis.example/MapServer/0")
    client = _FakeArcGisClient({"features": []})
    out = asyncio.run(landuse_service.fetch_landuse_zone(12.97, 77.59, client))
    assert out is None


# ── analyze_zone override (Overpass + LULC + landuse mocked) ─────────────────
class _FakeOverpassClient:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, data=None):
        return _FakeResp({"elements": []})  # no OSM features → base zone "Unknown"

    async def get(self, *a, **k):
        return _FakeResp({})


async def _lulc_none(lat, lon, client):
    return (None, None, None)


def _patch_zone_deps(monkeypatch):
    from app.services import geo_service

    monkeypatch.setattr(geo_service, "fetch_lulc", _lulc_none)
    monkeypatch.setattr(geo_service.httpx, "AsyncClient", _FakeOverpassClient)
    return geo_service


def test_analyze_zone_authoritative_override(monkeypatch):
    geo_service = _patch_zone_deps(monkeypatch)

    async def _auth(lat, lon, client):
        return {"zone_class": "Commercial", "zone_code": "C", "raw_zone": "Commercial"}

    monkeypatch.setattr(geo_service.landuse_service, "fetch_landuse_zone", _auth)

    res = asyncio.run(geo_service.GeoService().analyze_zone(12.97, 77.59))
    assert res.zone_class == "Commercial"
    assert res.zone_authority == "BDA-RMP-2015"
    assert res.source_confidence == "authoritative"
    assert res.zone_code == "C"
    assert "BDA Revised Master Plan" in res.data_source


def test_analyze_zone_osm_fallback(monkeypatch):
    geo_service = _patch_zone_deps(monkeypatch)

    async def _none(lat, lon, client):
        return None

    monkeypatch.setattr(geo_service.landuse_service, "fetch_landuse_zone", _none)

    res = asyncio.run(geo_service.GeoService().analyze_zone(12.97, 77.59))
    assert res.zone_authority == "OSM-inferred"
    # OSM/Bhuvan land cover is INFERRED, never authoritative (unified vocab, US-088 P0).
    assert res.source_confidence == "inferred"


# ── Endpoint gate ────────────────────────────────────────────────────────────
@skip_no_app
def test_zone_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.get("/geo/zone", params={"lat": 12.97, "lon": 77.59})
    assert resp.status_code == 403
