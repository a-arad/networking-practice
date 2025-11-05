import type { SessionTurn } from "../types/session";

interface Props {
  readonly turns: SessionTurn[];
}

export function TranscriptPanel({ turns }: Props) {
  if (turns.length === 0) {
    return (
      <div className="transcript-container">
        <p className="transcript-empty">Your conversation will appear here...</p>
      </div>
    );
  }

  return (
    <div className="transcript-container">
      <div className="transcript-list">
        {turns.map((turn) => (
          <div key={turn.turn_id}>
            {/* User Message */}
            <div className="speech-bubble user">
              <div className="bubble-header">You</div>
              <div className="bubble-content">{turn.user.utterance}</div>
              <div className="bubble-timestamp">
                {new Date(turn.user.timestamp).toLocaleTimeString()}
              </div>
            </div>

            {/* Assistant Messages */}
            {turn.assistant.map((message) => (
              <div key={message.message_id} className="speech-bubble assistant">
                <div className="bubble-header">{turn.analysis?.persona.name || "Assistant"}</div>
                <div className="bubble-content">{message.utterance}</div>
                <div className="bubble-timestamp">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
