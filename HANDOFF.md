# Developer Handoff: Networking Practice v2

## Status: Backend Complete, Frontend Needs HTTP Client

**Project**: `/Users/aradnamin/repos/networking-practice-v2`
**Architecture**: Turn-based voice (Whisper → Chat Completions → TTS)
**Backend**: ✅ Working, tested, API key configured
**Frontend**: ⚠️ Copied but needs WebSocket→HTTP migration

---

## Backend API (Ready to Use)

### Running
```bash
cd /Users/aradnamin/repos/networking-practice-v2
uv run uvicorn networking_practice.app:app --reload
```

Server: `http://localhost:8000`
Docs: `http://localhost:8000/docs`

### Endpoints

**Create Session**
```bash
POST /api/v1/conversations
Body: {"scenario_id": null}  # null = random persona
Returns: {session_id, persona{name, role, backstory, ...}, state{mood, patience, ...}}
```

**Process Voice Turn**
```bash
POST /api/v1/conversations/{session_id}/turns
Form-data: audio=<file>  # WebM/MP3/WAV
Returns: MP3 audio + headers X-User-Text, X-Assistant-Text
Flow: Audio → Whisper → GPT-4o → TTS → MP3
```

**Evaluate Transcript**
```bash
POST /api/v1/evaluation
Body: {transcript: {metadata, turns}}
Returns: {overall_score, dimensions: [{dimension, score, rationale}]}
```

---

## Frontend Task: WebSocket → HTTP Migration

**Location**: `frontend/`
**Framework**: React + TypeScript + Vite + Zustand

### Files to Change

1. **`src/services/realtimeRelayClient.ts`** → DELETE, replace with:

```typescript
// src/services/voiceClient.ts
export class VoiceClient {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  async startRecording(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (e) => this.audioChunks.push(e.data);
    this.mediaRecorder.start();
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        resolve(audioBlob);
      };
      this.mediaRecorder!.stop();
    });
  }

  async sendAudio(sessionId: string, audioBlob: Blob): Promise<{
    audioResponse: Blob;
    userText: string;
    assistantText: string;
  }> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    const response = await fetch(
      `http://localhost:8000/api/v1/conversations/${sessionId}/turns`,
      { method: 'POST', body: formData }
    );

    return {
      audioResponse: await response.blob(),
      userText: response.headers.get('X-User-Text') || '',
      assistantText: response.headers.get('X-Assistant-Text') || '',
    };
  }

  playAudio(audioBlob: Blob): void {
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    audio.play();
  }
}
```

2. **Update conversation flow** (likely in `src/hooks/useConversation.ts` or similar):

```typescript
// OLD: WebSocket bidirectional streaming
// NEW: Record → POST → Play → Repeat

const voiceClient = new VoiceClient();

// When user presses "Record"
await voiceClient.startRecording();

// When user releases "Record"
const audioBlob = await voiceClient.stopRecording();
const { audioResponse, userText, assistantText } =
  await voiceClient.sendAudio(sessionId, audioBlob);

// Update transcript
addMessageToTranscript({ role: 'user', content: userText });
addMessageToTranscript({ role: 'assistant', content: assistantText });

// Play response
voiceClient.playAudio(audioResponse);
```

3. **Update `src/services/apiClient.ts`**:
   - Session creation already works (same endpoint)
   - Remove WebRTC/WebSocket setup
   - Add `processVoiceTurn()` method

---

## Quick Test Without Frontend

```bash
# 1. Create session
SESSION=$(curl -s -X POST http://localhost:8000/api/v1/conversations \
  -H "Content-Type: application/json" -d '{}' | jq -r '.session_id')

# 2. Record audio (any tool: QuickTime, sox, ffmpeg)
# Save as recording.webm

# 3. Send audio
curl -X POST "http://localhost:8000/api/v1/conversations/${SESSION}/turns" \
  -F "audio=@recording.webm" \
  -v \
  -o response.mp3

# 4. Play response
afplay response.mp3  # macOS

