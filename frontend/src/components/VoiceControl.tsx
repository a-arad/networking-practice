import type { RelayStatus } from "../hooks/useRealtimeSession";

interface VoiceControlProps {
  readonly status: RelayStatus;
  readonly streaming: boolean;
  readonly onStart: () => Promise<void>;
  readonly onPause: () => Promise<void>;
  readonly onResume: () => Promise<void>;
  readonly onStop: () => Promise<void>;
}

export function VoiceControl({ status, streaming, onStart, onPause, onResume, onStop }: VoiceControlProps) {
  const connected = status === "connected";
  const connecting = status === "connecting";
  const isProcessing = connecting && !streaming;

  if (!connected && !connecting) {
    return (
      <div className="session-controls">
        <button
          type="button"
          className="control-button primary"
          onClick={() => void onStart()}
          disabled={false}
        >
          Start Session
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="session-controls">
        <button
          type="button"
          className="control-button secondary"
          onClick={() => void onStop()}
        >
          End Session
        </button>
      </div>

      <div className="voice-control-container">
        <button
          type="button"
          className={`voice-button ${streaming ? 'recording' : ''} ${isProcessing ? 'processing' : ''}`}
          onClick={() => {
            if (streaming) {
              void onPause();
            } else {
              void onResume();
            }
          }}
          disabled={isProcessing}
        >
          <div className="voice-icon">
            {isProcessing ? "⏳" : streaming ? "🎤" : "🎙️"}
          </div>
          <div className="voice-label">
            {isProcessing ? "Processing" : streaming ? "Stop & Send" : "Start Recording"}
          </div>
        </button>
      </div>
    </>
  );
}
