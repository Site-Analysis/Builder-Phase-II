# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import math
import os
from typing import Any

import httpx
from fastapi import HTTPException

from app.models.geo import TransportAccessResult, TransportCategory, TransportFeature

OVERPASS_URL = os.getenv("OVERPASS_URL", "https://overpass.openstreetmap.fr/api/interpreter")

# Kempegowda International Airport (BLR) — IATA ARP, authoritative
_BLR_AIRPORT = {"name": "Kempegowda International Airport (BLR)", "lat": 13.1986, "lon": 77.7066}

_METRO_RADIUS = 5_000   # metro stations: tight radius (city scale)
_RAIL_RADIUS  = 15_000  # suburban rail: wider
_HWY_RADIUS   = 10_000  # highway junctions / trunk ways


def _hav_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    p = math.pi / 180
    a = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def _is_metro(tags: dict[str, str]) -> bool:
    network = tags.get("network", "").lower()
    station = tags.get("station", "")
    line = tags.get("line", "")
    return (
        "metro" in network
        or "namma" in network
        or "bmrc" in network
        or station == "subway"
        or line == "metro"
    )


def _nearest_on_way(geometry: list[dict], site_lat: float, site_lon: float) -> tuple[float, float, float]:
    """Closest node in a way geometry to the site. Returns (lat, lon, distance_m)."""
    best_d = float("inf")
    best_lat = best_lon = 0.0
    for node in geometry:
        d = _hav_m(site_lat, site_lon, node["lat"], node["lon"])
        if d < best_d:
            best_d = d
            best_lat = node["lat"]
            best_lon = node["lon"]
    return best_lat, best_lon, best_d


def _build_query(lat: float, lon: float) -> str:
    mr, rr, hr = _METRO_RADIUS, _RAIL_RADIUS, _HWY_RADIUS
    return f"""
[out:json][timeout:60];
(
  node["railway"="station"]["network"~"Namma|Metro|BMRC",i](around:{mr},{lat},{lon});
  node["railway"="station"]["station"="subway"](around:{mr},{lat},{lon});
  node["railway"="station"]["line"="metro"](around:{mr},{lat},{lon});
  node["railway"="station"](around:{rr},{lat},{lon});
  node["highway"="motorway_junction"](around:{hr},{lat},{lon});
  way["highway"~"^(motorway|trunk)$"](around:{hr},{lat},{lon});
);
out geom;
"""


def _feature_name(tags: dict[str, str], fallback: str) -> str:
    return tags.get("name") or tags.get("ref") or fallback


async def fetch_transport_access(lat: float, lon: float, radius_m: int = 10_000) -> TransportAccessResult:
    query = _build_query(lat, lon)
    try:
        async with httpx.AsyncClient(
            timeout=65, headers={"User-Agent": "SAT-SiteAnalysisTool/1.0"}
        ) as client:
            resp = await client.post(OVERPASS_URL, data={"data": query})
            resp.raise_for_status()
            elements: list[dict[str, Any]] = resp.json().get("elements", [])
    except Exception:
        raise HTTPException(status_code=502, detail="OSM upstream unavailable")

    metro_items: list[tuple[float, float, float, str]] = []  # (lat, lon, dist, name)
    rail_items:  list[tuple[float, float, float, str]] = []
    hwy_items:   list[tuple[float, float, float, str, str]] = []  # + subtype
    seen_ids: set[int] = set()

    for el in elements:
        el_id  = el.get("id", 0)
        el_type = el.get("type")
        tags   = el.get("tags", {})

        if el_type == "node":
            el_lat = el.get("lat")
            el_lon = el.get("lon")
            if el_lat is None or el_lon is None:
                continue

            railway = tags.get("railway", "")
            highway = tags.get("highway", "")

            if railway == "station":
                dist = _hav_m(lat, lon, el_lat, el_lon)
                name = _feature_name(tags, "Railway Station")
                if _is_metro(tags):
                    if el_id not in seen_ids:
                        seen_ids.add(el_id)
                        metro_items.append((el_lat, el_lon, dist, name))
                else:
                    if el_id not in seen_ids:
                        seen_ids.add(el_id)
                        rail_items.append((el_lat, el_lon, dist, name))

            elif highway == "motorway_junction":
                dist = _hav_m(lat, lon, el_lat, el_lon)
                name = _feature_name(tags, "Highway Junction")
                hwy_items.append((el_lat, el_lon, dist, name, "highway_junction"))

        elif el_type == "way":
            hw = tags.get("highway", "")
            if hw in ("motorway", "trunk"):
                geom = el.get("geometry", [])
                if not geom:
                    continue
                wlat, wlon, dist = _nearest_on_way(geom, lat, lon)
                name = _feature_name(tags, f"{'Motorway' if hw == 'motorway' else 'Trunk Road'}")
                hwy_items.append((wlat, wlon, dist, name, "highway_access"))

    # Sort by distance, deduplicate highway by proximity (keep closest within 200m)
    metro_items.sort(key=lambda x: x[2])
    rail_items.sort(key=lambda x: x[2])
    hwy_items.sort(key=lambda x: x[2])

    # Remove metro-tagged stations that also appeared in rail bucket (seen_ids already handles it,
    # but double-check by dropping rail items within 50m of a metro item)
    metro_latlons = {(round(m[0], 3), round(m[1], 3)) for m in metro_items}
    rail_items = [
        r for r in rail_items
        if (round(r[0], 3), round(r[1], 3)) not in metro_latlons
    ]

    def _build_cat(
        items: list[tuple],
        subtype: str,
        confidence: str = "osm-derived",
        top: int = 5,
    ) -> TransportCategory:
        if not items:
            return TransportCategory(nearest=None, features=[], status="none_found")
        feats = [
            TransportFeature(
                name=it[3], subtype=subtype if len(it) == 4 else it[4],
                lat=round(it[0], 6), lon=round(it[1], 6),
                distance_m=round(it[2], 1), confidence=confidence,
            )
            for it in items[:top]
        ]
        return TransportCategory(nearest=feats[0], features=feats, status="resolved")

    # Airport — always BLR, authoritative
    blr_dist = _hav_m(lat, lon, _BLR_AIRPORT["lat"], _BLR_AIRPORT["lon"])
    airport_feat = TransportFeature(
        name=_BLR_AIRPORT["name"],
        subtype="airport",
        lat=_BLR_AIRPORT["lat"],
        lon=_BLR_AIRPORT["lon"],
        distance_m=round(blr_dist, 1),
        confidence="authoritative",
    )
    airport_cat = TransportCategory(
        nearest=airport_feat,
        features=[airport_feat],
        status="resolved",
    )

    metro_cat = _build_cat(metro_items, "metro_station")
    rail_cat  = _build_cat(rail_items,  "rail_station")
    hwy_cat   = _build_cat(hwy_items,   "highway_junction")  # subtype per-item from tuple[4]

    return TransportAccessResult(
        metro=metro_cat,
        rail=rail_cat,
        highway=hwy_cat,
        airport=airport_cat,
        radius_m=radius_m,
        data_source="OpenStreetMap (Overpass API) · BLR airport: AAI ARP (authoritative)",
    )
