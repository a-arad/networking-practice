"""Conversation session endpoints."""

from __future__ import annotations

import random
import uuid
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from networking_practice.conversation.models import ParticipantRole
from networking_practice.conversation.session_manager import get_session_manager
from networking_practice.conversation.voice_service import VoiceConversationService
from networking_practice.core.config import Settings, get_settings
from networking_practice.scenarios import CharacterTemplate, instantiate_persona
from networking_practice.scenarios.loader import load_default_templates
from networking_practice.scenarios.prompt import format_conversation_prompt
from networking_practice.scenarios.runtime import CharacterPersonaInstance

router: APIRouter = APIRouter(prefix="/conversations")


class SessionStartRequest(BaseModel):
    """Request to start a new conversation session."""

    scenario_id: str | None = None

    model_config = {"extra": "forbid"}


class PersonaSummary(BaseModel):
    """Persona summary for the frontend."""

    name: str
    role: str
    scenario: str
    formality: str
    energy: str
    openness: str
    backstory: str
    topic_focus: dict[str, str]


class PatienceConfig(BaseModel):
    """Patience configuration."""

    starting_patience: int
    warning_threshold: int


class CharacterStateSummary(BaseModel):
    """Character state summary."""

    stress_level: int
    current_mood: str
    current_patience: int
    patience_config: PatienceConfig
    warning_turns_remaining: int | None = None


class SessionStartResponse(BaseModel):
    """Response when starting a new session."""

    session_id: str
    persona: PersonaSummary
    state: CharacterStateSummary


def _select_template(
    templates: list[CharacterTemplate], scenario_id: str | None
) -> CharacterTemplate:
    """Select a character template by ID or random."""
    if scenario_id:
        for template in templates:
            if template.id == scenario_id:
                return template
        msg = f"Template '{scenario_id}' not found"
        raise ValueError(msg)

    # Random selection
    return random.choice(templates)


def _build_persona_summary(persona: CharacterPersonaInstance) -> PersonaSummary:
    """Build a persona summary for the API response."""
    template = persona.template
    seed = persona.seed

    return PersonaSummary(
        name=template.name,
        role=template.role,
        scenario=template.scenario,
        formality=template.base_personality.formality.value,
        energy=template.base_personality.energy.value,
        openness=template.base_personality.openness.value,
        backstory=template.base_personality.backstory,
        topic_focus={
            "interest": seed.topic_focus.interest,
            "recent_project": seed.topic_focus.recent_project,
            "pain_point": seed.topic_focus.pain_point,
        },
    )


@router.post("", response_model=SessionStartResponse, status_code=201)
async def start_conversation(
    payload: SessionStartRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> SessionStartResponse:
    """Initialize a persona-driven conversation session.

    Args:
        payload: Request with optional scenario_id.
        settings: Application settings.

    Returns:
        Session information with persona and state.

    Raises:
        HTTPException: If template loading fails.
    """
    from returns.result import Failure

    # Load templates
    templates_result = load_default_templates()
    if isinstance(templates_result, Failure):
        error = templates_result.failure()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load templates: {error.message}",
        )

    templates = list(templates_result.unwrap())

    # Select template
    try:
        template = _select_template(templates, payload.scenario_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))

    # Generate session ID
    session_id = str(uuid.uuid4())

    # Instantiate persona
    persona = instantiate_persona(template, rng=random.Random())

    # Create session in manager
    session_manager = get_session_manager()
    session_manager.create_session(session_id, persona)

    # Build response
    patience_cfg = PatienceConfig(
        starting_patience=template.patience_config.starting_patience,
        warning_threshold=template.patience_config.warning_threshold,
    )

    state = CharacterStateSummary(
        stress_level=persona.seed.stress_level,
        current_mood=persona.seed.starting_mood.value,
        current_patience=template.patience_config.starting_patience,
        patience_config=patience_cfg,
        warning_turns_remaining=None,
    )

    return SessionStartResponse(
        session_id=session_id,
        persona=_build_persona_summary(persona),
        state=state,
    )


@router.post("/{session_id}/turns", status_code=200)
async def process_voice_turn(
    session_id: str,
    audio: Annotated[UploadFile, File(description="Audio file (WebM, MP3, WAV, etc.)")],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    """Process a voice conversation turn (STT → Chat → TTS).

    Args:
        session_id: Session identifier.
        audio: Audio file from user.
        settings: Application settings.

    Returns:
        Audio response (MP3 format).

    Raises:
        HTTPException: If session not found or processing fails.
    """
    # Get session
    session_manager = get_session_manager()
    session = session_manager.get_session(session_id)

    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Read audio data
    audio_data = await audio.read()

    # Create voice service
    voice_service = VoiceConversationService(settings)

    try:
        # Get conversation history
        history = session.get_conversation_history()

        # Format system instructions with persona
        instructions = format_conversation_prompt(session.persona)

        # Process turn
        user_text, assistant_text, audio_response = voice_service.process_turn(
            audio_input=audio_data,
            conversation_history=history,
            instructions=instructions,
            voice=None,  # Use default voice from settings
        )

        # Add messages to session
        session.add_message(ParticipantRole.USER, user_text)
        session.add_message(ParticipantRole.ASSISTANT, assistant_text)

        # URL-encode text for safe HTTP headers
        user_text_encoded = quote(user_text, safe='')
        assistant_text_encoded = quote(assistant_text, safe='')

        # Return audio response
        return Response(
            content=audio_response,
            media_type="audio/mpeg",
            headers={
                "X-User-Text": user_text_encoded,
                "X-Assistant-Text": assistant_text_encoded,
            },
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process voice turn: {str(error)}",
        )


__all__ = ["router"]
