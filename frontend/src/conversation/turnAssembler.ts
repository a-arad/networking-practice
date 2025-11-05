import { SessionMessage, SessionTurn } from "../types/session";

type ConversationalRole = SessionMessage["role"];

export interface TurnEvent {
  readonly itemId: string;
  readonly role: ConversationalRole;
  readonly utterance: string;
  readonly timestamp: string;
  readonly isFinal: boolean;
}

type MutableSessionMessage = {
  -readonly [Key in keyof SessionMessage]: SessionMessage[Key];
};

interface MessageState extends MutableSessionMessage {
  queued: boolean;
}

interface TurnState {
  readonly index: number;
  readonly turnId: string;
  user: MessageState | null;
  userFinalized: boolean;
  assistantFinalized: boolean;
  openedAt: string | null;
  closedAt: string | null;
  assistantOrder: string[];
  assistantByItem: Map<string, MessageState>;
  assistantOffsets: number;
}

export class ConversationTurnAssembler {
  private readonly turns = new Map<number, TurnState>();

  private readonly turnOrder: number[] = [];

  private readonly itemTurn = new Map<string, number>();

  private nextUserTurn = 0;

  private lastUserTurn = -1;

  private readonly assistantTurnQueue: number[] = [];

  apply(event: TurnEvent): SessionTurn | null {
    return event.role === "user" ? this.applyUser(event) : this.applyAssistant(event);
  }

  reset(): void {
    this.turns.clear();
    this.turnOrder.length = 0;
    this.itemTurn.clear();
    this.nextUserTurn = 0;
    this.lastUserTurn = -1;
    this.assistantTurnQueue.length = 0;
  }

  private applyUser(event: TurnEvent): SessionTurn {
    const index = this.determineTurnIndex(event.role, event.itemId);
    const state = this.obtainTurnState(index);

    const message: MessageState = state.user ?? {
      message_id: event.itemId,
      role: "user",
      utterance: "",
      timestamp: event.timestamp,
      sequence: index * 2,
      final: false,
      queued: false
    };

    message.utterance = event.utterance;
    message.timestamp = event.timestamp;
    message.final = event.isFinal;
    message.queued = false;

    state.user = message;
    state.openedAt = state.openedAt ?? event.timestamp;
    if (event.isFinal) {
      state.userFinalized = true;
      state.closedAt = event.timestamp;
      this.releaseQueuedAssistants(state);
    } else if (!state.userFinalized) {
      state.closedAt = null;
    }
    state.assistantFinalized = false;

    return this.exportState(state);
  }

  private applyAssistant(event: TurnEvent): SessionTurn | null {
    const index = this.determineTurnIndex(event.role, event.itemId);
    const state = this.obtainTurnState(index);

    const existing = state.assistantByItem.get(event.itemId);
    const message: MessageState = existing ?? {
      message_id: event.itemId,
      role: "assistant",
      utterance: "",
      timestamp: event.timestamp,
      sequence: this.computeAssistantSequence(state),
      final: false,
      queued: true
    };

    message.utterance = event.utterance;
    message.timestamp = event.timestamp;
    message.final = event.isFinal;
    message.queued = !state.userFinalized;
    if (!event.isFinal) {
      state.assistantFinalized = false;
    }

    if (!existing) {
      state.assistantByItem.set(event.itemId, message);
      state.assistantOrder.push(event.itemId);
    }

    if (state.user === null) {
      return null;
    }

    if (!message.queued) {
      this.ensureAssistantChronology(state);
      if (event.isFinal) {
        state.assistantFinalized = true;
        if (state.closedAt === null) {
          state.closedAt = event.timestamp;
        }
      }
      return this.exportState(state);
    }

    return null;
  }

  private releaseQueuedAssistants(state: TurnState): void {
    for (const itemId of state.assistantOrder) {
      const message = state.assistantByItem.get(itemId);
      if (message) {
        message.queued = false;
      }
    }
    this.ensureAssistantChronology(state);
  }

  private ensureAssistantChronology(state: TurnState): void {
    if (!state.user) {
      return;
    }
    let lastTimestamp = state.user.timestamp;
    for (const itemId of state.assistantOrder) {
      const message = state.assistantByItem.get(itemId);
      if (!message || message.queued) {
        continue;
      }
      if (message.timestamp < lastTimestamp) {
        message.timestamp = lastTimestamp;
      }
      lastTimestamp = message.timestamp;
    }
  }

  private exportState(state: TurnState): SessionTurn {
    if (!state.user) {
      throw new Error("Cannot export turn without a user message");
    }

    const assistant = state.assistantOrder
      .map((itemId) => state.assistantByItem.get(itemId) ?? null)
      .filter((message): message is MessageState => message !== null && !message.queued)
      .sort((a, b) => a.sequence - b.sequence);

    const { queued: _userQueued, ...user } = state.user;
    return {
      turn_id: state.turnId,
      user,
      assistant: assistant.map((message) => {
        const { queued: _queued, ...rest } = message;
        return rest;
      }),
      opened_at: state.openedAt ?? state.user.timestamp,
      closed_at: state.closedAt
    };
  }

  private hasCompletedAssistantForCurrentTurn(): boolean {
    if (this.lastUserTurn < 0) {
      return false;
    }
    const state = this.turns.get(this.lastUserTurn);
    if (!state) {
      return false;
    }
    return state.userFinalized && state.assistantFinalized;
  }

  private determineTurnIndex(role: ConversationalRole, itemId: string): number {
    const existing = this.itemTurn.get(itemId);
    if (existing !== undefined) {
      if (role === "user") {
        this.lastUserTurn = existing;
        this.nextUserTurn = Math.max(this.nextUserTurn, existing + 1);
      }
      return existing;
    }

    if (role === "user") {
      let turnIndex: number;
      if (this.assistantTurnQueue.length > 0) {
        turnIndex = this.assistantTurnQueue.shift() as number;
        this.nextUserTurn = Math.max(this.nextUserTurn, turnIndex + 1);
      } else {
        turnIndex = this.nextUserTurn;
        this.nextUserTurn += 1;
      }
      this.itemTurn.set(itemId, turnIndex);
      this.lastUserTurn = turnIndex;
      return turnIndex;
    }

    let turnIndex: number;
    if (this.lastUserTurn >= 0 && !this.hasCompletedAssistantForCurrentTurn()) {
      turnIndex = this.lastUserTurn;
    } else {
      turnIndex = this.nextUserTurn + this.assistantTurnQueue.length;
      this.assistantTurnQueue.push(turnIndex);
    }
    this.itemTurn.set(itemId, turnIndex);
    return turnIndex;
  }

  private obtainTurnState(index: number): TurnState {
    const existing = this.turns.get(index);
    if (existing) {
      return existing;
    }
    const turnId = `turn-${index}`;
    const state: TurnState = {
      index,
      turnId,
      user: null,
      userFinalized: false,
      assistantFinalized: false,
      openedAt: null,
      closedAt: null,
      assistantOrder: [],
      assistantByItem: new Map(),
      assistantOffsets: 0
    };
    this.turns.set(index, state);
    this.turnOrder.push(index);
    return state;
  }

  private computeAssistantSequence(state: TurnState): number {
    const offset = state.assistantOffsets;
    state.assistantOffsets += 1;
    return state.index * 2 + 1 + offset * 0.01;
  }
}
