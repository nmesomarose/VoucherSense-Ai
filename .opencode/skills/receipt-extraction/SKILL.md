---
name: receipt-extraction
description: Use when working on the receipt processing pipeline — uploads, file validation, the background worker, Gemini extraction (Role 1), Zod validation, retries, timeouts, truncation, job status, and the summarize flow (Role 2). Triggers on words like upload, receipt, worker, job, extract, validate, retry, stale, truncat, timeout, summarize.
---

# Receipt Extraction Pipeline

Walk the pipeline exactly as built. The whole value of this codebase is that
each stage (claim → call → validate → retry → persist) is separate and
inspectable. Never collapse stages together.

## Where each stage lives

| Stage | File |
|---|---|
| Upload validation (4 checks) | `lib/files/validateFile.ts` |
| Batch upload route | `app/api/receipts/batch/route.ts` |
| Storage abstraction | `lib/storage/index.ts`, `localDriver.ts`, `s3Driver.ts` |
| Claim job (SKIP LOCKED) | `worker/claimJob.ts` |
| Staleness reaper | `worker/reapStaleJobs.ts` |
| Per-job sequence | `worker/processJob.ts` |
| Worker entry | `worker/index.ts` |
| Gemini wrapper + timeout + truncation | `lib/ai/geminiClient.ts` |
| Role 1 prompt / schema | `lib/ai/extractorPrompt.ts`, `lib/ai/extractorSchema.ts` |
| Role 2 prompt / schema | `lib/ai/analystPrompt.ts`, `lib/ai/analystSchema.ts` |
| Zod extraction gate | `lib/validation/extraction.ts` |
| Zod summary gate | `lib/validation/summary.ts` |
| Summarize route (sync Role 2) | `app/api/results/[id]/summarize/route.ts` |
| Rate limit buckets | `lib/rateLimit/index.ts` |
| Config | `config/index.ts` (only place that reads `process.env`) |
| Env template | `.env.example` |

## End-to-end flow for a successful receipt

1. **Upload** — `POST /api/receipts/batch` consumes one upload rate-limit unit
   per request, then validates EACH file independently and fail-fast:
   MIME allow-list → size ≤ max and non-empty → image decodes (`sharp`) or PDF
   starts with `%PDF-`. A file only reaches storage + DB after its own checks
   pass. One bad file never blocks the batch.
2. **Persist** — through `storage().save(...)` with a key from
   `storageKeyFor(mimeType, id)`; then one transaction creates the `Receipt`
   + one `pending` `Job` sharing a `batchId`.
3. **Claim** — the worker loop calls `reapStaleJobs()` first every cycle, then
   claims the oldest `pending` job via `FOR UPDATE SKIP LOCKED`; it will never
   process a job it doesn't own.
4. **Extract (Role 1)** — `lib/ai/extractorPrompt.ts` + schema go through
   `lib/ai/geminiClient.ts` `extractReceipt()`. Timeout and truncation detection
   happen inside that wrapper — never reimplement outside it.
5. **Retry loop** — bounded by `config.ai.maxRetries`. Truncated responses and
   Zod-invalid responses both retry, but ONLY with the specific
   validator/truncation context appended to the prompt. `timeout` and
   `provider_error` are terminal.
6. **Gate** — `ExtractionSchema.safeParse(...)` is the ONLY definition of
   success. No `ExtractionResult` and no `done` status until it passes.
7. **Summarize (Role 2)** — user-triggered, synchronous, idempotent. Only the
   validated JSON (with `confidence_note`) is sent. If a `Summary` exists it
   returns it (HTTP 200) and never makes a second AI call.

## Non-negotiables to check in any change

- `items` never over 40 (prompt + Gemini `maxItems` + Zod `.max(40)`).
- `purchase_date` is a real calendar date via `isValidCalendarDate`, not a regex.
- Truncation (`finishReason === "MAX_TOKENS"` → outcome `"truncated"`) is
  checked BEFORE parsing JSON; it is never `invalid_schema`.
- Every Gemini call has `config.ai.timeoutMs` enforced (AbortController in
  `geminiClient.ts`).
- Retries: never more than `maxRetries`, never an identical prompt.
- Retry route returns 409 unless the job is currently `failed`
  (`app/api/jobs/[id]/retry/route.ts`).
- The summarize route never lets a second `Summary` appear for one
  `extractionResultId`.
- No job is ever left stuck in `processing` — the reaper runs every cycle.
- Never use Gemini in a route for Role 1; never store file binaries in the DB;
  never send the original file to Role 2.

## Debugging a failed receipt

Trace, in order: `JobAttempt` rows (outcome tells the story) → the raw
`rawResponse` → the `validationError` if any → `Job.errorMessage`. Map:
- `valid` → persisted, job `done`.
- `invalid_schema` → fix the prompt/schema for the specific field, or inspect
  the raw OCR for a field the model mis-read.
- `truncated` → raise `AI_MAX_OUTPUT_TOKENS` or reduce item count pressure; the
  cap in the schema means a real >40-item receipt should self-trim.
- `timeout` → raise `AI_TIMEOUT_MS` (respect platform function timeouts).
- `provider_error` → check `GEMINI_API_KEY` / model authorization / quota.

## Verify

```bash
npm run typecheck   # zero errors
npm run lint        # zero errors
npm run test        # pipeline tests (validateFile, extractionSchema, summarySchema, geminiSchema, aiConcurrency, rateLimit)
```

Run the worker with `npm run worker` and the app with `npm run dev`, then
upload `e2e-receipt.png` (or the PDF generator `make-receipt.ts`) to exercise
the real end-to-end path.