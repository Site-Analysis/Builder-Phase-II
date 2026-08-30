"""
Infrastructure service smoke tests.

Run:
    pytest tests/infrastructure_smoke.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure services/infrastructure is on sys.path so 'app' package is importable.
_INFRA_SERVICE = Path(__file__).resolve().parents[1] / "services" / "infrastructure"
_INFRA_PATH = str(_INFRA_SERVICE)
if _INFRA_PATH in sys.path:
    sys.path.remove(_INFRA_PATH)
sys.path.insert(0, _INFRA_PATH)

# Ensure we import the infrastructure app, not another service's app.
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


@skip_no_app
def test_health():
    resp = CLIENT.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("status") == "ok"
    assert body.get("service") == "infrastructure"


@skip_no_app
def test_analyze_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.post(
        "/infrastructure/analyze",
        json={"latitude": 12.97, "longitude": 77.59, "radius_m": 2000},
    )
    assert resp.status_code == 403


@skip_no_app
def test_analyze_flag_on(monkeypatch):
    from app.models.infrastructure import (
        InfraResult,
        InfraSubScores,
        RoadAccess,
        TransitStop,
        UtilityPresence,
    )
    from app.routers import infrastructure as infra_router

    monkeypatch.setenv("FLAGS", "feature.infrastructure.connectivity")

    async def _fake_analyze(_lat, _lon, _radius_m=2000):
        return InfraResult(
            road_access=RoadAccess(nearest_road_m=25.0, road_type="residential", frontage_present=True),
            transit=[TransitStop(type="metro", name="MG Road", distance_m=400.0)],
            utilities=UtilityPresence(
                water_supply_nearby=False,
                power_substation_nearby=True,
                storm_drainage_nearby=False,
                sewage_works_nearby=False,
            ),
            sub_scores=InfraSubScores(road=45.0, transit=25.0, power=15.0, water=0.0, telecom=0.0),
            score=85.0,
            severity="low",
            data_source="OpenStreetMap (Overpass API) — roads, transit, power",
        )

    monkeypatch.setattr(infra_router._service, "analyze", _fake_analyze)

    resp = CLIENT.post(
        "/infrastructure/analyze",
        json={"latitude": 12.97, "longitude": 77.59, "radius_m": 2000},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["score"] == 85.0
    assert body["sub_scores"]["road"] == 45.0
    assert body["transit"][0]["type"] == "metro"


@skip_no_app
def test_power_grid_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.get("/infrastructure/power-grid", params={"lat": 12.9716, "lon": 77.5946})
    assert resp.status_code == 403


@skip_no_app
def test_power_grid_flag_on(monkeypatch):
    from app.models.infrastructure import PowerGridResult, PowerLine, PowerSubstation
    import app.routers.infrastructure as infra_router_mod

    monkeypatch.setenv("FLAGS", "feature.infrastructure.power-grid")

    async def _fake_fetch_power_grid(lat, lon, radius_m=10_000):
        return PowerGridResult(
            nearest_ht_line=PowerLine(
                voltage_kv=110,
                operator="KPTCL",
                distance_m=2300.0,
                classification="transmission",
                confidence="derived",
            ),
            nearest_distribution_line=PowerLine(
                voltage_kv=11,
                operator="BESCOM",
                distance_m=85.0,
                classification="distribution_ht",
                confidence="derived",
            ),
            nearest_substation=PowerSubstation(
                name="Koramangala 66kV",
                voltage_kv=66,
                operator="KPTCL",
                distance_m=1800.0,
                lat=12.9335,
                lon=77.6273,
                confidence="derived",
            ),
            bescom_lt_within_200m=False,
            bescom_ht_within_2km=True,
            kptcl_ht_within_5km=True,
            radius_m=radius_m,
            data_source="OSM Overpass (power=line, power=substation)",
            data_disclaimer="Indicative only.",
        )

    import app.services.power_service as ps_mod
    monkeypatch.setattr(ps_mod, "fetch_power_grid", _fake_fetch_power_grid)

    resp = CLIENT.get("/infrastructure/power-grid", params={"lat": 12.9716, "lon": 77.5946})
    assert resp.status_code == 200
    body = resp.json()
    assert body["nearest_ht_line"]["voltage_kv"] == 110
    assert body["nearest_ht_line"]["classification"] == "transmission"
    assert body["nearest_distribution_line"]["distance_m"] == 85.0
    assert body["nearest_substation"]["name"] == "Koramangala 66kV"
    assert body["kptcl_ht_within_5km"] is True
    assert body["bescom_ht_within_2km"] is True
    assert body["bescom_lt_within_200m"] is False
