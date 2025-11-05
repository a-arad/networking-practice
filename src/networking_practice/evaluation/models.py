"""Pydantic models describing evaluation inputs and outputs."""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from networking_practice.conversation.models import ConversationTranscript, ParticipantRole


class EvaluationDimension(str, Enum):
    """Dimensions used in heuristic scoring."""

    LENGTH = "length"
    QUESTIONS = "questions"
    SENTIMENT = "sentiment"
    FLOW = "flow"


class DimensionScore(BaseModel):
    """Score for a single evaluation dimension."""

    dimension: EvaluationDimension
    score: Annotated[float, Field(ge=0.0, le=1.0)]
    rationale: Annotated[str, Field(min_length=1)]

    model_config = {
        "extra": "forbid",
    }


class EvaluationRequest(BaseModel):
    """Payload accepted by the evaluation service."""

    transcript: ConversationTranscript
    focus_role: ParticipantRole = ParticipantRole.USER

    model_config = {
        "extra": "forbid",
    }


class EvaluationResult(BaseModel):
    """Aggregated evaluation response."""

    overall_score: Annotated[float, Field(ge=0.0, le=1.0)]
    dimensions: list[DimensionScore]

    model_config = {
        "extra": "forbid",
    }

    @field_validator("dimensions")
    @classmethod
    def _ensure_dimensions_present(cls, value: list[DimensionScore]) -> list[DimensionScore]:
        if not value:
            msg = "at least one dimension score is required"
            raise ValueError(msg)
        return value


__all__ = [
    "EvaluationDimension",
    "DimensionScore",
    "EvaluationRequest",
    "EvaluationResult",
]
