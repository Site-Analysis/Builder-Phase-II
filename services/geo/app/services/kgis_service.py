# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""
KGIS (Karnataka State GIS) authoritative location context.

Queries the public, token-free K-GIS point service for the administrative
hierarchy of a coordinate:
  - Urban: district / town(ULB) / BBMP admin zone / ward
  - Rural: district / taluk / hobli / village / survey number

Endpoint:
  https://kgis.ksrsac.in:9000/genericwebservices/ws/getlocationdetails?coordinates=<lat>,<lon>&type=dd

IMPORTANT: KGIS `zoneName` is the *administrative* zone (BBMP East/West/...),
NOT the RMP land-use zone. It is authoritative location context only.

Fails gracefully — returns None on any error so the caller falls back to OSM.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

_KGIS_URL = "https://kgis.ksrsac.in:9000/genericwebservices/ws/getlocationdetails"


async def fetch_kgis_context(
    lat: float, lon: float, client: httpx.AsyncClient
) -> dict[str, Any] | None:
    """Return a normalised KGIS context dict, or None on failure / no data."""
    params = {"coordinates": f"{lat},{lon}", "type": "dd"}
    try:
        resp = await client.get(_KGIS_URL, params=params, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        d = data[0]
        if str(d.get("message")) != "200":
            return None
        ctx = {
            "type": d.get("type"),  # "Urban" | "Rural"
            "district": d.get("districtName"),
            "town": d.get("townName"),
            "admin_zone": d.get("zoneName"),  # administrative, NOT land-use
            "ward": d.get("wardName"),
            "taluk": d.get("talukName"),
            "hobli": d.get("hobliName"),
            "village": d.get("villageName"),
            "village_code": d.get("villageCode"),  # e.g. "2905030017_1" (rural only)
            "survey_number": d.get("surveynum"),
        }
        # Drop entirely-empty results
        if not any(v for k, v in ctx.items() if k != "type"):
            return None
        return ctx
    except Exception:
        return None


# ── Forward survey-number → parcel geometry (SAT-19) ─────────────────────────
_GEOM_URL = "https://kgis.ksrsac.in:9000/genericwebservices/ws/geomForSurveyNum"


def resolve_kgis_village_id(village_code: str | None) -> str | None:
    """Map a reverse-lookup villageCode to the numeric KGISVillageId that
    geomForSurveyNum requires.

    SAT-19 blocker: KGISVillageId is a separate numeric *master* id — it is NOT the
    `villageCode` / `LGD_VillageCode` returned by getlocationdetails (probes with those
    forms return HTTP 404). The mapping (a village-master table or a coord→id service)
    is pending KSRSAC. Until it lands this returns None and the parcel endpoint reports
    `resolved=False`. Wire the real lookup here.
    """
    return None


def _wkt_polygon_to_geojson(geom: str | None) -> dict[str, Any] | None:
    """Parse a WKT ``POLYGON ((lng lat, ...))`` (DD / WGS84) into a GeoJSON Polygon.

    KGIS DD responses are decimal degrees in lng/lat order, so no reprojection is
    needed. Returns None for empty / non-polygon / unparseable input.
    """
    if not geom or "POLYGON" not in geom.upper():
        return None
    try:
        inner = geom[geom.index("((") + 2 : geom.rindex("))")]
    except ValueError:
        return None
    rings: list[list[list[float]]] = []
    for ring in inner.split("),("):
        coords: list[list[float]] = []
        for pair in ring.split(","):
            parts = pair.strip().split()
            if len(parts) < 2:
                continue
            try:
                coords.append([float(parts[0]), float(parts[1])])
            except ValueError:
                continue
        if coords:
            rings.append(coords)
    if not rings:
        return None
    return {"type": "Polygon", "coordinates": rings}


async def fetch_parcel_geometry(
    kgis_village_id: str,
    survey_no: str,
    client: httpx.AsyncClient,
    crs: str = "DD",
) -> dict[str, Any] | None:
    """Return a GeoJSON Polygon (WGS84) for a survey number via KGIS
    ``geomForSurveyNum``, or None on failure / no data.

    Path-style: ``/geomForSurveyNum/{KGISVillageId}/{SurveyNumber}/{DD|UTM}``.
    DD returns a WKT POLYGON in decimal degrees (lng lat). Fails gracefully to None.
    """
    vid = quote(str(kgis_village_id), safe="")
    sno = quote(str(survey_no), safe="")
    crs_seg = "UTM" if str(crs).upper() == "UTM" else "DD"
    url = f"{_GEOM_URL}/{vid}/{sno}/{crs_seg}"
    try:
        resp = await client.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        d = data[0]
        if str(d.get("message")) != "200":
            return None
        return _wkt_polygon_to_geojson(d.get("geom"))
    except Exception:
        return None
