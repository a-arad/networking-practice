"""Application configuration loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application configuration with runtime validation."""

    openai_api_key: str = Field(..., min_length=10, alias="OPENAI_API_KEY")
    environment: Literal["development", "staging", "production"] = Field(
        default="development", alias="ENVIRONMENT"
    )
    debug: bool = Field(default=True, alias="DEBUG")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO", alias="LOG_LEVEL"
    )
    api_host: str = Field(default="0.0.0.0", alias="API_HOST")
    api_port: int = Field(default=8000, alias="API_PORT")
    allowed_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173"], alias="ALLOWED_ORIGINS"
    )
    frontend_url: str = Field(default="http://localhost:5173", alias="FRONTEND_URL")

    # Turn-based voice pipeline models
    whisper_model: str = Field(default="gpt-4o-transcribe", alias="WHISPER_MODEL")
    chat_model: str = Field(default="gpt-4o", alias="CHAT_MODEL")
    tts_model: str = Field(default="gpt-4o-mini-tts", alias="TTS_MODEL")
    tts_voice: str = Field(default="alloy", alias="TTS_VOICE")

    # Chat completion parameters
    chat_temperature: float = Field(default=0.8, alias="CHAT_TEMPERATURE")
    chat_max_tokens: int | None = Field(default=None, alias="CHAT_MAX_TOKENS")

    # Evaluation
    evaluation_model: str = Field(default="gpt-4o-mini", alias="EVALUATION_MODEL")
    evaluation_combined_enabled: bool = Field(default=True, alias="EVALUATION_COMBINED_ENABLED")
    session_store_backend: Literal["memory", "redis"] = Field(
        default="memory",
        alias="SESSION_STORE_BACKEND",
    )
    session_store_ttl_seconds: int = Field(
        default=1800,
        alias="SESSION_STORE_TTL_SECONDS",
        ge=60,
        le=86_400,
    )
    session_store_redis_url: str = Field(
        default="redis://localhost:6379/0",
        alias="SESSION_STORE_REDIS_URL",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        populate_by_name=True,
        env_nested_delimiter=",",
    )


@lru_cache
def get_settings() -> Settings:
    """Return cached settings to reuse validation results."""

    return Settings()


__all__ = ["Settings", "get_settings"]
