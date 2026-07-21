# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

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
    RAINFALL_CLIMATE_PROFILE = "feature.rainfall.climate-profile"
    RAINFALL_ANOMALY = "feature.rainfall.anomaly"
    RAINFALL_SEASONALITY = "feature.rainfall.seasonality"
    RAINFALL_SITE_ANALYSIS = "feature.rainfall.site-analysis"
    PLANNING_SITE_CAPACITY = "feature.planning.site-capacity"
    PLANNING_ROAD_WIDTH_RESOLVER = "feature.planning.road-width-resolver"
    INFRASTRUCTURE_CONNECTIVITY = "feature.infrastructure.connectivity"
    CONTEXT_GROWTH_PIPELINE = "feature.context.growth-pipeline"
    LAND_RECORDS = "feature.land.records"
    ZONING_LAND_USE = "feature.zoning.land-use"
    ENVIRONMENT_SOIL = "feature.environment.soil"
    ENVIRONMENT_WATER_CONSTRAINTS = "feature.environment.water-constraints"
    GEO_AMENITIES = "feature.geo.amenities"
    GEO_KGIS_CONTEXT = "feature.geo.kgis-context"
    GEO_PARCEL_GEOMETRY = "feature.geo.parcel-geometry"
    GEO_AUTHORITY = "feature.geo.authority"


_enabled: set[str] = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}


def is_enabled(flag: FeatureFlag) -> bool:
    return flag.value in _enabled


def require_flag(flag: FeatureFlag) -> None:
    if not is_enabled(flag):
        raise RuntimeError(f"Feature flag disabled: {flag.value}")
