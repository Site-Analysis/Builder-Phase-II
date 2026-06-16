from __future__ import annotations

import math
import os
from typing import Any

import httpx
from fastapi import HTTPException

from app.models.geo import AmenityCategory, AmenityItem, AmenitiesResult

OVERPASS_URL = os.getenv("OVERPASS_URL", "https://overpass.openstreetmap.fr/api/interpreter")

# OSM tag → category mapping
_TAG_CATEGORY: dict[tuple[str, str], str] = {}

_HEALTHCARE_VALS = {"hospital", "clinic", "pharmacy", "doctor", "dentist", "health_post", "nursing_home"}
_EDUCATION_VALS  = {"school", "college", "university", "kindergarten", "language_school", "driving_school"}
_RETAIL_VALS     = {"supermarket", "marketplace", "convenience", "department_store", "mall", "shopping_centre"}
_FINANCE_VALS    = {"bank", "atm", "bureau_de_change", "money_transfer"}
_RECREATION_VALS = {"park", "playground", "sports_centre", "fitness_centre", "swimming_pool", "stadium", "pitch"}
_RELIGIOUS_VALS  = {"place_of_worship"}
_TRANSPORT_VALS  = {"bus_stop", "bus_station", "taxi", "fuel", "station", "subway_entrance", "halt"}

def _classify(tags: dict[str, str]) -> str | None:
    amenity = tags.get("amenity", "")
    leisure = tags.get("leisure", "")
    shop    = tags.get("shop", "")
    railway = tags.get("railway", "")

    if amenity in _HEALTHCARE_VALS:
        return "healthcare"
    if amenity in _EDUCATION_VALS:
        return "education"
    if amenity in _RETAIL_VALS or shop in {"mall", "supermarket", "department_store", "convenience"}:
        return "retail"
    if amenity in _FINANCE_VALS:
        return "finance"
    if leisure in _RECREATION_VALS:
        return "recreation"
    if amenity in _RELIGIOUS_VALS:
        return "religious"
    if amenity in _TRANSPORT_VALS or railway in {"station", "subway_entrance", "halt"}:
        return "transport"
    return None


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    p = math.pi / 180
    a = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def _score(cats: dict[str, AmenityCategory], radius_m: float) -> tuple[float, str]:
    # Weighted scoring — presence and proximity matter
    # Max score per category based on builder priorities
    weights = {
        "healthcare": 25,
        "education":  20,
        "transport":  20,
        "retail":     15,
        "finance":    10,
        "recreation":  5,
        "religious":   5,
    }
    total = 0.0
    for cat, max_pts in weights.items():
        c = cats.get(cat)
        if c is None or c.count == 0:
            continue
        # Full points if nearest within 500m; half at 2km; quarter at radius
        nearest = c.nearest_m
        if nearest <= 500:
            frac = 1.0
        elif nearest <= 2000:
            frac = 0.6
        elif nearest <= radius_m * 0.5:
            frac = 0.3
        else:
            frac = 0.15
        # Count bonus: up to 25% extra if well-served category (10+ amenities)
        count_bonus = min(0.25, c.count / 40)
        total += max_pts * min(1.0, frac + count_bonus)

    score = round(min(100.0, total), 1)
    severity = "low" if score >= 65 else "moderate" if score >= 40 else "high"
    return score, severity


class AmenitiesService:
    async def get_amenities(self, lat: float, lon: float, radius_m: float = 5000) -> AmenitiesResult:
        r = int(radius_m)
        query = f"""
[out:json][timeout:30];
(
  node[amenity~"^(hospital|clinic|pharmacy|doctor|dentist|health_post|nursing_home)$"](around:{r},{lat},{lon});
  node[amenity~"^(school|college|university|kindergarten|language_school)$"](around:{r},{lat},{lon});
  way[amenity~"^(school|college|university)$"](around:{r},{lat},{lon});
  node[shop~"^(mall|supermarket|department_store|convenience)$"](around:{r},{lat},{lon});
  way[shop~"^(mall|supermarket|department_store)$"](around:{r},{lat},{lon});
  node[amenity~"^(supermarket|marketplace|convenience)$"](around:{r},{lat},{lon});
  node[amenity~"^(bank|atm|bureau_de_change)$"](around:{r},{lat},{lon});
  node[leisure~"^(park|playground|sports_centre|fitness_centre|swimming_pool|stadium)$"](around:{r},{lat},{lon});
  way[leisure~"^(park|stadium|sports_centre)$"](around:{r},{lat},{lon});
  node[amenity=place_of_worship](around:{r},{lat},{lon});
  node[amenity~"^(bus_stop|bus_station|taxi)$"](around:{r},{lat},{lon});
  node[railway~"^(station|subway_entrance|halt)$"](around:{r},{lat},{lon});
);
out center 500;
"""
        try:
            async with httpx.AsyncClient(timeout=35, headers={"User-Agent": "SAT-SiteAnalysisTool/1.0"}) as client:
                resp = await client.post(OVERPASS_URL, data={"data": query})
                resp.raise_for_status()
                elements: list[dict[str, Any]] = resp.json().get("elements", [])
        except Exception:
            raise HTTPException(status_code=502, detail="OSM upstream unavailable")

        # Bucket elements by category — tuple carries coords for map markers
        buckets: dict[str, list[tuple[str, str, float, float, float]]] = {
            "healthcare": [], "education": [], "retail": [],
            "finance": [], "recreation": [], "religious": [], "transport": [],
        }

        for el in elements:
            tags = el.get("tags", {})
            center = el.get("center") or el
            el_lat = center.get("lat")
            el_lon = center.get("lon")
            if el_lat is None or el_lon is None:
                continue
            cat = _classify(tags)
            if cat is None:
                continue
            dist = _haversine(lat, lon, float(el_lat), float(el_lon))
            name = tags.get("name") or tags.get("amenity") or tags.get("leisure") or tags.get("shop") or "—"
            el_type = (
                tags.get("amenity") or tags.get("leisure") or
                tags.get("shop") or tags.get("railway") or "unknown"
            )
            buckets[cat].append((name, el_type, dist, float(el_lat), float(el_lon)))

        def _build_cat(items: list[tuple[str, str, float, float, float]]) -> AmenityCategory:
            if not items:
                return AmenityCategory(count=0, nearest_m=float("inf"), top_5=[])
            items_sorted = sorted(items, key=lambda x: x[2])
            return AmenityCategory(
                count=len(items),
                nearest_m=round(items_sorted[0][2], 1),
                top_5=[
                    AmenityItem(name=n, type=t, distance_m=round(d, 1), lat=round(la, 6), lon=round(lo, 6))
                    for n, t, d, la, lo in items_sorted[:5]
                ],
                # All located amenities (capped) for dense map markers.
                points=[
                    AmenityItem(name=n, type=t, distance_m=round(d, 1), lat=round(la, 6), lon=round(lo, 6))
                    for n, t, d, la, lo in items_sorted[:40]
                ],
            )

        cats = {k: _build_cat(v) for k, v in buckets.items()}
        total = sum(c.count for c in cats.values())
        score, severity = _score(cats, radius_m)

        return AmenitiesResult(
            radius_m=radius_m,
            healthcare=cats["healthcare"],
            education=cats["education"],
            retail=cats["retail"],
            finance=cats["finance"],
            recreation=cats["recreation"],
            religious=cats["religious"],
            transport=cats["transport"],
            total_count=total,
            score=score,
            severity=severity,  # type: ignore[arg-type]
            data_source=f"OpenStreetMap (Overpass API) · {int(radius_m / 1000)}km amenity coverage",
        )
