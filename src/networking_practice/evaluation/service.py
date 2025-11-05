"""Service orchestrating heuristic evaluation."""

from __future__ import annotations

import icontract
from returns.result import Failure, Result, Success

from networking_practice.evaluation.heuristics import evaluate_turns
from networking_practice.evaluation.models import EvaluationRequest, EvaluationResult


class EvaluationError(Exception):
    """Raised when evaluation cannot be completed."""


class EvaluationService:
    """High-level facade used by API endpoints."""

    @icontract.require(lambda request: request.transcript.utterance_count > 0)
    def evaluate(self, request: EvaluationRequest) -> Result[EvaluationResult, EvaluationError]:
        """Evaluate a transcript and return heuristic scores."""

        turns = request.transcript.turns
        try:
            dimension_scores = evaluate_turns(turns, role=request.focus_role)
            overall_score = sum(score.score for score in dimension_scores) / len(dimension_scores)
        except ValueError as error:
            return Failure(EvaluationError(str(error)))

        evaluation_result = EvaluationResult(
            overall_score=overall_score,
            dimensions=dimension_scores,
        )
        return Success(evaluation_result)


__all__ = ["EvaluationService", "EvaluationError"]
