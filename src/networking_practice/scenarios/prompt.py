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

    instructions = f"""You're {template.name}, {template.role}. {template.scenario}.

{personality.backstory}

You're {seed.starting_mood.value} right now, stress around {seed.stress_level}/100. Talk {personality.formality.value}, {personality.energy.value} energy.

This is a real conversation, not an interview or presentation. Keep it natural and brief - a sentence or two unless the other person asks for details. Don't list things, don't structure responses, don't offer action items unprompted. Just talk."""

    return instructions


__all__ = ["build_persona_instructions", "format_conversation_prompt"]
