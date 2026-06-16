from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class PlanningSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    cors_origins: str = Field("*", validation_alias="CORS_ORIGINS")
