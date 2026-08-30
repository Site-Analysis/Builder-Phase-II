"""
Geo service smoke tests.

Run:
    pytest tests/geo_smoke.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure services/geo is on sys.path so 'app' package is importable.
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

_PT = {"lat": 12.97, "lon": 77.59}


@skip_no_app
def test_health():
    resp = CLIENT.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("status") == "ok"
    assert body.get("service") == "geo"


@skip_no_app
@pytest.mark.parametrize("path", ["/geo/zone", "/geo/soil", "/geo/water-constraints", "/geo/amenities"])
def test_endpoints_flag_off(monkeypatch, path):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.get(path, params=_PT)
    assert resp.status_code == 403


@skip_no_app
def test_zone_flag_on(monkeypatch):
    from app.models.geo import ZoneResult
    from app.routers import geo as geo_router

    monkeypatch.setenv("FLAGS", "feature.zoning.land-use")

    async def _fake_zone(_lat, _lon, _radius_m, kgis_enabled=False):
        return ZoneResult(
            zone_class="Residential",
            primary_landuse="residential",
            score=78.0,
            severity="low",
            data_source="OpenStreetMap (Overpass) + ISRO Bhuvan LULC",
        )

    monkeypatch.setattr(geo_router._service, "analyze_zone", _fake_zone)

    resp = CLIENT.get("/geo/zone", params=_PT)
    assert resp.status_code == 200
    body = resp.json()
    assert body["zone_class"] == "Residential"
    assert body["score"] == 78.0


@skip_no_app
def test_parcel_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.get("/geo/parcel", params={"survey_no": "45/2"})
    assert resp.status_code == 403


@skip_no_app
def test_parcel_resolved(monkeypatch):
    """Resolver + geomForSurveyNum path returns a real polygon (US-080)."""
    from app.services import kgis_service as ks

    monkeypatch.setenv("FLAGS", "feature.geo.parcel-geometry")

    async def _fake_resolve(_vc, _client):
        return "12345"

    async def _fake_geom(_vid, _sno, _client, crs="DD"):
        return {
            "type": "Polygon",
            "coordinates": [[[77.0, 12.0], [77.1, 12.0], [77.1, 12.1], [77.0, 12.0]]],
        }

    monkeypatch.setattr(ks, "resolve_kgis_village_id", _fake_resolve)
    monkeypatch.setattr(ks, "fetch_parcel_geometry", _fake_geom)

    resp = CLIENT.get("/geo/parcel", params={"survey_no": "45/2", "village_code": "2905030017"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["resolved"] is True
    assert body["kgis_village_id"] == "12345"
    assert body["geometry"]["type"] == "Polygon"


@skip_no_app
def test_parcel_unresolved(monkeypatch):
    """KGIS unreachable / no match → honest resolved=false, no fabricated geometry."""
    from app.services import kgis_service as ks

    monkeypatch.setenv("FLAGS", "feature.geo.parcel-geometry")

    async def _none_resolve(_vc, _client):
        return None

    async def _none_direct(_vc, _sno, _client):
        return None

    monkeypatch.setattr(ks, "resolve_kgis_village_id", _none_resolve)
    monkeypatch.setattr(ks, "fetch_parcel_geometry_direct", _none_direct)

    resp = CLIENT.get("/geo/parcel", params={"survey_no": "45/2", "village_code": "2905030017"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["resolved"] is False
    assert body["geometry"] is None


@skip_no_app
def test_authority_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.get("/geo/authority", params=_PT)
    assert resp.status_code == 403


@skip_no_app
def test_authority_bengaluru(monkeypatch):
    """Bengaluru urban point → GBA-aware authority, live_verified false (US-093)."""
    from app.services import authority_service as auth

    monkeypatch.setenv("FLAGS", "feature.geo.authority")

    async def _fake_ctx(_lat, _lon, _client):
        return {
            "type": "Urban",
            "district": "Bengaluru Urban",
            "town": "BBMP",
            "admin_zone": "BBMP East",
            "ward": "Hoysala Nagar",
            "taluk": None,
            "hobli": None,
            "village": None,
            "village_code": None,
            "survey_number": None,
        }

    monkeypatch.setattr(auth, "fetch_kgis_context", _fake_ctx)

    resp = CLIENT.get("/geo/authority", params=_PT)
    assert resp.status_code == 200
    body = resp.json()
    assert "Greater Bengaluru Authority" in body["authority"]
    assert body["jurisdiction_type"] == "Urban"
    assert body["live_verified"] is False
    # ADDITIVE check: pre-existing fields unchanged + KGIS-live provenance = authoritative.
    for f in ("authority", "jurisdiction_type", "planning_authority", "approval_track",
              "bye_law_reference", "portal", "confidence", "live_verified", "kgis",
              "notes", "data_source", "data_disclaimer"):
        assert f in body
    assert body["confidence"] == "derived"  # US-092 C4: ladder (was off-ladder "medium")
    assert body["provenance"]["tier"] == "authoritative"
    assert body["provenance"]["mode"] == "kgis-live"


@skip_no_app
def test_authority_kgis_unavailable_inferred_fallback(monkeypatch):
    """KGIS unavailable + Bengaluru point → inferred from the committed GBA wards layer."""
    from app.services import authority_service as auth

    monkeypatch.setenv("FLAGS", "feature.geo.authority")

    async def _no_ctx(_lat, _lon, _client):
        return None

    monkeypatch.setattr(auth, "fetch_kgis_context", _no_ctx)
    # reset the load-once caches so the real wards layer is (re)loaded for this test
    auth._wards_cache.update({"loaded": False, "feats": None})

    resp = CLIENT.get("/geo/authority", params={"lat": 12.9716, "lon": 77.5946})
    assert resp.status_code == 200
    body = resp.json()
    assert "Greater Bengaluru Authority" in body["authority"]
    assert body["provenance"]["tier"] == "inferred"
    assert body["provenance"]["mode"] == "inferred-fallback"
    assert body["provenance"]["data_vintage"] == "2025"


@skip_no_app
def test_authority_no_context_no_fallback_unresolved(monkeypatch):
    """No KGIS context AND point outside every bundled layer → honest unresolved."""
    from app.services import authority_service as auth

    monkeypatch.setenv("FLAGS", "feature.geo.authority")

    async def _no_ctx(_lat, _lon, _client):
        return None

    monkeypatch.setattr(auth, "fetch_kgis_context", _no_ctx)
    auth._wards_cache.update({"loaded": False, "feats": None})
    auth._villages_cache.update({"loaded": False, "index": None})

    # A non-Karnataka point → wards + villages both miss → unresolved, never a guess.
    resp = CLIENT.get("/geo/authority", params={"lat": 0.0, "lon": 0.0})
    assert resp.status_code == 200
    body = resp.json()
    assert body["authority"] == "Unknown"
    assert body["confidence"] == "unresolved"  # US-092 C4: ladder (was off-ladder "low")
    assert body["provenance"]["tier"] == "unresolved"
    assert body["provenance"]["mode"] == "unresolved"


# ── US-088 dry-run FIX A: OSM-inferred zone can NEVER be authoritative ────────

def test_zone_result_rejects_authoritative_osm_zone():
    """P0 GUARD: constructing a ZoneResult with source_confidence='authoritative' but a
    non-RMP zone_authority (OSM-inferred) must FAIL LOUD."""
    import pytest as _pytest
    from app.models.geo import ZoneResult

    with _pytest.raises(Exception):  # pydantic ValidationError wraps the ValueError
        ZoneResult(
            zone_class="Residential", primary_landuse="residential",
            source_confidence="authoritative", zone_authority="OSM-inferred",
            score=50, severity="low", data_source="OpenStreetMap (Overpass API)",
        )


def test_zone_result_allows_authoritative_only_for_rmp():
    """Only a real RMP/KGIS land-use source (BDA-RMP-2015) may mint 'authoritative'."""
    from app.models.geo import ZoneResult

    ok = ZoneResult(
        zone_class="Residential", primary_landuse="residential",
        source_confidence="authoritative", zone_authority="BDA-RMP-2015",
        score=50, severity="low", data_source="KGIS BDA Revised Master Plan 2015 land-use",
    )
    assert ok.source_confidence == "authoritative"
    # an OSM zone defaults to inferred and validates fine
    osm = ZoneResult(
        zone_class="Residential", primary_landuse="residential",
        zone_authority="OSM-inferred", score=50, severity="low",
        data_source="OpenStreetMap (Overpass API)",
    )
    assert osm.source_confidence == "inferred"
