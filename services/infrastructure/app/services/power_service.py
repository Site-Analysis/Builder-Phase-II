# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import math
import os

import httpx

from app.models.infrastructure import PowerGridResult, PowerLine, PowerSubstation

OVERPASS_URL = os.getenv("OVERPASS_URL", "https://overpass.openstreetmap.fr/api/interpreter")

_DATA_SOURCE = (
    "OSM Overpass (power=line, power=substation) · "
    "KPTCL Grid Map 2018 (web.archive.org/web/20220802124435/"
    "kptcl.karnataka.gov.in/storage/pdf-files/epra/1%20GRIDMAP_2018.pdf)"
)
_DATA_DISCLAIMER = (
    "Distances indicative — straight-line to nearest OSM geometry node, not network distance. "
    "OSM power data may lag the actual KPTCL/BESCOM network by 1-3 years. "
    "Verify connection feasibility and tariff category with the BESCOM section office "
    "and KPTCL for HT connections before project design."
)


def _hav_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    p = math.pi / 180
    a = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def _nearest_on_way(geometry: list[dict], site_lat: float, site_lon: float) -> tuple[float, float, float]:
    best_d = float("inf")
    best_lat = best_lon = 0.0
    for node in geometry:
        nlat = node.get("lat")
        nlon = node.get("lon")
        if nlat is None or nlon is None:
            continue
        d = _hav_m(site_lat, site_lon, float(nlat), float(nlon))
        if d < best_d:
            best_d = d
            best_lat = float(nlat)
            best_lon = float(nlon)
    return best_lat, best_lon, best_d


def _parse_voltage(tags: dict) -> int | None:
    raw = tags.get("voltage") or tags.get("voltage:primary")
    if not raw:
        return None
    try:
        return int(str(raw).split(";")[0].strip())
    except (ValueError, TypeError):
        return None


def _classify(voltage_v: int | None) -> str:
    if voltage_v is None:
        return "unknown"
    if voltage_v >= 66_000:
        return "transmission"
    if voltage_v >= 11_000:
        return "distribution_ht"
    return "distribution_lt"


def _operator(tags: dict) -> str | None:
    op = (tags.get("operator") or "").upper()
    if "KPTCL" in op:
        return "KPTCL"
    if "BESCOM" in op:
        return "BESCOM"
    if "GESCOM" in op or "HESCOM" in op or "CESC" in op or "MESCOM" in op:
        return tags.get("operator")
    return tags.get("operator") or None


async def fetch_power_grid(lat: float, lon: float, radius_m: int = 10_000) -> PowerGridResult:
    query = f"""
[out:json][timeout:20];
(
  way[power=line](around:{radius_m},{lat},{lon});
  node[power=substation](around:{radius_m},{lat},{lon});
  node[power=transformer](around:2000,{lat},{lon});
);
out geom;
"""
    nearest_ht: PowerLine | None = None
    nearest_dist: PowerLine | None = None
    nearest_sub: PowerSubstation | None = None
    best_ht_d = float("inf")
    best_dist_d = float("inf")
    best_sub_d = float("inf")

    try:
        async with httpx.AsyncClient(
            timeout=25, headers={"User-Agent": "SAT-SiteAnalysisTool/1.0"}
        ) as client:
            resp = await client.post(OVERPASS_URL, data={"data": query})
            resp.raise_for_status()
            elements = resp.json().get("elements", [])
    except Exception:
        elements = []

    for el in elements:
        el_type = el.get("type")
        tags = el.get("tags", {})
        power_tag = tags.get("power", "")

        if el_type == "way" and power_tag == "line":
            geom = el.get("geometry", [])
            if not geom:
                continue
            _, _, d = _nearest_on_way(geom, lat, lon)
            voltage_v = _parse_voltage(tags)
            classification = _classify(voltage_v)
            voltage_kv = round(voltage_v / 1000) if voltage_v is not None else None
            op = _operator(tags)

            line = PowerLine(
                voltage_kv=voltage_kv,
                operator=op,
                distance_m=round(d, 1),
                classification=classification,
                confidence="derived",
            )

            if classification == "transmission" and d < best_ht_d:
                best_ht_d = d
                nearest_ht = line
            elif classification in ("distribution_ht", "distribution_lt", "unknown") and d < best_dist_d:
                best_dist_d = d
                nearest_dist = line

        elif el_type == "node" and power_tag in ("substation", "transformer"):
            el_lat = el.get("lat")
            el_lon = el.get("lon")
            if el_lat is None or el_lon is None:
                continue
            d = _hav_m(lat, lon, float(el_lat), float(el_lon))
            if d < best_sub_d:
                best_sub_d = d
                voltage_v = _parse_voltage(tags)
                nearest_sub = PowerSubstation(
                    name=tags.get("name") or tags.get("ref") or None,
                    voltage_kv=round(voltage_v / 1000) if voltage_v is not None else None,
                    operator=_operator(tags),
                    distance_m=round(d, 1),
                    lat=round(float(el_lat), 6),
                    lon=round(float(el_lon), 6),
                    confidence="derived",
                )

    return PowerGridResult(
        nearest_ht_line=nearest_ht,
        nearest_distribution_line=nearest_dist,
        nearest_substation=nearest_sub,
        bescom_lt_within_200m=(
            nearest_dist is not None
            and nearest_dist.classification in ("distribution_lt", "distribution_ht")
            and nearest_dist.distance_m <= 200
        ),
        bescom_ht_within_2km=(
            nearest_dist is not None
            and nearest_dist.classification == "distribution_ht"
            and nearest_dist.distance_m <= 2000
        ),
        kptcl_ht_within_5km=(
            nearest_ht is not None
            and nearest_ht.classification == "transmission"
            and nearest_ht.distance_m <= 5000
        ),
        radius_m=radius_m,
        data_source=_DATA_SOURCE,
        data_disclaimer=_DATA_DISCLAIMER,
    )
