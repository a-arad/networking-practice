import type { CharacterMood } from "../types/session";

interface MoodIndicatorProps {
  readonly mood: CharacterMood | null;
}

const moodCopy: Record<CharacterMood, { label: string; description: string; icon: string }> = {
  irritated: {
    label: "Irritated",
    description: "Persona is close to disengaging — refocus quickly.",
    icon: "⚠️"
  },
  neutral: {
    label: "Reserved",
    description: "Persona is undecided — keep building rapport.",
    icon: "🧭"
  },
  curious: {
    label: "Curious",
    description: "Persona is leaning in — share relevant insights.",
    icon: "🔍"
  },
  engaged: {
    label: "Engaged",
    description: "Persona is invested — nurture the momentum.",
    icon: "🔥"
  }
};

export function MoodIndicator({ mood }: MoodIndicatorProps) {
  if (!mood) {
    return (
      <section className="card mood-card">
        <h3>Mood</h3>
        <p className="mood-placeholder">Mood insights will appear after the first turn.</p>
      </section>
    );
  }

  const entry = moodCopy[mood];

  return (
    <section className={`card mood-card mood-${mood}`}>
      <h3>Mood</h3>
      <div className="mood-indicator" aria-live="polite">
        <span className="mood-icon" aria-hidden="true">{entry.icon}</span>
        <div>
          <p className="mood-label">{entry.label}</p>
          <p className="mood-description">{entry.description}</p>
        </div>
      </div>
    </section>
  );
}
