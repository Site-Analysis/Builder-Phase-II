# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from app.models.future_infra import (
    DEAD_STATUSES,
    UPSIDE_STATUSES,
    PipelineItem,
    PipelineResult,
)

# services/future-infra/data — app/services/pipeline_service.py is 2 parents below future-infra/.
# (Was parents[3] = services/, which does not exist -> the curated pipeline silently loaded EMPTY.)
_DATA_DIR = Path(__file__).resolve().parents[2] / "data"

# ── EPSG:32643 (WGS84 → UTM 43N) — repo convention: hand-rolled, no pyproj (copied from the
# connectivity_service so metro distances match the connectivity CRS exactly). ──
_A = 6378137.0
_F = 1.0 / 298.257223563
_E2 = _F * (2.0 - _F)
_K0 = 0.9996
_FALSE_EASTING = 500000.0
_LON0 = math.radians(75.0)


def wgs84_to_utm43n(lat_deg: float, lon_deg: float) -> tuple[float, float]:
    lat, lon = math.radians(lat_deg), math.radians(lon_deg)
    ep2 = _E2 / (1.0 - _E2)
    n = _A / math.sqrt(1.0 - _E2 * math.sin(lat) ** 2)
    t = math.tan(lat) ** 2
    c = ep2 * math.cos(lat) ** 2
    a = math.cos(lat) * (lon - _LON0)
    m = _A * (
        (1 - _E2 / 4 - 3 * _E2**2 / 64 - 5 * _E2**3 / 256) * lat
        - (3 * _E2 / 8 + 3 * _E2**2 / 32 + 45 * _E2**3 / 1024) * math.sin(2 * lat)
        + (15 * _E2**2 / 256 + 45 * _E2**3 / 1024) * math.sin(4 * lat)
        - (35 * _E2**3 / 3072) * math.sin(6 * lat)
    )
    easting = _FALSE_EASTING + _K0 * n * (
        a + (1 - t + c) * a**3 / 6 + (5 - 18 * t + t**2 + 72 * c - 58 * ep2) * a**5 / 120
    )
    northing = _K0 * (
        m + n * math.tan(lat) * (
            a**2 / 2 + (5 - t + 9 * c + 4 * c**2) * a**4 / 24
            + (61 - 58 * t + t**2 + 600 * c - 330 * ep2) * a**6 / 720
        )
    )
    return easting, northing


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _feature_centroid(geometry: dict[str, Any]) -> tuple[float, float]:
    gtype = geometry.get("type", "")
    coords = geometry.get("coordinates", [])
    if gtype == "Point":
        return float(coords[1]), float(coords[0])
    if gtype == "LineString":
        lats = [c[1] for c in coords]
        lons = [c[0] for c in coords]
        return sum(lats) / len(lats), sum(lons) / len(lons)
    if gtype == "Polygon":
        ring = coords[0]
        lats = [c[1] for c in ring]
        lons = [c[0] for c in ring]
        return sum(lats) / len(lats), sum(lons) / len(lons)
    return 0.0, 0.0


