"""File-backed loading of character templates."""

from __future__ import annotations

import json
from dataclasses import dataclass
from contextlib import ExitStack
from importlib import resources
from pathlib import Path
from typing import Iterable, Tuple

import icontract
from pydantic import ValidationError
from returns.result import Failure, Result, Success

from networking_practice.scenarios.models import CharacterTemplate


DEFAULT_TEMPLATE_PACKAGE = "networking_practice.scenarios.templates"


@dataclass(frozen=True)
class TemplateLoadError(Exception):
    """Domain error describing template loading failures."""

    message: str
    path: str | None = None
    cause: str | None = None

    def __str__(self) -> str:
        location = f" ({self.path})" if self.path else ""
        return f"{self.message}{location}"


def _serialize_failure(message: str, *, path: Path | None = None, cause: Exception | None = None) -> TemplateLoadError:
    cause_summary: str | None
    if cause is None:
        cause_summary = None
    elif isinstance(cause, ValidationError):
        cause_summary = cause.json()
    else:
        cause_summary = str(cause)
    return TemplateLoadError(message=message, path=str(path) if path else None, cause=cause_summary)


@icontract.require(lambda path: path.suffix == ".json")
@icontract.require(lambda path: path.exists())
@icontract.require(lambda path: path.is_file())
def load_template_file(path: Path) -> Result[CharacterTemplate, TemplateLoadError]:
    """Load a single character template from disk."""

    try:
        payload = path.read_text(encoding="utf-8")
    except OSError as error:
        failure = _serialize_failure("failed to read template file", path=path, cause=error)
        return Failure(failure)

    try:
        template = CharacterTemplate.model_validate_json(payload)
    except ValidationError as error:
        failure = _serialize_failure("template validation failed", path=path, cause=error)
        return Failure(failure)
    except json.JSONDecodeError as error:
        failure = _serialize_failure("template file is not valid JSON", path=path, cause=error)
        return Failure(failure)

    return Success(template)


@icontract.require(lambda entries: all(path.suffix == ".json" for path in entries))
def _load_many(entries: Iterable[Path]) -> Result[Tuple[CharacterTemplate, ...], TemplateLoadError]:
    templates: list[CharacterTemplate] = []
    for entry in entries:
        result = load_template_file(entry)
        if isinstance(result, Failure):
            return Failure(result.failure())
        templates.append(result.unwrap())
    if not templates:
        failure = TemplateLoadError("no character templates discovered")
        return Failure(failure)
    return Success(tuple(templates))


@icontract.require(lambda directory: directory.exists())
@icontract.require(lambda directory: directory.is_dir())
def load_templates_from(directory: Path) -> Result[Tuple[CharacterTemplate, ...], TemplateLoadError]:
    """Load all JSON templates within the provided directory."""

    files = sorted(directory.glob("*.json"))
    return _load_many(files)


def load_default_templates() -> Result[Tuple[CharacterTemplate, ...], TemplateLoadError]:
    """Load bundled templates shipped with the package."""

    try:
        package_root = resources.files(DEFAULT_TEMPLATE_PACKAGE)
    except ModuleNotFoundError as error:
        failure = _serialize_failure("default template package cannot be resolved", cause=error)
        return Failure(failure)

    json_entries = sorted(
        (entry for entry in package_root.iterdir() if entry.name.endswith(".json")),
        key=lambda entry: entry.name,
    )
    if not json_entries:
        failure = TemplateLoadError("no character templates discovered")
        return Failure(failure)

    templates: list[CharacterTemplate] = []
    with ExitStack() as stack:
        for entry in json_entries:
            as_path = stack.enter_context(resources.as_file(entry))
            result = load_template_file(as_path)
            if isinstance(result, Failure):
                return Failure(result.failure())
            templates.append(result.unwrap())

    return Success(tuple(templates))


__all__ = [
    "DEFAULT_TEMPLATE_PACKAGE",
    "TemplateLoadError",
    "load_template_file",
    "load_templates_from",
    "load_default_templates",
]
