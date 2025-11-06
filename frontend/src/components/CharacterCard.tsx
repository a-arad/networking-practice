import { useEffect, useRef, useState } from "react";
import type { CharacterSessionState, PersonaSummary } from "../types/session";

interface CharacterCardProps {
  readonly persona: PersonaSummary | null;
  readonly state: CharacterSessionState | null;
}

const moodEmoji: Record<string, string> = {
  irritated: "😤",
  neutral: "😐",
  curious: "🤔",
  engaged: "😊",
};

const moodLabels: Record<string, string> = {
  irritated: "Irritated",
  neutral: "Neutral",
  curious: "Curious",
  engaged: "Engaged",
};

export function CharacterCard({ persona, state }: CharacterCardProps) {
  const [moodTransition, setMoodTransition] = useState(false);
  const prevMoodRef = useRef<string | null>(null);

  // Trigger mood animation on change
  useEffect(() => {
    if (state && prevMoodRef.current && prevMoodRef.current !== state.current_mood) {
      setMoodTransition(true);
      const timer = setTimeout(() => setMoodTransition(false), 150);
      return () => clearTimeout(timer);
    }
    if (state) {
      prevMoodRef.current = state.current_mood;
    }
  }, [state?.current_mood]);

  if (!persona || !state) {
    return (
      <div className="character-card-container">
        <div className="character-card">
          <p className="character-placeholder">Start a session to meet your conversation partner</p>
        </div>
      </div>
    );
  }

  const patiencePercentage = (state.current_patience / state.patience_config.starting_patience) * 100;
  const isWarning = state.is_in_warning_state;
  const isCritical = patiencePercentage <= 15;
  const stressPercentage = state.stress_level;

  // Determine stress intensity class
  const getStressClass = (stress: number) => {
    if (stress >= 90) return 'stress-critical';
    if (stress >= 75) return 'stress-high';
    if (stress >= 50) return 'stress-medium';
    return 'stress-low';
  };

  const stressClass = getStressClass(stressPercentage);

  return (
    <div className="character-card-container">
      <div className="character-card">
        {/* Character Portrait */}
        <div className="character-portrait">
          {persona.name.charAt(0).toUpperCase()}
        </div>

        {/* Character Info */}
        <h1 className="character-name">{persona.name}</h1>
        <p className="character-role">{persona.role}</p>
        <p className="character-scenario">{persona.scenario}</p>

        {/* Live Stats */}
        <div className="character-stats">
          {/* Patience */}
          <div className="stat-item">
            <div className="stat-header">
              <span className="stat-label">Patience</span>
              <span className="stat-value">{state.current_patience}/{state.patience_config.starting_patience}</span>
            </div>
            <div className="stat-bar">
              <div
                className={`stat-bar-fill patience ${isCritical ? 'critical' : isWarning ? 'warning' : ''}`}
                style={{ width: `${Math.max(0, Math.min(100, patiencePercentage))}%` }}
              />
            </div>
            {isWarning && state.warning_turns_remaining !== null && (
              <p style={{ fontSize: '0.85rem', color: 'var(--accent-red)', margin: '0.25rem 0 0 0', fontWeight: 600 }}>
                ⚠️ {state.warning_turns_remaining} turns remaining
              </p>
            )}
          </div>

          {/* Mood */}
          <div className="stat-item">
            <div className="stat-header">
              <span className="stat-label">Mood</span>
              <span className={`mood-icon-display ${moodTransition ? 'mood-transition' : ''}`}>
                {moodEmoji[state.current_mood] || "😐"}
              </span>
            </div>
            <p style={{ fontSize: '1rem', color: 'var(--text-primary)', margin: '0', fontWeight: 600 }}>
              {moodLabels[state.current_mood] || state.current_mood}
            </p>
          </div>

          {/* Stress */}
          <div className="stat-item">
            <div className="stat-header">
              <span className="stat-label">Stress</span>
              <span className="stat-value">{stressPercentage}%</span>
            </div>
            <div className="stat-bar">
              <div
                className={`stat-bar-fill ${stressClass}`}
                style={{
                  width: `${stressPercentage}%`,
                  background: stressPercentage >= 75
                    ? 'linear-gradient(90deg, var(--accent-blue), var(--accent-purple), var(--accent-red))'
                    : stressPercentage >= 50
                    ? 'linear-gradient(90deg, var(--accent-green), var(--accent-yellow))'
                    : 'linear-gradient(90deg, var(--accent-green), var(--accent-blue))'
                }}
              />
            </div>
          </div>
        </div>

        {/* Character Traits */}
        <div className="character-traits">
          <div className="trait-badge">{capitalize(persona.energy)} Energy</div>
          <div className="trait-badge">{capitalize(persona.formality)}</div>
          <div className="trait-badge">{capitalize(persona.openness)}</div>
        </div>
      </div>
    </div>
  );
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
