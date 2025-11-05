"""Scenario runtime instantiation utilities."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Final

import icontract
from pydantic import BaseModel, Field

from networking_practice.scenarios.models import CharacterMood, CharacterTemplate


class TopicFocus(BaseModel):
    """Single-session selection of topics to anchor prompts."""

    interest: str = Field(min_length=1)
    recent_project: str = Field(min_length=1)
    pain_point: str = Field(min_length=1)

    model_config = {"extra": "forbid"}


class CharacterSessionSeed(BaseModel):
    """Runtime parameters sampled from a template at session start."""

    stress_level: int = Field(ge=0, le=100)
    starting_mood: CharacterMood
    topic_focus: TopicFocus

    model_config = {"extra": "forbid"}


@dataclass(frozen=True)
class CharacterPersonaInstance:
    """Concrete persona instantiation combining template and sampled traits."""

    template: CharacterTemplate
    seed: CharacterSessionSeed


_DEFAULT_RANDOM: Final[random.Random] = random.Random()


def _select_topic(choices: tuple[str, ...], rng: random.Random) -> str:
    index = rng.randrange(0, len(choices))
    return choices[index]


@icontract.require(lambda template: len(template.randomized_traits.possible_moods) > 0)
@icontract.require(lambda rng: isinstance(rng, random.Random) if rng is not None else True)
def instantiate_persona(
    template: CharacterTemplate,
    *,
    rng: random.Random | None = None,
) -> CharacterPersonaInstance:
    """Instantiate a character template with sampled runtime attributes."""

    generator = rng if rng is not None else _DEFAULT_RANDOM

    moods = template.randomized_traits.possible_moods
    stress_min, stress_max = template.randomized_traits.stress_level_range

    mood_index = generator.randrange(0, len(moods))
    stress_level = generator.randint(stress_min, stress_max)

    pools = template.randomized_traits.topic_pools
    topic_focus = TopicFocus(
        interest=_select_topic(pools.interests, generator),
        recent_project=_select_topic(pools.recent_projects, generator),
        pain_point=_select_topic(pools.pain_points, generator),
    )

    seed = CharacterSessionSeed(
        stress_level=stress_level,
        starting_mood=moods[mood_index],
        topic_focus=topic_focus,
    )
    return CharacterPersonaInstance(template=template, seed=seed)


__all__ = ["CharacterPersonaInstance", "CharacterSessionSeed", "TopicFocus", "instantiate_persona"]
