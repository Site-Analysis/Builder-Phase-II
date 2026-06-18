"""SunPath service smoke tests (SAT-226).

Run:
    pip install -r services/sunpath/requirements.txt
    pytest tests/sunpath_smoke.py -v

CI note: the shared smoke job installs only `pytest httpx`, so the heavy deps
(pvlib/matplotlib/shapely) are absent and these tests SKIP via `skip_no_app`
unless the service requirements are installed first.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Flags must be on before the app/handlers read them (read at request time).
os.environ.setdefault("FLAGS", "feature.sunpath.diagram,feature.sunpath.solar-day")

_SUNPATH_SERVICE = Path(__file__).resolve().parents[1] / "services" / "sunpath"
if str(_SUNPATH_SERVICE) not in sys.path:
    sys.path.insert(0, str(_SUNPATH_SERVICE))

APP_AVAILABLE = False
CLIENT = None
_APP_IMPORT_ERROR = ""

try:
    from app.main import app  # noqa: E402
    from app.services.solar_engine import SolarEngine  # noqa: E402
    from app.services.sunlight_hours import compute_sunlight_hours  # noqa: E402
    from fastapi.testclient import TestClient

    CLIENT = TestClient(app)
    APP_AVAILABLE = True
except Exception as _exc:  # noqa: BLE001
    _APP_IMPORT_ERROR = f"{type(_exc).__name__}: {_exc}"

skip_no_app = pytest.mark.skipif(
    not APP_AVAILABLE, reason=f"app/ not importable: {_APP_IMPORT_ERROR}"
)

BLR = {"lat": 12.9716, "lon": 77.5946}  # Bangalore
DEL = {"lat": 28.6139, "lon": 77.2090}  # Delhi


@skip_no_app
def test_health_ok_and_ungated():
    # Health works even with the flag off.
    assert CLIENT.get("/health").status_code == 200


@skip_no_app
def test_tz_regression_not_arctic():
    # Fix #1: tzfpy arg order. Wrong order sent Bangalore to Arctic/Longyearbyen.
    assert SolarEngine().detect_timezone(BLR["lat"], BLR["lon"]) == "Asia/Kolkata"


@skip_no_app
def test_summer_hours_are_local_not_utc():
    # Fix #2: peak elevation must land at local solar noon (~hour 12), not UTC (~6).
    r = CLIENT.get("/sunpath/summer", params=BLR)
    assert r.status_code == 200
    d = r.json()
    assert d["timezone"] == "Asia/Kolkata"
    peak = max(d["hourly_data"], key=lambda x: x["elevation"])
    assert 11 <= peak["hour"] <= 13
    # Bangalore summer-solstice peak elevation ~78°.
    assert 76 <= peak["elevation"] <= 80
    assert all(0 <= h["azimuth"] <= 360 for h in d["hourly_data"])


@skip_no_app
def test_events_shape():
    d = CLIENT.get("/sunpath/events", params=BLR).json()["events"]
    assert set(d) == {"sunrise", "solar_noon", "sunset"}
    # Bangalore is never polar — all three events must be present (not null).
    assert all(d[k] is not None for k in d)


@skip_no_app
def test_winter_day_length_delhi():
    # Delhi winter solstice daylight ≈ 10.3 h → ~10 daylight hours in the hourly grid.
    d = CLIENT.get("/sunpath/winter", params=DEL).json()
    daylight = [h for h in d["hourly_data"] if h["elevation"] > 0]
    assert 9 <= len(daylight) <= 11


@skip_no_app
def test_solar_day_shape_and_accuracy():
    # Accurate per-date sun path for the summer solstice at Bangalore.
    r = CLIENT.get("/sunpath/solar-day", params={**BLR, "date": "2025-06-21"})
    assert r.status_code == 200
    d = r.json()
    assert set(d) >= {"latitude", "longitude", "date", "timezone", "hourly_data", "events"}
    assert d["date"] == "2025-06-21"
    assert d["timezone"] == "Asia/Kolkata"
    peak = max(d["hourly_data"], key=lambda x: x["elevation"])
    assert 11 <= peak["hour"] <= 13            # peak at local solar noon
    assert 76 <= peak["elevation"] <= 80       # BLR summer-solstice noon ~78°
    assert all(0 <= h["azimuth"] <= 360 for h in d["hourly_data"])
    assert all(d["events"][k] is not None for k in ("sunrise", "solar_noon", "sunset"))


@skip_no_app
def test_solar_day_winter_lower_sun():
    # Dec-21 worst-case: noon altitude ≈ 90 − lat − 23.44 ≈ 53.6° at Bangalore,
    # markedly lower than summer — the binding case for shadow studies.
    d = CLIENT.get("/sunpath/solar-day", params={**BLR, "date": "2025-12-21"}).json()
    peak = max(d["hourly_data"], key=lambda x: x["elevation"])
    assert 50 <= peak["elevation"] <= 57


@skip_no_app
def test_solar_day_bad_date_422():
    assert CLIENT.get("/sunpath/solar-day", params={**BLR, "date": "21-06-2025"}).status_code == 422


@skip_no_app
def test_solar_day_requires_own_flag(monkeypatch):
    # Router flag on, solar-day flag off → endpoint-level gate must 403.
    monkeypatch.setenv("FLAGS", "feature.sunpath.diagram")
    assert CLIENT.get("/sunpath/summer", params=BLR).status_code == 200
    assert CLIENT.get("/sunpath/solar-day", params={**BLR, "date": "2025-06-21"}).status_code == 403


@skip_no_app
def test_diagram_svg():
    r = CLIENT.get("/sunpath/diagram.svg", params=BLR)
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/svg+xml"
    assert b"<svg" in r.content[:2000]


@skip_no_app
def test_orientation_recommendation():
    d = CLIENT.get("/sunpath/orientation", params=BLR).json()
    assert d["optimal_facade_orientation"] == "south"
    assert d["summer_noon_altitude_deg"] > d["winter_noon_altitude_deg"]
    assert d["overhang_projection_factor"] > 0
    # Southern hemisphere flips.
    s = CLIENT.get("/sunpath/orientation", params={"lat": -33.86, "lon": 151.2}).json()
    assert s["optimal_facade_orientation"] == "north"


@skip_no_app
def test_sunlight_hours_open_sky():
    # No network/GEE in CI → building extraction degrades to open-sky grid.
    r = CLIENT.get(
        "/shadow/sunlight-hours", params={**BLR, "date": "2025-06-21", "radius_meters": 150}
    )
    assert r.status_code == 200
    d = r.json()
    assert len(d["grid"]) > 0
    assert all(0 <= cell["sunlight_hours"] <= 24 for cell in d["grid"])
    assert "pybdshadow" in d["attribution"]


@skip_no_app
def test_sunlight_hours_building_shadow_reduces_hours():
    # The building-shadow branch must actually subtract hours (guards the
    # feature.properties bug from silently reverting to open-sky).
    import datetime as _dt

    day = _dt.date(2025, 6, 21)
    footprint = [
        [77.5946, 12.9716],
        [77.59506, 12.9716],
        [77.59506, 12.97194],
        [77.5946, 12.97194],
        [77.5946, 12.9716],
    ]
    building = [{"footprint": footprint, "height": 80.0, "id": "tower"}]
    open_sky = compute_sunlight_hours(
        12.9716, 77.5946, day, radius_meters=120, buildings=None, grid_n=11
    )
    shaded = compute_sunlight_hours(
        12.9716, 77.5946, day, radius_meters=120, buildings=building, grid_n=11
    )
    open_max = max(c["sunlight_hours"] for c in open_sky)
    shaded_min = min(c["sunlight_hours"] for c in shaded)
    assert shaded_min < open_max  # some cells lose sun to the tower
    assert any(c["sunlight_hours"] < open_max for c in shaded)


@skip_no_app
def test_flag_off_returns_403(monkeypatch):
    monkeypatch.setenv("FLAGS", "")
    assert CLIENT.get("/health").status_code == 200  # health stays open
    assert CLIENT.get("/sunpath/summer", params=BLR).status_code == 403
    assert (
        CLIENT.post(
            "/shadow/calculate/radius",
            json={
                "latitude": 1,
                "longitude": 1,
                "radius_meters": 100,
                "timestamp": "2025-06-21T12:00:00",
            },
        ).status_code
        == 403
    )
