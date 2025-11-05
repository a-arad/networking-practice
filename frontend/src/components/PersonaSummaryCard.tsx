import type { CharacterSessionState, PersonaSummary } from "../types/session";

interface PersonaSummaryCardProps {
  readonly persona: PersonaSummary | null;
  readonly state: CharacterSessionState | null;
}

const difficultyLabels: Record<PersonaSummary["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced"
};

export function PersonaSummaryCard({ persona, state }: PersonaSummaryCardProps) {
  if (!persona || !state) {
    return (
      <section className="card persona-card">
        <header>
          <h2>Persona</h2>
        </header>
        <p className="persona-placeholder">Start a session to see persona details here.</p>
      </section>
    );
  }

  return (
    <section className="card persona-card" aria-live="polite">
      <header className="persona-header">
        <div>
          <h2>{persona.name}</h2>
          <p className="persona-role">{persona.role}</p>
        </div>
        <span className={`persona-difficulty badge badge-${persona.difficulty}`}>{difficultyLabels[persona.difficulty]}</span>
      </header>
      <p className="persona-scenario">Scenario: {persona.scenario}</p>
      <dl className="persona-facts">
        <div>
          <dt>Energy</dt>
          <dd>{capitalize(persona.energy)}</dd>
        </div>
        <div>
          <dt>Formality</dt>
          <dd>{capitalize(persona.formality)}</dd>
        </div>
        <div>
          <dt>Openness</dt>
          <dd>{capitalize(persona.openness)}</dd>
        </div>
        <div>
          <dt>Stress Level</dt>
          <dd>{state.stress_level}</dd>
        </div>
      </dl>
      <section className="persona-topics" aria-label="Current topic focus">
        <h3>Topic Focus</h3>
        <ul>
          <li><strong>Interest:</strong> {persona.topic_focus.interest}</li>
          <li><strong>Recent project:</strong> {persona.topic_focus.recent_project}</li>
          <li><strong>Pain point:</strong> {persona.topic_focus.pain_point}</li>
        </ul>
      </section>
    </section>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
