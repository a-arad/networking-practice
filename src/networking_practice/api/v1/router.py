"""API v1 router aggregating all endpoints."""

from fastapi import APIRouter

from networking_practice.api.v1.endpoints import conversations, evaluation

router = APIRouter(prefix="/api/v1")

# Register endpoint routers
router.include_router(conversations.router, tags=["conversations"])
router.include_router(evaluation.router, tags=["evaluation"])

__all__ = ["router"]
