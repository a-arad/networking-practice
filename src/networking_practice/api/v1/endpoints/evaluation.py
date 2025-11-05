"""Evaluation endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from returns.result import Failure, Success

from networking_practice.evaluation.models import EvaluationRequest, EvaluationResult
from networking_practice.evaluation.service import EvaluationService

router: APIRouter = APIRouter(prefix="/evaluation")


@router.post("", response_model=EvaluationResult, status_code=status.HTTP_200_OK)
async def evaluate_transcript(payload: EvaluationRequest) -> EvaluationResult:
    """Run heuristic scoring over a validated conversation transcript."""
    service = EvaluationService()
    result = service.evaluate(payload)

    if isinstance(result, Success):
        return result.unwrap()

    if isinstance(result, Failure):
        error = result.failure()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    msg = "Unexpected result variant"
    raise RuntimeError(msg)


__all__ = ["router"]
