export type VoiceActivityEventType = "speech_started" | "speech_continued" | "speech_ended";

export interface VoiceActivityEvent {
  readonly type: VoiceActivityEventType;
  readonly timestamp: number;
  readonly level: number;
}

interface VoiceActivityMonitorOptions {
  readonly sampleRate: number;
  readonly frameDurationMs?: number;
  readonly attackMs?: number;
  readonly releaseMs?: number;
  readonly speechThreshold?: number;
  readonly silenceThreshold?: number;
  readonly minimumSpeechMs?: number;
  readonly minimumSilenceMs?: number;
  readonly clock?: () => number;
}

const DEFAULT_FRAME_MS = 20;
const DEFAULT_ATTACK_MS = 40;
const DEFAULT_RELEASE_MS = 120;
const DEFAULT_SPEECH_THRESHOLD = 0.015;
const DEFAULT_SILENCE_THRESHOLD = 0.008;
const DEFAULT_MIN_SPEECH_MS = 180;
const DEFAULT_MIN_SILENCE_MS = 180;
const INT16_MAX = 32768;

export class VoiceActivityMonitor {
  private readonly frameSize: number;
  private readonly attackFactor: number;
  private readonly releaseFactor: number;
  private readonly speechThreshold: number;
  private readonly silenceThreshold: number;
  private readonly minSpeechFrames: number;
  private readonly minSilenceFrames: number;
  private readonly clock: () => number;

  private buffer = new Int16Array(0);
  private smoothedLevel = 0;
  private speechFrames = 0;
  private silenceFrames = 0;
  private state: "silence" | "speech" = "silence";

  constructor(options: VoiceActivityMonitorOptions) {
    const frameMs = options.frameDurationMs ?? DEFAULT_FRAME_MS;
    this.frameSize = Math.max(1, Math.floor((options.sampleRate * frameMs) / 1000));
    this.attackFactor = this.computeSmoothingFactor(options.attackMs ?? DEFAULT_ATTACK_MS, frameMs);
    this.releaseFactor = this.computeSmoothingFactor(options.releaseMs ?? DEFAULT_RELEASE_MS, frameMs);
    this.speechThreshold = options.speechThreshold ?? DEFAULT_SPEECH_THRESHOLD;
    this.silenceThreshold = options.silenceThreshold ?? DEFAULT_SILENCE_THRESHOLD;

    const minSpeechMs = options.minimumSpeechMs ?? DEFAULT_MIN_SPEECH_MS;
    const minSilenceMs = options.minimumSilenceMs ?? DEFAULT_MIN_SILENCE_MS;
    this.minSpeechFrames = Math.max(1, Math.floor(minSpeechMs / frameMs));
    this.minSilenceFrames = Math.max(1, Math.floor(minSilenceMs / frameMs));
    this.clock = options.clock ?? (() => Date.now());
  }

  ingest(chunk: Int16Array): VoiceActivityEvent[] {
    if (chunk.length === 0) {
      return [];
    }
    const merged = new Int16Array(this.buffer.length + chunk.length);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;

    const events: VoiceActivityEvent[] = [];
    let offset = 0;

    while (offset + this.frameSize <= this.buffer.length) {
      const frame = this.buffer.subarray(offset, offset + this.frameSize);
      const level = this.computeRms(frame);
      this.updateSmoothedLevel(level);
      offset += this.frameSize;
      events.push(...this.stepStateMachine());
    }

    if (offset > 0) {
      this.buffer = this.buffer.subarray(offset);
    }

    return events;
  }

  reset(): void {
    this.buffer = new Int16Array(0);
    this.smoothedLevel = 0;
    this.speechFrames = 0;
    this.silenceFrames = 0;
    this.state = "silence";
  }

  private computeSmoothingFactor(timeMs: number, frameMs: number): number {
    if (timeMs <= 0) {
      return 1;
    }
    const frames = Math.max(1, timeMs / frameMs);
    return 1 - Math.exp(-1 / frames);
  }

  private computeRms(frame: Int16Array): number {
    let sum = 0;
    for (let i = 0; i < frame.length; i += 1) {
      const raw = frame[i] ?? 0;
      const sample = raw / INT16_MAX;
      sum += sample * sample;
    }
    return Math.sqrt(sum / frame.length);
  }

  private updateSmoothedLevel(level: number): void {
    const factor = level > this.smoothedLevel ? this.attackFactor : this.releaseFactor;
    this.smoothedLevel = this.smoothedLevel + factor * (level - this.smoothedLevel);
  }

  private stepStateMachine(): VoiceActivityEvent[] {
    const now = this.clock();
    const events: VoiceActivityEvent[] = [];

    if (this.state === "silence") {
      if (this.smoothedLevel >= this.speechThreshold) {
        this.speechFrames += 1;
        this.silenceFrames = 0;
        if (this.speechFrames >= this.minSpeechFrames) {
          this.state = "speech";
          this.speechFrames = 0;
          events.push({ type: "speech_started", timestamp: now, level: this.smoothedLevel });
        }
      } else {
        this.speechFrames = 0;
      }
      return events;
    }

    if (this.smoothedLevel >= this.silenceThreshold) {
      this.silenceFrames = 0;
      events.push({ type: "speech_continued", timestamp: now, level: this.smoothedLevel });
      return events;
    }

    this.silenceFrames += 1;
    if (this.silenceFrames >= this.minSilenceFrames) {
      this.state = "silence";
      this.silenceFrames = 0;
      events.push({ type: "speech_ended", timestamp: now, level: this.smoothedLevel });
    }
    return events;
  }
}
