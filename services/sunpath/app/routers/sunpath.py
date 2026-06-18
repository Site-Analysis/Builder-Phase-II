"""Sun path API — clean GET endpoints over the pvlib SolarEngine.

Contract: contracts/sunpath.yaml (SunPathResponse / SolarEventsResponse).
`hour` is derived by converting the tz-aware UTC `timestamp` into the site's
IANA zone — never by reparsing the `local_time` abbreviation string.
"""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.core.flags import require_solar_day_flag, require_sunpath_flag
from app.core.logging import get_logger
from app.services.orientation_service import orientation_recommendation
from app.services.solar_engine import SolarEngine
from app.services.sunpath_renderer import SunpathRenderer

logger = get_logger(__name__)

router = APIRouter(
    prefix="/sunpath",
    tags=["sunpath"],
    dependencies=[Depends(require_sunpath_flag)],
)

solar_engine = SolarEngine()
sunpath_renderer = SunpathRenderer()


def _day_curve(lat: float, lon: float, day: dt.date) -> tuple[str, list[dict]]:
    """Hourly sun path for one day, mapped to the contract SolarPoint shape."""
    start = dt.datetime.combine(day, dt.time(0, 0))
    end = dt.datetime.combine(day, dt.time(23, 0))
    rows = solar_engine.calculate_solar_position(lat, lon, start, end)
    tz = rows[0].timezone if rows else solar_engine.detect_timezone(lat, lon)
    zone = ZoneInfo(tz)
    hourly = [
        {
            # Fix #2: hour from local time — convert the tz-aware UTC timestamp into
            # the site's IANA zone. (Never reparse the `local_time` abbrev string.)
            "hour": r.timestamp.astimezone(zone).hour,
            "azimuth": r.azimuth,
            "elevation": r.elevation,  # apparent (refraction-corrected)
        }
        for r in rows
    ]
    return tz, hourly


def _solstice_year() -> int:
    return dt.date.today().year


def _sunpath_response(lat: float, lon: float, day: dt.date) -> dict:
    tz, hourly = _day_curve(lat, lon, day)
    return {"latitude": lat, "longitude": lon, "timezone": tz, "hourly_data": hourly}


@router.get("/summer", summary="Summer solstice sun path")
async def summer(lat: float = Query(...), lon: float = Query(...)) -> dict:
    return _sunpath_response(lat, lon, dt.date(_solstice_year(), 6, 21))


@router.get("/winter", summary="Winter solstice sun path")
async def winter(lat: float = Query(...), lon: float = Query(...)) -> dict:
    return _sunpath_response(lat, lon, dt.date(_solstice_year(), 12, 21))


@router.get("/annual", summary="Annual sun path — equinox + both solstices")
async def annual(lat: float = Query(...), lon: float = Query(...)) -> dict:
    year = _solstice_year()
    tz: str | None = None
    combined: list[dict] = []
    for day in (dt.date(year, 6, 21), dt.date(year, 3, 20), dt.date(year, 12, 21)):
        tz, hourly = _day_curve(lat, lon, day)
        combined.extend(hourly)
    return {"latitude": lat, "longitude": lon, "timezone": tz, "hourly_data": combined}


@router.get(
    "/solar-day",
    summary="Accurate hourly sun path + events for a specific date (3D study)",
    dependencies=[Depends(require_solar_day_flag)],
)
async def solar_day(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    date: str = Query(..., description="ISO date (YYYY-MM-DD) to compute the sun path for"),
) -> dict:
    """Per-date hourly azimuth/elevation + sunrise/solar-noon/sunset via pvlib SPA.

    Drives the 3D sun-path study: the sun light, sun marker, shadow direction and
    day arc are all computed for the exact selected date and site — not
    interpolated from fixed reference days.
    """
    try:
        day = dt.date.fromisoformat(date)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="date must be ISO YYYY-MM-DD") from exc

    start = dt.datetime.combine(day, dt.time(0, 0))
    end = dt.datetime.combine(day, dt.time(23, 0))
    rows = solar_engine.calculate_solar_position(lat, lon, start, end)
    if not rows:
        raise HTTPException(status_code=502, detail="solar engine returned no data")

    tz = rows[0].timezone
    zone = ZoneInfo(tz)
    hourly = [
        {
            "hour": r.timestamp.astimezone(zone).hour,
            "azimuth": r.azimuth,
            "elevation": r.elevation,  # apparent (refraction-corrected)
        }
        for r in rows
    ]
    first = rows[0]
    return {
        "latitude": lat,
        "longitude": lon,
        "date": day.isoformat(),
        "timezone": tz,
        "hourly_data": hourly,
        "events": {
            "sunrise": first.sunrise,
            "solar_noon": first.solar_noon,
            "sunset": first.sunset,
        },
        "day_length_hours": first.day_length,
    }


@router.get("/events", summary="Solar events — sunrise, sunset, solar noon")
async def events(lat: float = Query(...), lon: float = Query(...)) -> dict:
    today = dt.date.today()
    rows = solar_engine.calculate_solar_position(
        lat, lon, dt.datetime.combine(today, dt.time(12, 0))
    )
    row = rows[0]
    # Engine already formats these as "HH:MM:SS" strings (or None).
    return {
        "latitude": lat,
        "longitude": lon,
        "events": {
            "sunrise": row.sunrise,
            "solar_noon": row.solar_noon,
            "sunset": row.sunset,
        },
    }


@router.get("/orientation", summary="Building orientation & shading recommendation")
async def orientation(lat: float = Query(...), lon: float = Query(...)) -> dict:
    return orientation_recommendation(lat, lon)


@router.get("/diagram.svg", summary="Polar sun path diagram (SVG)")
async def diagram_svg(
    lat: float = Query(...),
    lon: float = Query(...),
    date: str | None = Query(None, description="ISO date for highlighted day path"),
) -> Response:
    year = _solstice_year()
    tz = solar_engine.detect_timezone(lat, lon)
    custom = pd.Timestamp(date) if date else pd.Timestamp(dt.date.today())
    try:
        svg = sunpath_renderer.render_svg(
            latitude=lat, longitude=lon, year=year, timezone_str=tz, custom_datetime=custom
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("SVG render failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"diagram render failed: {exc}") from exc
    return Response(content=svg, media_type="image/svg+xml")
