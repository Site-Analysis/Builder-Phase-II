"""Feature-flag gating.

Reads the FLAGS env var directly (comma-separated) — `packages/flags` is
outside the Docker build context, so services enforce flags in-process.
Mirrors the temperature service convention.
"""

from __future__ import annotations

import os

from fastapi import HTTPException

SUNPATH_FLAG = "feature.sunpath.diagram"
SOLAR_DAY_FLAG = "feature.sunpath.solar-day"


def is_enabled(flag: str) -> bool:
    enabled = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}
    return flag in enabled


def require_sunpath_flag() -> None:
    """FastAPI dependency — 403 when the sunpath flag is off."""
    if not is_enabled(SUNPATH_FLAG):
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {SUNPATH_FLAG}")


def require_solar_day_flag() -> None:
    """FastAPI dependency for the accurate per-date sun endpoint (3D study)."""
    if not is_enabled(SOLAR_DAY_FLAG):
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {SOLAR_DAY_FLAG}")
