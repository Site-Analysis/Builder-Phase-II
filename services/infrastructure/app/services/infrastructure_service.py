from __future__ import annotations

import math
import os
from typing import Any

import httpx
from fastapi import HTTPException

from app.models.infrastructure import (
    InfraResult, InfraSubScores, RoadAccess, TransitStop, UtilityPresence,
)

OVERPASS_URL = os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter")

# Paved road surfaces get a score bonus; unpaved get a penalty.
_PAVED_SURFACES = {"paved", "asphalt", "concrete", "tarmac", "tar", "bituminous"}
_UNPAVED_SURFACES = {"unpaved", "dirt", "gravel", "ground", "grass", "sand", "mud", "track"}


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    p = math.pi / 180
    a = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def _center(el: dict[str, Any]) -> tuple[float, float] | None:
    c = el.get("center") or el
    lat = c.get("lat")
    lon = c.get("lon")
    if lat is None or lon is None:
        return None
    return float(lat), float(lon)


def _parse_float(val: str | None) -> float | None:
    if not val:
        return None
    try:
        return float(val.split()[0])
    except (ValueError, AttributeError):
        return None


def _parse_int(val: str | None) -> int | None:
    if not val:
        return None
    try:
        return int(val.split()[0])
    except (ValueError, AttributeError):
        return None


def _transit_score(metro_dists: list[float], other_dists: list[float]) -> float:
    """
    Linear decay transit scoring — avoids the cliff at exact threshold distances.

    Metro (higher capacity): 30 → 0 over 0–5 km
    Other transit (bus/rail): 15 → 0 over 0–3 km
    Returns the best single contribution (not additive — transit is one network).
    """
    best = 0.0

    if metro_dists:
        d = min(metro_dists)
        if d <= 5000:
            # Full 30 at 0m, decays linearly to 0 at 5000m
            metro_contribution = max(0.0, 30.0 * (1.0 - d / 5000.0))
            best = max(best, metro_contribution)

    if other_dists:
        d = min(other_dists)
        if d <= 3000:
            other_contribution = max(0.0, 15.0 * (1.0 - d / 3000.0))
            best = max(best, other_contribution)

    return round(best, 1)


def _road_score(nearest_road_m: float, road_type: str | None, surface: str | None) -> float:
    """
    Road proximity + type + surface quality → 0-50.

    Proximity (0-40):
      <5m: 40, <20m: 35, <100m: 25, <500m: 15, else: 5
    Road type bonus (up to +5):
      motorway/trunk/primary: +5
    Surface quality (±5):
      paved/asphalt/concrete: +5
      unpaved/dirt/gravel: -5
    """
    # Proximity
    if nearest_road_m < 5:
        score = 40.0
    elif nearest_road_m < 20:
        score = 35.0
    elif nearest_road_m < 100:
        score = 25.0
    elif nearest_road_m < 500:
        score = 15.0
    else:
        score = 5.0

    # Road type bonus
    if road_type in ("motorway", "trunk", "primary"):
        score += 5.0

    # Surface quality
    surf = (surface or "").lower()
    if surf in _PAVED_SURFACES:
        score += 5.0
    elif surf in _UNPAVED_SURFACES:
        score -= 5.0

    return min(50.0, max(0.0, score))


