# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import math
import os
from typing import Any

import httpx

from app.models.planning import AirportRestriction, PlanningRequest, PlanningResult

OVERPASS_URL = os.getenv("OVERPASS_URL", "https://overpass.openstreetmap.fr/api/interpreter")

# NBC 2016 Table 15 + BDA CDP 2031: zone → road_width_bracket → FAR
NBC_FAR: dict[str, dict[tuple[float, float], float]] = {
    "Residential": {
        (0, 7.5): 1.00,
        (7.5, 12): 1.50,
        (12, 18): 2.00,
        (18, 24): 2.50,
        (24, float("inf")): 3.00,
    },
    "Commercial": {
        (0, 7.5): 1.50,
        (7.5, 12): 2.00,
        (12, 18): 2.50,
        (18, 24): 3.00,
        (24, float("inf")): 3.50,
    },
    "Industrial": {(0, float("inf")): 1.50},
    "Mixed Use": {(0, 7.5): 1.50, (7.5, 12): 2.00, (12, 18): 2.50, (18, float("inf")): 3.00},
    "Institutional": {(0, float("inf")): 1.50},
}

NBC_GROUND_COVERAGE: dict[str, float] = {
    "Residential": 0.55,
    "Commercial": 0.60,
    "Industrial": 0.65,
    "Mixed Use": 0.55,
    "Institutional": 0.45,
}

NBC_MAX_HEIGHT: dict[str, float] = {
    "Residential": 45.0,
    "Commercial": 70.0,
    "Industrial": 45.0,
    "Mixed Use": 70.0,
    "Institutional": 45.0,
}

# BDA TOD Notification 2020 — FAR 4.0 within 500m of metro station (R/MU zones)
TOD_FAR = 4.0
TOD_RADIUS_M = 500.0
TOD_ELIGIBLE_ZONES = {"Residential", "Mixed Use"}

AAI_AIRPORTS: list[dict[str, Any]] = [
    {"name": "Kempegowda International", "iata": "BLR", "lat": 13.1979, "lon": 77.7063},
    {"name": "HAL Airport Bengaluru", "iata": "BLR-HAL", "lat": 12.9500, "lon": 77.6632},
    {"name": "Mysuru Airport", "iata": "MYQ", "lat": 12.2333, "lon": 76.6500},
    {"name": "Mangaluru International", "iata": "IXE", "lat": 12.9613, "lon": 74.8900},
    {"name": "Hubballi Airport", "iata": "HBX", "lat": 15.3617, "lon": 75.0849},
    {"name": "Belagavi Airport", "iata": "IXG", "lat": 15.8593, "lon": 74.6183},
    {"name": "Kalaburagi Airport", "iata": "GBI", "lat": 17.5288, "lon": 76.9016},
    {"name": "Shivamogga Airport", "iata": "IXX", "lat": 13.9783, "lon": 75.0369},
    {"name": "RGIA Hyderabad", "iata": "HYD", "lat": 17.2403, "lon": 78.4294},
    {"name": "CSIA Mumbai", "iata": "BOM", "lat": 19.0896, "lon": 72.8656},
    {"name": "Juhu Aerodrome", "iata": "JUB", "lat": 19.0967, "lon": 72.8331},
    {"name": "CIAL Kochi", "iata": "COK", "lat": 10.1520, "lon": 76.4019},
    {"name": "Chennai International", "iata": "MAA", "lat": 12.9900, "lon": 80.1693},
    {"name": "Indira Gandhi International", "iata": "DEL", "lat": 28.5562, "lon": 77.1000},
    {"name": "Netaji Subhas Bose Intl", "iata": "CCU", "lat": 22.6520, "lon": 88.4463},
    {"name": "Pune Airport", "iata": "PNQ", "lat": 18.5822, "lon": 73.9197},
    {"name": "Ahmedabad Airport", "iata": "AMD", "lat": 23.0772, "lon": 72.6347},
    {"name": "Jaipur International", "iata": "JAI", "lat": 26.8242, "lon": 75.8122},
    {"name": "Goa International (Dabolim)", "iata": "GOI", "lat": 15.3808, "lon": 73.8314},
    {"name": "Mopa International (North Goa)", "iata": "GOX", "lat": 15.7120, "lon": 73.9148},
    {"name": "Coimbatore International", "iata": "CJB", "lat": 11.0300, "lon": 77.0434},
    {"name": "Tiruchirapalli International", "iata": "TRZ", "lat": 10.7654, "lon": 78.7097},
]


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    p = math.pi / 180
    a = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def _lookup_far(zone: str, road_width: float) -> float:
    brackets = NBC_FAR.get(zone, {(0, float("inf")): 1.0})
    for (lo, hi), far in brackets.items():
        if lo <= road_width < hi:
            return far
    return 1.0


