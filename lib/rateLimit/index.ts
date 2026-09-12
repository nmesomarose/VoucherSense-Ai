// lib/rateLimit/index.ts — two independent server-side token buckets per user:
// upload (counts REQUESTS, not files) and summarize. In-memory is the documented
// provisional implementation for a single-instance MVP (PRD §9, §12 item 5).

import { config } from "../../config";

export type RateLimitBucket = "upload" | "summarize";

interface BucketState {
  windowStartedAt: number;
  count: number;
}

/**
 * Keys are `"<bucket>:<userId>"`. state is a simple fixed-window counter: after
 * `windowMs` elapses the window resets. This is deliberately uncomplicated —
 * it bounds a single user hammering an endpoint, which is all the MVP needs.
 */
const state = new Map<string, BucketState>();
const WINDOW_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  /** Requests per window for this bucket. */
  limit: number;
  /** Seconds until the current window resets (only meaningful when denied). */
  retryAfterSeconds: number;
}

export function limitFor(bucket: RateLimitBucket): number {
  return bucket === "upload"
    ? config.rateLimits.uploadRequestsPerUserPerMinute
    : config.rateLimits.summarizePerUserPerMinute;
}

export function checkRateLimit(
  bucket: RateLimitBucket,
  userId: string,
): RateLimitResult {
  const limit = limitFor(bucket);
  const key = `${bucket}:${userId}`;
  const now = Date.now();

  const entry = state.get(key);
  if (!entry || now - entry.windowStartedAt >= WINDOW_MS) {
    state.set(key, { windowStartedAt: now, count: 1 });
    return { allowed: true, limit, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((entry.windowStartedAt + WINDOW_MS - now) / 1000),
    );
    return { allowed: false, limit, retryAfterSeconds };
  }

  return { allowed: true, limit, retryAfterSeconds: 0 };
}

export function consumeUpload(userId: string): RateLimitResult {
  return checkRateLimit("upload", userId);
}

export function consumeSummarize(userId: string): RateLimitResult {
  return checkRateLimit("summarize", userId);
}

/** Exposed for tests only — clears all in-memory bucket state. */
export function resetRateLimitStore(): void {
  state.clear();
}