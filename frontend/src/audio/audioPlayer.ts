import { base64ToInt16, int16ToFloat32 } from "../utils/audio";

interface AudioPlayerOptions {
  readonly sampleRate: number;
}

export class AudioPlayer {
  private context: AudioContext;

  private gain: GainNode;

  private playhead = 0;

  private readonly sources = new Set<AudioBufferSourceNode>();

  constructor(private readonly options: AudioPlayerOptions) {
    this.context = new AudioContext({ sampleRate: options.sampleRate });
    this.gain = this.context.createGain();
    this.gain.connect(this.context.destination);
  }

  private attachSource(source: AudioBufferSourceNode): void {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
    };
  }

  async enqueueFromBase64(chunk: string): Promise<void> {
    if (!chunk) {
      return;
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    const buffer = base64ToInt16(chunk);
    const floats = int16ToFloat32(buffer);

    const audioBuffer = this.context.createBuffer(1, floats.length, this.options.sampleRate);
    audioBuffer.copyToChannel(new Float32Array(floats), 0);

    const source = this.context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gain);
    this.attachSource(source);

    const startAt = Math.max(this.context.currentTime, this.playhead);
    source.start(startAt);
    this.playhead = startAt + audioBuffer.duration;
  }

  async reset(): Promise<void> {
    this.playhead = 0;

    for (const source of this.sources) {
      try {
        source.stop();
      } catch (error) {
        /* no-op */
      }
    }
    this.sources.clear();

    if (this.context.state !== "closed") {
      await this.context.suspend();
    }
  }
}
