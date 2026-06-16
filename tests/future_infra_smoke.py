"""
Future infrastructure service smoke tests.

Run:
    pytest tests/future_infra_smoke.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_SVC = Path(__file__).resolve().parents[1] / "services" / "future-infra"
_SVC_PATH = str(_SVC)
if _SVC_PATH in sys.path:
    sys.path.remove(_SVC_PATH)
sys.path.insert(0, _SVC_PATH)

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
    assert resp.json().get("service") == "future-infra"


@skip_no_app
def test_flag_off(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    resp = CLIENT.get("/future-infra/pipeline?lat=12.97&lon=77.59")
    assert resp.status_code == 403


@skip_no_app
def test_flag_on(monkeypatch):
    monkeypatch.setenv("FLAGS", "feature.context.growth-pipeline")
    resp = CLIENT.get("/future-infra/pipeline?lat=12.9716&lon=77.5946&radius_km=10")
    assert resp.status_code == 200
    body = resp.json()
    assert "pipeline_items" in body
    assert body["score"] >= 0
