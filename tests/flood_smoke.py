"""
Flood service smoke tests.

Run:
    pytest tests/flood_smoke.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_FLOOD_SERVICE = Path(__file__).resolve().parents[1] / "services" / "flood"
_FLOOD_PATH = str(_FLOOD_SERVICE)
if _FLOOD_PATH in sys.path:
    sys.path.remove(_FLOOD_PATH)
sys.path.insert(0, _FLOOD_PATH)

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
    assert body.get("service") == "flood"


@skip_no_app
def test_analyze_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.post(
        "/flood/analyze",
        json={"latitude": 19.07, "longitude": 72.87, "radius_meters": 1000},
    )
    assert resp.status_code == 403


@skip_no_app
@pytest.mark.integration
def test_analyze_flag_on(monkeypatch):
    monkeypatch.setenv("FLAGS", "feature.flood.risk-analysis")
    resp = CLIENT.post(
        "/flood/analyze",
        json={"latitude": 19.07, "longitude": 72.87, "radius_meters": 1000},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert 0 <= body["overall_score"] <= 100
    components = body.get("component_scores")
    assert components is not None
    for key in ("elevation_risk", "hydrology_risk", "historical_risk", "llai_risk"):
        assert key in components
