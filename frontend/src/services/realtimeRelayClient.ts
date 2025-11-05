import { MicrophoneCapture } from "../audio/microphoneCapture";
import { AudioPlayer } from "../audio/audioPlayer";
import { env } from "../lib/env";
import { ConversationTurnAssembler, type TurnEvent } from "../conversation/turnAssembler";
import type {
  ConversationMetadata,
  ParticipantRole,
  RealtimeSessionCredentials,
  SessionTurn,
  TurnMessage,
  TurnResponsePayload
} from "../types/session";
import { int16ToBase64 } from "../utils/audio";
import { createRealtimeSession, submitConversationTurn } from "./apiClient";

export type RelayStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export interface RelayEventHandlers {
  readonly onStatusChange?: (status: RelayStatus) => void;
  readonly onTurn?: (turn: SessionTurn) => void;
  readonly onBackendTurn?: (turnId: string, payload: TurnResponsePayload) => void;
  readonly onError?: (error: Error) => void;
}

interface PendingTranscript {
  buffer: string;
  lastUpdated: number;
}

const SAMPLE_RATE = 24_000;
const FORCED_RESPONSE_METADATA = "conversation_engine_forced";

export class RealtimeRelayClient {
  private readonly microphone = new MicrophoneCapture({ sampleRate: SAMPLE_RATE });
  private readonly player = new AudioPlayer({ sampleRate: SAMPLE_RATE });

  private websocket: WebSocket | null = null;
  private handlers: RelayEventHandlers = {};
  private status: RelayStatus = "idle";
  private credentials: RealtimeSessionCredentials | null = null;
  private metadata: ConversationMetadata | null = null;
  private sessionInstructions?: string;
  private conversationSessionId: string | null = null;

  private streaming = false;
  private allowAssistantAudio = false;

  private readonly turnAssembler = new ConversationTurnAssembler();
  private readonly itemTimestamps = new Map<string, string>();
  private readonly pendingTranscripts = new Map<string, PendingTranscript>();
  private readonly processedItems = new Set<string>();
  private readonly pendingBackend = new Map<string, AbortController>();
  private bufferTranscriptFallbackId: string | null = null;
  private inputTranscriptFallbackId: string | null = null;
  private awaitingForcedResponse = false;
  private forcedResponseId: string | null = null;

  setHandlers(handlers: RelayEventHandlers): void {
    this.handlers = handlers;
  }

  setSessionInstructions(instructions: string | undefined): void {
    this.sessionInstructions = instructions;
  }

  setConversationSessionId(sessionId: string): void {
    this.conversationSessionId = sessionId;
  }

  get sessionMetadata(): ConversationMetadata | null {
    return this.metadata;
  }

