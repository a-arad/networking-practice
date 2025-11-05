import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  createRealtimeSessionMock: vi.fn(),
  submitConversationTurnMock: vi.fn()
}));

vi.mock("./apiClient", () => ({
  createRealtimeSession: apiMocks.createRealtimeSessionMock,
  submitConversationTurn: apiMocks.submitConversationTurnMock
}));

vi.mock("../audio/microphoneCapture", () => {
  class MockMicrophoneCapture {
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
  }
  return { MicrophoneCapture: MockMicrophoneCapture };
});

const enqueueMock = vi.fn();
const resetMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../audio/audioPlayer", () => {
  class MockAudioPlayer {
    enqueueFromBase64 = enqueueMock;
    reset = resetMock;
  }
  return { AudioPlayer: MockAudioPlayer };
});

import { RealtimeRelayClient } from "./realtimeRelayClient";
import type { TurnResponsePayload } from "../types/session";

class StubWebSocket {
  static readonly OPEN = 1;

  readyState = StubWebSocket.OPEN;
  send = vi.fn();
  close = vi.fn();
  binaryType: BinaryType = "arraybuffer";
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: (() => void) | null = null;
}

beforeAll(() => {
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    writable: true,
    value: StubWebSocket
  });

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({}),
        addEventListener: vi.fn()
      }
    }
  });

  if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      writable: true,
      value: {
        randomUUID: () => "00000000-0000-4000-8000-000000000000"
      }
    });
  }
});

describe("RealtimeRelayClient", () => {
  beforeEach(() => {
    apiMocks.createRealtimeSessionMock.mockReset();
    apiMocks.submitConversationTurnMock.mockReset();
    enqueueMock.mockReset();
    resetMock.mockReset();
  });

  const asInspectable = (client: RealtimeRelayClient) =>
    client as unknown as {
      handleJsonMessage: (raw: string) => void;
      websocket: StubWebSocket | null;
    };

  it("cancels automatically generated responses", () => {
    const client = new RealtimeRelayClient();
    const inspectable = asInspectable(client);
    const socket = new StubWebSocket();
    inspectable.websocket = socket;

    inspectable.handleJsonMessage(
      JSON.stringify({
        type: "response.created",
        response: { id: "resp-123" }
      })
    );

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "response.cancel", response_id: "resp-123" })
    );
  });

  it("routes completed transcripts through the backend and injects the assistant response", async () => {
    const client = new RealtimeRelayClient();
    client.setConversationSessionId("session-42");
    const turns: string[] = [];
    const backendResponses: TurnResponsePayload[] = [];

    client.setHandlers({
      onTurn: (turn) => {
        const assistant = turn.assistant.at(-1)?.utterance ?? "";
        turns.push(`${turn.turn_id}:${assistant}`);
      },
      onBackendTurn: (_turnId, payload) => {
        backendResponses.push(payload);
      }
    });

    const inspectable = asInspectable(client);
    const socket = new StubWebSocket();
    inspectable.websocket = socket;

    const payload: TurnResponsePayload = {
      session_id: "session-42",
      assistant_message: {
        message_id: "assistant-1",
        role: "assistant",
        utterance: "Absolutely, let's schedule a follow-up.",
        timestamp: new Date().toISOString()
      },
      state: {
        session_id: "session-42",
        character_id: "character-1",
        stress_level: 20,
        patience_config: {
          starting_patience: 3,
          warning_threshold: 1,
          countdown_turns: 2
        },
        current_patience: 3,
        current_mood: "neutral",
        warning_turns_remaining: null,
        turn_index: 1,
        is_in_warning_state: false
      },
      persona: {
        id: "persona-1",
        name: "Alex",
        role: "Mentor",
        scenario: "Networking practice",
        difficulty: "beginner",
        formality: "casual",
        energy: "medium",
        openness: "neutral",
        stress_level: 20,
        current_mood: "neutral",
        topic_focus: {
          interest: "AI meetups",
          recent_project: "Startup accelerator",
          pain_point: "Time management"
        }
      },
      evaluation: {
        dimension_scores: [
          {
            dimension: "rapport",
            score: 4.5,
            rationale: "Showed empathy"
          }
        ],
        patience_delta: 0,
        average_score: 4.5,
        previous_mood: "neutral",
        new_mood: "neutral",
        entered_warning: false,
        exited_warning: false,
        conversation_ended: false
      },
      combined_evaluation: null,
      evaluation_failure_reason: null,
      response_source: "llm",
      response_failure_reason: null
    };

    apiMocks.submitConversationTurnMock.mockResolvedValue(payload);

    inspectable.handleJsonMessage(
      JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        item: { id: "item-1", role: "user" },
        transcript: "Great chatting today"
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(apiMocks.submitConversationTurnMock).toHaveBeenCalledWith(
      "session-42",
      { utterance: "Great chatting today" },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    expect(backendResponses).toEqual([payload]);
    expect(turns.some((entry) => entry.includes("Absolutely"))).toBe(true);

    inspectable.handleJsonMessage(
      JSON.stringify({
        type: "response.created",
        response: {
          id: "resp-forced",
          metadata: { relay_source: "conversation_engine_forced" }
        }
      })
    );

    const cancelCall = socket.send.mock.calls.find((args) =>
      typeof args[0] === "string" && args[0].includes("response.cancel")
    );
    if (cancelCall) {
      expect(cancelCall[0]).not.toContain("resp-forced");
    }

    const instructionCall = socket.send.mock.calls.find((args) =>
      typeof args[0] === "string" && args[0].includes("response.create")
    );
    expect(instructionCall).toBeTruthy();
  });
});
