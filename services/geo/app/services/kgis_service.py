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

from typing import Any, Optional

import httpx

_KGIS_URL = "https://kgis.ksrsac.in:9000/genericwebservices/ws/getlocationdetails"


async def fetch_kgis_context(
    lat: float, lon: float, client: httpx.AsyncClient
) -> Optional[dict[str, Any]]:
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
            "type": d.get("type"),                 # "Urban" | "Rural"
            "district": d.get("districtName"),
            "town": d.get("townName"),
            "admin_zone": d.get("zoneName"),        # administrative, NOT land-use
            "ward": d.get("wardName"),
            "taluk": d.get("talukName"),
            "hobli": d.get("hobliName"),
            "village": d.get("villageName"),
            "survey_number": d.get("surveynum"),
        }
        # Drop entirely-empty results
        if not any(v for k, v in ctx.items() if k != "type"):
            return None
        return ctx
    except Exception:
        return None
