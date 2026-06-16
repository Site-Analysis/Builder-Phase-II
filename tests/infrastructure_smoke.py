"""
Infrastructure service smoke tests.

Run:
    pytest tests/infrastructure_smoke.py -m "not integration" -v
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_INFRA_SERVICE = Path(__file__).resolve().parents[1] / "services" / "infrastructure"
_INFRA_PATH = str(_INFRA_SERVICE)
if _INFRA_PATH in sys.path:
    sys.path.remove(_INFRA_PATH)
sys.path.insert(0, _INFRA_PATH)

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
    assert resp.json().get("service") == "infrastructure"


@skip_no_app
def test_analyze_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.post(
        "/infrastructure/analyze",
        json={"latitude": 12.97, "longitude": 77.59, "radius_m": 2000},
    )
    assert resp.status_code == 403


@skip_no_app
@pytest.mark.integration
def test_analyze_flag_on(monkeypatch):
    monkeypatch.setenv("FLAGS", "feature.infrastructure.connectivity")
    resp = CLIENT.post(
        "/infrastructure/analyze",
        json={"latitude": 12.9716, "longitude": 77.5946, "radius_m": 2000},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert 0 <= body["score"] <= 100
    assert "nearest_road_m" in body["road_access"]