def _setbacks(plot_area: float, road_width: float) -> tuple[float, float, float]:
    front = 1.5 if road_width < 7.5 else 3.0 if road_width < 18.0 else 4.5
    if plot_area < 100:
        return front, 1.0, 0.0
    if plot_area < 250:
        return front, 1.5, 1.0
    if plot_area < 500:
        return front, 3.0, 1.5
    return front, 4.5, 3.0


def _icao_max_height(dist_m: float) -> tuple[float | None, str, bool]:
    if dist_m < 500:
        return 15.0, "Inner Approach Surface", True
    if dist_m < 4000:
        return 45.0, "Inner Horizontal Surface", True
    if dist_m < 7000:
        return 45.0 + (dist_m - 4000) * 0.05, "Conical Surface", True
    if dist_m < 15000:
        return 155.0, "Outer Horizontal Surface", False
    return None, "No restriction", False


async def _detect_road_width(
    lat: float, lon: float, client: httpx.AsyncClient
) -> tuple[float, str]:
    """
    Query OSM for nearest road within 100m. Extract width from:
    1. tags.width (explicit width in metres)
    2. tags.lanes × 3.5m (estimated from lane count)
    Returns (road_width_m, source_label).
    """
    query = f"""
[out:json][timeout:10];
(
  way[highway~"^(motorway|trunk|primary|secondary|tertiary|residential|service)$"](around:100,{lat},{lon});
);
out tags 5;
"""
    try:
        resp = await client.post(OVERPASS_URL, data={"data": query}, timeout=12)
        resp.raise_for_status()
        elements = resp.json().get("elements", [])
        if not elements:
            return 9.0, "default_9m"
        tags = elements[0].get("tags", {})
        raw_width = tags.get("width")
        if raw_width:
            try:
                return float(raw_width.split()[0]), "osm_detected"
            except (ValueError, AttributeError):
                pass
        lanes = tags.get("lanes")
        if lanes:
            try:
                return float(lanes) * 3.5, "osm_detected"
            except (ValueError, AttributeError):
                pass
    except Exception:
        pass
    return 9.0, "default_9m"


def _clean_metro_name(name: str | None) -> str:
    """Turn an entrance label like 'D: Cubbon Park/RBI Side' into a usable metro
    name when no station node is available."""
    if not name:
        return "Metro Station"
    n = name.split(": ", 1)[1] if ": " in name else name  # drop entrance letter prefix
    if n.endswith(" Side"):
        n = n[:-5]
    return f"Metro entrance — {n.strip()}"


async def _detect_metro(
    lat: float, lon: float, client: httpx.AsyncClient
) -> tuple[str | None, float | None, float | None, float | None]:
    """
    Return (station_name, distance_m, station_lat, station_lon) for the nearest
    metro within TOD_RADIUS_M, or (None, None, None, None).
    Queries both railway=station (subway=yes) and railway=subway_entrance within 600m buffer.
    """
    query = f"""
[out:json][timeout:10];
(
  node[railway=station][subway=yes](around:600,{lat},{lon});
  node[railway=subway_entrance](around:600,{lat},{lon});
  node[station=subway](around:600,{lat},{lon});
);
out 10;
"""
    try:
        resp = await client.post(OVERPASS_URL, data={"data": query}, timeout=12)
        resp.raise_for_status()
        elements = resp.json().get("elements", [])
        best_dist = float("inf")
        best_lat: float | None = None
        best_lon: float | None = None
        station_name: str | None = None  # name from the actual station node, preferred
        station_dist = float("inf")
        nearest_name: str | None = None  # name from the nearest element (may be an entrance)
        for el in elements:
            el_lat = el.get("lat")
            el_lon = el.get("lon")
            if el_lat is None or el_lon is None:
                continue
            tags = el.get("tags", {})
            d = _haversine(lat, lon, float(el_lat), float(el_lon))
            # nearest access point drives the TOD distance + marker
            if d < best_dist:
                best_dist = d
                best_lat = round(float(el_lat), 6)
                best_lon = round(float(el_lon), 6)
                nearest_name = tags.get("name")
            # prefer the station node's name over an entrance label
            if (
                tags.get("railway") == "station" or tags.get("station") == "subway"
            ) and d < station_dist:
                station_dist = d
                station_name = tags.get("name")
        if best_dist <= TOD_RADIUS_M:
            name = station_name or _clean_metro_name(nearest_name)
            return name, round(best_dist, 1), best_lat, best_lon
    except Exception:
        pass
    return None, None, None, None


