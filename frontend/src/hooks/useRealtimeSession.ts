import { useCallback, useMemo, useRef } from "react";
import { RealtimeRelayClient, type RelayEventHandlers } from "../services/realtimeRelayClient";
import { useSessionStore } from "../store/useSessionStore";
import type {
  CombinedEvaluationResult,
  ConversationTranscript,
  ConversationTurn,
  SessionTurn,
  PersonaSummary,
  CharacterSessionState
} from "../types/session";
import {
  startConversationSession,
  submitCompositeEvaluation
} from "../services/apiClient";

export function useRealtimeSession() {
  const store = useSessionStore();
  const clientRef = useRef<RealtimeRelayClient | null>(null);

  const ensureClient = useCallback((): RealtimeRelayClient => {
    if (!clientRef.current) {
      const client = new RealtimeRelayClient();
      clientRef.current = client;
      if (typeof window !== "undefined" && import.meta.env.DEV) {
        (window as unknown as { __relayClient?: RealtimeRelayClient }).__relayClient = client;
      }
    }
    return clientRef.current;
  }, []);

  const attachHandlers = useCallback(
    (client: RealtimeRelayClient) => {
      const handlers: RelayEventHandlers = {
        onStatusChange: (status) => {
          store.setStatus(status);
          if (status !== "connected") {
            store.setStreaming(false);
          }
        },
        onTurn: (turn) => store.upsertTurn(turn),
        onBackendTurn: (turnId, response) => {
          store.recordTurnAnalysis(turnId, {
            evaluation: response.evaluation,
            combined_evaluation: response.combined_evaluation,
            evaluation_failure_reason: response.evaluation_failure_reason,
            response_source: response.response_source,
            response_failure_reason: response.response_failure_reason,
            persona: response.persona,
            state: response.state
          });
        },
        onError: (error) => store.setError(error.message)
      };
      client.setHandlers(handlers);
    },
    [store]
  );

  const beginSession = useCallback(async () => {
    if (store.status === "connecting" || store.status === "connected") {
      return;
    }
    const client = ensureClient();
    attachHandlers(client);
    store.reset();
    store.setError(null);
    store.setStatus("connecting");

    try {
      const session = await startConversationSession();
      store.setConversationSession({
        sessionId: session.session_id,
        persona: session.persona,
        state: session.state
      });
      client.setConversationSessionId(session.session_id);
      client.setSessionInstructions(composePersonaInstructions(session.persona, session.state));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
      store.setError(message);
      store.setStatus("error");
      return;
    }

    try {
      await client.connect();
      await client.startStreaming();
      store.setStreaming(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
      store.setError(message);
      store.setStatus("error");
      return;
    }
  }, [attachHandlers, ensureClient, store]);

  const pauseSession = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      return;
    }
    await client.pauseStreaming();
    store.setStreaming(false);
  }, [store]);

  const resumeSession = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      throw new Error("Client not connected");
    }
    await client.startStreaming();
    store.setStreaming(true);
  }, [store]);

  const stopSession = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      return;
    }
    await client.finalizeTurn({ disconnect: true });
    store.setStreaming(false);
  }, [store]);

  const runCompositeEvaluation = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      throw new Error("Client not connected");
    }
    const metadata = client.sessionMetadata;
    if (!metadata) {
      throw new Error("Missing session metadata");
    }

    const turns: ConversationTurn[] = store.turns.map((turn) => mapSessionTurnToConversation(turn));

    const transcript: ConversationTranscript = {
      metadata,
      turns
    };

    store.setEvaluationLoading(true);
    store.setError(null);
    try {
      const evaluation: CombinedEvaluationResult = await submitCompositeEvaluation({
        transcript,
        focus_role: "user"
      });
      store.setEvaluation(evaluation);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
      store.setError(message);
    } finally {
      store.setEvaluationLoading(false);
    }
  }, [store]);

  return useMemo(
    () => ({
      status: store.status,
      streaming: store.streaming,
      turns: store.turns,
      evaluation: store.evaluation,
      evaluationLoading: store.evaluationLoading,
      error: store.error,
      beginSession,
      pauseSession,
      resumeSession,
      stopSession,
      runCompositeEvaluation
    }),
    [beginSession, pauseSession, resumeSession, stopSession, runCompositeEvaluation, store]
  );
}

function mapSessionTurnToConversation(turn: SessionTurn): ConversationTurn {
  return {
    turn_id: turn.turn_id,
    user: {
      message_id: turn.user.message_id,
      role: turn.user.role,
      utterance: turn.user.utterance,
      timestamp: turn.user.timestamp
    },
    assistant: turn.assistant.map((message) => ({
      message_id: message.message_id,
      role: message.role,
      utterance: message.utterance,
      timestamp: message.timestamp
    }))
  };
}

function composePersonaInstructions(persona: PersonaSummary, state: CharacterSessionState): string {
  const moodLabel = state.current_mood.replace(/_/g, " ");
  const traits = `${persona.energy} energy, ${persona.formality} tone, ${persona.openness} openness`;
  const topicFocus = `Interests: ${persona.topic_focus.interest}. Recent project: ${persona.topic_focus.recent_project}. Pain point: ${persona.topic_focus.pain_point}.`;
  return [
    `You are ${persona.name}, ${persona.role}. Setting: ${persona.scenario}.`,
    `Your personality: ${traits}. Current stress level ${state.stress_level}/100 and mood ${moodLabel}.`,
    `${topicFocus}`,
    `${persona.backstory}`,
    "Engage naturally in conversation while staying in character.",
    "Keep responses brief and conversational, matching the personality traits above."
  ].join(" ");
}
