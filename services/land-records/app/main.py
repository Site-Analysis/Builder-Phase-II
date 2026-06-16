from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager

from app.routers.land_records import land_records_router
from app.settings import LandRecordsSettings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("land-records")


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
    logger.info("Starting Land Records API")
    yield
    logger.info("Shutting down Land Records API")


settings = LandRecordsSettings()
app = FastAPI(title="SAT-Platform Land Records Service", lifespan=lifespan)

cors_origins = _parse_cors_origins(settings.cors_origins)
allow_credentials = os.getenv("CORS_ALLOW_CREDENTIALS", "false").lower() in {"1", "true", "yes", "on"}
if "*" in cors_origins:
    allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(land_records_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "land-records"}