  async connect(): Promise<void> {
    if (this.status === "connected" || this.status === "connecting") {
      return;
    }

    this.updateStatus("connecting");
    this.resetRealtimeState();

    try {
      this.credentials = await createRealtimeSession({
        instructions: this.sessionInstructions,
        turn_detection: { type: "server_vad" }
      });
    } catch (error) {
      const message = this.normalizeError(error);
      this.updateStatus("error");
      this.handlers.onError?.(new Error(message));
      throw new Error(message);
    }

    if (!this.credentials) {
      const message = "Realtime session credentials were not returned";
      this.updateStatus("error");
      this.handlers.onError?.(new Error(message));
      throw new Error(message);
    }

    this.metadata = {
      session_id: this.credentials.session_id,
      created_at: new Date().toISOString()
    };

    const wsUrl = new URL(`${env.wsUrl}/api/v1/ws/relay-simple`);
    wsUrl.searchParams.set("session_id", this.credentials.session_id);
    wsUrl.searchParams.set("client_secret", this.credentials.client_secret);

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      socket.binaryType = "arraybuffer";

      socket.onopen = () => {
        this.websocket = socket;
        this.bindSocket(socket);
        this.updateStatus("connected");
        resolve();
      };

      socket.onerror = () => {
        const error = new Error("WebSocket connection error");
        this.handlers.onError?.(error);
        this.updateStatus("error");
        reject(error);
      };

      socket.onclose = () => {
        this.streaming = false;
        this.allowAssistantAudio = false;
        this.updateStatus("disconnected");
        if (socket.readyState !== WebSocket.OPEN) {
          reject(new Error("WebSocket closed before it became ready"));
        }
      };
    });
  }

  async disconnect(): Promise<void> {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    await this.microphone.stop();
    await this.player.reset();
    this.streaming = false;
    this.allowAssistantAudio = false;
    this.abortPendingBackend();
    this.resetRealtimeState();
    this.updateStatus("idle");
  }

  async startStreaming(): Promise<void> {
    if (!this.websocket) {
      throw new Error("WebSocket is not ready");
    }
    if (this.websocket.readyState === WebSocket.CONNECTING) {
      await this.waitForSocketOpen(this.websocket);
    }
    if (this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not ready");
    }
    if (this.streaming) {
      return;
    }
    await this.microphone.start((chunk) => {
      if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (chunk.length === 0) {
        return;
      }
      const audio = int16ToBase64(chunk);
      this.send({ type: "input_audio_buffer.append", audio });
    });
    this.streaming = true;
  }

  private waitForSocketOpen(socket: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      const handleOpen = () => {
        cleanup();
        resolve();
      };
      const handleClose = () => {
        cleanup();
        reject(new Error("WebSocket closed before it became ready"));
      };
      const handleError = () => {
        cleanup();
        reject(new Error("WebSocket error before it became ready"));
      };

      const cleanup = () => {
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("close", handleClose);
        socket.removeEventListener("error", handleError);
      };

      socket.addEventListener("open", handleOpen);
      socket.addEventListener("close", handleClose);
      socket.addEventListener("error", handleError);
    });
  }

  async pauseStreaming(): Promise<void> {
    if (!this.streaming) {
      return;
    }
    await this.microphone.stop();
    this.streaming = false;
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.send({ type: "input_audio_buffer.clear" });
    }
    await this.player.reset();
    this.allowAssistantAudio = false;
  }

  async finalizeTurn(options: { disconnect?: boolean } = {}): Promise<void> {
    await this.pauseStreaming();
    if (options.disconnect) {
      await this.disconnect();
    }
  }

  deliverAssistantResponse(turnId: string, message: TurnMessage): void {
    this.injectAssistantResponse(turnId, message);
  }

  private bindSocket(socket: WebSocket): void {
    socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (typeof event.data === "string") {
        this.handleJsonMessage(event.data);
        return;
      }
      // Ignore raw audio frames; the API currently sends audio as JSON deltas.
    };

    socket.onerror = () => {
      this.handlers.onError?.(new Error("Realtime relay encountered an error"));
    };

    socket.onclose = () => {
      this.streaming = false;
      this.allowAssistantAudio = false;
      this.updateStatus("disconnected");
    };
  }

  private handleJsonMessage(raw: string): void {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      console.warn("Failed to parse realtime payload", raw, error);
      return;
    }

    const type = typeof payload["type"] === "string" ? (payload["type"] as string) : null;
    if (!type) {
      return;
    }

    switch (type) {
      case "response.created":
      case "response.output_created": {
        const responseId = this.extractResponseId(payload);
        const responsePayload = this.asRecord(payload["response"]);
        const metadata = this.asRecord(responsePayload?.["metadata"] ?? null);
        const sourceTag = typeof metadata?.relay_source === "string" ? (metadata.relay_source as string) : null;
        const instructionText =
          typeof responsePayload?.instructions === "string" ? (responsePayload.instructions as string) : null;
        const matchesForcedInstruction = instructionText?.startsWith("Say exactly:") ?? false;
        if (
          (sourceTag === FORCED_RESPONSE_METADATA || matchesForcedInstruction) &&
          this.forcedResponseId === null &&
          responseId
        ) {
          this.forcedResponseId = responseId;
          this.awaitingForcedResponse = false;
          this.allowAssistantAudio = true;
          return;
        }
        if (responseId && this.forcedResponseId && responseId === this.forcedResponseId) {
          this.allowAssistantAudio = true;
          return;
        }
        this.cancelUpstreamResponse(payload);
        return;
      }
      case "response.output_audio.delta":
      case "response.audio.delta": {
        this.handleAssistantAudioDelta(payload);
        return;
      }
      case "response.output_audio.done":
      case "response.audio.done":
      case "response.completed": {
        const responseId = this.extractResponseId(payload);
        if (responseId && this.forcedResponseId && responseId !== this.forcedResponseId) {
          this.cancelUpstreamResponse(payload);
          return;
        }
        if (type === "response.completed") {
          this.forcedResponseId = null;
        }
        this.allowAssistantAudio = false;
        return;
      }
      case "conversation.item.input_audio_transcription.delta":
      case "input_audio_transcription.delta":
      case "input_audio_buffer.transcription.delta":
      case "conversation.item.transcript.delta":
      case "input_audio_buffer.transcript": {
        this.handleUserTranscriptDelta(payload, type);
        return;
      }
      case "conversation.item.input_audio_transcription.completed":
      case "input_audio_transcription.completed":
      case "input_audio_buffer.transcription.completed":
      case "conversation.item.transcript.completed": {
        void this.handleUserTranscriptCompleted(payload, type);
        return;
      }
      case "response.error":
      case "conversation.item.error":
      case "error": {
        const detail = this.extractError(payload);
        if (detail) {
          this.handlers.onError?.(new Error(detail));
        }
        return;
      }
      default: {
        // Unhandled event type; keep silent for now to minimize noise.
      }
    }
  }

  private handleUserTranscriptDelta(payload: Record<string, unknown>, type: string): void {
    const item = this.asRecord(payload["item"]);
    const fallbackId = this.resolveTranscriptIdentifier(payload, type) ?? this.generateItemId("user");
    const itemId = this.getItemId(item) ?? fallbackId;
    const transcript = this.extractDeltaText(payload);
    if (!transcript) {
      return;
    }
    const pending = this.pendingTranscripts.get(itemId) ?? {
      buffer: "",
      lastUpdated: Date.now()
    };
    pending.buffer += transcript;
    pending.lastUpdated = Date.now();
    this.pendingTranscripts.set(itemId, pending);

    const utterance = this.normalizeUtterance(pending.buffer);
    if (!utterance) {
      return;
    }

    const timestamp = this.ensureTimestamp(itemId, this.extractTimestamp(item));
    this.emitTurnUpdate(
      {
        itemId,
        role: "user",
        utterance,
        timestamp,
        isFinal: false
      }
    );
  }

  private async handleUserTranscriptCompleted(payload: Record<string, unknown>, type: string): Promise<void> {
    const item = this.asRecord(payload["item"]);
    const fallbackId = this.resolveTranscriptIdentifier(payload, type) ?? this.generateItemId("user");
    const itemId = this.getItemId(item) ?? fallbackId;
    if (this.processedItems.has(itemId)) {
      return;
    }
    const transcript = this.extractCompletedText(payload);
    const utterance = this.normalizeUtterance(transcript);
    this.pendingTranscripts.delete(itemId);
    if (!utterance) {
      return;
    }
    const timestamp = this.ensureTimestamp(itemId, this.extractTimestamp(item));
    const turn = this.emitTurnUpdate(
      {
        itemId,
        role: "user",
        utterance,
        timestamp,
        isFinal: true
      }
    );
    if (!turn) {
      return;
    }

    this.processedItems.add(itemId);
    this.clearFallbackId(type);
    await this.processBackendTurn(turn, itemId);
  }

  private resolveTranscriptIdentifier(payload: Record<string, unknown>, type: string): string | undefined {
    const direct = typeof payload["item_id"] === "string" ? (payload["item_id"] as string) : undefined;
    if (direct) {
      return direct;
    }
    if (type.startsWith("conversation.item")) {
      const source = this.asRecord(payload["item"]);
      const id = this.getItemId(source);
      if (id) {
        return id;
      }
    }
    if (typeof payload["id"] === "string") {
      return payload["id"] as string;
    }
    if (typeof payload["conversation_item_id"] === "string") {
      return payload["conversation_item_id"] as string;
    }
    if (type.startsWith("input_audio_buffer")) {
      if (typeof payload["buffer_id"] === "string") {
        this.bufferTranscriptFallbackId = payload["buffer_id"] as string;
        return this.bufferTranscriptFallbackId;
      }
      if (this.bufferTranscriptFallbackId === null) {
        this.bufferTranscriptFallbackId = this.generateItemId("user");
      }
      return this.bufferTranscriptFallbackId;
    }
    if (type.startsWith("input_audio_transcription")) {
      if (typeof payload["transcription_id"] === "string") {
        this.inputTranscriptFallbackId = payload["transcription_id"] as string;
        return this.inputTranscriptFallbackId;
      }
      if (this.inputTranscriptFallbackId === null) {
        this.inputTranscriptFallbackId = this.generateItemId("user");
      }
      return this.inputTranscriptFallbackId;
    }
    return undefined;
  }

  private clearFallbackId(type: string): void {
    if (type.startsWith("input_audio_buffer")) {
      this.bufferTranscriptFallbackId = null;
    }
    if (type.startsWith("input_audio_transcription")) {
      this.inputTranscriptFallbackId = null;
    }
  }

  private extractDeltaText(payload: Record<string, unknown>): string | null {
    return (
      this.extractText(payload["delta"]) ??
      this.extractText(payload["transcript"]) ??
      this.extractText(payload["text"])
    );
  }

  private extractCompletedText(payload: Record<string, unknown>): string | null {
    return (
      this.extractText(payload["transcript"]) ??
      this.extractText(payload["text"]) ??
      this.extractText(payload["delta"]) ??
      this.extractText(payload["output"])
    );
  }

  private async processBackendTurn(turn: SessionTurn, itemId: string): Promise<void> {
    const sessionId = this.conversationSessionId;
    if (!sessionId) {
      this.handlers.onError?.(new Error("Cannot call backend without an active conversation session"));
      return;
    }
    if (this.pendingBackend.has(itemId)) {
      return;
    }

    const abortController = new AbortController();
    this.pendingBackend.set(itemId, abortController);

    try {
      const response = await submitConversationTurn(
        sessionId,
        { utterance: turn.user.utterance },
        { signal: abortController.signal }
      );
      this.injectAssistantResponse(turn.turn_id, response.assistant_message);
      this.handlers.onBackendTurn?.(turn.turn_id, response);
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      const message = this.normalizeError(error);
      this.handlers.onError?.(new Error(message));
    } finally {
      this.pendingBackend.delete(itemId);
    }
  }

  private injectAssistantResponse(turnId: string, message: TurnMessage): void {
    const utterance = this.normalizeUtterance(message.utterance);
    if (!utterance) {
      return;
    }
    const timestamp = message.timestamp ?? new Date().toISOString();
    const event: TurnEvent = {
      itemId: message.message_id,
      role: "assistant",
      utterance,
      timestamp,
      isFinal: true
    };
    this.emitTurnUpdate(event);
    this.allowAssistantAudio = true;
    void this.player.reset();
    if (this.forcedResponseId) {
      this.send({ type: "response.cancel", response_id: this.forcedResponseId });
    }
    this.awaitingForcedResponse = true;
    this.forcedResponseId = null;
    this.sendForcedAssistantInstruction(utterance);
  }

  private cancelUpstreamResponse(payload: Record<string, unknown>): void {
    const responseId = this.extractResponseId(payload);
    if (responseId) {
      this.send({ type: "response.cancel", response_id: responseId });
    } else {
      this.send({ type: "response.cancel" });
    }
  }

  private handleAssistantAudioDelta(payload: Record<string, unknown>): void {
    if (!this.allowAssistantAudio) {
      return;
    }
    const responseId = this.extractResponseId(payload);
    if (responseId && this.forcedResponseId && responseId !== this.forcedResponseId) {
      return;
    }
    const audio = payload["delta"];
    if (typeof audio === "string") {
      void this.player.enqueueFromBase64(audio);
    }
  }

  private emitTurnUpdate(event: TurnEvent): SessionTurn | null {
    const turn = this.turnAssembler.apply(event);
    if (turn) {
      this.handlers.onTurn?.(turn);
    }
    return turn;
  }

  private ensureTimestamp(itemId: string, fallback?: string | null): string {
    const existing = this.itemTimestamps.get(itemId);
    if (existing) {
      return existing;
    }
    const timestamp = fallback ?? new Date().toISOString();
    this.itemTimestamps.set(itemId, timestamp);
    return timestamp;
  }

  private extractTimestamp(item: Record<string, unknown> | null): string | null {
    if (!item) {
      return null;
    }
    const timestamp = item["created_at"] ?? item["updated_at"];
    return typeof timestamp === "string" ? timestamp : null;
  }

  private sendForcedAssistantInstruction(utterance: string): void {
    const escaped = utterance.replace(/"/g, '\\"');
    this.send({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions: `Say exactly: "${escaped}"`,
        metadata: {
          relay_source: FORCED_RESPONSE_METADATA
        }
      }
    });
  }

  private extractResponseId(payload: Record<string, unknown>): string | null {
    const direct = payload["response_id"];
    if (typeof direct === "string") {
      return direct;
    }
    const response = this.asRecord(payload["response"]);
    if (response && typeof response["id"] === "string") {
      return response["id"] as string;
    }
    return null;
  }

  private extractError(payload: Record<string, unknown>): string | null {
    const error = payload["error"] ?? payload["detail"] ?? payload["message"];
    if (typeof error === "string") {
      return error;
    }
    if (error && typeof error === "object") {
      const record = error as Record<string, unknown>;
      if (typeof record["message"] === "string") {
        return record["message"] as string;
      }
      if (typeof record["error"] === "string") {
        return record["error"] as string;
      }
      return JSON.stringify(record);
    }
    return null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private getItemId(item: Record<string, unknown> | null): string | undefined {
    if (!item) {
      return undefined;
    }
    const itemId = item["id"];
    return typeof itemId === "string" ? itemId : undefined;
  }

  private generateItemId(role: ParticipantRole): string {
    return `${role}-${crypto.randomUUID()}`;
  }

  private extractText(value: unknown): string | null {
    if (value == null) {
      return null;
    }
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      const merged = value
        .map((entry) => this.extractText(entry))
        .filter((part): part is string => typeof part === "string")
        .join("");
      return merged.length > 0 ? merged : null;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record["text"] === "string") {
        return record["text"] as string;
      }
      if (typeof record["transcript"] === "string") {
        return record["transcript"] as string;
      }
      if (typeof record["delta"] === "string") {
        return record["delta"] as string;
      }
      if (typeof record["value"] === "string") {
        return record["value"] as string;
      }
    }
    return null;
  }

  private normalizeUtterance(text: string | null | undefined): string | null {
    if (!text) {
      return null;
    }
    const normalized = text.replace(/\s+/g, " ").trim();
    return normalized.length > 0 ? normalized : null;
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.websocket.send(JSON.stringify(payload));
  }

  private updateStatus(status: RelayStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    this.handlers.onStatusChange?.(status);
  }

  private resetRealtimeState(): void {
    this.turnAssembler.reset();
    this.itemTimestamps.clear();
    this.pendingTranscripts.clear();
    this.processedItems.clear();
    this.abortPendingBackend();
    this.awaitingForcedResponse = false;
    this.forcedResponseId = null;
    this.bufferTranscriptFallbackId = null;
    this.inputTranscriptFallbackId = null;
  }

  private abortPendingBackend(): void {
    for (const controller of this.pendingBackend.values()) {
      controller.abort();
    }
    this.pendingBackend.clear();
  }

  private normalizeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  }

}
