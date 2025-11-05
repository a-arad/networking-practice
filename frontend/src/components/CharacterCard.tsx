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
  const stressPercentage = state.stress_level;

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
                className={`stat-bar-fill patience ${isWarning ? 'warning' : ''}`}
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
              <span className="mood-icon-display">{moodEmoji[state.current_mood] || "😐"}</span>
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
                className="stat-bar-fill mood"
                style={{ width: `${stressPercentage}%` }}
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
