# VoucherSense AI — Implementation PRD

*Version 2 — Revised after live multi-role audit*
*Follows the Product Discovery & Architecture Review and the PRD v1 audit. This document specifies what to build.*

---

## Revision Note — What Changed From v1

This is a revised version of the Implementation PRD, produced after a live multi-role audit (Skeptic, Author, Engineer, Product Lead, Judge) surfaced 15 lapses in the original document, ranked by severity. Every correction from that audit has been applied directly into the sections below rather than left as a separate errata list. Sections carrying a material change are marked with a **`> FIX APPLIED (v2):`** blockquote at the point of change. The full audit correction log is reproduced in the Appendix for traceability.

The three highest-severity corrections, applied throughout this document, are:

- Deployment target is now a required, highest-priority open decision (§0, §12) — the worker design in §4 explicitly assumes a persistent-process host and is incompatible with default serverless Next.js hosting.
- Bulk upload is now a first-class, batch-capable route (§3), and the upload rate limit is redefined as request-based rather than file-based (§1, §9) — the original config would have blocked the assignment's own 50-receipt evidence scenario.
- The worker now includes a staleness reaper (§4) to reclaim jobs abandoned mid-processing by a crashed or restarted worker — the original design had no recovery path for this case.

---

## 0. Assumptions Locked In For This PRD

| Decision | Choice | Status |
|---|---|---|
| AI provider / model strategy | One Gemini model, two system prompts, two structured-output schemas (Option B) | Confirmed by you |
| Stack | Next.js (App Router) + TypeScript + Prisma + PostgreSQL | Assumed — matches your pattern on other projects; flag if wrong |
| Queue mechanism | Simple DB-polling worker using Postgres row-locking (`FOR UPDATE SKIP LOCKED`) — no Redis/BullMQ | Assumed — depends on deployment target below |
| Object storage | Local filesystem in dev, documented as swappable for S3-compatible storage in production | Carried over from discovery doc |
| Deployment target | Not yet specified | **NEW — highest priority open item; see §12** |

> **FIX APPLIED (v2):** Deployment target added as an explicit assumption gap. The Engineer's audit objection: a long-running Node worker process with polling loops (§4) requires a persistent host (VM, container service, dedicated worker dyno) and does NOT run on default serverless Next.js hosting (e.g. Vercel). If the target is serverless, §4's mechanism cannot be built as written and needs to be replaced with a cron-triggered drain pattern. This must be resolved before scaffolding — items 2 and 3 in §12 both depend on it.

---

## 1. Central Configuration

One module, no scattered `process.env.X` calls elsewhere in the codebase. Every AI-related and operational parameter lives here, with a one-line justification for each.

