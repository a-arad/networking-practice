"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from networking_practice.api.v1.router import router as api_router
from networking_practice.core.config import Settings, get_settings
from networking_practice.core.logging import configure_logging, get_logger

logger = get_logger(__name__)


def _build_cors_origins(settings: Settings) -> list[str]:
    """Parse CORS origins from settings.

    Args:
        settings: Application settings.

    Returns:
        List of allowed CORS origins.
    """
    return [origin.strip() for origin in settings.allowed_origins if origin.strip()]


@asynccontextmanager
async def create_lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan context manager.

    Args:
        app: FastAPI application instance.

    Yields:
        None during application lifetime.
    """
    settings = get_settings()
    logger.info(
        "Starting application",
        extra={"environment": settings.environment},
    )

    yield

    logger.info("Application shutdown complete")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Returns:
        Configured FastAPI application instance.
    """
    settings = get_settings()
    configure_logging(settings.log_level)

    logger.info(
        "Creating FastAPI application",
        extra={"environment": settings.environment},
    )

    application = FastAPI(
        title="Networking Practice API",
        version="0.2.0",
        description="Turn-based voice conversation practice with AI personas",
        debug=settings.debug,
        lifespan=create_lifespan,
    )

    # Configure CORS
    application.add_middleware(
        CORSMiddleware,
        allow_origins=_build_cors_origins(settings),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register API router
    application.include_router(api_router)

    # Root endpoint
    @application.get("/", include_in_schema=False)
    async def root():
        return {
            "name": "Networking Practice API",
            "version": "0.2.0",
            "architecture": "turn-based (Whisper → Chat Completions → TTS)",
            "docs": "/docs",
        }

    # Health check endpoint
    @application.get("/health", include_in_schema=False)
    async def health():
        return {"status": "healthy"}

    logger.info("Application initialized")

    return application


# Create application instance
app = create_app()


__all__ = ["app", "create_app"]
