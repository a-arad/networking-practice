"""Conversation session endpoints."""

from __future__ import annotations

import random
import uuid
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from networking_practice.conversation.models import (
    ConversationMetadata,
    ConversationTranscript,
    ConversationTurn,
    ParticipantRole,
    TurnMessage,
)
from networking_practice.conversation.session_manager import get_session_manager
from networking_practice.conversation.voice_service import VoiceConversationService
from networking_practice.core.config import Settings, get_settings
from networking_practice.evaluation.models import EvaluationRequest
from networking_practice.evaluation.service import EvaluationService
from networking_practice.scenarios import CharacterTemplate, instantiate_persona
from networking_practice.scenarios.loader import load_default_templates
from networking_practice.scenarios.models import CharacterMood
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


class DimensionScoreView(BaseModel):
    """Dimension score for frontend."""

    dimension: str
    score: float
    rationale: str


class TurnEvaluationView(BaseModel):
    """Evaluation result for a single turn."""

    dimension_scores: list[DimensionScoreView]
    patience_delta: int
    average_score: float
    previous_mood: str
    new_mood: str
    entered_warning: bool
    exited_warning: bool
    conversation_ended: bool


class TurnResponsePayload(BaseModel):
    """Full response payload for a conversation turn."""

    session_id: str
    user_text: str
    assistant_text: str
    audio_url: str  # Base64 encoded audio
    state: CharacterStateSummary
    persona: PersonaSummary
    evaluation: TurnEvaluationView


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
) -> TurnResponsePayload:
    """Process a voice conversation turn (STT → Chat → TTS) with evaluation.

    Args:
        session_id: Session identifier.
        audio: Audio file from user.
        settings: Application settings.

    Returns:
        Full turn response with state updates and evaluation.

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

        # Process turn (STT → Chat → TTS)
        user_text, assistant_text, audio_response = voice_service.process_turn(
            audio_input=audio_data,
            conversation_history=history,
            instructions=instructions,
            voice=None,  # Use default voice from settings
        )

        # Add messages to session
        user_msg = session.add_message(ParticipantRole.USER, user_text)
        assistant_msg = session.add_message(ParticipantRole.ASSISTANT, assistant_text)

        # Build transcript for evaluation (just this turn)
        turn = ConversationTurn(
            turn_id=f"turn_{uuid.uuid4().hex[:8]}",
            user=user_msg,
            assistant=(assistant_msg,),
        )
        transcript = ConversationTranscript(
            metadata=ConversationMetadata(session_id=session_id),
            turns=(turn,),
        )

        # Evaluate the turn
        evaluation_service = EvaluationService()
        eval_result = evaluation_service.evaluate(
            EvaluationRequest(transcript=transcript, focus_role=ParticipantRole.USER)
        )

        # Calculate state changes based on evaluation
        previous_mood = session.current_mood
        previous_patience = session.current_patience
        was_in_warning = session.warning_turns_remaining is not None

        from returns.result import Success

        if isinstance(eval_result, Success):
            evaluation = eval_result.unwrap()
            avg_score = evaluation.overall_score

            # Calculate patience delta (poor performance costs patience)
            # Score of 1.0 = no change, 0.0 = -15 patience
            patience_delta = int(-15 * (1.0 - avg_score))
            session.decay_patience(abs(patience_delta))

            # Update mood based on average score
            if avg_score >= 0.8:
                session.current_mood = CharacterMood.ENGAGED
            elif avg_score >= 0.6:
                session.current_mood = CharacterMood.CURIOUS
            elif avg_score >= 0.4:
                session.current_mood = CharacterMood.NEUTRAL
            else:
                session.current_mood = CharacterMood.IRRITATED

            # Build evaluation view
            dimension_scores = [
                DimensionScoreView(
                    dimension=dim.dimension.value,
                    score=dim.score,
                    rationale=dim.rationale,
                )
                for dim in evaluation.dimensions
            ]

            eval_view = TurnEvaluationView(
                dimension_scores=dimension_scores,
                patience_delta=patience_delta,
                average_score=avg_score,
                previous_mood=previous_mood.value,
                new_mood=session.current_mood.value,
                entered_warning=not was_in_warning
                and session.warning_turns_remaining is not None,
                exited_warning=False,
                conversation_ended=session.current_patience <= 0,
            )
        else:
            # Evaluation failed - return neutral defaults
            eval_view = TurnEvaluationView(
                dimension_scores=[],
                patience_delta=0,
                average_score=0.5,
                previous_mood=previous_mood.value,
                new_mood=session.current_mood.value,
                entered_warning=False,
                exited_warning=False,
                conversation_ended=False,
            )

        # Build state summary
        state = CharacterStateSummary(
            stress_level=session.stress_level,
            current_mood=session.current_mood.value,
            current_patience=session.current_patience,
            patience_config=PatienceConfig(
                starting_patience=session.persona.template.patience_config.starting_patience,
                warning_threshold=session.persona.template.patience_config.warning_threshold,
            ),
            warning_turns_remaining=session.warning_turns_remaining,
        )

        # Encode audio as base64
        import base64

        audio_b64 = base64.b64encode(audio_response).decode("utf-8")

        # Return full response
        return TurnResponsePayload(
            session_id=session_id,
            user_text=user_text,
            assistant_text=assistant_text,
            audio_url=f"data:audio/mpeg;base64,{audio_b64}",
            state=state,
            persona=_build_persona_summary(session.persona),
            evaluation=eval_view,
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process voice turn: {str(error)}",
        )


__all__ = ["router"]