```typescript
// config/index.ts

export const config = {
  ai: {
    // Single model serves both roles — routing is by system prompt + schema, not by model.
    model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
    // Justification: a single vision-capable model must be selected because Role 1 requires
    // image/PDF understanding; using the same model for Role 2 (text-only) trades a small
    // amount of cost efficiency for architectural simplicity — the explicit assignment-approved
    // tradeoff. NOTE: the 2.5-series models are no longer offered to new accounts, so the
    // default is gemini-3.6-flash (pick the model your account is actually authorized to call).

    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30_000),
    // Justification: 30s comfortably covers typical vision-model latency for a single image
    // without letting one slow call hold a worker slot indefinitely. NOTE (v2): confirm this
    // against the deployment platform's own request/function timeout — see §7.2.

    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 2_000),
    // Justification (revised in v2): raised from 1,000 to 2,000. A real supermarket receipt
    // can carry 20-40+ line items; at ~30-50 tokens per item once quantity/unit_price/line_total
    // keys are included, a 1,000-token cap risked truncating common, not just edge-case, receipts.
    // Paired with a hard maxItems cap (see §5.2, §7.1) so a pathological response still can't
    // run away.

    temperature: Number(process.env.AI_TEMPERATURE ?? 0),
    // Justification: both roles are extraction/transformation tasks, not creative generation —
    // determinism and repeatability matter more than variation, so temperature is pinned to 0.

    maxRetries: Number(process.env.AI_MAX_RETRIES ?? 2),
    // Justification: allows up to 3 total attempts (1 original + 2 retries) — enough to recover
    // from a transient malformed or truncated response without masking a persistently broken
    // prompt/schema.
  },

  queue: {
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
    // Justification: bounds simultaneous Gemini calls to stay well under typical per-account
    // rate limits and keeps memory use (image buffers in flight) predictable; 4 is large enough
    // to clear a 50-file batch in a reasonable demo window, small enough to make the cap visibly
    // binding in evidence screenshots.

    pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1_000),
    // Justification: 1s polling is frequent enough to feel responsive in a demo without
    // hammering the database; this is a DB-polling design, not a push-based queue.

    staleJobTimeoutMs: Number(process.env.STALE_JOB_TIMEOUT_MS ?? 60_000),
    // Justification (NEW in v2): a job claimed (status='processing') longer than this without
    // completing is assumed abandoned by a crashed or restarted worker and is reclaimed by the
    // staleness reaper (see §4.3). Set to 2x the AI timeout so a legitimately slow-but-in-flight
    // call is never reclaimed out from under a worker that is still actively waiting on it.
  },

  uploads: {
    maxSizeBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 8 * 1024 * 1024), // 8MB
    // Justification: comfortably covers a high-resolution phone photo of a single receipt
    // without allowing arbitrarily large uploads to consume storage/bandwidth.

    allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
    // Justification: covers the two realistic capture methods (phone photo, scanned PDF)
    // without accepting formats the extractor was never designed to read.

    maxFilesPerBatch: Number(process.env.MAX_FILES_PER_BATCH ?? 50),
    // Justification (NEW in v2): the batch upload route (see §3) accepts multiple files in one
    // request; this caps a single request's file count independently of the per-minute request
    // rate limit below, so the two controls address different abuse shapes.
  },

  rateLimits: {
    uploadRequestsPerUserPerMinute: Number(process.env.RATE_LIMIT_UPLOAD ?? 10),
    // Justification (revised in v2): this now limits REQUESTS, not files. A user submitting 50
    // receipts in one batch request consumes exactly one unit of this limit — the original v1
    // config limited individual files and would have blocked the assignment's own 50-receipt
    // demo scenario. This limit exists to stop a scripted client from firing unbounded batch
    // requests in seconds, not to cap how many files one legitimate batch can contain (that's
    // maxFilesPerBatch above).

    summarizePerUserPerMinute: Number(process.env.RATE_LIMIT_SUMMARIZE ?? 20),
    // Justification: summarization is cheap and often re-triggered while iterating on a demo,
    // so the limit is looser than upload, but still bounded — this is a separate limit per the
    // assignment's explicit requirement that the follow-up endpoint be rate-limited independently.
  },

  storage: {
    driver: process.env.STORAGE_DRIVER ?? "local", // "local" | "s3"
    localBasePath: process.env.STORAGE_LOCAL_PATH ?? "./storage/receipts",
    // Justification: local filesystem is the documented dev-equivalent of object storage;
    // switching STORAGE_DRIVER to "s3" is the only change needed to move to production storage,
    // because application code only ever handles a storage key, never a raw path or binary.
  },
} as const;
```

```
# .env.example

GEMINI_API_KEY=              # set manually, never generated or exposed by an agent
GEMINI_MODEL=gemini-3.6-flash # single model used for both AI roles
AI_TIMEOUT_MS=30000
AI_MAX_OUTPUT_TOKENS=2000
AI_TEMPERATURE=0
AI_MAX_RETRIES=2
WORKER_CONCURRENCY=4
WORKER_POLL_INTERVAL_MS=1000
STALE_JOB_TIMEOUT_MS=60000
MAX_UPLOAD_BYTES=8388608
MAX_FILES_PER_BATCH=50
RATE_LIMIT_UPLOAD=10
RATE_LIMIT_SUMMARIZE=20
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./storage/receipts
DATABASE_URL=                # Postgres connection string
```

---

## 2. Data Model (Prisma)

```prisma
// prisma/schema.prisma

model User {
  id        String    @id @default(cuid())
  createdAt DateTime  @default(now())
  receipts  Receipt[]

  // Deliberately minimal — no auth fields. A single seeded demo user is sufficient
  // since real authentication is explicitly out of scope for this MVP.
}

model Receipt {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  storageKey       String   // e.g. "receipts/2026/09/clx9f...jpg" — never the binary
  originalFilename String
  mimeType         String
  sizeBytes        Int
  batchId          String?  // groups files submitted together in one batch upload request
  uploadedAt       DateTime @default(now())
  job              Job?
}

enum JobStatus {
  pending
  processing
  done
  failed
}

model Job {
  id              String    @id @default(cuid())
  receiptId       String    @unique
  receipt         Receipt   @relation(fields: [receiptId], references: [id])
  status          JobStatus @default(pending)
  attemptCount    Int       @default(0)
  errorMessage    String?
  claimedBy       String?   // worker instance id
  claimedAt       DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  attempts         JobAttempt[]
  extractionResult ExtractionResult?

  @@index([status, createdAt]) // supports FIFO claiming and the staleness reaper scan
}

model JobAttempt {
  id               String   @id @default(cuid())
  jobId            String
  job              Job      @relation(fields: [jobId], references: [id])
  attemptNumber    Int
  rawResponse      String   @db.Text
  validationError  String?  @db.Text // null if this attempt passed validation
  outcome          String   // "valid" | "invalid_schema" | "truncated" | "timeout" | "provider_error"
  createdAt        DateTime @default(now())

  @@index([jobId])
}

model ExtractionResult {
  id              String   @id @default(cuid())
  jobId           String   @unique
  job             Job      @relation(fields: [jobId], references: [id])
  merchant        String?
  purchaseDate    String?  // stored as returned (YYYY-MM-DD) or null
  currency        String?
  total           Float?
  paymentMethod   String   // enum value, validated at app level
  category        String   // enum value, validated at app level
  items           Json     // array of { name, quantity, unit_price, line_total }, max 40 entries
  confidenceNote  String?
  createdAt       DateTime @default(now())

  summary         Summary?
}

model Summary {
  id                 String           @id @default(cuid())
  extractionResultId String           @unique
  extractionResult   ExtractionResult @relation(fields: [extractionResultId], references: [id])
  status             String           @default("pending") // pending | done | failed — see §7.2
  attemptCount       Int              @default(0)
  errorMessage       String?
  summaryText        String?
  totalSpent         Float?
  currency           String?
  category           String?
  largestItem        String?
  itemCount          Int?
  createdAt          DateTime         @default(now())
}
```

