from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from app.models.future_infra import PipelineItem, PipelineResult

_DATA_DIR = Path(__file__).resolve().parents[3] / "data"


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
            items.append(PipelineItem(
                type=props.get("type", "metro"),  # type: ignore[arg-type]
                name=props.get("name", "Unknown"),
                description=props.get("description"),
                status=props.get("status", "Planned"),  # type: ignore[arg-type]
                expected_completion=props.get("expected_completion"),
                distance_km=round(dist_km, 2),
                source=props.get("source", "Curated"),
                source_date=props.get("source_date", "2024-Q4"),
            ))

        items.sort(key=lambda i: i.distance_km)

        uc_approved = sum(1 for i in items if i.status in ("Under Construction", "Approved"))
        operational = sum(1 for i in items if i.status == "Operational")
        base = 50
        base += min(30, uc_approved * 8)
        base += min(15, operational * 3)
        if any(i.type == "metro" and i.distance_km <= 2 for i in items):
            base += 10
        if any(i.type in ("expressway", "ring_road") and i.distance_km <= 5 for i in items):
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
