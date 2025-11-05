import { describe, expect, it } from "vitest";
import { base64ToInt16, int16ToBase64, int16ToFloat32 } from "./audio";

describe("audio utils", () => {
  it("round trips int16 base64", () => {
    const samples = new Int16Array([0, 1024, -1024, 32767, -32768]);
    const base64 = int16ToBase64(samples);
    const restored = base64ToInt16(base64);
    expect(Array.from(restored)).toEqual(Array.from(samples));
  });

  it("converts int16 to float32 within range", () => {
    const samples = new Int16Array([0, 32767, -32768]);
    const floats = int16ToFloat32(samples);
    expect(floats[0]).toBe(0);
    expect(floats[1]).toBeCloseTo(1, 5);
    expect(floats[2]).toBeCloseTo(-1, 5);
  });
});
