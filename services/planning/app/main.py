# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import verify_token
from app.routers.planning import planning_router
from app.settings import PlanningSettings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("planning")


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
    logger.info("Starting Planning API")
    yield
    logger.info("Shutting down Planning API")


settings = PlanningSettings()
app = FastAPI(title="SAT-Platform Planning Service", lifespan=lifespan)

cors_origins = _parse_cors_origins(settings.cors_origins)
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

app.include_router(planning_router, dependencies=[Depends(verify_token)])


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "planning"}
