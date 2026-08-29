# Copyright (c) 2026 Qnit. All rights reserved.
# SPDX-License-Identifier: LicenseRef-Proprietary

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.report import report_router

app = FastAPI(title="Report Service (US-092 GO/NO-GO verdict)", version="1.0.0")

# CORS — the results page (browser) POSTs here cross-origin. Mirror the other services: allow all
# origins by default (dev); override via CORS_ORIGINS (comma-separated) in production.
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials="*" not in _origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(report_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "report"}
