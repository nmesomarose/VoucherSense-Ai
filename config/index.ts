/**
 * Central configuration — THE ONLY module in the codebase that reads
 * `process.env`. Every other file imports from here. (AGENTS.md §2)
 *
 * All defaults carry the `// Justification:` notes from PRD §1 so the
 * reasoning survives in the code itself.
 */

import { randomBytes } from "node:crypto";

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}".`);
  }
  return parsed;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",

  databaseUrl: process.env.DATABASE_URL ?? "",

  ai: {
    // Credential consumed only by lib/ai/geminiClient.ts. Never printed, logged,
    // exported to client components, or referenced anywhere else.
    apiKey: process.env.GEMINI_API_KEY ?? "",

    // Single model serves both roles — routing is by system prompt + schema, not by model.
    // Default is gemini-3.6-flash; older 2.5-series models are no longer offered to some
    // (new) accounts, so pick a model the account is actually authorized to call.
    model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
    // Justification: a single vision-capable model must be selected because Role 1 requires
    // image/PDF understanding (Gemini Flash understands both inline images and PDFs through
    // the same code path); using the same model for Role 2 (text-only) trades a small amount
    // of cost efficiency for architectural simplicity — the explicit assignment-approved
    // tradeoff.

    timeoutMs: numberFromEnv("AI_TIMEOUT_MS", 30_000),
    // Justification: 30s comfortably covers typical vision-model latency for a single image
    // without letting one slow call hold a worker slot indefinitely. NOTE (v2): confirm this
    // against the deployment platform's own request/function timeout — see §7.2.

    maxOutputTokens: numberFromEnv("AI_MAX_OUTPUT_TOKENS", 2_000),
    // Justification (revised in v2): raised from 1,000 to 2,000. A real supermarket receipt
    // can carry 20-40+ line items; at ~30-50 tokens per item once quantity/unit_price/line_total
    // keys are included, a 1,000-token cap risked truncating common, not just edge-case, receipts.
    // Paired with a hard maxItems cap (see §5.2, §7.1) so a pathological response still can't
    // run away.

    temperature: numberFromEnv("AI_TEMPERATURE", 0),
    // Justification: both roles are extraction/transformation tasks, not creative generation —
    // determinism and repeatability matter more than variation, so temperature is pinned to 0.

    maxRetries: numberFromEnv("AI_MAX_RETRIES", 2),
    // Justification: allows up to 3 total attempts (1 original + 2 retries) — enough to recover
    // from a transient malformed or truncated response without masking a persistently broken
    // prompt/schema.
  },

  queue: {
    concurrency: numberFromEnv("WORKER_CONCURRENCY", 4),
    // Justification: bounds simultaneous AI provider calls to stay well under typical per-account
    // rate limits and keeps memory use (image buffers in flight) predictable. Doubles as the
    // GLOBAL AI concurrency cap across both roles (see lib/ai/geminiClient.ts).

    pollIntervalMs: numberFromEnv("WORKER_POLL_INTERVAL_MS", 1_000),
    // Justification: 1s polling is frequent enough to feel responsive in a demo without
    // hammering the database; this is a DB-polling design, not a push-based queue.

    staleJobTimeoutMs: numberFromEnv("STALE_JOB_TIMEOUT_MS", 60_000),
    // Justification (v2): a job claimed (status='processing') longer than this without
    // completing is assumed abandoned by a crashed or restarted worker and is reclaimed by the
    // staleness reaper. Set to 2x the AI timeout so a legitimately slow-but-in-flight call is
    // never reclaimed out from under a worker that is still actively waiting on it.
  },

  uploads: {
    maxSizeBytes: numberFromEnv("MAX_UPLOAD_BYTES", 8 * 1024 * 1024), // 8 MB
    // Justification: PRD §8 caps each uploaded file at 8 MB — comfortably covers a
    // high-resolution phone photo of a single receipt without allowing arbitrarily large
    // uploads to consume storage/bandwidth.

    allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"] as const,
    // Justification: covers the two realistic capture methods (phone photo, scanned PDF)
    // without accepting formats the extractor was never designed to read.

    maxFilesPerBatch: numberFromEnv("MAX_FILES_PER_BATCH", 50),
    // Justification (v2): the batch upload route accepts multiple files in one request; this
    // caps a single request's file count independently of the per-minute request rate limit.
    // Set to the PRD's 50-file evidence scenario.
  },

  rateLimits: {
    uploadRequestsPerUserPerMinute: numberFromEnv("RATE_LIMIT_UPLOAD", 10),
    // Justification (v2): limits REQUESTS, not files. A 10-file batch consumes exactly one
    // unit. Stops a scripted client firing unbounded batch requests in seconds; file count is
    // bounded separately by maxFilesPerBatch.

    summarizePerUserPerMinute: numberFromEnv("RATE_LIMIT_SUMMARIZE", 20),
    // Justification: summarization is cheap and often re-triggered while iterating on a demo,
    // so the limit is looser than upload, but still bounded — tracked independently from the
    // upload bucket per the assignment's explicit requirement.
  },

  storage: {
    driver: process.env.STORAGE_DRIVER ?? "local", // "local" | "s3"
    // Base is just "./storage": storage keys already begin with the "receipts/" prefix
    // (see lib/storage/index.ts), so the final on-disk layout is
    // ./storage/receipts/<yyyy>/<mm>/<id>.<ext> — no double nesting.
    localBasePath: process.env.STORAGE_LOCAL_PATH ?? "./storage",
    // Justification: local filesystem is the documented dev-equivalent of object storage;
    // switching STORAGE_DRIVER to "s3" is the only change needed to move to production storage,
    // because application code only ever handles a storage key, never a raw path or binary.

    s3: {
      bucket: process.env.STORAGE_S3_BUCKET ?? "",
      region: process.env.STORAGE_S3_REGION ?? "auto",
      endpoint: process.env.STORAGE_S3_ENDPOINT ?? undefined,
      accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY ?? "",
    },
  },

  auth: {
    // Signs the session cookie. When unset, an ephemeral secret is generated at startup
    // (dev-only convenience) — sessions then do not survive a restart.
    sessionSecret: process.env.SESSION_SECRET ?? randomHex(32),
    cookieName: "vs_session",
    sessionMaxAgeSeconds: numberFromEnv("SESSION_MAX_AGE_SECONDS", 60 * 60 * 12), // 12 hours
    minPasswordLength: 8,
    // Justification: a floor that keeps accounts trivially strong without over-constraining;
    // enforcement lives in the register route and the UI.
  },
} as const;

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export type Config = typeof config;

/**
 * Validates that the environment the process needs to actually do work is present.
 * Called from Next's `instrumentation.ts` (at server startup) and from the worker
 * entrypoint. Importing `config` itself never throws so unit tests can load it
 * without a populated environment.
 */
export function validateConfig(): void {
  const required: Array<[string, string]> = [
    ["DATABASE_URL", process.env.DATABASE_URL ?? ""],
    ["GEMINI_API_KEY", process.env.GEMINI_API_KEY ?? ""],
  ];

  const missing = required.filter(([, value]) => value.trim().length === 0);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment configuration: ${missing
        .map(([name]) => name)
        .join(", ")}. ` +
        "Copy .env.example to .env and populate these values manually. " +
        "(AGENTS.md: credentials are never generated by an agent.)",
    );
  }

  if (!config.uploads.allowedMimeTypes.includes("application/pdf")) {
    throw new Error("Upload MIME allow-list must include application/pdf.");
  }
}