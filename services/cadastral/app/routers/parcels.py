# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""Parcel geometry endpoint: e-Chawadi Bhoomi parcel polygons in WGS84 GeoJSON."""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from app.services import cadastral_service as cs
from app.services import overlay_service as ov

_LAND_FLAG = "feature.cadastral.land-records"

router = APIRouter(tags=["parcels"])


def _require_flag() -> None:
    enabled = {f.strip() for f in os.getenv("FLAGS", "").split(",") if f.strip()}
    if _LAND_FLAG not in enabled:
        raise HTTPException(status_code=403, detail=f"Feature flag disabled: {_LAND_FLAG}")


@router.get("/data")
def get_parcel_data(
    dist:   str | None = Query(None),
    taluk:  str | None = Query(None),
    hobli:  str | None = Query(None),
    vlg:    str | None = Query(None),
    survey: str | None = Query(None, description="Filter to exact survey_no (e.g. '309/*/*')"),
) -> Response:
    """Parcel polygon GeoJSON for a village (prefer all four params — unscoped loads full 1.7 GB lake)."""
    _require_flag()
    geojson = cs.build_geojson(dist, taluk, hobli, vlg, survey)
    return Response(content=geojson, media_type="application/json")


@router.get("/parcels-by-bbox")
def get_parcels_by_bbox(
    bbox: str = Query(..., description="minlng,minlat,maxlng,maxlat"),
) -> Response:
    """Parcel GeoJSON for all e-Chawadi covered villages intersecting bbox.

    Features include dist/taluk/hobli/vlg props so the client can fetch RCCMS + mutations.
    First call loads lgd_villages.parquet (418 MB) — expect 5–10 s cold start.
    """
    _require_flag()
    geojson = ov.parcels_by_bbox(bbox, cs.RCCMS_DB, cs.DATA_DIR)
    return Response(content=geojson, media_type="application/json")