class PipelineService:
    def __init__(self) -> None:
        self._features: list[dict[str, Any]] = []
        for fname in ("bengaluru_pipeline.json", "pan_india_pipeline.json"):
            fpath = _DATA_DIR / fname
            if fpath.exists():
                try:
                    data = json.loads(fpath.read_text(encoding="utf-8"))
                    self._features.extend(data.get("features", []))
                except Exception:
                    pass

    def get_pipeline(self, lat: float, lon: float, radius_km: float) -> PipelineResult:
        items: list[PipelineItem] = []
        for feature in self._features:
            props = feature.get("properties", {})
            geom = feature.get("geometry", {})
            try:
                c_lat, c_lon = _feature_centroid(geom)
                dist_km = _haversine_km(lat, lon, c_lat, c_lon)
            except Exception:
                continue
            if dist_km > radius_km:
                continue
            status = props.get("status", "Planned")
            items.append(
                PipelineItem(
                    type=props.get("type", "metro"),  # type: ignore[arg-type]
                    name=props.get("name", "Unknown"),
                    description=props.get("description"),
                    status=status,  # type: ignore[arg-type]
                    expected_completion=props.get("expected_completion"),
                    distance_km=round(dist_km, 2),
                    source=props.get("source", "Curated"),
                    source_date=props.get("source_date", "2024-Q4"),
                    status_as_of=props.get("status_as_of", props.get("source_date")),
                    contributes_to_upside=status in UPSIDE_STATUSES,
                )
            )

        items.sort(key=lambda i: i.distance_km)

        # SCORE — a Cancelled/Tendered project must NEVER raise the score, and metro/road proximity
        # bonuses only count for LIVE (non-dead) projects. Pricing appreciation off a cancelled road
        # is a real loss, so dead projects are filtered out of every scoring term.
        live = [i for i in items if i.status not in DEAD_STATUSES]
        uc_approved = sum(1 for i in live if i.status in ("Under Construction", "Approved"))
        operational = sum(1 for i in live if i.status == "Operational")
        base = 50
        base += min(30, uc_approved * 8)
        base += min(15, operational * 3)
        if any(i.type == "metro" and i.distance_km <= 2 for i in live):
            base += 10
        if any(i.type in ("expressway", "ring_road") and i.distance_km <= 5 for i in live):
            base += 5
        score = min(95, base)
        severity = "low" if score >= 70 else "moderate" if score >= 50 else "high"

        return PipelineResult(
            within_radius_km=radius_km,
            pipeline_items=items,
            score=score,
            severity=severity,  # type: ignore[arg-type]
            data_source="Curated — BMRCL, BDA, NHAI, KIADB, MoCI (2024)",
            data_as_of="2024-Q4",
        )

    def features(self) -> list[dict[str, Any]]:
        """Raw curated features (for the price model's node scan)."""
        return self._features

    def nearest_metro(self, lat: float, lon: float) -> dict[str, Any]:
        """US-090 PART 2 — nearest curated METRO-corridor node, straight-line in EPSG:32643.

        Fills the US-086 metro seam that returned `unresolved` (BMRCL GTFS not fetchable). We use the
        curated metro alignment VERTICES — approximate, NOT live station points — so confidence is
        `inferred` and the corridor's own status is carried. A Cancelled corridor is skipped (a dead
        line is not metro access). Returns a `metro_fetched`-shaped dict for `build_connectivity`."""
        px, py = wgs84_to_utm43n(lat, lon)
        best_d = math.inf
        best: dict[str, Any] | None = None
        for feat in self._features:
            props = feat.get("properties", {})
            if props.get("type") != "metro":
                continue
            if props.get("status") in DEAD_STATUSES:
                continue
            geom = feat.get("geometry", {})
            if geom.get("type") != "LineString":
                continue
            for lon_v, lat_v in geom.get("coordinates", []):
                vx, vy = wgs84_to_utm43n(float(lat_v), float(lon_v))
                d = math.hypot(px - vx, py - vy)
                if d < best_d:
                    best_d = d
                    best = props
        if best is None:
            return {
                "status": "unresolved", "name": None, "ref": None, "corridor_status": None,
                "distance_m": None, "distance_type": "straight-line", "confidence": "unresolved",
                "crs": "EPSG:32643", "vintage": None,
                "data_source": "future-infra curated metro alignment (approximate)",
                "reason": "no curated metro corridor loaded — distance withheld, not fabricated.",
            }
        return {
            "status": "resolved",
            "name": best.get("name"),
            "ref": best.get("type"),
            "corridor_status": best.get("status"),
            "distance_m": round(best_d, 1),
            "distance_type": "straight-line",
            "confidence": "inferred",   # curated approximate alignment, not live GTFS
            "crs": "EPSG:32643",
            "vintage": best.get("status_as_of") or best.get("source_date") or "2024-Q4",
            "data_source": "future-infra curated metro alignment (approximate)",
            "reason": None,
        }
