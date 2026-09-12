import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeSummarize,
  consumeUpload,
  limitFor,
  resetRateLimitStore,
} from "../lib/rateLimit";

describe("rate limit buckets", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("allows requests up to the configured limit", () => {
    const userId = "user-a";
    const limit = limitFor("upload");
    for (let i = 0; i < limit; i += 1) {
      expect(consumeUpload(userId).allowed).toBe(true);
    }
  });

  it("blocks the request that crosses the limit", () => {
    const userId = "user-a";
    const limit = limitFor("upload");
    for (let i = 0; i < limit; i += 1) consumeUpload(userId);
    const blocked = consumeUpload(userId);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limit).toBe(limit);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks different users independently", () => {
    const limit = limitFor("upload");
    for (let i = 0; i < limit + 1; i += 1) consumeUpload("user-a");
    expect(consumeUpload("user-b").allowed).toBe(true);
  });

  it("keeps upload and summarize buckets independent", () => {
    const userId = "user-a";
    for (let i = 0; i < limitFor("upload") + 1; i += 1) consumeUpload(userId);
    // Exhausted the upload bucket; summarize should still be fresh.
    expect(consumeSummarize(userId).allowed).toBe(true);
  });

  it("resets buckets between windows", () => {
    const userId = "user-a";
    const limit = limitFor("upload");
    for (let i = 0; i < limit; i += 1) consumeUpload(userId);
    expect(consumeUpload(userId).allowed).toBe(false);
    resetRateLimitStore();
    expect(consumeUpload(userId).allowed).toBe(true);
  });
});