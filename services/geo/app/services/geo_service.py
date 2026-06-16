from __future__ import annotations

import math
import os
from typing import Any

import httpx
from fastapi import HTTPException

from app.models.geo import KgisContext, NearbyFeature, ZoneResult
from app.services.lulc_service import fetch_lulc, lulc_flags
from app.services.kgis_service import fetch_kgis_context

OVERPASS_URL = os.getenv("OVERPASS_URL", "https://overpass.openstreetmap.fr/api/interpreter")

ZONE_CLASSIFICATION: dict[tuple[str, str], str] = {
    ("landuse", "residential"): "Residential",
    ("landuse", "commercial"): "Commercial",
    ("landuse", "retail"): "Commercial",
    ("landuse", "industrial"): "Industrial",
    ("landuse", "farmland"): "Agricultural",
    ("landuse", "farmyard"): "Agricultural",
    ("landuse", "orchard"): "Agricultural",
    ("landuse", "meadow"): "Agricultural",
    ("landuse", "forest"): "Green Belt",
    ("natural", "wood"): "Green Belt",
    ("natural", "water"): "Water Body",
    ("landuse", "basin"): "Water Body",
    ("landuse", "military"): "Restricted",
    ("landuse", "mixed"): "Mixed Use",
    ("amenity", "school"): "Institutional",
    ("amenity", "university"): "Institutional",
    ("amenity", "college"): "Institutional",
    ("amenity", "hospital"): "Institutional",
    ("amenity", "place_of_worship"): "Institutional",
}

PERMITTED_USES: dict[str, list[str]] = {
    "Residential": ["Dwelling units", "Home office", "Ground-floor shop <25sqm", "Nursery school"],
    "Commercial": ["Retail", "Office", "Hotel", "Restaurant", "Bank", "Service establishment"],
    "Industrial": ["Manufacturing", "Warehouse", "Service industry", "Ancillary office"],
    "Agricultural": ["Cultivation only", "Farm structure", "No residential permitted"],
    "Institutional": ["Education", "Healthcare", "Place of worship", "Government office"],
    "Green Belt": ["Parks", "Passive recreation", "No permanent structure"],
    "Water Body": ["No construction permitted within buffer zone"],
    "Mixed Use": ["Residential", "Commercial", "Institutional (per approval)"],
    "Restricted": ["Prior NOC required from competent authority"],
    "Unknown": ["Verify with local authority"],
}

# FAR is road-width-dependent per BDA CDP 2031 / NBC 2016 Table 15.
# These are the minimum FAR values (road width <7.5m) — use BC-2 Planning service
# for exact FAR once road width is known.
BASE_FAR: dict[str, float | None] = {
    "Residential":  1.00,  # NBC 2016 minimum (road <7.5m); max 3.0 for road >24m
    "Commercial":   1.50,  # NBC 2016 minimum; max 3.5 for road >24m
    "Industrial":   1.50,  # Fixed per NBC 2016
    "Mixed Use":    1.50,  # NBC 2016 minimum
    "Institutional": 1.50, # Fixed per NBC 2016
}

GROUND_COVERAGE: dict[str, float | None] = {
    "Residential": 0.55,
    "Commercial": 0.60,
    "Industrial": 0.65,
    "Institutional": 0.50,
}

SCORE_MAP: dict[str, tuple[float, str]] = {
    "Residential": (80, "low"),
    "Commercial": (78, "low"),
    "Institutional": (75, "low"),
    "Mixed Use": (77, "low"),
    "Industrial": (55, "moderate"),
    "Agricultural": (35, "high"),
    "Green Belt": (25, "high"),
    "Water Body": (10, "high"),
    "Restricted": (20, "high"),
    "Unknown": (50, "moderate"),
}


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _classify_element(tags: dict[str, str]) -> str:
    for (k, v), zone in ZONE_CLASSIFICATION.items():
        if tags.get(k) == v:
            return zone
    if tags.get("waterway"):
        return "Water Body"
    return "Unknown"


