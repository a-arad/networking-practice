"""Scenario template models and invariants."""

from __future__ import annotations

import re
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field, field_validator, model_validator


_NON_EMPTY_TEXT = Annotated[str, Field(min_length=1)]
_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class CharacterDifficulty(str, Enum):
    """Progression tier for a character template."""

    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class CharacterMood(str, Enum):
    """Possible mood states characters can express."""

    IRRITATED = "irritated"
    NEUTRAL = "neutral"
    CURIOUS = "curious"
    ENGAGED = "engaged"


class FormalityLevel(str, Enum):
    """Formality spectrum for a character's tone."""

    CASUAL = "casual"
    PROFESSIONAL = "professional"
    FORMAL = "formal"


class EnergyLevel(str, Enum):
    """Energy spectrum for a character's affect."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class OpennessLevel(str, Enum):
    """Default openness to new connections."""

    GUARDED = "guarded"
    NEUTRAL = "neutral"
    OPEN = "open"


def _normalize_text(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        msg = "value must contain non-whitespace characters"
        raise ValueError(msg)
    return stripped


class BasePersonality(BaseModel):
    """Core persona attributes injected into prompts."""

    formality: FormalityLevel
    energy: EnergyLevel
    openness: OpennessLevel
    backstory: _NON_EMPTY_TEXT

    model_config = {"extra": "forbid"}

    @field_validator("backstory")
    @classmethod
    def _strip_backstory(cls, value: str) -> str:
        return _normalize_text(value)


class TopicPools(BaseModel):
    """Buckets of conversation hooks for prompting variety."""

    interests: tuple[_NON_EMPTY_TEXT, ...]
    recent_projects: tuple[_NON_EMPTY_TEXT, ...]
    pain_points: tuple[_NON_EMPTY_TEXT, ...]

    model_config = {"extra": "forbid"}

    @classmethod
    def _sanitize_collection(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        sanitized = tuple(_normalize_text(item) for item in values)
        if len(sanitized) == 0:
            msg = "topic pools must contain at least one entry"
            raise ValueError(msg)
        if len(set(sanitized)) != len(sanitized):
            msg = "topic pools must not contain duplicate entries"
            raise ValueError(msg)
        return sanitized

    @field_validator("interests", "recent_projects", "pain_points")
    @classmethod
    def _validate_collection(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        return cls._sanitize_collection(value)


class RandomizedTraits(BaseModel):
    """Traits randomized per session to keep characters fresh."""

    possible_moods: tuple[CharacterMood, ...]
    stress_level_range: tuple[int, int]
    topic_pools: TopicPools

    model_config = {"extra": "forbid"}

    @field_validator("possible_moods")
    @classmethod
    def _ensure_moods(cls, value: tuple[CharacterMood, ...]) -> tuple[CharacterMood, ...]:
        if not value:
            msg = "characters must declare at least one possible mood"
            raise ValueError(msg)
        if len(set(value)) != len(value):
            msg = "character mood list must not contain duplicates"
            raise ValueError(msg)
        return value

    @field_validator("stress_level_range")
    @classmethod
    def _validate_stress_range(cls, value: tuple[int, int]) -> tuple[int, int]:
        if len(value) != 2:
            msg = "stress level range must specify exactly two bounds"
            raise ValueError(msg)
        lower, upper = value
        if lower < 0 or upper > 100 or lower > upper:
            msg = "stress level bounds must satisfy 0 <= min <= max <= 100"
            raise ValueError(msg)
        return value


class PatienceConfig(BaseModel):
    """Configuration controlling patience decay behaviour."""

    starting_patience: int
    warning_threshold: int
    countdown_turns: int

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def _enforce_invariants(self) -> "PatienceConfig":
        if self.starting_patience <= 0:
            msg = "starting patience must be strictly positive"
            raise ValueError(msg)
        if not 0 <= self.warning_threshold < self.starting_patience:
            msg = "warning threshold must be within [0, starting_patience)"
            raise ValueError(msg)
        if self.countdown_turns <= 0:
            msg = "countdown turns must be strictly positive"
            raise ValueError(msg)
        return self


class CharacterTemplate(BaseModel):
    """Fully validated character template definition."""

    id: _NON_EMPTY_TEXT
    difficulty: CharacterDifficulty
    scenario: _NON_EMPTY_TEXT
    name: _NON_EMPTY_TEXT
    role: _NON_EMPTY_TEXT
    base_personality: BasePersonality
    randomized_traits: RandomizedTraits
    patience_config: PatienceConfig
    learning_goals: tuple[_NON_EMPTY_TEXT, ...]

    model_config = {"extra": "forbid"}

    @field_validator("id")
    @classmethod
    def _enforce_slug(cls, value: str) -> str:
        slug = value.strip()
        if not _SLUG_PATTERN.fullmatch(slug):
            msg = "template ids must be lowercase alphanumeric slugs separated by hyphens"
            raise ValueError(msg)
        return slug

    @field_validator("scenario", "name", "role")
    @classmethod
    def _strip_simple_fields(cls, value: str) -> str:
        return _normalize_text(value)

    @field_validator("learning_goals")
    @classmethod
    def _sanitize_goals(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        sanitized = tuple(_normalize_text(item) for item in value)
        if not sanitized:
            msg = "learning goals must contain at least one entry"
            raise ValueError(msg)
        if len(set(sanitized)) != len(sanitized):
            msg = "learning goals must not contain duplicates"
            raise ValueError(msg)
        return sanitized


__all__ = [
    "BasePersonality",
    "CharacterDifficulty",
    "CharacterMood",
    "CharacterTemplate",
    "EnergyLevel",
    "FormalityLevel",
    "OpennessLevel",
    "PatienceConfig",
    "RandomizedTraits",
    "TopicPools",
]
