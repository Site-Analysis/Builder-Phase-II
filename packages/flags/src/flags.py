"""
Feature flag helper for Python services.

Usage:
    from packages.flags.src.flags import is_enabled, FeatureFlag

Enable flags via env var:
    FLAGS=feature.temperature.thermal-profile,feature.wind.analysis
"""

import os
from enum import StrEnum


class FeatureFlag(StrEnum):
    TEMPERATURE_THERMAL_PROFILE = "feature.temperature.thermal-profile"
    FLOOD_RISK_ANALYSIS = "feature.flood.risk-analysis"
    SUNPATH_DIAGRAM = "feature.sunpath.diagram"
    SUNPATH_SOLAR_DAY = "feature.sunpath.solar-day"
    WIND_ANALYSIS = "feature.wind.analysis"
    RAINFALL_ARCHIVE = "feature.rainfall.archive"
    RAINFALL_SUMMARY = "feature.rainfall.summary"
    TERRAIN_ANALYSIS = "feature.terrain.analysis"
    SIMULATION_3D = "feature.simulation.3d"
    ZONING_LAND_USE = "feature.zoning.land-use"
    PLANNING_SITE_CAPACITY = "feature.planning.site-capacity"
    INFRASTRUCTURE_CONNECTIVITY = "feature.infrastructure.connectivity"
    ENVIRONMENT_SOIL = "feature.environment.soil"
    ENVIRONMENT_WATER_CONSTRAINTS = "feature.environment.water-constraints"
    CONTEXT_GROWTH_PIPELINE = "feature.context.growth-pipeline"
    LAND_RECORDS = "feature.land.records"
    GEO_AMENITIES = "feature.geo.amenities"
    GEO_KGIS_CONTEXT = "feature.geo.kgis-context"


_enabled: set[str] = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}


def is_enabled(flag: FeatureFlag) -> bool:
    return flag.value in _enabled


def require_flag(flag: FeatureFlag) -> None:
    if not is_enabled(flag):
        raise RuntimeError(f"Feature flag disabled: {flag.value}")