# Check headers for transcripts
```

---

## Minimal HTML Demo (No Build Required)

```html
<!-- test.html -->
<!DOCTYPE html>
<html>
<body>
  <button id="start">Start Recording</button>
  <button id="stop" disabled>Stop & Send</button>
  <div id="status"></div>

  <script>
    let mediaRecorder, chunks = [], sessionId;
    const status = document.getElementById('status');

    // Create session on load
    fetch('http://localhost:8000/api/v1/conversations', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({})
    })
    .then(r => r.json())
    .then(data => {
      sessionId = data.session_id;
      status.textContent = `Session: ${data.persona.name}`;
    });

    document.getElementById('start').onclick = async () => {
      chunks = [];
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => chunks.push(e.data);
      mediaRecorder.start();

      document.getElementById('start').disabled = true;
      document.getElementById('stop').disabled = false;
      status.textContent = 'Recording...';
    };

    document.getElementById('stop').onclick = () => {
      mediaRecorder.stop();
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, {type: 'audio/webm'});
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        status.textContent = 'Processing...';

        const response = await fetch(
          `http://localhost:8000/api/v1/conversations/${sessionId}/turns`,
          {method: 'POST', body: formData}
        );

        const userText = response.headers.get('X-User-Text');
        const assistantText = response.headers.get('X-Assistant-Text');
        const audioResponse = await response.blob();

        status.innerHTML = `
          You: ${userText}<br>
          AI: ${assistantText}
        `;

        const audio = new Audio(URL.createObjectURL(audioResponse));
        audio.play();

        document.getElementById('start').disabled = false;
        document.getElementById('stop').disabled = true;
      };
    };
  </script>
</body>
</html>
```

Save as `test.html`, open in Chrome/Firefox. Requires HTTPS or localhost.

---

## Architecture Notes

**Why turn-based over Realtime API?**
- Cost: $0.15/min vs $0.22-0.50/min
- Latency: 500ms acceptable for practice scenarios
- Simplicity: Linear pipeline, no WebSocket state management
- Debugging: Easy to log/inspect each stage
- Quality: Can swap TTS providers

**Current models** (in `.env`):
- Whisper: `whisper-1`
- Chat: `gpt-4o`
- TTS: `tts-1`
- Eval: `gpt-4o-mini`

**Session state** (in-memory):
- Stores messages, persona, patience/mood
- Returns OpenAI-compatible history
- Patience decay not yet wired to chat context

---

## Code Quality

- **Type safety**: Pydantic models with validation
- **Error handling**: Returns from `returns` library
- **Logging**: Structured JSON logging
- **Testing**: No tests yet (migrated domain logic has tests in original)

---

## Next Steps Priority

1. **[15 min]** Test with `test.html` to validate full pipeline
2. **[60 min]** Migrate React frontend to HTTP client
3. **[30 min]** Add loading states, error handling in UI
4. **[Later]** Streaming chat completions (async endpoint)
5. **[Later]** Patience decay → dynamic persona behavior

---

## Migration from Pipecat

**Kept (85% of code)**:
- `scenarios/`: 8 persona templates, loader, runtime
- `evaluation/`: Heuristic + LLM scoring
- `conversation/models.py`: Domain models
- `core/`: Config, logging

**New (15% of code)**:
- `conversation/voice_service.py`: Whisper→Chat→TTS pipeline
- `api/v1/endpoints/conversations.py`: HTTP endpoints
- Session manager refactored to use domain models

**Removed**:
- Pipecat dependency
- WebRTC transport
- WebSocket relay (260 lines)

---

## Files Changed Summary

```
New:
  conversation/voice_service.py         (200 lines)
  api/v1/endpoints/conversations.py     (200 lines)

Modified:
  conversation/session_manager.py       (refactored)
  core/config.py                        (turn-based models)
  scenarios/prompt.py                   (+1 alias function)

Migrated as-is:
  scenarios/*                           (8 templates, loader, models)
  evaluation/*                          (scoring system)
  conversation/models.py                (domain models)
```

---

## Questions?

- Backend: Works, tested with cURL
- API key: Configured in `.env`
- Server: Running on localhost:8000
- Frontend: Needs `realtimeRelayClient.ts` → HTTP client swap

**Bottleneck**: Frontend WebSocket→HTTP migration (~1 hour of work)
