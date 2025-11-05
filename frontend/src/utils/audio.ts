const INT16_MAX = 0x7fff;

export function float32ToInt16(samples: Float32Array): Int16Array {
  const buffer = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const s = Math.max(-1, Math.min(1, samples[index] ?? 0));
    buffer[index] = s < 0 ? s * INT16_MAX : s * INT16_MAX;
  }
  return buffer;
}

export function int16ToBase64(data: Int16Array): string {
  const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < view.length; index += chunk) {
    const slice = view.subarray(index, index + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const length = binary.length;
  const buffer = new ArrayBuffer(length);
  const view = new Uint8Array(buffer);
  for (let index = 0; index < length; index += 1) {
    const code = binary.charCodeAt(index);
    view[index] = Number.isNaN(code) ? 0 : code & 0xff;
  }
  return new Int16Array(buffer);
}

export function int16ToFloat32(samples: Int16Array): Float32Array {
  const floats = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    const denominator = sample < 0 ? 0x8000 : INT16_MAX;
    floats[index] = sample / denominator;
  }
  return floats;
}
