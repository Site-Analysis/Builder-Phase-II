# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import verify_token
from app.routers.land_records import router as land_router
from app.routers.parcels import router as parcel_router
from app.routers.overlays import router as overlay_router

app = FastAPI(
    title="Cadastral Service",
    version="1.0.0",
    description=(
        "Karnataka e-Chawadi (Bhoomi) cadastral data: parcel geometries, RCCMS court cases, "
        "mutation records, road widths, encroachment flags, infrastructure overlays. "
        "Primary land-record source — preferred over KGIS digitization where coverage exists."
    ),
)

_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials="*" not in _origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(land_router, dependencies=[Depends(verify_token)])
app.include_router(parcel_router, dependencies=[Depends(verify_token)])
app.include_router(overlay_router, dependencies=[Depends(verify_token)])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "cadastral"}
