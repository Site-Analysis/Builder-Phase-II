"""
Geo parcel-geometry smoke tests (SAT-19 Phase 1).

Survey-number → parcel polygon via KGIS geomForSurveyNum. Network is mocked; the
KGISVillageId resolver is seamed (pending KSRSAC), so both the resolved and the
honest-unresolved paths are exercised.

Run:
    pytest tests/geo_parcel_smoke.py -v
"""

from __future__ import annotations

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

_PARAMS = {"survey_no": "88", "village_code": "2905030017_1"}
_FAKE_POLY = {
    "type": "Polygon",
    "coordinates": [[[77.42, 12.65], [77.43, 12.65], [77.43, 12.66], [77.42, 12.65]]],
}


def test_wkt_parser():
    """WKT POLYGON (DD) → GeoJSON, lng/lat preserved (no reprojection)."""
    from app.services.kgis_service import _wkt_polygon_to_geojson

    g = _wkt_polygon_to_geojson(
        "POLYGON ((74.2908198 15.8114947, 74.2907650 15.8112831, "
        "74.2909000 15.8113000, 74.2908198 15.8114947))"
    )
    assert g is not None
    assert g["type"] == "Polygon"
    assert g["coordinates"][0][0] == [74.2908198, 15.8114947]
    assert _wkt_polygon_to_geojson("not wkt") is None
    assert _wkt_polygon_to_geojson(None) is None


@skip_no_app
def test_parcel_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.get("/geo/parcel", params=_PARAMS)
    assert resp.status_code == 403


@skip_no_app
def test_parcel_flag_on_resolved(monkeypatch):
    from app.services import kgis_service

    monkeypatch.setenv("FLAGS", "feature.geo.parcel-geometry")

    async def _fake_geom(_vid, _survey, _client, crs="DD"):
        return _FAKE_POLY

    monkeypatch.setattr(kgis_service, "resolve_kgis_village_id", lambda _vc: "123")
    monkeypatch.setattr(kgis_service, "fetch_parcel_geometry", _fake_geom)

    resp = CLIENT.get("/geo/parcel", params=_PARAMS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["resolved"] is True
    assert body["geometry"]["type"] == "Polygon"
    assert body["survey_number"] == "88"
    assert body["kgis_village_id"] == "123"


@skip_no_app
def test_parcel_flag_on_unresolved(monkeypatch):
    """KGISVillageId unresolved (SAT-19 blocker) → honest empty, never fabricated."""
    from app.services import kgis_service

    monkeypatch.setenv("FLAGS", "feature.geo.parcel-geometry")
    monkeypatch.setattr(kgis_service, "resolve_kgis_village_id", lambda _vc: None)

    resp = CLIENT.get("/geo/parcel", params=_PARAMS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["resolved"] is False
    assert body["geometry"] is None