Notes:

- `JobAttempt.outcome` now includes `"truncated"` as a distinct value (v2), detected via the Gemini response's `finishReason === "MAX_TOKENS"` before any parse is attempted — a truncated response is a different failure class from a malformed one (token-budget problem vs. prompt/schema problem) and needs its own retry framing.
- `Receipt.batchId` is new in v2 — supports the batch upload route in §3 and lets the UI group a bulk submission's jobs together.

> **FIX APPLIED (v2):** Job/Receipt 1:1 relationship note corrected. v1 claimed the separate-tables design was "cleaner if a reprocess feature is ever added," but the `Job.receiptId @unique` constraint as written does not actually support independent multi-attempt history per receipt — retries work by resetting the existing `Job` row's status, not by adding a new one. The 1:1 design is accurate and intentional for MVP simplicity; the overstated future-flexibility claim has been removed. If independent multi-attempt history is ever required, the `@unique` constraint would need to be dropped.

---

## 3. API / Route Design

| Route | Method | Purpose | Rate limit |
|---|---|---|---|
| `/api/receipts/batch` | `POST` | Upload one or more receipt files in a single multipart request (up to `maxFilesPerBatch`). Validates each file independently, stores it, creates one `Receipt` + `Job` pair per file sharing a `batchId`, returns an array of `jobId`s immediately. | Yes — upload bucket, 1 unit/request |
| `/api/jobs` | `GET` | List the current user's jobs with status, for the Processing/Job view. Supports filtering by `batchId`. | No |
| `/api/jobs/:id` | `GET` | Poll a single job's status (`pending`/`processing`/`done`/`failed`), including `errorMessage` if failed. | No |
| `/api/jobs/:id/result` | `GET` | Return the validated `ExtractionResult` for a `done` job. 404/409 if not yet done. | No |
| `/api/jobs/:id/retry` | `POST` | Re-enqueue a `failed` job. Returns HTTP 409 Conflict if the job's current status is not `failed`. | Yes — upload bucket |
| `/api/results/:id/summarize` | `POST` | Trigger Role 2 on a validated extraction. Idempotent: if a `Summary` already exists for this `extractionResultId`, returns the existing one (HTTP 200) instead of making a new AI call. | Yes — summarize bucket |
| `/api/results/:id/summary` | `GET` | Fetch the stored summary, if one exists. | No |

*"Upload bucket" = `uploadRequestsPerUserPerMinute` (§1) — one unit per request regardless of file count. "Summarize bucket" = `summarizePerUserPerMinute` (§1), tracked independently from uploads.*

> **FIX APPLIED (v2):** Batch upload route added, replacing the v1 single-file `/api/receipts` POST. The audit identified that a 50-file submission via 50 individual requests would be rejected almost entirely by the upload rate limit, directly undermining the assignment's own required concurrency-cap evidence scenario. One batch request now consumes exactly one rate-limit unit regardless of how many files it contains (bounded separately by `maxFilesPerBatch`).

> **FIX APPLIED (v2):** Retry route now explicitly guarded: HTTP 409 if the job is not currently `failed`, preventing a retry call from resetting a `done` job's status and orphaning a valid `ExtractionResult`.

> **FIX APPLIED (v2):** Summarize route is now explicitly idempotent, avoiding an unhandled unique-constraint conflict or a wasted duplicate AI call if the endpoint is called twice for the same extraction (e.g. a double-click in the UI).

---

## 4. Background Worker Design (Role 1 — Extraction)

