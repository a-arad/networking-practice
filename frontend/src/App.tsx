import { CharacterCard } from "./components/CharacterCard";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { VoiceControl } from "./components/VoiceControl";
import { ErrorBanner } from "./components/ErrorBanner";
import { useRealtimeSession } from "./hooks/useRealtimeSession";
import { useSessionStore } from "./store/useSessionStore";

export function App() {
  const {
    status,
    streaming,
    turns,
    error,
    beginSession,
    pauseSession,
    resumeSession,
    stopSession,
  } = useRealtimeSession();

  const persona = useSessionStore((state) => state.persona);
  const characterState = useSessionStore((state) => state.characterState);

  return (
    <main className="app-shell">
      {error && (
        <div className="error-banner">{error}</div>
      )}

      <CharacterCard persona={persona} state={characterState} />

      <VoiceControl
        status={status}
        streaming={streaming}
        onStart={beginSession}
        onPause={pauseSession}
        onResume={resumeSession}
        onStop={stopSession}
      />

      <TranscriptPanel turns={turns} />
    </main>
  );
}
