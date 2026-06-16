"""
Planning service smoke tests.

Run:
    pytest tests/planning_smoke.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_PLANNING_SERVICE = Path(__file__).resolve().parents[1] / "services" / "planning"
_PLANNING_PATH = str(_PLANNING_SERVICE)
if _PLANNING_PATH in sys.path:
    sys.path.remove(_PLANNING_PATH)
sys.path.insert(0, _PLANNING_PATH)

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
    assert resp.json().get("service") == "planning"


@skip_no_app
def test_analyze_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.post(
        "/planning/analyze",
        json={"latitude": 12.9716, "longitude": 77.5946, "plot_area_sqm": 1500},
    )
    assert resp.status_code == 403


@skip_no_app
@pytest.mark.integration
def test_analyze_flag_on(monkeypatch):
    monkeypatch.setenv("FLAGS", "feature.planning.site-capacity")
    resp = CLIENT.post(
        "/planning/analyze",
        json={"latitude": 12.9716, "longitude": 77.5946, "plot_area_sqm": 1500},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert 0 <= body["score"] <= 100
    assert body["far_applicable"] > 0
    assert pytest.approx(body["buildable_area_sqm"], rel=0.01) == body["far_applicable"] * 1500
    assert "nearest_airport" in body["airport_restriction"]
    assert body["airport_restriction"]["distance_km"] > 0
    # airport coordinates present for the site→airport map waypoint
    assert body["airport_restriction"]["lat"] is not None
    assert body["airport_restriction"]["lon"] is not None
    # metro coord keys always present (null when no metro within 600m)
    assert "metro_lat" in body and "metro_lon" in body
    assert body["road_width_source"] in ["user_input", "osm_detected", "default_9m"]
    assert isinstance(body["tod_applicable"], bool)
