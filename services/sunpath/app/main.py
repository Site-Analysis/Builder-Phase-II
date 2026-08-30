# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

"""SunPath service — FastAPI app.

Solar position & sun path diagrams (pvlib NREL SPA), shadow analysis,
orientation recommendations and sunlight-hours. Routers mounted at root
to match contracts/sunpath.yaml; health is ungated at /health.
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import verify_token
from app.routers import buildings, health, shadow, sunpath
from app.services.gee_service import GEEService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sunpath")

gee_service = GEEService()


def _parse_cors_origins(raw_value: str) -> list[str]:
    stripped = (raw_value or "").strip()
    if not stripped:
        return ["*"]
    if stripped.startswith("["):
        try:
            parsed = json.loads(stripped)
            if isinstance(parsed, list):
                origins = [str(o).strip() for o in parsed if str(o).strip()]
                return origins or ["*"]
        except json.JSONDecodeError:
            pass
    origins = [o.strip() for o in stripped.split(",") if o.strip()]
    return origins or ["*"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting SunPath API")
    try:
        gee_service.initialize()
        logger.info("Google Earth Engine initialized")
    except Exception as exc:  # noqa: BLE001
        # Graceful degrade — GEE-backed building endpoints disabled, rest works.
        logger.warning("GEE init failed (%s); building extraction disabled", exc)
    logger.info("Service ready")
    yield
    logger.info("Shutting down SunPath API")


app = FastAPI(title="SAT-Platform Backend", lifespan=lifespan)

cors_origins = _parse_cors_origins(os.getenv("CORS_ORIGINS", "*"))
allow_credentials = os.getenv("CORS_ALLOW_CREDENTIALS", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
if "*" in cors_origins:
    allow_credentials = False
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root-mounted routers (no /api/v1 prefix) — matches the contract.
# health.router stays public; data routers require Keycloak Bearer token.
app.include_router(health.router)
app.include_router(sunpath.router, dependencies=[Depends(verify_token)])
app.include_router(shadow.router, dependencies=[Depends(verify_token)])
app.include_router(buildings.router, dependencies=[Depends(verify_token)])
