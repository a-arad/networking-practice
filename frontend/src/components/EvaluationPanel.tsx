import type { CombinedEvaluationResult } from "../types/session";

interface Props {
  readonly result: CombinedEvaluationResult | null;
  readonly loading: boolean;
  readonly onEvaluate: () => Promise<void> | void;
}

export function EvaluationPanel({ result, loading, onEvaluate }: Props) {
  return (
    <section className="card">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Feedback</h2>
        <button type="button" className="secondary-button" onClick={() => onEvaluate()} disabled={loading}>
          {loading ? "Scoring…" : "Evaluate Conversation"}
        </button>
      </header>

      {loading && <p>Running evaluations…</p>}

      {!loading && !result && <p>Run an evaluation to see coaching feedback.</p>}

      {!loading && result && (
        <div className="evaluation-grid">
          <div className="evaluation-card">
            <h3>Heuristics</h3>
            <p>
              Score: {(result.heuristics.overall_score * 100).toFixed(0)}%
            </p>
            <ul>
              {result.heuristics.dimensions.map((dimension) => (
                <li key={dimension.dimension}>
                  <strong>{dimension.dimension}</strong>: {(dimension.score * 100).toFixed(0)}% — {dimension.rationale}
                </li>
              ))}
            </ul>
          </div>

          <div className="evaluation-card">
            <h3>LLM Judge</h3>
            <p>
              Rating: <strong>{result.llm.rating.toUpperCase()}</strong>
            </p>
            <p>{result.llm.summary}</p>
            <h4>Action Items</h4>
            <ul>
              {result.llm.action_items.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
