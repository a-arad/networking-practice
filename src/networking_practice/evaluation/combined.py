"""Combined evaluation service merging heuristics with LLM analysis."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

import icontract
from pydantic import BaseModel, Field
from returns.result import Failure, Result, Success

from networking_practice.evaluation.llm import LlmEvaluationError, LlmEvaluationResult
from networking_practice.evaluation.models import EvaluationRequest, EvaluationResult
from networking_practice.evaluation.service import EvaluationService


class EvaluationPipelineError(Exception):
    """Raised when any stage in the combined pipeline fails."""

    def __init__(self, message: str, *, cause: Exception | None = None) -> None:
        super().__init__(message)
        self.cause = cause


class LlmEvaluatorProtocol(Protocol):
    """Structural contract for LLM evaluation services."""

    async def evaluate(self, request: EvaluationRequest) -> Result[LlmEvaluationResult, LlmEvaluationError]:
        ...


class CombinedEvaluationResult(BaseModel):
    """Aggregate result capturing both heuristic and LLM judgements."""

    heuristics: EvaluationResult
    llm: LlmEvaluationResult
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {
        "extra": "forbid",
    }


@dataclass(slots=True)
class CombinedEvaluationService:
    """Facade orchestrating heuristic and LLM evaluations."""

    heuristics_service: EvaluationService
    llm_service: LlmEvaluatorProtocol

    @icontract.require(lambda request: request.transcript.utterance_count > 0)
    async def evaluate(self, request: EvaluationRequest) -> Result[CombinedEvaluationResult, EvaluationPipelineError]:
        heuristics_result = self.heuristics_service.evaluate(request)
        if isinstance(heuristics_result, Failure):
            failure = heuristics_result.failure()
            return Failure(EvaluationPipelineError("Heuristic evaluation failed", cause=failure))

        llm_result = await self.llm_service.evaluate(request)
        if isinstance(llm_result, Failure):
            failure = llm_result.failure()
            return Failure(EvaluationPipelineError("LLM evaluation failed", cause=failure))

        combined = CombinedEvaluationResult(
            heuristics=heuristics_result.unwrap(),
            llm=llm_result.unwrap(),
            generated_at=datetime.now(timezone.utc),
        )
        return Success(combined)


__all__ = [
    "CombinedEvaluationService",
    "CombinedEvaluationResult",
    "EvaluationPipelineError",
]