> **IMPLEMENTATION NOTE:** This design assumes a persistent-process host (a VM, container service, or dedicated worker process/dyno) that can run a long-lived Node process continuously. It is NOT compatible with default serverless Next.js hosting (e.g. Vercel's standard function model), where processes do not persist between invocations and cannot run indefinite polling loops. Confirm the deployment target (§0, §12) before implementing this section — if the target is serverless, replace this design with a cron-triggered function that claims and processes a small batch of jobs per invocation, which changes the concurrency guarantees described below.

### 4.1 Claiming a job (the concurrency mechanism)

The worker is a long-running Node process (`worker/index.ts`) running `WORKER_CONCURRENCY` independent async loops. Each loop repeatedly:

1. Attempts to atomically claim one `pending` job using a `SELECT ... FOR UPDATE SKIP LOCKED` query (via `$queryRaw` in Prisma), ordered by `createdAt ASC` (FIFO).
2. If a job is claimed, sets `status = processing`, `claimedBy = <worker-loop-id>`, `claimedAt = now()`.
3. Calls the extractor (§5), validates (§6), retries per policy, and writes the final `done`/`failed` state plus `JobAttempt` rows.
4. If no job is available, sleeps `pollIntervalMs` and polls again.

`SKIP LOCKED` is the specific mechanism that makes the concurrency cap real rather than cosmetic: two loops can never claim the same row. This part of the design held up under audit scrutiny without changes — the Engineer confirmed the claim mechanism itself is sound. What the audit found missing was recovery after a successful claim (see §4.3).

```typescript
// worker/claimJob.ts
const claimed = await prisma.$queryRaw<Job[]>`
  UPDATE "Job"
  SET status = 'processing', "claimedAt" = now(), "claimedBy" = ${workerId}
  WHERE id = (
    SELECT id FROM "Job"
    WHERE status = 'pending'
    ORDER BY "createdAt" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
`;
```

### 4.2 Per-job processing sequence

```
claim job (status -> processing)
  |
attemptCount = 0
loop:
  attemptCount += 1
  call Gemini (Role 1 prompt + schema, timeout enforced) -> raw response
  if finishReason === "MAX_TOKENS" -> outcome = "truncated" (see 7.1), treat as retryable, continue loop
  record JobAttempt(rawResponse, outcome)
  if timeout or provider error (non-retryable class) -> break, outcome = failed
  validate(raw response) against Zod schema
  if valid -> store ExtractionResult, status = done, break
  if invalid and attemptCount < maxRetries + 1 -> append validation error to next prompt, continue loop
  if invalid and attemptCount == maxRetries + 1 -> status = failed, errorMessage = last error, break
```

### 4.3 Staleness reaper (NEW in v2)

The audit identified that no mechanism existed to recover a job left in `processing` after a worker crashes or the process restarts mid-job — it would sit in that state indefinitely, which is a direct reliability gap the assignment's own defence questions probe for ("what happens if the process restarts mid-batch").

Before claiming a new `pending` job, each worker loop also runs a reclaim check:

```typescript
// worker/reapStaleJobs.ts — run once per poll cycle, before claiming new work
await prisma.$executeRaw`
  UPDATE "Job"
  SET
    status = CASE WHEN "attemptCount" >= ${config.ai.maxRetries + 1} THEN 'failed' ELSE 'pending' END,
    "errorMessage" = CASE WHEN "attemptCount" >= ${config.ai.maxRetries + 1}
      THEN 'Job abandoned by a worker that did not complete in time.'
      ELSE "errorMessage" END,
    "claimedBy" = NULL,
    "claimedAt" = NULL
  WHERE status = 'processing'
    AND "claimedAt" < now() - (${config.queue.staleJobTimeoutMs}::text || ' milliseconds')::interval;
`;
```

> **FIX APPLIED (v2):** Staleness reaper added. `staleJobTimeoutMs` (default 60s, i.e. 2x the AI timeout) bounds how long a job can sit in `processing` before being treated as abandoned. A reclaimed job with retries remaining goes back to `pending` (and re-enters the FIFO queue — see note below); one that has exhausted its retries goes to `failed` with an honest error message, rather than remaining silently stuck.

Note on FIFO fairness: a retried or reclaimed job keeps its original `createdAt`, so it re-enters the queue ahead of newer, never-attempted jobs rather than at the back. This is treated as intentional, not a bug — a job that already has a partial attempt history is judged to warrant priority over one that hasn't started yet.

---

## 5. AI Integration — Role 1: Receipt Extractor

SDK: official `@google/genai` npm package. Input: the receipt file (base64-encoded image, or PDF) as an `inlineData` part plus the system prompt below, sent via `models.generateContent`. Structured output: Gemini structured JSON via `responseMimeType: "application/json"` plus a `responseSchema` synthesized from the schema in §5.2.

> **IMPLEMENTATION NOTE (resolved in the Gemini migration):** Gemini accepts images and PDFs through the same `inlineData` part, so no separate PDF content-block code path is required — the originally specified provider's split image/PDF paths collapsed into one. If a future Gemini version changes PDF handling, branch the extractor call accordingly and add any PDF-specific error cases to the failure table in §8.

### 5.1 System prompt (full text)

```
You are a receipt data extraction engine. You will be shown an image or PDF of a single
purchase receipt. Your only job is to extract the information that is visibly present on
the receipt into the required JSON structure.

Rules you must follow exactly:

1. Only report information that is visibly legible on the receipt. Never guess, infer, or
   fill in a plausible-sounding value for anything you cannot actually read.
2. If a field is not present on the receipt, or is present but illegible, set it to null.
   Do not omit the field - every field in the schema must appear in your response.
3. "payment_method" must be one of exactly: cash, card, transfer, pos, unknown. If the
   receipt does not clearly state the payment method, use "unknown" - never guess based
   on the type of store.
4. "category" must be one of exactly: groceries, fuel, transport, dining, utilities,
   office_supplies, equipment, services, other. Choose the single best fit based on the
   merchant name and items purchased. If genuinely unclear, use "other".
5. "purchase_date" must be in YYYY-MM-DD format if a date is present and legible,
   otherwise null. Do not guess a date from context if the receipt itself doesn't show one.
6. "currency" should be the ISO 4217 code if determinable from a symbol or explicit label
   (e.g. a Naira symbol or "NGN" implies "NGN"). If genuinely ambiguous, use null.
7. "total" must be the final total actually charged, as printed on the receipt - not a
   subtotal, unless no total line exists, in which case use null.
8. For each line item, extract "name" as printed (cleaned of obvious OCR noise but not
   reworded), and "quantity", "unit_price", "line_total" where legible, otherwise null for
   those numeric fields individually. Do not skip an item because one of its numeric
   fields is unreadable - include the item with whatever fields you can read.
9. Report at most 40 items. If the receipt genuinely has more, include the 40 highest-value
   line items and note the omission in "confidence_note".
10. Use "confidence_note" to briefly flag anything that affects reliability - for example,
    part of the receipt is cut off, the image is blurry in a way that affects a specific
    field, the total appears to include an unlisted discount, or items were omitted per
    rule 9. Leave it null if nothing notable applies.
11. Return only the structured JSON object. Do not include any explanation, preamble, or
    text outside the JSON structure.

If you are given feedback about a previous invalid or incomplete response, correct exactly
the issue described and return a complete, corrected JSON object.
```

### 5.2 JSON Schema (Gemini structured output — canonical field/type definitions)

```json
{
  "name": "receipt_extraction",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "merchant": { "type": ["string", "null"] },
      "purchase_date": { "type": ["string", "null"], "description": "YYYY-MM-DD or null" },
      "currency": { "type": ["string", "null"], "description": "ISO 4217 code or null" },
      "total": { "type": ["number", "null"] },
      "payment_method": {
        "type": "string",
        "enum": ["cash", "card", "transfer", "pos", "unknown"]
      },
      "category": {
        "type": "string",
        "enum": ["groceries", "fuel", "transport", "dining", "utilities",
                 "office_supplies", "equipment", "services", "other"]
      },
      "items": {
        "type": "array",
        "maxItems": 40,
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "quantity": { "type": ["number", "null"] },
            "unit_price": { "type": ["number", "null"] },
            "line_total": { "type": ["number", "null"] }
          },
          "required": ["name", "quantity", "unit_price", "line_total"],
          "additionalProperties": false
        }
      },
      "confidence_note": { "type": ["string", "null"] }
    },
    "required": [
      "merchant", "purchase_date", "currency", "total",
      "payment_method", "category", "items", "confidence_note"
    ],
    "additionalProperties": false
  }
}
```

> **FIX APPLIED (v2):** `maxItems: 40` added to the schema, paired with the raised token budget in §1 and system prompt rule 9, so a pathological or unusually long receipt cannot exceed the configured output budget.

> **FIX APPLIED (v2):** Correctness caveat added per audit: schema validation (§7.1) confirms the response is well-formed and internally consistent — it does NOT confirm the extraction is factually correct. Category and payment-method are judgment calls the model makes from visual context; an incorrect-but-validly-enumerated value (e.g. a hardware store miscategorized as "other" instead of "equipment") will pass every validation gate in this system. This is a known MVP limitation, not something schema validation can resolve, and should be named explicitly in the assignment write-up rather than implied away.

---

## 6. AI Integration — Role 2: Expense Analyst

Input: the *validated* `ExtractionResult` row, serialized as plain JSON, including `confidence_note` (added in v2 — see below) — the original receipt file is never re-sent. Trigger: user-initiated, via `/api/results/:id/summarize`.

### 6.1 System prompt (full text)

```
You are an expense summarization engine. You will be given a single, already-validated
structured expense record extracted from a receipt, including a confidence note if one
was flagged during extraction. Your job is to produce a short, plain-language summary and
a small set of derived fields.

Rules you must follow exactly:

1. Base your summary only on the data provided. Do not re-interpret, correct, or second-
   guess the extraction.
2. "summary" must be one or two plain-language sentences a small-business owner would
   understand at a glance - merchant, amount, and category at minimum, when that data is
   present. Do not use accounting jargon.
3. If "merchant" is null, "total" is null, or "items" is empty, do not describe an amount
   or merchant that wasn't actually captured. Instead, write a summary that plainly says
   the receipt could not be fully read and describe only what data is actually available.
4. If a confidence note is present indicating the extraction may be incomplete or
   unreliable, reflect that briefly in the summary rather than presenting the data with
   full confidence.
5. "total_spent" must exactly equal the "total" field from the input (which may be null).
6. "currency" must exactly equal the "currency" field from the input (which may be null).
7. "category" must exactly equal the "category" field from the input - do not re-
   categorize it.
8. "largest_item" is the name of the item with the highest line_total in the input's
   items array. If items is empty or all line_total values are null, use null.
9. "item_count" is the count of entries in the input's items array (0 if empty).
10. Return only the structured JSON object, nothing else.
```

> **FIX APPLIED (v2):** Rules 3 and 4 added. The audit found the v1 prompt assumed merchant/total/items would always be present, with no instruction for the (fully valid, schema-legal) case where they are null — and `confidence_note` wasn't even passed to Role 2, so it had no way to know an extraction was unreliable. Both gaps are closed: the field is now included in the payload, and the prompt tells the model what to do when the data is thin or flagged as uncertain.

### 6.2 JSON Schema

```json
{
  "name": "expense_summary",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "summary": { "type": "string" },
      "total_spent": { "type": ["number", "null"] },
      "currency": { "type": ["string", "null"] },
      "category": { "type": "string" },
      "largest_item": { "type": ["string", "null"] },
      "item_count": { "type": "integer" }
    },
    "required": ["summary", "total_spent", "currency", "category", "largest_item", "item_count"],
    "additionalProperties": false
  }
}
```

---

## 7. Validation, Retry, and Timeout Implementation

### 7.1 Application-level validation

A Zod schema mirrors each JSON schema exactly (including the enums, and now the item cap and a real calendar-date check) and is the actual gate — not "the API call succeeded":

```typescript
// lib/validation/extraction.ts
import { z } from "zod";

function isValidCalendarDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export const ExtractionSchema = z.object({
  merchant: z.string().nullable(),
  purchase_date: z.string().refine(isValidCalendarDate, {
    message: "purchase_date must be a real calendar date in YYYY-MM-DD format",
  }).nullable(),
  currency: z.string().length(3).nullable(),
  total: z.number().nonnegative().nullable(),
  payment_method: z.enum(["cash", "card", "transfer", "pos", "unknown"]),
  category: z.enum([
    "groceries", "fuel", "transport", "dining", "utilities",
    "office_supplies", "equipment", "services", "other",
  ]),
  items: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().nonnegative().nullable(),
    unit_price: z.number().nonnegative().nullable(),
    line_total: z.number().nonnegative().nullable(),
  })).max(40),
  confidence_note: z.string().nullable(),
});

// Truncation check — run BEFORE attempting to parse/validate the response body.
// Gemini reports a token-cap cut-off via `finishReason === "MAX_TOKENS"`.
export function checkTruncation(finishReason: string): boolean {
  return finishReason === "MAX_TOKENS";
}
```

> **FIX APPLIED (v2):** `purchase_date` validation upgraded from a shape-only regex to a real calendar-date check — the v1 regex would accept a string like "2026-13-45" as valid since it only checked digit positions, not whether the date actually exists.

> **FIX APPLIED (v2):** `items` array now capped at `.max(40)` in the Zod schema, matching the JSON schema's `maxItems` and the system prompt's rule 9 (§5.2) — closes the same unbounded-array gap from three angles (prompt instruction, provider-enforced schema, and application-enforced schema).

> **FIX APPLIED (v2):** `checkTruncation()` added, called against the raw Gemini response's `finishReason` before any JSON parsing is attempted. A `finishReason` of `MAX_TOKENS` is recorded as `JobAttempt.outcome = "truncated"` and routed through the same retry path as a validation failure, rather than being silently mis-bucketed as `"invalid_schema"` or crashing the parser on incomplete JSON.

### 7.2 Role 2 is synchronous — a deliberate, bounded exception

Unlike Role 1, the summarize endpoint calls Gemini directly inside the request handler rather than going through the job queue. This is intentional: the input is a small JSON object (no image), so latency is typically well within a normal HTTP request budget, and it's still bounded by the same `timeoutMs`/`maxRetries` config and independently rate-limited per the assignment's requirement. The `Summary` table still records `status`/`attemptCount`/`errorMessage` so a failure is represented just as honestly as a Role 1 failure.

> **FIX APPLIED (v2):** Platform-timeout confirmation requirement added. The Engineer's audit objection: on a serverless host with a hard function execution ceiling (commonly 10–60s), `AI_TIMEOUT_MS × (maxRetries + 1)` — potentially up to 90 seconds — could exceed the platform's own limit before this code's own timeout logic fires, producing a raw platform 504 instead of the intended clean failure message. Before relying on this synchronous design, confirm `AI_TIMEOUT_MS × (maxRetries + 1)` is comfortably under the chosen deployment platform's request/function timeout (see §0, §12). If it isn't, either reduce `timeoutMs` for this specific call path or move Role 2 onto the job queue like Role 1.

### 7.3 Retry with context injection

On a validation failure or truncation, the retry doesn't just re-ask — it appends the specific issue to a user-turn message before re-calling:

```typescript
const retryMessage = outcome === "truncated"
  ? "Your previous response was cut off before completing. Return a complete, corrected " +
    "JSON object — if the receipt has more than 40 items, include only the 40 highest-value " +
    "ones and note the omission in confidence_note."
  : `Your previous response failed validation: ${zodError.message}. Return a corrected, ` +
    "complete JSON object fixing this issue.";
```

### 7.4 Timeout handling

```typescript
const response = await Promise.race([
  googleAi.models.generateContent({ /* ... config: { abortSignal } ... */ }),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error("AI_TIMEOUT")), config.ai.timeoutMs)
  ),
]);
```

A timeout is recorded as a `JobAttempt` with `outcome: "timeout"`, consumes one attempt, and follows the same retry/fail path as a schema validation failure, with `errorMessage: "The AI provider did not respond in time."` if it's the terminal attempt.

---

## 8. File Upload & Storage

```typescript
// lib/storage/index.ts — the only module that knows about the storage driver
interface StorageDriver {
  save(buffer: Buffer, key: string): Promise<void>;
  read(key: string): Promise<Buffer>;
}
```

Local driver writes to `config.storage.localBasePath`; an S3-compatible driver (same interface) is a drop-in swap via `STORAGE_DRIVER=s3`. The `Receipt.storageKey` column is populated by whichever driver is active — application code elsewhere never constructs a raw path, it only ever asks the driver to read by key.

Upload validation order (fail fast, before any storage write), applied independently per file within a batch request:

1. MIME type in `allowedMimeTypes`
2. Size ≤ `maxSizeBytes`, and > 0 bytes
3. For images: buffer actually decodes as a valid image (catches corrupted files that merely have a correct-looking extension/MIME)
4. For PDFs: file starts with `%PDF-` magic bytes

Only after all four pass for a given file does that file get written to storage and its `Receipt` + `Job` row get created — one file failing validation within a batch does not block the others in the same request.

---

## 9. Rate Limiting

A simple in-memory or Redis-backed token bucket per `userId` (in-memory is acceptable for a single-instance assessment deployment; a multi-instance deployment would need a shared store). Two independent buckets, per config:

- `uploadRequestsPerUserPerMinute` — enforced on `/api/receipts/batch`, counted per request rather than per file (v2 fix — see §1, §3).
- `summarizePerUserPerMinute` — enforced on `/api/results/:id/summarize`, independently of the upload bucket per the assignment's explicit requirement.

Both return HTTP 429 with a clear message (e.g. "Too many uploads — please wait a moment") rather than silently queuing further.

---

## 10. Screens

1. **Upload** — file picker supporting multi-file selection, client-side pre-check against `allowedMimeTypes`/`maxSizeBytes`/`maxFilesPerBatch`, POSTs to `/api/receipts/batch`.
2. **Processing/Job list** — polls `GET /api/jobs`, renders `pending`/`processing`/`done`/`failed` with the exact copy from the discovery doc, retry button on `failed`, and a small warning badge on any `done` job whose `ExtractionResult.confidenceNote` is non-null (NEW in v2).
3. **Result** — `GET /api/jobs/:id/result`, renders fields, shows `confidence_note` visibly if present, "Summarise expense" button → `POST /api/results/:id/summarize` → renders returned summary.

> **FIX APPLIED (v2):** Confidence badge added to the job list screen. The audit noted that `confidence_note` was only surfaced on the Result detail screen in v1, while §6's fix now puts more weight on that field for Role 2 — a user scanning job history had no way to tell a clean `done` job from a low-confidence one without opening each result individually.

---

## 11. Out of Scope

Auth system, editing extracted fields, export/sharing, invoicing, multi-page/multi-currency receipts, budgeting/dashboards, any AI role beyond the two specified above.

> **FIX APPLIED (v2):** Added: file/data retention and cleanup policy is explicitly out of scope for this MVP — all uploaded files and database records persist indefinitely. This was previously an unstated omission rather than a named exclusion.

---

## 12. Open Decisions Needing Your Sign-Off Before Scaffolding

| # | Decision | Recommendation | Priority |
|---|---|---|---|
| 1 | Deployment target (VM/container vs. serverless) | Needs a real answer — gates decisions 2 and 3 | **Resolve first** |
| 2 | Queue mechanism (DB-polling vs. BullMQ+Redis) | DB-polling with `SKIP LOCKED`, contingent on #1 | Confirm after #1 |
| 3 | Role 2 synchronous vs. queued | Synchronous, contingent on platform timeout check in §7.2 | Confirm after #1 |
| 4 | Exact `GEMINI_MODEL` value | Placeholder `gemini-3.6-flash` in `.env.example` — pick the actual vision-capable Gemini model you're authorized to use | Needs a real value |
| 5 | Rate limit store (in-memory vs. Redis) | In-memory, documented single-instance limitation | Confirm acceptable for assessment scope |

> **FIX APPLIED (v2):** Deployment target promoted to item #1 and marked highest priority — the audit found it was the single most consequential unresolved item in the document, since items 2 and 3 both depend on its answer, and it wasn't listed at all in v1.

---

## Appendix — Audit Correction Log

Full record of the live multi-role audit findings and the corrections applied in this v2 document, for traceability against the assessment's own documentation expectations.

| # | Lapse (from audit) | Correction applied in this document |
|---|---|---|
| 1 | Deployment target unspecified; worker design incompatible with common serverless hosting if that's the target. | Added as highest-priority open decision (§0, §12); worker section now states its persistent-host assumption explicitly. |
| 2 | Upload rate limit (10/min) contradicts the assignment's own 50-receipt evidence scenario. | Added a batch upload route (§3); rate limit redefined as request-based, not file-based (§1, §9). |
| 3 | No recovery path for a job stuck in "processing" after a worker crash or restart. | Added a staleness reaper to the worker poll loop (§4.3). |
| 4 | `maxOutputTokens` (1,000) risks truncating realistic receipts; truncation wasn't a modeled failure outcome. | Raised token cap to 2,000; added `maxItems`(40) to both schemas; added "truncated" outcome with dedicated retry handling (§1, §5.2, §7.1). |
| 5 | No multi-file/batch upload route existed despite the assignment requiring "one or more" files. | Same fix as #2 — batch route added (§3). |
| 6 | Role 2 prompt had no handling for null/empty extraction data, and `confidence_note` wasn't passed to it. | `confidence_note` now included in Role 2's payload; prompt rules 3–4 added for thin/uncertain data (§6.1). |
| 7 | No accuracy/correctness bar defined — validation confirms shape, not correctness. | Explicit caveat added stating this MVP limitation plainly (§5.2). |
| 8 | Retry endpoint had no guard against retrying a `done` or `processing` job. | HTTP 409 guard specified for non-`failed` jobs (§3). |
| 9 | Summarize endpoint's behavior on a repeat call wasn't specified against the unique constraint. | Endpoint made explicitly idempotent — returns existing `Summary` instead of erroring or duplicating (§3). |
| 10 | Role 2's synchronous design wasn't checked against platform function/request timeout limits. | Added explicit confirmation requirement tying `AI_TIMEOUT_MS × (maxRetries+1)` to the deployment platform's limits (§7.2). |
| 11 | PDF input mechanics were unverified for the originally specified provider. | Resolved during the Gemini migration: images and PDFs share one `inlineData` path, so no separate PDF code path is required (§5). |
| 12 | Job/Receipt 1:1 constraint contradicted the stated "cleaner for reprocessing" rationale. | Rationale corrected to accurately describe the MVP-simplicity tradeoff (§2). |
| 13 | Zod date validation checked shape only, not calendar validity (e.g. month 13 would pass). | Replaced with a real calendar-date parse/round-trip check (§7.1). |
| 14 | No visual confidence indicator on the job list screen, only on the Result detail screen. | Added a confidence badge to job list entries (§10). |
| 15 | No stated retention/cleanup policy for files or records. | Named explicitly as an MVP exclusion rather than left as a silent omission (§11). |
