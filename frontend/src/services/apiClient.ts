import { env } from "../lib/env";
import type {
  CombinedEvaluationResult,
  ConversationMetadata,
  ConversationTranscript,
  RealtimeSessionCredentials,
  SessionStartResponse,
  TurnResponsePayload
} from "../types/session";

const jsonHeaders = { "Content-Type": "application/json" } as const;

export interface RealtimeSessionRequestPayload {
  readonly instructions?: string;
  readonly voice?: string;
  readonly turn_detection?: {
    readonly type: "server_vad" | "semantic_vad" | "none";
    readonly silence_duration_ms?: number;
  };
}

export async function createRealtimeSession(
  payload: RealtimeSessionRequestPayload = {}
): Promise<RealtimeSessionCredentials> {
  const response = await fetch(`${env.apiUrl}/api/v1/sessions/realtime`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      modalities: ["audio", "text"],
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      input_audio_transcription: { model: "whisper-1" },
      instructions:
        payload.instructions ??
        "You are a supportive networking coach. Keep answers concise and empathetic.",
      voice: payload.voice ?? "alloy",
      turn_detection: payload.turn_detection ?? ({ type: "server_vad" } as const)
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to create realtime session: ${response.statusText}`);
  }
  return (await response.json()) as RealtimeSessionCredentials;
}

export interface CompositeEvaluationPayload {
  readonly transcript: ConversationTranscript;
  readonly focus_role: "user" | "assistant";
}

export async function submitCompositeEvaluation(
  payload: CompositeEvaluationPayload
): Promise<CombinedEvaluationResult> {
  const response = await fetch(`${env.apiUrl}/api/v1/evaluation/composite`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Evaluation failed: ${message}`);
  }

  return (await response.json()) as CombinedEvaluationResult;
}

export interface ConversationSessionPayload {
  readonly scenario_id?: string | null;
}

export async function startConversationSession(
  payload: ConversationSessionPayload = {}
): Promise<SessionStartResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/conversations`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to start conversation session: ${message || response.statusText}`);
  }

  return (await response.json()) as SessionStartResponse;
}

export interface ConversationTurnPayload {
  readonly utterance: string;
}

export async function submitConversationTurn(
  sessionId: string,
  payload: ConversationTurnPayload,
  options: { signal?: AbortSignal } = {}
): Promise<TurnResponsePayload> {
  const response = await fetch(`${env.apiUrl}/api/v1/conversations/${encodeURIComponent(sessionId)}/turns`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
    signal: options.signal
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to process conversation turn: ${message || response.statusText}`);
  }

  return (await response.json()) as TurnResponsePayload;
}
