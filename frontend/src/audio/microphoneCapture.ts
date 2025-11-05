export type AudioChunkHandler = (chunk: Int16Array) => void;

interface CaptureOptions {
  readonly sampleRate: number;
}

export class MicrophoneCapture {
  private audioContext: AudioContext | null = null;

  private workletNode: AudioWorkletNode | null = null;

  private stream: MediaStream | null = null;

  private gainNode: GainNode | null = null;

  private running = false;

  constructor(private readonly options: CaptureOptions) {}

  async start(handler: AudioChunkHandler): Promise<void> {
    if (this.running) {
      return;
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: this.options.sampleRate,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false
      }
    });

    this.audioContext = new AudioContext({ sampleRate: this.options.sampleRate });
    await this.audioContext.audioWorklet.addModule(new URL("./pcm-worklet.ts", import.meta.url));

    this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-encoder", {
      channelCount: 1
    });
    this.workletNode.port.onmessage = (event: MessageEvent<Int16Array>) => {
      handler(event.data);
    };

    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0;

    source.connect(this.workletNode);
    this.workletNode.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    this.running = true;
    await this.audioContext.resume();
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;

    this.workletNode?.disconnect();
    this.gainNode?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());

    if (this.audioContext) {
      await this.audioContext.close();
    }

    this.workletNode = null;
    this.gainNode = null;
    this.stream = null;
    this.audioContext = null;
  }
}