class GeoService:
    async def analyze_zone(self, lat: float, lon: float, radius_m: float = 500, kgis_enabled: bool = False) -> ZoneResult:
        query = f"""
[out:json][timeout:25];
(
  way[landuse](around:{radius_m},{lat},{lon});
  relation[landuse](around:{radius_m},{lat},{lon});
  node[amenity](around:{radius_m},{lat},{lon});
  way[amenity](around:{radius_m},{lat},{lon});
  node[leisure](around:{radius_m},{lat},{lon});
  node[natural](around:{radius_m},{lat},{lon});
  way[natural](around:{radius_m},{lat},{lon});
);
out center;
"""
        try:
            async with httpx.AsyncClient(timeout=30, headers={"User-Agent": "SAT-SiteAnalysisTool/1.0"}) as client:
                r = await client.post(OVERPASS_URL, data={"data": query})
                r.raise_for_status()
                osm_data = r.json()
                # Bhuvan LULC query runs concurrently — graceful fallback on failure
                lulc_label, lulc_code, lulc_vintage = await fetch_lulc(lat, lon, client)
                # KGIS authoritative admin context — flag-gated, graceful None on failure
                kgis_raw = await fetch_kgis_context(lat, lon, client) if kgis_enabled else None
        except httpx.HTTPStatusError:
            raise HTTPException(status_code=502, detail="OSM upstream unavailable")
        except Exception:
            raise HTTPException(status_code=502, detail="OSM upstream unavailable")

        elements: list[dict[str, Any]] = osm_data.get("elements", [])

        zone_class = "Unknown"
        primary_landuse = "unclassified"
        nearby: list[NearbyFeature] = []
        best_zone: tuple[int, float] | None = None  # (priority, distance) — lower wins

        for el in elements:
            tags = el.get("tags", {})
            center = el.get("center") or el
            el_lat = center.get("lat")
            el_lon = center.get("lon")
            if el_lat is None or el_lon is None:
                continue

            dist = _haversine(lat, lon, el_lat, el_lon)
            cls = _classify_element(tags)

            key_tag = next(
                (k for k in ("landuse", "amenity", "natural", "leisure", "waterway") if k in tags),
                None,
            )
            if key_tag:
                nearby.append(NearbyFeature(
                    type=key_tag,
                    value=tags[key_tag],
                    name=tags.get("name"),
                    distance_m=round(dist, 1),
                    lat=round(float(el_lat), 6),
                    lon=round(float(el_lon), 6),
                ))

            # Zone = the nearest classified feature, preferring land-cover polygons
            # (landuse/natural) over single-point amenities — otherwise one tagged
            # hospital/temple defines the whole neighbourhood regardless of distance.
            if cls != "Unknown":
                has_land = ("landuse" in tags) or ("natural" in tags)
                cand = (0 if has_land else 1, dist)
                if best_zone is None or cand < best_zone:
                    best_zone = cand
                    zone_class = cls
                    primary_landuse = (
                        tags.get("landuse") or tags.get("natural")
                        or tags.get("amenity") or tags.get("leisure") or "unclassified"
                    )

        nearby_sorted = sorted(nearby, key=lambda f: f.distance_m)[:5]
        score, severity = SCORE_MAP.get(zone_class, (50, "moderate"))

        na_required, forest_required = lulc_flags(lulc_code)
        source_confidence = "authoritative" if lulc_label is not None else "community"

        # Dual-source insight: OSM says Residential but Bhuvan says Agricultural →
        # NA order is very likely required. Both readings surfaced to the user.
        data_src = "OpenStreetMap (Overpass API)"
        if lulc_label is not None and lulc_vintage:
            data_src = f"OpenStreetMap (Overpass API) + ISRO NRSC Bhuvan LULC {lulc_vintage}"

        return ZoneResult(
            zone_class=zone_class,  # type: ignore[arg-type]
            permitted_uses=PERMITTED_USES.get(zone_class, ["Verify with local authority"]),
            base_far=BASE_FAR.get(zone_class),
            permissible_ground_coverage=GROUND_COVERAGE.get(zone_class),
            primary_landuse=primary_landuse,
            nearby_features=nearby_sorted,
            lulc_class=lulc_label,
            lulc_code=lulc_code,
            lulc_vintage=lulc_vintage,
            na_order_required=na_required,
            forest_clearance_required=forest_required,
            source_confidence=source_confidence,  # type: ignore[arg-type]
            kgis=KgisContext(**kgis_raw) if kgis_raw else None,
            score=score,
            severity=severity,  # type: ignore[arg-type]
            data_source=data_src,
        )
