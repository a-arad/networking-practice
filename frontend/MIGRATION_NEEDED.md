# Frontend Migration Needed

The current frontend uses WebSocket/WebRTC for the Realtime API.
Our new backend uses HTTP endpoints for turn-based conversation.

## Changes Required

### 1. Replace `src/services/realtimeRelayClient.ts` with HTTP client

**Old approach (WebSocket)**:
- Connect to WebSocket
- Stream audio bidirectionally
- Real-time audio processing

**New approach (HTTP)**:
- Record audio locally
- POST audio file to `/api/v1/conversations/{session_id}/turns`
- Receive MP3 response
- Play audio response

### 2. Update `src/services/apiClient.ts`

Add new method:
```typescript
async processVoiceTurn(sessionId: string, audioBlob: Blob): Promise<Blob> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  
  const response = await fetch(
    `${API_URL}/api/v1/conversations/${sessionId}/turns`,
    { method: 'POST', body: formData }
  );
  
  return await response.blob(); // Returns MP3 audio
}
```

### 3. Update conversation flow

Instead of continuous WebSocket connection:
1. Record user audio (use MediaRecorder API)
2. Stop recording when user finishes speaking
3. POST audio to backend
4. Wait for response
5. Play response audio
6. Repeat

## Quick Test Option

For quick testing, you can use:
- **cURL** to test the API (see IMPLEMENTATION.md)
- **Postman** or **Insomnia** to upload audio files
- **Browser console** with Fetch API

## Simple Demo Frontend

Would you like me to create a minimal HTML+JS demo page for testing?
