# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""
Authoritative land-use zone from the KGIS BDA Revised Master Plan 2015 layer (SAT-20).

KGIS publishes the BDA master plans under the ArcGIS REST service
``CITYGIS/BDA_Plans`` (`https://kgis.ksrsac.in/kgismaps/rest/services/CITYGIS/BDA_Plans/MapServer`,
spatialReference wkid 32643, Query-capable, geoJSON output). The populated land-use
layer is served under the KGIS data-sharing licence, so the exact published **layer id**
and **zone attribute field name** are confirmed at license go-live and supplied via env:

    KGIS_LANDUSE_URL         full MapServer *layer* URL, e.g.
                             https://kgis.ksrsac.in/kgismaps/rest/services/CITYGIS/BDA_Plans/MapServer/0
    KGIS_LANDUSE_ZONE_FIELD  attribute holding the RMP land-use code/label (default "LANDUSE")

Until `KGIS_LANDUSE_URL` is set, ``fetch_landuse_zone`` returns None and the caller
falls back to the OSM-inferred zone (no fabricated authoritative labels). Read-only
public GET, no credentials. Fails gracefully to None on any error.

See FVD SAT-20.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

# ArcGIS REST point-intersect query: the layer's CRS (32643) is handled server-side by
# passing inSR=4326, so no local reprojection / pyproj dependency is needed.
_QUERY_PARAMS = {
    "geometryType": "esriGeometryPoint",
    "inSR": "4326",
    "spatialRel": "esriSpatialRelIntersects",
    "outFields": "*",
    "returnGeometry": "false",
    "f": "json",
}


def _landuse_url() -> str | None:
    """Read at call time so the seam stays env-configurable + test-overridable."""
    url = os.getenv("KGIS_LANDUSE_URL", "").strip()
    return url or None


def _zone_field() -> str:
    return os.getenv("KGIS_LANDUSE_ZONE_FIELD", "LANDUSE").strip() or "LANDUSE"


# RMP-2015 land-use code/label → planning ZoneClass. Codes (R/C/I/PSP/OS/AG/…) checked
# first; otherwise keyword substring match on the full label. Falls back to "Unknown".
_CODE_MAP: dict[str, str] = {
    "R": "Residential",
    "C": "Commercial",
    "I": "Industrial",
    "MU": "Mixed Use",
    "PSP": "Institutional",
    "PS": "Institutional",
    "PU": "Institutional",
    "AG": "Agricultural",
    "A": "Agricultural",
    "OS": "Green Belt",
    "P": "Green Belt",
    "GB": "Green Belt",
    "G": "Green Belt",
    "W": "Water Body",
    "TC": "Restricted",
    "T": "Restricted",
}

# (substring, ZoneClass) — ordered; first hit wins.
_KEYWORD_MAP: list[tuple[str, str]] = [
    ("resid", "Residential"),
    ("commerc", "Commercial"),
    ("indus", "Industrial"),
    ("mixed", "Mixed Use"),
    ("public", "Institutional"),
    ("semi", "Institutional"),
    ("institut", "Institutional"),
    ("utilit", "Institutional"),
    ("amenit", "Institutional"),
    ("agri", "Agricultural"),
    ("park", "Green Belt"),
    ("open space", "Green Belt"),
    ("green", "Green Belt"),
    ("buffer", "Green Belt"),
    ("valley", "Green Belt"),
    ("forest", "Green Belt"),
    ("water", "Water Body"),
    ("lake", "Water Body"),
    ("tank", "Water Body"),
    ("transport", "Restricted"),
    ("railway", "Restricted"),
    ("defence", "Restricted"),
    ("military", "Restricted"),
]


def map_rmp_to_zoneclass(raw: Any) -> str:
    """Map a raw RMP-2015 land-use code/label to a planning ``ZoneClass`` string."""
    if raw is None:
        return "Unknown"
    s = str(raw).strip()
    if not s:
        return "Unknown"
    # Exact code (case-insensitive, strip punctuation like "P&SP" → "PSP").
    code = "".join(ch for ch in s.upper() if ch.isalnum())
    if code in _CODE_MAP:
        return _CODE_MAP[code]
    low = s.lower()
    for needle, zone in _KEYWORD_MAP:
        if needle in low:
            return zone
    return "Unknown"


async def fetch_landuse_zone(
    lat: float, lon: float, client: httpx.AsyncClient
) -> dict[str, Any] | None:
    """Return the authoritative BDA RMP-2015 land-use for a point, or None.

    Result dict: ``{"zone_class", "zone_code", "raw_zone"}``. None when the layer is
    not configured, the point is outside the BDA Local Planning Area (no feature), or
    on any upstream error — the caller then falls back to the OSM-inferred zone.
    """
    url = _landuse_url()
    if not url:
        return None
    field = _zone_field()
    params = {**_QUERY_PARAMS, "geometry": f"{lon},{lat}"}
    try:
        resp = await client.get(f"{url}/query", params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        features = data.get("features") if isinstance(data, dict) else None
        if not features:
            return None
        attrs = features[0].get("attributes", {}) or {}
        raw = attrs.get(field)
        if raw is None:
            return None
        return {
            "zone_class": map_rmp_to_zoneclass(raw),
            "zone_code": str(raw),
            "raw_zone": str(raw),
        }
    except Exception:
        return None
