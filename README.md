# Networking Practice v2

Voice-based networking conversation practice with AI personas using a **turn-based architecture** (Whisper + Chat Completions + TTS).

## Architecture Decision

This project uses a **turn-based (cascading) architecture** rather than OpenAI's Realtime API:

```
User Audio → Whisper (STT) → Chat Completions → TTS → Audio Response
```

### Why Turn-Based?

1. **Cost-effective**: ~$0.15/min vs $0.22-0.50/min for Realtime API
2. **Simpler debugging**: Linear pipeline, easy to inspect each stage
3. **Better audio quality**: Can use premium TTS providers
4. **Sufficient latency**: 500ms is acceptable for networking practice scenarios
5. **Framework-free**: No dependencies on Pipecat/LiveKit/etc.

## Project Structure

```
src/networking_practice/
├── api/              # FastAPI endpoints
├── conversation/     # Voice conversation logic
├── core/            # Config and logging
├── evaluation/      # Transcript evaluation system
└── scenarios/       # AI persona templates and management
```

## Quick Start

### Prerequisites

- Python 3.11+
- [uv](https://github.com/astral-sh/uv) package manager
- OpenAI API key

### Setup

```bash
# Install dependencies
uv sync --dev

# Configure environment
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Run the server
uv run uvicorn networking_practice.app:app --reload
```

## Features

### Persona System
- 8 pre-built AI personas (beginner/intermediate/advanced)
- Randomized traits (mood, stress level, topics)
- Dynamic patience/engagement modeling

### Evaluation System
- Heuristic scoring (length, questions, sentiment, flow)
- LLM-based evaluation with G-EVAL methodology
- Actionable feedback for conversation improvement

### Turn-Based Voice Pipeline
- Whisper transcription (gpt-4o-transcribe)
- Streaming chat completions
- High-quality TTS (gpt-4o-mini-tts with instruction support)

## Development

```bash
# Type checking
uv run mypy --strict src/

# Code formatting
uv run ruff format src/
uv run ruff check src/ --fix

# Testing
uv run pytest
```

## License

[Your License]
