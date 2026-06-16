from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException

from app.models.geo import WaterBody, WaterConstraintResult

OVERPASS_URL = os.getenv("OVERPASS_URL", "https://overpass.openstreetmap.fr/api/interpreter")

# Authoritative primary rajakaluve (storm-water-drain) network, bundled GeoJSON
# (BBMP SWD 2022 / KSRSAC via OpenCity, Public Domain). Far better coverage than
# OSM, which barely maps rajakaluves. Lazily loaded + bbox-indexed once.
_RAJAKALUVE_PATH = Path(__file__).parent.parent / "data" / "rajakaluve_primary.geojson"
_RAJAKALUVE: list[tuple[tuple[float, float, float, float], list[list[float]]]] | None = None


def _load_rajakaluve() -> list[tuple[tuple[float, float, float, float], list[list[float]]]]:
    global _RAJAKALUVE
    if _RAJAKALUVE is not None:
        return _RAJAKALUVE
    feats: list[tuple[tuple[float, float, float, float], list[list[float]]]] = []
    try:
        fc = json.loads(_RAJAKALUVE_PATH.read_text())
        for f in fc.get("features", []):
            coords = f.get("geometry", {}).get("coordinates", [])
            if len(coords) < 2:
                continue
            lons = [c[0] for c in coords]
            lats = [c[1] for c in coords]
            feats.append(((min(lons), min(lats), max(lons), max(lats)), coords))
    except Exception:
        feats = []
    _RAJAKALUVE = feats
    return _RAJAKALUVE


