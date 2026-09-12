# Rules — Receipt Processing Pipeline (VoucherSense AI)

These are the hard rules for any work that touches the receipt pipeline. They
are distilled from `docx/AGENTS.md` (§2 "Locked", §3 "Must Never Happen") and
the PRD `docx/VoucherSense-AI-Implementation-PRD-v2.md` (§1–§9). Where this
file and AGENTS.md disagree, **AGENTS.md wins**; where either is silent, the
PRD wins. Nothing here overrides the human.

## What "success" means for receipt processing

A receipt is successfully processed when, end to end:

1. The file passes all four upload checks, per file, with no side effects for
   files that fail (`lib/files/validateFile.ts`).
2. The file is stored through the `StorageDriver` abstraction only — never a
   raw filesystem/object path from application code.
3. Exactly one `Receipt` + exactly one `pending` `Job` row exist per accepted
   file (created in one transaction), sharing a `batchId`.
4. The background worker claims the job via `FOR UPDATE SKIP LOCKED`
   (`worker/claimJob.ts`), runs the staleness reaper each poll cycle
   (`worker/reapStaleJobs.ts`), and processes it
   (`worker/processJob.ts`) — Role 1 (extractor) is NEVER called from a route.
5. The model's response passes the Zod gate (`lib/validation/extraction.ts`)
   before a `done` state or an `ExtractionResult` is ever written.
6. Role 2 (`/api/results/[id]/summarize`) only ever sees the validated
   `ExtractionResult` JSON (incl. `confidence_note`) — never the original file
   — and is idempotent.

A job that fails must land in `failed` with an honest `errorMessage` and full
`JobAttempt` history. Silently passing garbage through validation is the
definition of failure.

## Boundaries that must never move

- Application code (routes, UI) never imports the Gemini SDK directly —
  everything goes through `lib/ai/geminiClient.ts`.
- Application code never reads/writes files directly — everything goes through
  `lib/storage`.
- Only `worker/*` calls the extractor. Only the summarize route calls the
  analyst, and it must use the same `lib/ai/geminiClient.ts` so timeout/retry
  logic is never duplicated.
- Nothing outside `config/index.ts` reads `process.env`.

## The four upload checks (PRD §8) — in order, fail-fast, per file

1. MIME type in `config.uploads.allowedMimeTypes` (jpeg/png/pdf).
2. Size ≤ `config.uploads.maxSizeBytes` and > 0 bytes.
3. Images: buffer actually decodes via `sharp` (catches fake extensions).
4. PDFs: file starts with the `%PDF-` magic bytes.

Every file is validated independently; one bad file must never block the
rest of the batch or write any storage/DB rows before its own checks pass.

## Worker lifecycle rules (PRD §4)

- Claim only with the `SKIP LOCKED` pattern; never claim a row already claimed.
- Run `reapStaleJobs()` on **every** poll cycle, **before** claiming new work.
- Respect `config.queue.concurrency` — the loops + the global AI semaphore in
  `lib/ai/geminiClient.ts` both enforce it.
- Per job: attempt loop bounded by `config.ai.maxRetries` (1 original +
  retries). Each retry must carry the specific validation/truncation error in
  the next prompt — identical retry prompts are forbidden (PRD §7.3).

## Validation gates that cannot be relaxed

- `items` array capped at 40 — enforced in the system prompt (PS rule 9), the
  Gemini `responseSchema` (`maxItems`), AND the Zod schema (`.max(40)`).
- `purchase_date` must be a REAL, round-tripping calendar date
  (`isValidCalendarDate`), never a shape-only regex.
- Truncation is detected from the provider's `finishReason === "MAX_TOKENS"`
  BEFORE any parse; it is outcome `truncated`, never `invalid_schema`.
- Outcome values are exactly: `valid | invalid_schema | truncated | timeout |
  provider_error`. Do not invent new outcomes.
- Every AI call has an enforced `config.ai.timeoutMs` — no unbounded waits.

## Rate limiting (PRD §9)

Two independent buckets: upload (per request, not per file) on the batch route,
summarize on the summarize route. A rejection returns HTTP 429 with a clear
message. Never merge, queue, or silently drop.

## Out of scope — do not build

Auth system, editing extraction fields, export/sharing, invoicing, multi-page /
multi-currency receipts, budgeting/dashboards, extra AI roles, retention /
cleanup tooling. Respect `Receipt.batchId` grouping; no new tables beyond the
six PRD models unless the human explicitly reopens the data model.

## Open decisions — flag, never silently resolve

Deployment target, exact `GEMINI_MODEL` value, rate-limit store (in-memory vs
Redis). Build against the documented default, say it is provisional, and move
on. Never state that a validated extraction is "verified" or "confirmed
correct" — validation confirms well-formed, not factually correct (AGENTS.md §3
rule 18).

## Verify before reporting done

- `npm run typecheck` — zero errors.
- `npm run lint` — zero errors.
- `npm run test` — receipt-pipeline tests pass
  (`tests/validateFile.test.ts`, `tests/extractionSchema.test.ts`,
  `tests/summarySchema.test.ts`, `tests/geminiSchema.test.ts`,
  `tests/aiConcurrency.test.ts`, `tests/rateLimit.test.ts`).
- Walk §3 of AGENTS.md rule-by-rule against the code you touched and confirm
  each one still holds.