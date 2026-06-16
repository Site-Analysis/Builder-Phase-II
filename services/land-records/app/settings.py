from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class LandRecordsSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    cors_origins: str = "*"
    bhoomi_base_url: str = "https://landrecords.karnataka.gov.in"
    bhoomi_timeout_s: int = 15
    ecourts_base_url: str = "https://services.ecourts.gov.in/ecourtindia_v6"
    ecourts_timeout_s: int = 10
