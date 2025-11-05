class PcmEncoderProcessor extends AudioWorkletProcessor {
  override process(inputs: Float32Array[][]): boolean {
    const input = inputs.at(0);
    if (!input || input.length === 0) {
      return true;
    }
    const channelData = input[0];
    if (!channelData) {
      return true;
    }
    const int16 = new Int16Array(channelData.length);
    for (let index = 0; index < channelData.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[index] ?? 0));
      int16[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    this.port.postMessage(int16, [int16.buffer]);
    return true;
  }
}

registerProcessor("pcm-encoder", PcmEncoderProcessor);
export {};
