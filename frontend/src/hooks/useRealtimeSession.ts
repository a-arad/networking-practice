import { useCallback, useMemo, useRef } from "react";
import { VoiceClient } from "../services/voiceClient";
import { useSessionStore } from "../store/useSessionStore";
import type {
  CombinedEvaluationResult,
  ConversationTranscript,
  ConversationTurn,
  SessionTurn,
  PersonaSummary,
  CharacterSessionState,
  TurnAnalysis
} from "../types/session";
import {
  startConversationSession,
  submitCompositeEvaluation,
  processVoiceTurn
} from "../services/apiClient";
import { env } from "../lib/env";

export type SessionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";
// Alias for backward compatibility
export type RelayStatus = SessionStatus;

export function useRealtimeSession() {
  const store = useSessionStore();
  const voiceClientRef = useRef<VoiceClient | null>(null);
  const conversationSessionIdRef = useRef<string | null>(null);
  const turnCountRef = useRef<number>(0);

  const ensureVoiceClient = useCallback((): VoiceClient => {
    if (!voiceClientRef.current) {
      voiceClientRef.current = new VoiceClient();
    }
    return voiceClientRef.current;
  }, []);

  const beginSession = useCallback(async () => {
    if (store.status === "connecting" || store.status === "connected") {
      return;
    }

    ensureVoiceClient();
    store.reset();
    store.setError(null);
    store.setStatus("connecting");
    turnCountRef.current = 0;

    try {
      const session = await startConversationSession();
      conversationSessionIdRef.current = session.session_id;

      store.setConversationSession({
        sessionId: session.session_id,
        persona: session.persona,
        state: session.state
      });

      store.setStatus("connected");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
      store.setError(message);
      store.setStatus("error");
      throw error;
    }
  }, [ensureVoiceClient, store]);

  const startRecording = useCallback(async () => {
    const client = voiceClientRef.current;
    if (!client) {
      throw new Error("Voice client not initialized");
    }

    if (!conversationSessionIdRef.current) {
      throw new Error("No active conversation session");
    }

    if (store.status !== "connected") {
      throw new Error("Session not connected");
    }

    try {
      await client.startRecording();
      store.setStreaming(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
      store.setError(message);
      throw error;
    }
  }, [store]);

  const stopRecordingAndSend = useCallback(async () => {
    const client = voiceClientRef.current;
    const sessionId = conversationSessionIdRef.current;

    if (!client) {
      throw new Error("Voice client not initialized");
    }

    if (!sessionId) {
      throw new Error("No active conversation session");
    }

    store.setStreaming(false);

    try {
      // Stop recording and get the audio blob
      const audioBlob = await client.stopRecording();

      // Temporarily store status for restoration
      const previousStatus = store.status;
      store.setStatus("connecting"); // Reusing "connecting" to indicate "processing"

      // Send audio to backend
      const { audioResponse, payload } = await processVoiceTurn(sessionId, audioBlob);

      // Create turn ID
      turnCountRef.current += 1;
      const turnId = `turn-${turnCountRef.current}`;
      const openedAt = new Date().toISOString();

      // Create and add user message to turn
      const userMessageId = `${turnId}-user`;
      const assistantMessageId = `${turnId}-assistant`;

      // Build TurnAnalysis from the response payload
      const analysis: TurnAnalysis = {
        evaluation: payload.evaluation,
        combined_evaluation: null,
        evaluation_failure_reason: null,
        response_source: "llm" as const,
        response_failure_reason: null,
        persona: payload.persona,
        state: payload.state
      };

      const turn: SessionTurn = {
        turn_id: turnId,
        user: {
          message_id: userMessageId,
          role: "user" as const,
          utterance: payload.user_text,
          timestamp: openedAt,
          sequence: 0,
          final: true
        },
        assistant: [
          {
            message_id: assistantMessageId,
            role: "assistant" as const,
            utterance: payload.assistant_text,
            timestamp: new Date().toISOString(),
            sequence: 0,
            final: true
          }
        ],
        opened_at: openedAt,
        closed_at: new Date().toISOString(),
        analysis
      };

      store.upsertTurn(turn);

      // Update character state with turn analysis
      store.recordTurnAnalysis(turnId, analysis);

      // Play the response audio
      await client.playAudio(audioResponse);

      // Restore status
      store.setStatus(previousStatus);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
      store.setError(message);
      store.setStatus("error");
      throw error;
    }
  }, [store]);

  const pauseSession = useCallback(async () => {
    // In HTTP mode, "pause" means stop recording and send
    // Maps to stopRecordingAndSend for backward compatibility with old UI
    if (store.streaming) {
      await stopRecordingAndSend();
    }
  }, [store.streaming, stopRecordingAndSend]);

  const resumeSession = useCallback(async () => {
    // In HTTP mode, "resume" means start recording
    // Maps to startRecording for backward compatibility with old UI
    if (!store.streaming && store.status === "connected") {
      await startRecording();
    }
  }, [store.streaming, store.status, startRecording]);

  const stopSession = useCallback(async () => {
    const client = voiceClientRef.current;
    if (!client) {
      return;
    }

    // Cleanup
    client.cleanup();
    conversationSessionIdRef.current = null;
    turnCountRef.current = 0;
    store.setStreaming(false);
    store.setStatus("idle");
  }, [store]);

  const runCompositeEvaluation = useCallback(async () => {
    if (!conversationSessionIdRef.current) {
      throw new Error("No active conversation session");
    }

    const turns: ConversationTurn[] = store.turns.map((turn) => mapSessionTurnToConversation(turn));

    if (turns.length === 0) {
      store.setError("No turns to evaluate");
      return;
    }

    const transcript: ConversationTranscript = {
      metadata: {
        session_id: conversationSessionIdRef.current,
        created_at: new Date().toISOString()
      },
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
      streaming: store.streaming, // In HTTP mode, this means "recording"
      turns: store.turns,
      evaluation: store.evaluation,
      evaluationLoading: store.evaluationLoading,
      error: store.error,
      beginSession,
      startRecording,
      stopRecordingAndSend,
      pauseSession,
      resumeSession,
      stopSession,
      runCompositeEvaluation
    }),
    [
      beginSession,
      startRecording,
      stopRecordingAndSend,
      pauseSession,
      resumeSession,
      stopSession,
      runCompositeEvaluation,
      store
    ]
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
