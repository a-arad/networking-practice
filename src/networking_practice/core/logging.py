"""Structured logging configuration."""

from __future__ import annotations

import logging
import sys
from typing import Any


def configure_logging(log_level: str = "INFO") -> None:
    """Configure application logging with structured output."""
    logging.basicConfig(
        level=log_level.upper(),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        stream=sys.stdout,
    )


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance for the given module."""
    return logging.getLogger(name)


__all__ = [
    "configure_logging",
    "get_logger",
]
