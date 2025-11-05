import { useMemo } from "react";
import type { CharacterSessionState, TurnAnalysis } from "../types/session";

interface ConversationAlertsProps {
  readonly state: CharacterSessionState | null;
  readonly latestAnalysis: TurnAnalysis | null;
}

export function ConversationAlerts({ state, latestAnalysis }: ConversationAlertsProps) {
  const warnings = useMemo(() => {
    const entries: Array<{ type: "warning" | "info"; message: string; key: string }> = [];
    if (state?.is_in_warning_state) {
      entries.push({
        type: "warning",
        key: "patience-warning",
        message: `Persona patience is critical. ${state.warning_turns_remaining ?? 0} turns remaining before the conversation ends.`
      });
    }
    if (latestAnalysis?.evaluation_failure_reason) {
      entries.push({
        type: "info",
        key: "evaluation-failure",
        message: `Evaluation warning: ${latestAnalysis.evaluation_failure_reason}`
      });
    }
    if (latestAnalysis?.response_failure_reason) {
      entries.push({
        type: "info",
        key: "response-failure",
        message: `Assistant fallback reason: ${latestAnalysis.response_failure_reason}`
      });
    }
    return entries;
  }, [latestAnalysis?.evaluation_failure_reason, latestAnalysis?.response_failure_reason, state?.is_in_warning_state, state?.warning_turns_remaining]);

  if (warnings.length === 0) {
    return null;
  }

  return (
    <section className="alert-stack" aria-live="polite">
      {warnings.map((entry) => (
        <div key={entry.key} className={`alert alert-${entry.type}`}>
          <span className="alert-icon" aria-hidden="true">{entry.type === "warning" ? "⚠️" : "ℹ️"}</span>
          <span>{entry.message}</span>
        </div>
      ))}
    </section>
  );
}

