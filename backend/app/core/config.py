import json
import os
from typing import List
from pydantic_settings import BaseSettings


DEFAULT_JWT_SECRET = "your-secret-key-change-in-production"


def _cors_origins() -> List[str]:
    raw = os.getenv("CORS_ORIGINS", "")
    if not raw:
        return [
            "http://localhost:5173",
            "http://localhost:3001",
            "http://localhost:3000",
        ]
    raw = raw.strip()
    if raw.startswith("["):
        return [str(item).strip() for item in json.loads(raw) if str(item).strip()]
    return [item.strip() for item in raw.split(",") if item.strip()]


class Settings(BaseSettings):
    """Application settings."""

    APP_NAME: str = "MediBill"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = os.getenv("APP_ENV", "development")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"

    API_V1_STR: str = "/api/v1"
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = int(os.getenv("PORT", os.getenv("SERVER_PORT", "8000")))

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://medibill_user:medibill_password@postgres:5432/medibill_db",
    )

    JWT_SECRET: str = os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET)
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

    GST_PROVIDER: str = os.getenv("GST_PROVIDER", "gstinapi")
    GSTINAPI_KEY: str | None = os.getenv("GSTINAPI_KEY")
    GSTINAPI_BASE_URL: str = os.getenv("GSTINAPI_BASE_URL", "https://www.gstinapi.in")

    CORS_ORIGINS: List[str] = _cors_origins()
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = ["*"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]

    MAX_UPLOAD_SIZE_MB: int = 10
    UPLOAD_DIR: str = "./uploads"

    class Config:
        case_sensitive = True
        env_file = ".env"


settings = Settings()

if settings.APP_ENV.lower() == "production":
    if settings.JWT_SECRET == DEFAULT_JWT_SECRET or len(settings.JWT_SECRET) < 32:
        raise RuntimeError("Production JWT_SECRET must be explicitly configured and at least 32 characters long")
    if settings.DEBUG:
        raise RuntimeError("DEBUG must be disabled in production")
