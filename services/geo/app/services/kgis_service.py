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

# Public, token-free KGIS Cadastral layer (ArcGIS MapServer, layer 5 = parcel polygons).
# Exposes KGISVillageID / KGISVillageCode / surveynumberi, so it doubles as both the
# village-id resolver and a direct survey→polygon source.
_CADASTRAL_L5_URL = (
    "https://kgis.ksrsac.in/kgismaps/rest/services/CadastralData_Admin/"
    "Dynamic_CadastralData_Admin/MapServer/5/query"
)


async def resolve_kgis_village_id(
    village_code: str | None, client: httpx.AsyncClient
) -> str | None:
    """Resolve a reverse-lookup ``villageCode`` to the numeric ``KGISVillageId`` that
    ``geomForSurveyNum`` requires (SAT-19).

    Queries the public KGIS Cadastral layer for a feature whose ``KGISVillageCode``
    matches and returns its ``KGISVillageID``. Fails gracefully to None (unreachable,
    no match, parse error) so the parcel endpoint reports ``resolved=False`` — never a
    fabricated id.

    Phase-0 live-verify (KGIS egress was blocked during the spike): confirm the
    ``KGISVillageCode`` field name and that ``KGISVillageID`` is the integer
    ``geomForSurveyNum`` expects. ``getlocationdetails`` may carry a "_n" suffix on the
    code, so the base form is matched too.
    """
    if not village_code:
        return None
    base = str(village_code).split("_")[0]
    where = f"KGISVillageCode='{village_code}' OR KGISVillageCode='{base}'"
    params = {
        "where": where,
        "outFields": "KGISVillageID",
        "returnGeometry": "false",
        "returnDistinctValues": "true",
        "f": "json",
    }
    try:
        resp = await client.get(_CADASTRAL_L5_URL, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        feats = data.get("features") or []
        if not feats:
            return None
        vid = feats[0].get("attributes", {}).get("KGISVillageID")
        return str(vid) if vid not in (None, "") else None
    except Exception:
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


def _esri_rings_to_geojson(rings: Any) -> dict[str, Any] | None:
    """Convert an ArcGIS polygon ``rings`` array to a GeoJSON Polygon. Assumes the
    server already returned WGS84 (we request ``outSR=4326``). Returns None on empty /
    malformed input."""
    if not isinstance(rings, list) or not rings:
        return None
    out: list[list[list[float]]] = []
    for ring in rings:
        if not isinstance(ring, list):
            continue
        coords: list[list[float]] = []
        for pt in ring:
            if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                try:
                    coords.append([float(pt[0]), float(pt[1])])
                except (TypeError, ValueError):
                    continue
        if coords:
            out.append(coords)
    if not out:
        return None
    return {"type": "Polygon", "coordinates": out}


async def fetch_parcel_geometry_direct(
    village_code: str,
    survey_no: str,
    client: httpx.AsyncClient,
) -> dict[str, Any] | None:
    """Fallback: fetch the parcel polygon straight from the KGIS Cadastral layer by
    ``KGISVillageCode`` + ``surveynumberi``, bypassing ``geomForSurveyNum`` (used when
    the village-id resolver or geom service yields nothing). Requests geometry in WGS84
    (``outSR=4326``). Returns a GeoJSON Polygon or None; fails gracefully.

    Phase-0 live-verify: confirm ``surveynumberi`` matching (numeric vs string) and the
    exact field names — KGIS egress was blocked during the spike.
    """
    if not village_code or not survey_no:
        return None
    base = str(village_code).split("_")[0]
    where = (
        f"(KGISVillageCode='{village_code}' OR KGISVillageCode='{base}') "
        f"AND surveynumberi='{survey_no}'"
    )
    params = {
        "where": where,
        "outFields": "KGISVillageID,surveynumberi",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "json",
    }
    try:
        resp = await client.get(_CADASTRAL_L5_URL, params=params, timeout=12)
        resp.raise_for_status()
        data = resp.json()
        feats = data.get("features") or []
        if not feats:
            return None
        geom = feats[0].get("geometry") or {}
        return _esri_rings_to_geojson(geom.get("rings"))
    except Exception:
        return None
