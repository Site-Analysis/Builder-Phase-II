from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class InfraSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    cors_origins: str = Field("*", validation_alias="CORS_ORIGINS")
    overpass_url: str = Field("https://overpass-api.de/api/interpreter", validation_alias="OVERPASS_URL")
