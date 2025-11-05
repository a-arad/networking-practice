"""LLM-powered evaluation service leveraging OpenAI models."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Annotated, Any

import icontract
from httpx import AsyncClient, HTTPError
from pydantic import BaseModel, Field, ValidationError
from returns.result import Failure, Result, Success

from networking_practice.evaluation.models import EvaluationDimension, EvaluationRequest


class LlmEvaluationError(Exception):
    """Raised when the LLM-based evaluation fails."""


class LlmDimensionJudgment(BaseModel):
    """Single-dimension evaluation output from the LLM."""

    dimension: EvaluationDimension
    score: Annotated[float, Field(ge=0.0, le=1.0)]
    rating: Annotated[str, Field(pattern=r"^(excellent|good|fair|poor)$")]
    rationale: Annotated[str, Field(min_length=1)]


class LlmEvaluationResult(BaseModel):
    """Structured LLM evaluation payload."""

    overall_score: Annotated[float, Field(ge=0.0, le=1.0)]
    rating: Annotated[str, Field(pattern=r"^(excellent|good|fair|poor)$")]
    summary: Annotated[str, Field(min_length=1)]
    dimensions: list[LlmDimensionJudgment]
    action_items: list[Annotated[str, Field(min_length=1)]]
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {
        "extra": "forbid",
    }


PROMPT_TEMPLATE = """
You are an expert networking conversation coach. Evaluate the participant with role "{focus_role}".

Use the following rubric where the participant should:
- Keep answers concise yet informative (dimension: length)
- Ask clarifying or follow-up questions (dimension: questions)
- Maintain a positive, encouraging tone (dimension: sentiment)
- Speak fluently with minimal filler words (dimension: flow)

Return a JSON object following this schema:
{{
  "overall_score": float between 0 and 1,
  "rating": "excellent" | "good" | "fair" | "poor",
  "summary": string,
  "dimensions": [
    {{
      "dimension": "length" | "questions" | "sentiment" | "flow",
      "score": float between 0 and 1,
      "rating": "excellent" | "good" | "fair" | "poor",
      "rationale": string
    }},
    ...
  ],
  "action_items": [string, ...]
}}

Conversation transcript:
{transcript}
"""


def _format_transcript(request: EvaluationRequest) -> str:
    lines = []
    for turn in request.transcript.turns:
        user_timestamp = turn.user.timestamp.isoformat()
        lines.append(f"{user_timestamp} [{turn.user.role.value}]: {turn.user.utterance}")
        for message in turn.assistant:
            assistant_timestamp = message.timestamp.isoformat()
            lines.append(f"{assistant_timestamp} [{message.role.value}]: {message.utterance}")
    return "\n".join(lines)


def build_prompt(request: EvaluationRequest) -> str:
    """Construct the prompt body for the LLM request."""

    transcript = _format_transcript(request)
    return PROMPT_TEMPLATE.format(focus_role=request.focus_role.value, transcript=transcript)


def _extract_message_content(payload: dict[str, Any]) -> str:
    choices = payload.get("choices", [])
    if not choices:
        raise KeyError("choices")
    message = choices[0]["message"].get("content")
    if isinstance(message, str):
        return message
    if isinstance(message, list):
        segments = [segment.get("text", "") for segment in message if isinstance(segment, dict)]
        return "".join(segments)
    raise TypeError("Unexpected message content format")


def _parse_llm_json(content: str) -> LlmEvaluationResult:
    data = json.loads(content)
    return LlmEvaluationResult.model_validate(data)


@dataclass(slots=True)
class LlmEvaluationService:
    """Service performing LLM-based scoring following G-EVAL style prompts."""

    http_client: AsyncClient
    api_key: str
    model: str

    _ENDPOINT: str = "https://api.openai.com/v1/chat/completions"

    @icontract.require(lambda self: self.api_key.strip() != "")
    @icontract.require(lambda request: request.transcript.utterance_count > 0)
    async def evaluate(self, request: EvaluationRequest) -> Result[LlmEvaluationResult, LlmEvaluationError]:
        prompt = build_prompt(request)
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": "You are a rigorous conversation evaluator."},
                {"role": "user", "content": prompt},
            ],
        }

        try:
            response = await self.http_client.post(
                self._ENDPOINT,
                json=body,
                headers=headers,
                timeout=45.0,
            )
            response.raise_for_status()
        except HTTPError as error:
            return Failure(LlmEvaluationError(str(error)))

        try:
            payload = response.json()
            content = _extract_message_content(payload)
            evaluation = _parse_llm_json(content)
            return Success(evaluation)
        except (KeyError, TypeError, json.JSONDecodeError, ValidationError) as error:
            return Failure(LlmEvaluationError(f"Failed to parse LLM response: {error}"))


__all__ = [
    "LlmEvaluationService",
    "LlmEvaluationError",
    "LlmEvaluationResult",
    "LlmDimensionJudgment",
    "build_prompt",
]
