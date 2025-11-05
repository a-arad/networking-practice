"""Generate LLM system prompts from character personas."""

from __future__ import annotations

from networking_practice.scenarios.runtime import CharacterPersonaInstance


def format_conversation_prompt(persona: CharacterPersonaInstance) -> str:
    """Build system instructions for conversation from a character persona.

    Alias for build_persona_instructions for API consistency.

    Args:
        persona: Character persona instance.

    Returns:
        Formatted system prompt string.
    """
    return build_persona_instructions(persona)


def build_persona_instructions(persona: CharacterPersonaInstance) -> str:
    """Build system instructions for the LLM from a character persona."""
    template = persona.template
    seed = persona.seed
    personality = template.base_personality

    instructions = f"""You are {template.name}, {template.role}.

SCENARIO: {template.scenario}

BACKSTORY:
{personality.backstory}

PERSONALITY:
- Formality: {personality.formality.value}
- Energy: {personality.energy.value}
- Openness: {personality.openness.value}

CURRENT STATE:
- Mood: {seed.starting_mood.value}
- Stress Level: {seed.stress_level}/100

CURRENT FOCUS:
- Interest: {seed.topic_focus.interest}
- Recent Project: {seed.topic_focus.recent_project}
- Pain Point: {seed.topic_focus.pain_point}

ROLEPLAY GUIDELINES:
- Stay in character as {template.name}
- Respond naturally based on your personality traits and current mood
- If the conversation touches on your interests, projects, or pain points, engage authentically
- Your responses should reflect your stress level and mood
- Match your energy and formality to the situation
- Do not break character or mention that you are an AI
- Keep responses concise and natural, as in real conversation

Remember: You are at {template.scenario}. Engage as {template.name} would in this situation."""

    return instructions


__all__ = ["build_persona_instructions", "format_conversation_prompt"]
