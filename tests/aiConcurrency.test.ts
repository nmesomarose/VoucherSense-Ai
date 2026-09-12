import { describe, expect, it } from "vitest";

describe("global AI concurrency semaphore", () => {
  it("caps the number of simultaneously running AI calls", async () => {
    // The Gemini client is only constructed to hold a slot semaphore here — no
    // real API call is made — so a dummy key scoped to this test is acceptable.
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "test-key-not-used";

    const [{ config }, { getActiveAiCallCount, withAiConcurrency }] = await Promise.all([
      import("../config"),
      import("../lib/ai/geminiClient"),
    ]);

    const limit = config.queue.concurrency;

    let active = 0;
    let maxActive = 0;
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const run = () =>
      withAiConcurrency(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await gate;
        active -= 1;
      });

    const tasks = Array.from({ length: limit * 3 }, () => run());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(getActiveAiCallCount()).toBe(limit);

    releaseGate();
    await Promise.all(tasks);

    expect(maxActive).toBe(limit);
    expect(getActiveAiCallCount()).toBe(0);
  });
});