import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { VoiceActivityMonitor, type VoiceActivityEvent } from "./voiceActivityMonitor";

const SAMPLE_RATE = 24_000;
const FRAME_MS = 20;
const FRAME_SIZE = Math.floor((SAMPLE_RATE * FRAME_MS) / 1000);
const INT16_MAX = 32767;

const buildFrame = (level: number): Int16Array => {
  const frame = new Int16Array(FRAME_SIZE);
  const clamped = Math.max(0, Math.min(level, 1));
  const amplitude = Math.floor(clamped * INT16_MAX);
  for (let i = 0; i < frame.length; i += 1) {
    frame[i] = amplitude;
  }
  return frame;
};

describe("VoiceActivityMonitor", () => {
  test("events maintain valid ordering under random levels", () => {
    const MAX_LEVEL = Math.fround(0.2);
    const property = fc.property(
      fc.array(fc.float({ min: 0, max: MAX_LEVEL }), { minLength: 20, maxLength: 400 }),
      (levels) => {
        let now = 0;
        const clock = () => now;
        const monitor = new VoiceActivityMonitor({
          sampleRate: SAMPLE_RATE,
          frameDurationMs: FRAME_MS,
          clock
        });

        const events: VoiceActivityEvent[] = [];
        let speaking = false;
        for (const level of levels) {
          now += FRAME_MS;
          const frame = buildFrame(level);
          events.push(...monitor.ingest(frame));
          for (const event of events) {
            if (event.type === "speech_started") {
              expect(speaking).toBe(false);
              speaking = true;
            } else if (event.type === "speech_continued") {
              expect(speaking).toBe(true);
            } else {
              expect(event.type).toBe("speech_ended");
              expect(speaking).toBe(true);
              speaking = false;
            }
          }
          events.length = 0;
        }
      }
    );

    fc.assert(property, { verbose: true });
  });
});
