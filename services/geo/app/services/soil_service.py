from __future__ import annotations

import httpx
from fastapi import HTTPException

from app.models.geo import SoilResult

SOILGRIDS_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query"


def _classify_texture(clay: float, sand: float, silt: float) -> str:
    if clay > 40:
        return "Clay"
    if clay > 27 and silt > 40:
        return "Silty Clay"
    if clay > 27 and sand > 45:
        return "Sandy Clay"
    if clay > 27:
        return "Clay Loam"
    if silt > 80:
        return "Silt"
    if silt > 50 and clay < 12:
        return "Silt Loam"
    if sand > 85:
        return "Sand"
    if sand > 70 and clay < 15:
        return "Sandy Loam"
    return "Loam"


class SoilService:
    async def get_soil(self, lat: float, lon: float, client: httpx.AsyncClient) -> SoilResult:
        params = {
            "lon": lon,
            "lat": lat,
            "property": ["clay", "sand", "silt", "bdod", "phh2o"],
            "depth": "0-5cm",
            "value": "mean",
        }
        try:
            r = await client.get(SOILGRIDS_URL, params=params, timeout=20)
            r.raise_for_status()
            data = r.json()
        except Exception:
            raise HTTPException(status_code=502, detail="SoilGrids unavailable")

        def _extract(prop_name: str) -> float | None:
            # SoilGrids v2.0: properties.layers[] — each layer has .name + .depths[]
            try:
                for layer in data["properties"]["layers"]:
                    if layer.get("name") != prop_name:
                        continue
                    for depth in layer.get("depths", []):
                        if depth.get("range", {}).get("top_depth") == 0:
                            return depth.get("values", {}).get("mean")
            except (KeyError, TypeError, IndexError):
                return None
            return None

        clay_raw = _extract("clay") or 200.0
        sand_raw = _extract("sand") or 400.0
        silt_raw = _extract("silt") or 300.0
        bdod_raw = _extract("bdod") or 140.0
        ph_raw = _extract("phh2o") or 65.0

        clay_pct = clay_raw / 10
        sand_pct = sand_raw / 10
        silt_pct = silt_raw / 10
        bdod = bdod_raw / 100
        ph = ph_raw / 10

        texture = _classify_texture(clay_pct, sand_pct, silt_pct)

        if clay_pct > 45 or (clay_pct > 30 and bdod < 1.3):
            bearing = "Poor (<100 kN/m²)"
            notes = "Expansive clay — deep foundation (pile/raft) likely required."
            score, severity = 35, "high"
        elif bdod > 1.55 and clay_pct < 25:
            bearing = "Good (>150 kN/m²)"
            notes = "Compact soil — strip/pad foundation generally adequate."
            score, severity = 85, "low"
        else:
            bearing = "Moderate (100–150 kN/m²)"
            notes = "Standard foundation design; verify with site investigation."
            score, severity = 65, "moderate"

        return SoilResult(
            clay_pct=round(clay_pct, 1),
            sand_pct=round(sand_pct, 1),
            silt_pct=round(silt_pct, 1),
            bulk_density_gcm3=round(bdod, 3),
            ph=round(ph, 1),
            texture_class=texture,
            bearing_capacity_class=bearing,  # type: ignore[arg-type]
            foundation_notes=notes,
            score=score,
            severity=severity,  # type: ignore[arg-type]
            data_source="SoilGrids REST API v2.0 (ISRIC, 250m)",
        )
