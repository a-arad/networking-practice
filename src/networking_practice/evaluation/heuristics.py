"""Deterministic heuristics for conversation evaluation."""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from typing import Final

import icontract

from networking_practice.conversation.models import ConversationTurn, ParticipantRole
from networking_practice.evaluation.models import DimensionScore, EvaluationDimension


_FILLER_WORDS: Final[set[str]] = {
    "um",
    "uh",
    "like",
    "you know",
    "actually",
    "basically",
}

_POSITIVE_WORDS: Final[set[str]] = {
    "great",
    "good",
    "awesome",
    "excited",
    "glad",
    "interested",
    "thanks",
    "appreciate",
    "happy",
    "curious",
}

_NEGATIVE_WORDS: Final[set[str]] = {
    "hate",
    "bad",
    "terrible",
    "awful",
    "worried",
    "nervous",
    "sorry",
    "confused",
}


def _clamp(score: float) -> float:
    return max(0.0, min(1.0, score))


def _collect_utterances(turns: Sequence[ConversationTurn], *, role: ParticipantRole) -> list[str]:
    if role is ParticipantRole.USER:
        return [turn.user.utterance for turn in turns]
    if role is ParticipantRole.ASSISTANT:
        return [message.utterance for turn in turns for message in turn.assistant]
    return []


def _word_count(utterances: Sequence[str]) -> int:
    return sum(len(utterance.split()) for utterance in utterances)


@icontract.require(lambda utterances: len(utterances) > 0)
def _length_score(utterances: Sequence[str]) -> DimensionScore:
    total_words = _word_count(utterances)
    average_words = total_words / len(utterances)
    ideal_min, ideal_max = 8, 25
    if average_words < ideal_min:
        score = average_words / ideal_min
        rationale = "Try elaborating a bit more to provide fuller answers."
    elif average_words > ideal_max:
        score = ideal_max / average_words
        rationale = "Responses are long; tighten them to keep the dialogue balanced."
    else:
        score = 1.0
        rationale = "Great pacing—responses balance detail with brevity."
    return DimensionScore(
        dimension=EvaluationDimension.LENGTH,
        score=_clamp(score),
        rationale=rationale,
    )


@icontract.require(lambda utterances: len(utterances) > 0)
def _question_score(utterances: Sequence[str]) -> DimensionScore:
    question_count = sum(1 for utterance in utterances if "?" in utterance)
    ratio = question_count / len(utterances)
    ideal_ratio = 0.3
    score = 1.0 - abs(ratio - ideal_ratio) / max(ideal_ratio, 1 - ideal_ratio)
    rationale = (
        "Nice mix of questions." if 0.15 <= ratio <= 0.5 else "Mix in a few open-ended questions to show curiosity."
    )
    return DimensionScore(
        dimension=EvaluationDimension.QUESTIONS,
        score=_clamp(score),
        rationale=rationale,
    )


def _sentiment_score(utterances: Sequence[str]) -> DimensionScore:
    tokens = [token.strip(".,!?;:").lower() for utterance in utterances for token in utterance.split()]
    counts = Counter(tokens)
    positive_hits = sum(counts[word] for word in _POSITIVE_WORDS)
    negative_hits = sum(counts[word] for word in _NEGATIVE_WORDS)
    total_hits = positive_hits + negative_hits
    if total_hits == 0:
        score = 0.5
        rationale = "Neutral tone detected. Add enthusiasm to keep energy high."
    else:
        sentiment_ratio = (positive_hits - negative_hits) / total_hits
        score = (sentiment_ratio + 1) / 2
        rationale = (
            "Warm, positive tone—keep it up!"
            if score > 0.6
            else "Watch for negative phrasing; stay positive and encouraging."
        )
    return DimensionScore(
        dimension=EvaluationDimension.SENTIMENT,
        score=_clamp(score),
        rationale=rationale,
    )


def _flow_score(utterances: Sequence[str]) -> DimensionScore:
    words = [token.strip(".,!?;:").lower() for utterance in utterances for token in utterance.split()]
    filler_hits = sum(1 for word in words if word in _FILLER_WORDS)
    total_words = max(len(words), 1)
    filler_ratio = filler_hits / total_words
    if filler_ratio < 0.05:
        score = 1.0
        rationale = "Smooth delivery without noticeable filler words."
    elif filler_ratio < 0.15:
        score = 0.7
        rationale = "Light filler usage—practice pausing briefly instead."
    else:
        score = 0.3
        rationale = "Frequent filler words detected. Slow down and gather thoughts before speaking."
    return DimensionScore(
        dimension=EvaluationDimension.FLOW,
        score=_clamp(score),
        rationale=rationale,
    )


def evaluate_turns(turns: Sequence[ConversationTurn], *, role: ParticipantRole) -> list[DimensionScore]:
    utterances = _collect_utterances(turns, role=role)
    if not utterances:
        return [
            DimensionScore(
                dimension=EvaluationDimension.LENGTH,
                score=0.0,
                rationale="No utterances provided for evaluation.",
            )
        ]
    scores = [
        _length_score(utterances),
        _question_score(utterances),
        _sentiment_score(utterances),
        _flow_score(utterances),
    ]
    return scores


__all__ = ["evaluate_turns"]
