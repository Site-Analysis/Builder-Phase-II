from __future__ import annotations

import math
from datetime import date, timedelta

import httpx

from app.models.flood import (
    ElevationAnalysis,
    FloodComponentScores,
    FloodHistory,
    FloodMetadata,
    FloodReport,
    FloodRequest,
    HydrologyAnalysis,
    LowLyingAreaIndex,
)
from app.settings import FloodSettings

_OPENMETEO_ELEVATION = "https://api.open-meteo.com/v1/elevation"
_OPENMETEO_ARCHIVE   = "https://archive-api.open-meteo.com/v1/archive"
_OVERPASS_URL        = "https://overpass-api.de/api/interpreter"


class FloodRiskService:
    def __init__(self, settings: FloodSettings | None = None) -> None:
        self.settings = settings or FloodSettings()

    def analyze(self, request: FloodRequest) -> FloodReport:
        with httpx.Client(timeout=35) as client:
            elevation_m = self._fetch_elevation(client, request.latitude, request.longitude)
            rain        = self._fetch_rain(client, request.latitude, request.longitude)
            water_dist  = self._fetch_water_distance(
                client, request.latitude, request.longitude, request.radius_meters
            )

        elev_risk  = self._elevation_risk(elevation_m)
        hydro_risk = self._hydro_risk(water_dist)
        rain_risk  = self._rain_risk(rain)
        llai_risk  = round((elev_risk + hydro_risk) / 2.0, 2)

        overall       = round(0.30 * elev_risk + 0.30 * hydro_risk + 0.25 * rain_risk + 0.15 * llai_risk, 2)
        risk_category = self._risk_category(overall)

        if water_dist < 250:   river_risk = "High"
        elif water_dist < 600: river_risk = "Moderate"
        else:                  river_risk = "Low"

        elevation = ElevationAnalysis(
            mean_m=round(elevation_m, 1),
            min_m=round(max(0.0, elevation_m - 5.0), 1),
            max_m=round(elevation_m + 5.0, 1),
            range_m=10.0,
            slope_degrees=0.0,  # single-point SRTM cannot yield slope
            low_lying_area_pct=round(min(100.0, max(0.0, (200.0 - elevation_m) / 2.0)), 1),
            terrain_classification=(
                "flat" if elevation_m < 100 else
                "hilly" if elevation_m < 600 else
                "mountainous"
            ),
        )

        hydrology = HydrologyAnalysis(
            flow_accumulation=round(hydro_risk / 100.0, 3),
            nearest_river_distance_m=round(water_dist, 1),
            water_occurrence_pct=round(max(0.0, min(100.0, 100.0 - water_dist / 30.0)), 1),
            drainage_density=round(0.1 + (hydro_risk / 100.0) * 2.5, 3),
            river_proximity_risk=river_risk,
        )

        history = FloodHistory(
            historical_events_count=rain["high_rain_days"],
            annual_rainfall_mm=round(rain["annual_mean_mm"], 1),
            flood_history_score=round(rain_risk, 2),
        )

        llai = LowLyingAreaIndex(
            mean=round(llai_risk, 2),
            min=round(max(0.0, llai_risk - 12.0), 2),
            max=round(min(100.0, llai_risk + 12.0), 2),
            primary_risk_category=self._risk_category(llai_risk),
        )

        metadata = FloodMetadata(
            latitude=request.latitude,
            longitude=request.longitude,
            radius_meters=request.radius_meters,
            data_source=(
                "Open-Meteo (SRTM elevation + ERA5 precipitation · 5-year daily) "
                "· OSM Overpass (water body proximity)"
            ),
            gee_enabled=False,
        )

        return FloodReport(
            overall_score=overall,
            risk_category=risk_category,
            component_scores=FloodComponentScores(
                elevation_risk=elev_risk,
                hydrology_risk=hydro_risk,
                historical_risk=rain_risk,
                llai_risk=llai_risk,
            ),
            elevation=elevation,
            hydrology=hydrology,
            flood_history=history,
            llai=llai,
            recommendations=self._recommendations(risk_category, river_risk, rain),
            visualization_urls={"risk_map": "", "components_map": ""},
            metadata=metadata,
        )

    # ── data fetchers ──────────────────────────────────────────────────────

    def _fetch_elevation(self, client: httpx.Client, lat: float, lon: float) -> float:
        resp = client.get(_OPENMETEO_ELEVATION, params={"latitude": lat, "longitude": lon})
        resp.raise_for_status()
        data = resp.json()
        elev = data.get("elevation")
        if isinstance(elev, list) and elev:
            return float(elev[0])
        if isinstance(elev, (int, float)):
            return float(elev)
        return 50.0

    def _fetch_rain(self, client: httpx.Client, lat: float, lon: float) -> dict:
        end   = date.today()
        start = end - timedelta(days=5 * 365)
        resp  = client.get(_OPENMETEO_ARCHIVE, params={
            "latitude": lat,
            "longitude": lon,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "daily": "precipitation_sum",
            "timezone": "auto",
        })
        resp.raise_for_status()
        vals = [
            v for v in resp.json().get("daily", {}).get("precipitation_sum", [])
            if v is not None
        ]
        if not vals:
            return {"annual_mean_mm": 800.0, "max_daily_mm": 80.0, "high_rain_days": 5}
        years = max(1.0, len(vals) / 365.0)
        return {
            "annual_mean_mm": sum(vals) / years,
            "max_daily_mm":   max(vals),
            "high_rain_days": sum(1 for v in vals if v > 100.0),
        }

    def _fetch_water_distance(
        self, client: httpx.Client, lat: float, lon: float, radius_m: float
    ) -> float:
        search_r = max(radius_m, 5000.0)
        query = (
            f"[out:json][timeout:20];\n"
            f"(\n"
            f"  way[waterway~\"^(river|stream|canal)$\"](around:{search_r:.0f},{lat},{lon});\n"
            f"  node[natural=water](around:{search_r:.0f},{lat},{lon});\n"
            f"  way[natural=water](around:{search_r:.0f},{lat},{lon});\n"
            f");\n"
            f"out center 30;"
        )
        try:
            resp = client.post(_OVERPASS_URL, data={"data": query}, timeout=25)
            resp.raise_for_status()
            elements = resp.json().get("elements", [])
        except Exception:
            return search_r  # conservative fallback: no water found

        min_dist = float(search_r)
        for el in elements:
            clat = el.get("lat") or (el.get("center") or {}).get("lat")
            clon = el.get("lon") or (el.get("center") or {}).get("lon")
            if clat is None or clon is None:
                continue
            dist = self._haversine(lat, lon, float(clat), float(clon))
            if dist < min_dist:
                min_dist = dist
        return min_dist

    # ── risk scoring ────────────────────────────────────────────────────────

    @staticmethod
    def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        p = math.pi / 180
        a = (
            math.sin((lat2 - lat1) * p / 2) ** 2
            + math.cos(lat1 * p) * math.cos(lat2 * p)
            * math.sin((lon2 - lon1) * p / 2) ** 2
        )
        return 2 * 6_371_000 * math.asin(math.sqrt(a))

    @staticmethod
    def _elevation_risk(elev_m: float) -> float:
        if elev_m < 10:  return 85.0  # coastal / delta
        if elev_m < 50:  return 65.0  # low-lying
        if elev_m < 100: return 45.0  # slightly elevated
        if elev_m < 300: return 30.0  # hilly
        return 15.0                   # plateau / highland

    @staticmethod
    def _rain_risk(rain: dict) -> float:
        max_daily = rain["max_daily_mm"]
        annual    = rain["annual_mean_mm"]
        # Largest single-day event is the primary flood trigger
        if max_daily > 200: risk = 80.0
        elif max_daily > 150: risk = 65.0
        elif max_daily > 100: risk = 50.0
        elif max_daily > 60:  risk = 35.0
        else:                 risk = 20.0
        # Annual total modulates background risk
        if annual > 2000:   risk = min(100.0, risk + 15.0)
        elif annual > 1000: risk = min(100.0, risk + 5.0)
        return risk

    @staticmethod
    def _hydro_risk(water_dist_m: float) -> float:
        if water_dist_m < 100:  return 90.0
        if water_dist_m < 300:  return 70.0
        if water_dist_m < 600:  return 50.0
        if water_dist_m < 1500: return 30.0
        return 15.0

    @staticmethod
    def _risk_category(score: float) -> str:
        if score < 20: return "Very Low"
        if score < 40: return "Low"
        if score < 60: return "Moderate"
        if score < 80: return "High"
        return "Very High"

    @staticmethod
    def _recommendations(category: str, river_risk: str, rain: dict) -> list[str]:
        recs = [
            "Review site grading and stormwater discharge routes.",
            f"Design drainage for {rain['max_daily_mm']:.0f} mm/day peak event "
            f"(5-year maximum, Open-Meteo ERA5).",
        ]
        if river_risk == "High":
            recs.append(
                "Site within 300 m of water body — elevate plinth minimum 600 mm "
                "and provide retaining bund/barrier."
            )
        if category in {"High", "Very High"}:
            recs.extend([
                "Elevate critical infrastructure above projected flood levels.",
                "Commission site-specific hydrological study before development.",
            ])
        elif category == "Moderate":
            recs.append("Improve surface permeability and runoff capture.")
        else:
            recs.append("Maintain clear runoff paths and regular drainage maintenance.")
        return recs
