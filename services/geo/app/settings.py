from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class GeoSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    cors_origins: str = Field("*", validation_alias="CORS_ORIGINS")
    overpass_url: str = Field("https://overpass.openstreetmap.fr/api/interpreter", validation_alias="OVERPASS_URL")
    overpass_timeout_s: int = Field(30, validation_alias="OVERPASS_TIMEOUT_S")
