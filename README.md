# Networking Practice v2

Voice-based conversation practice with AI personas using turn-based architecture (Whisper STT + Chat Completions + TTS).

## Architecture

```
Audio → Whisper (STT) → Claude Haiku → TTS → Audio Response
```

**Turn-based vs Realtime API:**
- Cost: ~$0.15/min vs $0.22-0.50/min
- Latency: 500ms (acceptable for practice scenarios)
- Simpler debugging, flexible TTS providers, no framework dependencies
- Turn-by-turn evaluation uses GPT-4o-mini

## Stack

**Backend:** Python 3.11+, FastAPI, OpenAI/Anthropic APIs, uv package manager
**Frontend:** React 18, TypeScript, Vite, Zustand

## Setup

```bash
# Install dependencies
uv sync --dev

# Configure environment
cp .env.example .env
# Add OPENAI_API_KEY and ANTHROPIC_API_KEY to .env

# Run backend
uv run uvicorn networking_practice.app:app --reload

# Run frontend (separate terminal)
cd frontend && npm run dev
```

API: `http://localhost:8000`
Frontend: `http://localhost:5173`

## API Endpoints

**Start Session**
```bash
POST /api/v1/conversations
Body: {"scenario_id": null}  # null = random persona
Returns: {session_id, persona, state}
```

**Process Turn**
```bash
POST /api/v1/conversations/{session_id}/turns
Form-data: audio=<file>  # WebM/MP3/WAV
Returns: {session_id, user_text, assistant_text, audio_url, state, persona, evaluation}
```

**Evaluate Transcript**
```bash
POST /api/v1/evaluation
Body: {transcript: {metadata, turns}, focus_role: "user"}
Returns: {overall_score, dimensions: [{dimension, score, rationale}]}
```

## Features

- Dynamic AI personas with randomized traits (mood, stress, patience)
- Real-time evaluation with heuristic + LLM scoring
- Conversation state tracking (patience decay, mood transitions)
- Structured logging with latency metrics

## Development

```bash
# Type checking
uv run mypy --strict src/

# Formatting
uv run ruff format src/
uv run ruff check src/ --fix

# Testing
uv run pytest
```

## License

MIT
