import { create } from "zustand";
import type {
  CharacterSessionState,
  CombinedEvaluationResult,
  PersonaSummary,
  SessionTurn,
  TurnAnalysis
} from "../types/session";

import type { RelayStatus } from "../hooks/useRealtimeSession";

const ConversationTurnOrder = {
  compare(a: string, b: string): number {
    const parse = (value: string): number => {
      const [, suffix] = value.split("-");
      const parsed = Number.parseInt(suffix ?? "0", 10);
      return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
    };
    return parse(a) - parse(b);
  }
} as const;

interface SessionState {
  status: RelayStatus;
  streaming: boolean;
  turns: SessionTurn[];
  evaluation: CombinedEvaluationResult | null;
  evaluationLoading: boolean;
  error: string | null;
  conversationSessionId: string | null;
  persona: PersonaSummary | null;
  characterState: CharacterSessionState | null;
  turnAnalyses: Record<string, TurnAnalysis>;
  setStatus: (status: RelayStatus) => void;
  setStreaming: (streaming: boolean) => void;
  upsertTurn: (turn: SessionTurn) => void;
  setError: (error: string | null) => void;
  setEvaluation: (result: CombinedEvaluationResult | null) => void;
  setEvaluationLoading: (loading: boolean) => void;
  setConversationSession: (session: {
    sessionId: string;
    persona: PersonaSummary;
    state: CharacterSessionState;
  }) => void;
  recordTurnAnalysis: (turnId: string, analysis: TurnAnalysis) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: "idle",
  streaming: false,
  turns: [],
  evaluation: null,
  evaluationLoading: false,
  error: null,
  conversationSessionId: null,
  persona: null,
  characterState: null,
  turnAnalyses: {},
  setStatus: (status) => set({ status }),
  setStreaming: (streaming) => set({ streaming }),
  upsertTurn: (turn) =>
    set((state) => {
      const existingAnalysis = state.turnAnalyses[turn.turn_id];
      const normalizedTurn: SessionTurn = existingAnalysis ? { ...turn, analysis: existingAnalysis } : turn;
      const index = state.turns.findIndex((existing) => existing.turn_id === turn.turn_id);
      const nextTurns =
        index === -1
          ? [...state.turns, normalizedTurn]
          : state.turns.map((existing, i) => (i === index ? normalizedTurn : existing));
      nextTurns.sort((a, b) => ConversationTurnOrder.compare(a.turn_id, b.turn_id));
      return { turns: nextTurns };
    }),
  setError: (error) => set({ error }),
  setEvaluation: (evaluation) => set({ evaluation }),
  setEvaluationLoading: (evaluationLoading) => set({ evaluationLoading }),
  setConversationSession: ({ sessionId, persona, state }) =>
    set({
      conversationSessionId: sessionId,
      persona,
      characterState: state
    }),
  recordTurnAnalysis: (turnId, analysis) =>
    set((state) => {
      const turnAnalyses = { ...state.turnAnalyses, [turnId]: analysis };
      const turns = state.turns.map((turn) => (turn.turn_id === turnId ? { ...turn, analysis } : turn));
      return {
        turnAnalyses,
        turns,
        characterState: analysis.state,
        persona: analysis.persona
      };
    }),
  reset: () =>
    set({
      status: "idle",
      streaming: false,
      turns: [],
      evaluation: null,
      evaluationLoading: false,
      error: null,
      conversationSessionId: null,
      persona: null,
      characterState: null,
      turnAnalyses: {}
    })
}));
