import { useMemo } from "react";
import { SessionControls } from "./components/SessionControls";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { EvaluationPanel } from "./components/EvaluationPanel";
import { ErrorBanner } from "./components/ErrorBanner";
import { PersonaSummaryCard } from "./components/PersonaSummaryCard";
import { PatienceMeter } from "./components/PatienceMeter";
import { MoodIndicator } from "./components/MoodIndicator";
import { ConversationAlerts } from "./components/ConversationAlerts";
import { useRealtimeSession } from "./hooks/useRealtimeSession";
import { useSessionStore } from "./store/useSessionStore";

export function App() {
  const {
    status,
    streaming,
    turns,
    evaluation,
    evaluationLoading,
    error,
    beginSession,
    pauseSession,
    resumeSession,
    stopSession,
    runCompositeEvaluation
  } = useRealtimeSession();

  const persona = useSessionStore((state) => state.persona);
  const characterState = useSessionStore((state) => state.characterState);

  const latestAnalysis = useMemo(() => {
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const candidate = turns[index]?.analysis;
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }, [turns]);

  return (
    <main className="app-shell">
      {error && <ErrorBanner message={error} />}

      <SessionControls
        status={status}
        streaming={streaming}
        onStart={beginSession}
        onPause={pauseSession}
        onResume={resumeSession}
        onStop={stopSession}
      />

      <section className="hud-grid">
        <PersonaSummaryCard persona={persona} state={characterState} />
        <div className="hud-insights">
          <PatienceMeter state={characterState} />
          <MoodIndicator mood={characterState?.current_mood ?? null} />
          <ConversationAlerts state={characterState} latestAnalysis={latestAnalysis} />
        </div>
      </section>

      <section className="card transcript-card">
        <header className="section-heading">
          <h2>Live Transcript</h2>
        </header>
        <TranscriptPanel turns={turns} />
      </section>

      <EvaluationPanel result={evaluation} loading={evaluationLoading} onEvaluate={runCompositeEvaluation} />
    </main>
  );
}
