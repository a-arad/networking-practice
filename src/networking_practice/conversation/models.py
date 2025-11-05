"""Conversation domain models validated via Pydantic."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Iterable

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator


class ParticipantRole(str, Enum):
    """The supported conversation participant roles."""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class TurnMessage(BaseModel):
    """Single utterance emitted by either participant."""

    message_id: Annotated[str, Field(min_length=1)]
    role: ParticipantRole
    utterance: Annotated[str, Field(min_length=1)]
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {
        "extra": "forbid",
        "populate_by_name": True,
    }

    @field_validator("role")
    @classmethod
    def _restrict_role(cls, value: ParticipantRole) -> ParticipantRole:
        if value not in {ParticipantRole.USER, ParticipantRole.ASSISTANT}:
            msg = "turn messages only support user or assistant roles"
            raise ValueError(msg)
        return value

    @field_validator("utterance")
    @classmethod
    def _strip_and_validate(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            msg = "utterance must contain non-whitespace characters"
            raise ValueError(msg)
        return stripped


class ConversationTurn(BaseModel):
    """Aggregate of a user utterance and subsequent assistant responses."""

    turn_id: Annotated[str, Field(min_length=1)]
    user: TurnMessage
    assistant: tuple[TurnMessage, ...] = Field(default_factory=tuple)

    model_config = {
        "extra": "forbid",
        "populate_by_name": True,
    }

    @model_validator(mode="after")
    def _enforce_invariants(self) -> "ConversationTurn":
        if self.user.role is not ParticipantRole.USER:
            msg = "conversation turns must be anchored by a user message"
            raise ValueError(msg)
        for message in self.assistant:
            if message.role is not ParticipantRole.ASSISTANT:
                msg = "assistant collection must contain only assistant messages"
                raise ValueError(msg)
        self._ensure_chronology((self.user, *self.assistant))
        return self

    @staticmethod
    def _ensure_chronology(messages: Iterable[TurnMessage]) -> None:
        previous: datetime | None = None
        for message in messages:
            if previous is not None and message.timestamp < previous:
                msg = "turn messages must be timestamped in non-decreasing order"
                raise ValueError(msg)
            previous = message.timestamp

    @computed_field  # type: ignore[prop-decorator]
    @property
    def message_count(self) -> int:
        """Total number of individual messages inside the turn."""

        return 1 + len(self.assistant)


class ConversationMetadata(BaseModel):
    """Metadata accompanying a conversation transcript."""

    session_id: Annotated[str, Field(min_length=8)]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    label: Annotated[str | None, Field(default=None, max_length=120)] = None

    model_config = {
        "extra": "forbid",
    }


class ConversationTranscript(BaseModel):
    """A validated representation of an ordered conversation."""

    metadata: ConversationMetadata
    turns: tuple[ConversationTurn, ...]

    model_config = {
        "extra": "forbid",
    }

    @field_validator("turns")
    @classmethod
    def _ensure_non_empty(cls, value: tuple[ConversationTurn, ...]) -> tuple[ConversationTurn, ...]:
        if not value:
            msg = "transcript must contain at least one turn"
            raise ValueError(msg)
        return value

    @computed_field  # type: ignore[prop-decorator]
    @property
    def utterance_count(self) -> int:
        """Number of utterances in the transcript."""

        return sum(turn.message_count for turn in self.turns)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def character_count(self) -> int:
        """Total character count across all utterances."""

        return sum(
            len(turn.user.utterance) + sum(len(message.utterance) for message in turn.assistant)
            for turn in self.turns
        )


__all__ = [
    "ParticipantRole",
    "TurnMessage",
    "ConversationTurn",
    "ConversationMetadata",
    "ConversationTranscript",
]
