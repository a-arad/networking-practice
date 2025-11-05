import { useEffect, useRef } from "react";
import { clsx } from "clsx";
import type { SessionTurn } from "../types/session";

interface Props {
  readonly turns: SessionTurn[];
}

export function TranscriptPanel({ turns }: Props) {
  const previousCount = useRef(0);

  useEffect(() => {
    const messageCount = turns.reduce((total, turn) => total + 1 + turn.assistant.length, 0);
    if (messageCount !== previousCount.current) {
      const delta = messageCount - previousCount.current;
      const latestTurn = turns.at(-1);
      const latestAssistant = latestTurn?.assistant.at(-1);
      const latestUser = latestTurn?.user;
      const latestSpeaker = latestAssistant ? "assistant" : latestUser?.role ?? null;
      const latestUtterance = latestAssistant?.utterance ?? latestUser?.utterance ?? null;
      console.info("[TranscriptPanel]", {
        event: "render",
        totalMessages: messageCount,
        delta,
        latestRole: latestSpeaker,
        latestPreview: latestUtterance ? latestUtterance.replace(/\s+/g, " ").trim().slice(0, 80) : null,
        timestamp: new Date().toISOString()
      });
      previousCount.current = messageCount;
    }
  }, [turns]);

  if (turns.length === 0) {
    return <p>No conversation yet. Hold the button to start speaking.</p>;
  }

  return (
    <div className="transcript-list">
      {turns.map((turn) => (
        <section key={turn.turn_id} className="transcript-turn">
          <article className={clsx("transcript-item", turn.user.role)}>
            <span className="speaker">You</span>
            <span>{turn.user.utterance}</span>
            <time dateTime={turn.user.timestamp}>
              {new Date(turn.user.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </time>
          </article>
          {turn.analysis && (
            <article className="turn-analysis" aria-label="Your turn feedback">
              <header className="turn-analysis-header">
                <span className="badge badge-info">Turn insights</span>
                <span className="turn-analysis-score">Avg score: {turn.analysis.evaluation.average_score.toFixed(1)}/10</span>
                <span className="turn-analysis-patience">Patience Δ {formatDelta(turn.analysis.evaluation.patience_delta)}</span>
              </header>
              <div className="turn-analysis-body">
                <p>
                  Mood shift: {capitalize(turn.analysis.evaluation.previous_mood)} → {capitalize(turn.analysis.evaluation.new_mood)}
                </p>
                <ul className="dimension-list">
                  {turn.analysis.evaluation.dimension_scores.map((dimension) => (
                    <li key={dimension.dimension}>
                      <span className="dimension-name">{capitalize(dimension.dimension)}</span>
                      <span className="dimension-score">{(dimension.score * 10).toFixed(1)}</span>
                      <span className="dimension-rationale">{dimension.rationale}</span>
                    </li>
                  ))}
                </ul>
                {turn.analysis.response_failure_reason && (
                  <p className="turn-meta-detail">Assistant fallback reason: {turn.analysis.response_failure_reason}</p>
                )}
                {turn.analysis.evaluation_failure_reason && (
                  <p className="turn-meta-detail">Evaluation warning: {turn.analysis.evaluation_failure_reason}</p>
                )}
              </div>
            </article>
          )}
          {turn.assistant.map((message) => (
            <article key={message.message_id} className={clsx("transcript-item", message.role)}>
              <span className="speaker">{turn.analysis?.persona.name ?? "Coach"}</span>
              <span>{message.utterance}</span>
              <time dateTime={message.timestamp}>
                {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </time>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function formatDelta(value: number): string {
  if (value === 0) {
    return "±0";
  }
  return value > 0 ? `+${value}` : `${value}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
