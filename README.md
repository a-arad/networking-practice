# Conversation Practice

Voice-based conversation practice with AI personas using turn-based architecture (Whisper STT + Chat Completions + TTS).

## Architecture

**Conversation Pipeline (per turn):**
```
User Audio → Whisper STT → Claude Haiku → TTS → Audio Response
                                ↓
                         GPT-4o-mini Evaluation
                         (patience, mood, scores)
```

## Stack

**Backend:** Python 3.11+, FastAPI, OpenAI/Anthropic APIs, uv package manager

**Frontend:** React 18, TypeScript, Vite, Zustand

## Setup

```bash
# dependencies
uv sync --dev
# environment
cp .env.example .env
# launch backend
uv run uvicorn networking_practice.app:app --reload
# launch frontend
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
# type checking
uv run mypy --strict src/
# formatting
uv run ruff format src/
uv run ruff check src/ --fix
# testing
uv run pytest
```

## License

MIT