class InfrastructureService:
    async def analyze(self, lat: float, lon: float, radius_m: float = 2000) -> InfraResult:
        # Aerodromes excluded from transit — airport proximity is in Planning service.
        road_query = f"""
[out:json][timeout:20];
(
  way[highway~"^(motorway|trunk|primary|secondary|tertiary|residential|service)$"](around:{radius_m},{lat},{lon});
);
out center tags 25;
"""
        transit_query = f"""
[out:json][timeout:20];
(
  node[railway~"^(station|subway_entrance|halt)$"](around:5000,{lat},{lon});
  node[public_transport=stop_position][network](around:2000,{lat},{lon});
  node[highway=bus_stop](around:1000,{lat},{lon});
);
out center tags 30;
"""
        utility_query = f"""
[out:json][timeout:20];
(
  node[amenity=water_works](around:3000,{lat},{lon});
  node[man_made=water_tower](around:3000,{lat},{lon});
  node[power=substation](around:2000,{lat},{lon});
  node[man_made~"^(wastewater_plant|sewage_works)$"](around:3000,{lat},{lon});
  way[waterway~"^(drain|ditch)$"](around:1000,{lat},{lon});
);
out center tags 20;
"""
        power_query = f"""
[out:json][timeout:15];
(
  way[power=line](around:1000,{lat},{lon});
  way[power=cable](around:500,{lat},{lon});
);
out center tags 10;
"""
        telecom_query = f"""
[out:json][timeout:15];
(
  node[man_made=mast](around:2000,{lat},{lon});
  node[man_made=communications_tower](around:2000,{lat},{lon});
  node[man_made=tower][tower:type=communication](around:2000,{lat},{lon});
);
out center tags 15;
"""
        try:
            async with httpx.AsyncClient(timeout=35) as c:
                r_road    = (await c.post(OVERPASS_URL, data={"data": road_query})).json()
                r_transit = (await c.post(OVERPASS_URL, data={"data": transit_query})).json()
                r_util    = (await c.post(OVERPASS_URL, data={"data": utility_query})).json()
                r_power   = (await c.post(OVERPASS_URL, data={"data": power_query})).json()
                r_telecom = (await c.post(OVERPASS_URL, data={"data": telecom_query})).json()
        except Exception:
            raise HTTPException(status_code=502, detail="OSM upstream unavailable")

        # ── Road access ────────────────────────────────────────────────────
        road_elements = r_road.get("elements", [])
        road_access: RoadAccess | None = None
        if road_elements:
            best = min(
                (el for el in road_elements if _center(el) is not None),
                key=lambda el: _haversine(lat, lon, *_center(el)),  # type: ignore[arg-type]
                default=None,
            )
            if best:
                c_pos = _center(best)
                dist = _haversine(lat, lon, c_pos[0], c_pos[1]) if c_pos else 9999.0
                tags = best.get("tags", {})
                raw_lanes = _parse_int(tags.get("lanes"))
                raw_width = _parse_float(tags.get("width"))
                raw_speed = _parse_int(tags.get("maxspeed"))
                road_access = RoadAccess(
                    nearest_road_m=round(dist, 1),
                    road_type=tags.get("highway"),
                    road_name=tags.get("name"),
                    road_ref=tags.get("ref"),
                    road_surface=tags.get("surface"),
                    road_lanes=raw_lanes,
                    road_width_m=raw_width,
                    road_maxspeed_kmh=raw_speed,
                    frontage_present=dist < 15,
                )

        # ── Transit ────────────────────────────────────────────────────────
        transit_elements = r_transit.get("elements", [])
        transit_stops: list[TransitStop] = []
        for el in transit_elements:
            c_pos = _center(el)
            if c_pos is None:
                continue
            tags = el.get("tags", {})
            dist = _haversine(lat, lon, c_pos[0], c_pos[1])
            railway = tags.get("railway", "")
            subway  = tags.get("subway", "")
            pt      = tags.get("public_transport", "")
            hw      = tags.get("highway", "")
            station = tags.get("station", "")
            if (railway in ("subway_entrance", "station") and subway == "yes") or station == "subway":
                ttype: str = "metro"
            elif railway in ("station", "halt"):
                ttype = "railway"
            elif hw == "bus_stop" or pt == "stop_position":
                ttype = "bus"
            else:
                ttype = "bus"
            transit_stops.append(TransitStop(
                type=ttype,  # type: ignore[arg-type]
                name=tags.get("name"),
                distance_m=round(dist, 1),
                line=tags.get("line") or tags.get("network") or tags.get("ref"),
            ))
        transit_stops.sort(key=lambda t: t.distance_m)

        # ── Utilities ──────────────────────────────────────────────────────
        util_elements = r_util.get("elements", [])
        util_tags_set: set[tuple[str, str]] = set()
        for el in util_elements:
            for k, v in el.get("tags", {}).items():
                util_tags_set.add((k, v))

        # ── Power lines ────────────────────────────────────────────────────
        power_elements = r_power.get("elements", [])
        power_line_nearby = False
        power_line_voltage_kv: float | None = None
        power_line_dist: float | None = None

        for el in power_elements:
            c_pos = _center(el)
            if c_pos is None:
                continue
            dist = _haversine(lat, lon, c_pos[0], c_pos[1])
            power_line_nearby = True
            if power_line_dist is None or dist < power_line_dist:
                power_line_dist = round(dist, 1)
                voltage_str = el.get("tags", {}).get("voltage")
                if voltage_str:
                    try:
                        # Voltage tag: "11000" or "11000;33000" (multi-voltage) or "11000-33000"
                        raw = voltage_str.split(";")[0].split("-")[0].strip()
                        v_kv = float(raw) / 1000
                        if power_line_voltage_kv is None or v_kv > power_line_voltage_kv:
                            power_line_voltage_kv = round(v_kv, 1)
                    except (ValueError, AttributeError):
                        pass

        # ── Telecom towers ─────────────────────────────────────────────────
        telecom_elements = r_telecom.get("elements", [])
        telecom_nearby = False
        telecom_dist: float | None = None

        for el in telecom_elements:
            c_pos = _center(el)
            if c_pos is None:
                continue
            dist = _haversine(lat, lon, c_pos[0], c_pos[1])
            telecom_nearby = True
            if telecom_dist is None or dist < telecom_dist:
                telecom_dist = round(dist, 1)

        utilities = UtilityPresence(
            water_supply_nearby=any(
                t in util_tags_set for t in [("amenity", "water_works"), ("man_made", "water_tower")]
            ),
            power_substation_nearby=("power", "substation") in util_tags_set,
            power_line_nearby=power_line_nearby,
            power_line_voltage_kv=power_line_voltage_kv,
            power_line_distance_m=power_line_dist,
            storm_drainage_nearby=any(
                t in util_tags_set for t in [("waterway", "drain"), ("waterway", "ditch")]
            ),
            sewage_works_nearby=any(
                t in util_tags_set for t in [("man_made", "wastewater_plant"), ("man_made", "sewage_works")]
            ),
            telecom_tower_nearby=telecom_nearby,
            telecom_tower_distance_m=telecom_dist,
        )

        # ── Sub-scores ─────────────────────────────────────────────────────
        nearest_road_m = road_access.nearest_road_m if road_access else 9999.0
        road_type      = road_access.road_type      if road_access else None
        road_surface   = road_access.road_surface   if road_access else None

        # Road: 0-50 (proximity 0-40, type bonus 0-5, surface quality ±5)
        computed_road_score = _road_score(nearest_road_m, road_type, road_surface)

        # Transit: 0-30 (linear decay; metro weighted higher)
        metro_dists = [t.distance_m for t in transit_stops if t.type == "metro"]
        other_dists = [t.distance_m for t in transit_stops if t.type in ("bus", "railway")]
        computed_transit_score = _transit_score(metro_dists, other_dists)

        # Power: 0-20 (substation + line presence; better-mapped than water/telecom in India)
        power_score = 0.0
        if utilities.power_substation_nearby:
            power_score += 10.0
        if utilities.power_line_nearby:
            # Distance decay for power line
            pl_dist = utilities.power_line_distance_m or 1000
            power_score += max(0.0, 10.0 * (1.0 - pl_dist / 1000.0))
        power_score = min(20.0, round(power_score, 1))

        # Water/telecom: detected and reported but NOT scored —
        # OSM utility coverage in Indian cities is <20% and silence ≠ absence.
        water_score = 0.0
        telecom_score = 0.0

        sub_scores = InfraSubScores(
            road=computed_road_score,
            transit=computed_transit_score,
            power=power_score,
            water=water_score,
            telecom=telecom_score,
        )
        score = min(100.0, computed_road_score + computed_transit_score + power_score)
        severity = "low" if score >= 65 else "moderate" if score >= 40 else "high"

        return InfraResult(
            road_access=road_access,
            transit=transit_stops[:10],
            utilities=utilities,
            sub_scores=sub_scores,
            score=round(score, 1),
            severity=severity,  # type: ignore[arg-type]
            data_source="OpenStreetMap (Overpass API) — roads, transit, power",
        )
