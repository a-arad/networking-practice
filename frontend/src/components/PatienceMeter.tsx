import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterSessionState } from "../types/session";

interface PatienceMeterProps {
  readonly state: CharacterSessionState | null;
}

export function PatienceMeter({ state }: PatienceMeterProps) {
  const progress = useMemo(() => {
    if (!state) {
      return null;
    }
    const { current_patience: current, patience_config } = state;
    const percent = Math.max(0, Math.min(100, Math.round((current / patience_config.starting_patience) * 100)));
    return {
      percent,
      current,
      max: patience_config.starting_patience,
      warningThreshold: patience_config.warning_threshold,
      countdown: state.warning_turns_remaining,
      isWarning: state.is_in_warning_state
    };
  }, [state]);

  const [announcement, setAnnouncement] = useState<string | null>(null);
  const previousWarningRef = useRef<boolean>(false);

  useEffect(() => {
    if (!state) {
      previousWarningRef.current = false;
      setAnnouncement(null);
      return;
    }
    const isWarning = state.is_in_warning_state;
    const previousWarning = previousWarningRef.current;
    if (isWarning && !previousWarning) {
      const turnsRemaining = state.warning_turns_remaining ?? 0;
      setAnnouncement(`Warning: persona patience is critical. ${turnsRemaining} turns remaining.`);
    } else if (!isWarning && previousWarning) {
      setAnnouncement("Persona patience recovered.");
    }
    previousWarningRef.current = isWarning;
  }, [state?.is_in_warning_state, state?.warning_turns_remaining, state]);

  return (
    <section className="card patience-card">
      <header className="patience-header">
        <h3>Patience</h3>
        {state ? <span className="patience-count">{state.current_patience} / {state.patience_config.starting_patience}</span> : <span className="patience-count">&mdash;</span>}
      </header>
      {progress ? (
        <>
          <div
            className={`patience-meter${progress.isWarning ? " warning" : ""}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.max}
            aria-valuenow={progress.current}
            aria-valuetext={`${progress.current} of ${progress.max}`}
          >
            <div className="patience-meter-bar" style={{ width: `${progress.percent}%` }} />
          </div>
          <footer className="patience-meta">
            <span>Warning threshold: {progress.warningThreshold}</span>
            {progress.isWarning && (
              <span className="warning-countdown">Turns remaining: {progress.countdown ?? 0}</span>
            )}
          </footer>
        </>
      ) : (
        <p className="patience-placeholder">Patience information becomes available once a session starts.</p>
      )}
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
    </section>
  );
}