class PlanningService:
    async def analyze(self, request: PlanningRequest) -> PlanningResult:
        lat, lon = request.latitude, request.longitude

        # User-Agent required — public Overpass mirrors 403/406 the default httpx UA.
        async with httpx.AsyncClient(
            timeout=15, headers={"User-Agent": "SAT-SiteAnalysisTool/1.0"}
        ) as client:
            # Road width auto-detection (runs even if user provides value, for validation)
            if request.road_width_m is not None:
                road_width = request.road_width_m
                road_width_source: str = "user_input"
            else:
                road_width, road_width_source = await _detect_road_width(lat, lon, client)

            # Metro proximity for TOD FAR check
            metro_name, metro_dist, metro_lat, metro_lon = await _detect_metro(lat, lon, client)

        zone = request.zone_class

        # BDA TOD Notification 2020: FAR 4.0 within 500m of metro for R/MU zones
        tod_applicable = (metro_name is not None) and (zone in TOD_ELIGIBLE_ZONES)
        if tod_applicable:
            far = TOD_FAR
            far_source = f"BDA TOD Notification 2020 — FAR 4.0 ({metro_name}, {metro_dist:.0f}m)"
        else:
            far = _lookup_far(zone, road_width)
            far_source = f"NBC 2016 Table 15 ({zone}, road {road_width:.1f}m)"

        gc = NBC_GROUND_COVERAGE.get(zone, 0.55)
        front, rear, side = _setbacks(request.plot_area_sqm, road_width)
        max_h = NBC_MAX_HEIGHT.get(zone, 45.0)
        height_factor = "NBC 2016 zone height limit"

        nearest: dict[str, Any] = min(
            AAI_AIRPORTS,
            key=lambda a: _haversine(lat, lon, a["lat"], a["lon"]),
        )
        nearest_dist_m = _haversine(lat, lon, nearest["lat"], nearest["lon"])
        icao_h, surface, noc_req = _icao_max_height(nearest_dist_m)

        if icao_h is not None and icao_h < max_h:
            max_h = icao_h
            height_factor = f"ICAO Annex 14 {surface} — {nearest['name']}"

        buildable = request.plot_area_sqm * far

        base = 70
        if far >= 2.0:
            base += 10
        if tod_applicable:
            base += 10  # TOD bonus — better development potential
        if noc_req:
            base -= 20
        elif icao_h is not None and icao_h < 30:
            base -= 15
        score = max(10, min(95, base))
        severity = "low" if score >= 70 else "moderate" if score >= 50 else "high"

        return PlanningResult(
            far_applicable=far,
            far_source=far_source,
            ground_coverage_max=gc,
            setback_front_m=round(front, 2),
            setback_rear_m=round(rear, 2),
            setback_side_m=round(side, 2),
            max_height_m=round(max_h, 1),
            height_limiting_factor=height_factor,
            buildable_area_sqm=round(buildable, 1),
            road_width_used_m=road_width,
            road_width_source=road_width_source,  # type: ignore[arg-type]
            tod_applicable=tod_applicable,
            metro_station_name=metro_name,
            metro_distance_m=metro_dist,
            metro_lat=metro_lat,
            metro_lon=metro_lon,
            # HEIGHT-CAP ONLY — nearest_dist_m is used internally for the ICAO surface/height cap;
            # the airport DISTANCE reporting moved to infrastructure /connectivity (US-086).
            airport_restriction=AirportRestriction(
                nearest_airport=nearest["name"],
                iata_code=nearest["iata"],
                max_height_m=round(icao_h, 1) if icao_h is not None else None,
                restriction_surface=surface,
                dgca_noc_required=noc_req,
            ),
            score=score,
            severity=severity,  # type: ignore[arg-type]
            data_source="NBC 2016 + BDA CDP 2031 + BDA TOD 2020 + ICAO Annex 14 + AAI airports + OSM road width",
        )