def _seg_dist_m(plat: float, plon: float, alat: float, alon: float, blat: float, blon: float) -> float:
    """Point→segment distance in metres via local equirectangular projection."""
    kx = 111_320 * math.cos(math.radians(plat))
    ky = 110_540
    ax, ay = (alon - plon) * kx, (alat - plat) * ky
    bx, by = (blon - plon) * kx, (blat - plat) * ky
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(ax, ay)
    t = max(0.0, min(1.0, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
    return math.hypot(ax + t * dx, ay + t * dy)


def _nearest_rajakaluve(lat: float, lon: float) -> float | None:
    """Precise distance (m) to the nearest primary rajakaluve, or None if no data near."""
    feats = _load_rajakaluve()
    if not feats:
        return None
    pad = 0.03  # ~3 km bbox prefilter
    best: float | None = None
    for (minlon, minlat, maxlon, maxlat), coords in feats:
        if lon < minlon - pad or lon > maxlon + pad or lat < minlat - pad or lat > maxlat + pad:
            continue
        for i in range(len(coords) - 1):
            alon, alat = coords[i]
            blon, blat = coords[i + 1]
            d = _seg_dist_m(lat, lon, alat, alon, blat, blon)
            if best is None or d < best:
                best = d
    return best

WATER_BUFFER_RULES: dict[str, dict[str, Any]] = {
    # River: 100m per NGT Order (OA 593/2017) + Karnataka State Water Policy 2002
    "river":    {"buffer_m": 100, "source": "NGT Order OA 593/2017 + Karnataka State Water Policy 2002"},
    # Lakes/tanks: 75m from Full Tank Level per BBMP Lake Conservation Rules 2020
    "lake":     {"buffer_m": 75,  "source": "BBMP Lake Conservation Rules 2020"},
    "tank":     {"buffer_m": 75,  "source": "BBMP Lake Conservation Rules 2020"},
    "reservoir":{"buffer_m": 75,  "source": "BBMP Lake Conservation Rules 2020"},
    # Rajakaluve (storm drain): Karnataka HC WP 817/2008 — 50m primary, 25m secondary.
    # Using 50m as conservative default; field verification required.
    "drain":    {"buffer_m": 50,  "source": "Karnataka HC Order WP 817/2008 (Rajakaluve — 50m primary)"},
    "stream":   {"buffer_m": 30,  "source": "Karnataka Riparian Buffer (State Policy 2002)"},
    # Wetland: 100m per Wetland (Conservation & Management) Rules 2017
    "wetland":  {"buffer_m": 100, "source": "Wetland (Conservation & Management) Rules 2017"},
}


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _classify_water(tags: dict[str, str]) -> str:
    name = tags.get("name", "").lower()
    if tags.get("waterway") == "drain" or "kaluve" in name:
        return "drain"
    if tags.get("water") == "lake" or tags.get("natural") == "water":
        return "lake"
    if tags.get("water") == "reservoir":
        return "reservoir"
    if tags.get("water") == "tank":
        return "tank"
    if tags.get("waterway") == "river":
        return "river"
    if tags.get("waterway") == "stream":
        return "stream"
    return "water_body"


class WaterService:
    async def get_water_constraints(
        self, lat: float, lon: float, radius_m: float, client: httpx.AsyncClient
    ) -> WaterConstraintResult:
        query = f"""
[out:json][timeout:20];
(
  way[natural=water](around:{radius_m},{lat},{lon});
  node[natural=water](around:{radius_m},{lat},{lon});
  way[waterway~"^(river|stream|canal|drain|ditch)$"](around:{radius_m},{lat},{lon});
  node[waterway~"^(river|stream|canal|drain|ditch)$"](around:{radius_m},{lat},{lon});
  way[landuse=basin](around:{radius_m},{lat},{lon});
  node[water~"^(lake|pond|reservoir|tank)$"](around:{radius_m},{lat},{lon});
);
out center;
"""
        try:
            r = await client.post(OVERPASS_URL, data={"data": query}, timeout=25)
            r.raise_for_status()
            data = r.json()
        except Exception:
            raise HTTPException(status_code=502, detail="OSM upstream unavailable")

        elements = data.get("elements", [])
        water_bodies: list[WaterBody] = []

        for el in elements:
            tags = el.get("tags", {})
            center = el.get("center") or el
            el_lat = center.get("lat")
            el_lon = center.get("lon")
            if el_lat is None or el_lon is None:
                continue

            dist = _haversine(lat, lon, el_lat, el_lon)
            wtype = _classify_water(tags)
            rule = WATER_BUFFER_RULES.get(wtype, {"buffer_m": 30, "source": "General buffer rule"})
            buffer_m = rule["buffer_m"]

            water_bodies.append(WaterBody(
                type=wtype,
                name=tags.get("name"),
                distance_m=round(dist, 1),
                buffer_zone_m=buffer_m,
                buffer_source=rule["source"],
                site_within_buffer=dist < buffer_m,
            ))

        # Authoritative primary rajakaluve (precise point-to-line) — supersedes the
        # sparse OSM drains for the 50m HC buffer. Only fires inside Bengaluru.
        raja_dist = _nearest_rajakaluve(lat, lon)
        if raja_dist is not None:
            water_bodies.append(WaterBody(
                type="rajakaluve",
                name="Primary storm-water drain",
                distance_m=round(raja_dist, 1),
                buffer_zone_m=50,
                buffer_source="Karnataka HC WP 817/2008 (50m primary) · BBMP SWD 2022 / KSRSAC via OpenCity",
                site_within_buffer=raja_dist < 50,
            ))

        water_bodies.sort(key=lambda w: w.distance_m)
        construction_restricted = any(w.site_within_buffer for w in water_bodies)
        nearest = water_bodies[0].distance_m if water_bodies else None

        restriction_reason: str | None = None
        if construction_restricted:
            first = next(w for w in water_bodies if w.site_within_buffer)
            restriction_reason = f"Site within {first.buffer_zone_m}m buffer of {first.type} — {first.buffer_source}"

        if not water_bodies:
            score, severity = 90, "low"
        elif not construction_restricted:
            score, severity = 70, "low"
        else:
            min_buf = min(w.buffer_zone_m for w in water_bodies if w.site_within_buffer)
            if min_buf <= 30:
                score, severity = 25, "high"
            elif min_buf <= 75:
                score, severity = 40, "high"
            else:
                score, severity = 35, "high"

        return WaterConstraintResult(
            water_bodies=water_bodies,
            nearest_distance_m=nearest,
            construction_restricted=construction_restricted,
            restriction_reason=restriction_reason,
            score=score,
            severity=severity,  # type: ignore[arg-type]
            data_source="OpenStreetMap (Overpass API) + BBMP primary SWD 2022 (KSRSAC via OpenCity)"
            if _load_rajakaluve() else "OpenStreetMap (Overpass API)",
        )
