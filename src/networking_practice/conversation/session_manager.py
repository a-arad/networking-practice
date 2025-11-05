"""In-memory session state management for voice conversations."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from networking_practice.conversation.models import ParticipantRole, TurnMessage
from networking_practice.scenarios.models import CharacterMood
from networking_practice.scenarios.runtime import CharacterPersonaInstance


@dataclass
class SessionState:
    """Runtime state for a conversation session."""

    session_id: str
    persona: CharacterPersonaInstance
    current_patience: int
    current_mood: CharacterMood
    stress_level: int
    messages: list[TurnMessage] = field(default_factory=list)
    start_time: float = field(default_factory=time.time)
    warning_turns_remaining: int | None = None

    def add_message(self, role: ParticipantRole, utterance: str) -> TurnMessage:
        """Add a message to the conversation history.

        Args:
            role: The role of the speaker (user or assistant).
            utterance: The message content.

        Returns:
            The created TurnMessage.
        """
        message = TurnMessage(
            message_id=f"msg_{uuid.uuid4().hex[:8]}",
            role=role,
            utterance=utterance,
            timestamp=datetime.now(timezone.utc),
        )
        self.messages.append(message)
        return message

    def get_conversation_history(self) -> list[dict[str, str]]:
        """Get conversation history in OpenAI Chat Completions format.

        Returns:
            List of message dicts with 'role' and 'content' keys.
        """
        return [
            {"role": msg.role.value, "content": msg.utterance} for msg in self.messages
        ]

    def decay_patience(self, amount: int) -> None:
        """Reduce patience by the given amount.

        Args:
            amount: Amount to reduce patience by.
        """
        self.current_patience = max(0, self.current_patience - amount)

        # Check if we've entered warning territory
        warning_threshold = self.persona.template.patience_config.warning_threshold
        if (
            self.current_patience <= warning_threshold
            and self.warning_turns_remaining is None
        ):
            self.warning_turns_remaining = (
                self.persona.template.patience_config.countdown_turns
            )


class SessionManager:
    """In-memory session state manager."""

    def __init__(self) -> None:
        """Initialize session manager with empty session dict."""
        self._sessions: dict[str, SessionState] = {}

    def create_session(
        self,
        session_id: str,
        persona: CharacterPersonaInstance,
    ) -> SessionState:
        """Create a new session with the given persona.

        Args:
            session_id: Unique identifier for the session.
            persona: Character persona instance for this session.

        Returns:
            The created SessionState.
        """
        state = SessionState(
            session_id=session_id,
            persona=persona,
            current_patience=persona.template.patience_config.starting_patience,
            current_mood=persona.seed.starting_mood,
            stress_level=persona.seed.stress_level,
        )
        self._sessions[session_id] = state
        return state

    def get_session(self, session_id: str) -> SessionState | None:
        """Get session state by ID.

        Args:
            session_id: Session identifier.

        Returns:
            SessionState if found, None otherwise.
        """
        return self._sessions.get(session_id)

    def delete_session(self, session_id: str) -> None:
        """Remove session from memory.

        Args:
            session_id: Session identifier to delete.
        """
        self._sessions.pop(session_id, None)

    def list_sessions(self) -> list[str]:
        """List all active session IDs.

        Returns:
            List of session ID strings.
        """
        return list(self._sessions.keys())


# Global singleton instance
_session_manager: SessionManager | None = None


def get_session_manager() -> SessionManager:
    """Get the global session manager instance.

    Returns:
        The singleton SessionManager instance.
    """
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager


__all__ = [
    "SessionState",
    "SessionManager",
    "get_session_manager",
]
