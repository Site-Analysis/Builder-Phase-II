# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Land records endpoints: survey search, RCCMS court cases, mutations, village info,
and hierarchy listing (districts / taluks / hoblis / villages) for dropdown cascade."""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.services import cadastral_service as cs

_LAND_FLAG = "feature.cadastral.land-records"

router = APIRouter(tags=["land-records"])


def _require_flag() -> None:
    enabled = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}
    if _LAND_FLAG not in enabled:
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {_LAND_FLAG}")


@router.get("/search")
def search_survey(q: str = Query(..., min_length=2)) -> list[dict[str, Any]]:
    """Survey number prefix search across all 8.9M indexed Karnataka parcels (max 25 results)."""
    _require_flag()
    return cs.search_survey(q.strip())


@router.get("/rccms")
def get_rccms(
    dist:  str = Query(...),
    taluk: str = Query(...),
    hobli: str = Query(...),
    vlg:   str = Query(...),
) -> list[dict[str, Any]]:
    """RCCMS court cases for a village. All four hierarchy params required."""
    _require_flag()
    return cs.get_rccms(dist, taluk, hobli, vlg)


@router.get("/mutations")
def get_mutations(
    dist:  str = Query(...),
    taluk: str = Query(...),
    hobli: str = Query(...),
    vlg:   str = Query(...),
) -> list[dict[str, Any]]:
    """Mutation (land transfer) records for a village. All four hierarchy params required."""
    _require_flag()
    return cs.get_mutations(dist, taluk, hobli, vlg)


@router.get("/village-info")
def get_village_info(
    dist:  str = Query(...),
    taluk: str = Query(...),
    hobli: str = Query(...),
    vlg:   str = Query(...),
) -> dict[str, Any]:
    """Village name, LGD code, and parcel coverage flag for given hierarchy codes."""
    _require_flag()
    return cs.get_village_info(dist, taluk, hobli, vlg)


@router.get("/village-by-lgd")
def get_village_by_lgd(lgd: str = Query(...)) -> dict[str, Any]:
    """Resolve an LGD village code (from KGIS parcel LGD_VillageCode) to e-Chawadi hierarchy."""
    _require_flag()
    result = cs.get_village_by_lgd(lgd)
    if not result:
        raise HTTPException(status_code=404, detail=f"LGD code {lgd!r} not found in village roster")
    return result


@router.get("/districts")
def list_districts() -> list[dict[str, str]]:
    """Districts with human-readable names, sourced from village_roster (falls back to parquet dirs)."""
    _require_flag()
    return cs.list_districts()


@router.get("/taluks")
def list_taluks(dist: str = Query(..., description="District e-Chawadi code")) -> list[dict[str, str]]:
    """Taluks with names for a given district code."""
    _require_flag()
    return cs.list_taluks(dist)


@router.get("/hoblis")
def list_hoblis(
    dist: str = Query(...),
    taluk: str = Query(...),
) -> list[dict[str, str]]:
    """Hoblis with names for a given district + taluk."""
    _require_flag()
    return cs.list_hoblis(dist, taluk)


@router.get("/villages")
def list_villages(
    dist: str = Query(...),
    taluk: str = Query(...),
    hobli: str = Query(...),
) -> list[dict[str, str]]:
    """Villages with names for a given district + taluk + hobli."""
    _require_flag()
    return cs.list_villages(dist, taluk, hobli)
