# AGENTS.md — VoucherSense AI

**Read this before writing any code.** This file governs *how* you build. The PRD governs *what* you build. If the two ever appear to conflict, this file wins on process, architecture, and behavior; the PRD wins on product scope. Neither file gives you permission to override the other's domain.

---

## 1. What This Project Is

VoucherSense AI is an AI-powered receipt processing application, built as an AI engineering assessment. A user uploads one or more receipt images/PDFs; a background worker extracts structured expense data from each via an AI model (Role 1 — Extractor); once that extraction is validated, the user can trigger a one-time AI summary of it (Role 2 — Analyst).

- **Version being built:** MVP as defined in the PRD v2 — receipts only, two AI roles, plus a **minimal authentication system** in scope: Register → Login → Logout, secure password hashing, session management, route protection, and user ownership checks (see §3, rule 16). A single seeded demo user is retained for convenience; accounts are real.
- **Source of truth for scope and requirements:** `VoucherSense-AI-Implementation-PRD-v2.md` (the "PRD"). Every requirement number referenced below (`§0`–`§12`) refers to sections of that document.
- **Who this is for:** a solo micro-business owner persona, per the PRD's discovery doc — but you do not need to build anything user-facing beyond what the PRD's three screens specify (§10).

You are not building a general accounting platform. You are building one flow, done properly, with the background-job/validation/failure-handling machinery being the actual point of the exercise.

---

## 2. What Is Locked

The following decisions have already been made. Do not change, swap, "improve," or work around any of them without the human explicitly reopening the decision. If you believe one of these is wrong, say so and stop — do not silently substitute your own choice.

| Locked decision | Detail |
|---|---|
| Stack | Next.js (App Router) + TypeScript + Prisma + PostgreSQL. Do not introduce a different framework, ORM, or database engine. |
| AI provider | **Google Gemini is the authoritative AI provider.** Only the official `@google/genai` npm SDK is used, driven by `GEMINI_API_KEY` and `GEMINI_MODEL`. No second provider, routing layer, or different SDK (OpenAI or any other) may be introduced. |
| Model architecture | **One** Gemini model serves **both** AI roles, distinguished only by system prompt and JSON schema (PRD §0, §5, §6 — "Option B," confirmed). Do not split this into two different models or two providers. |
| Model identifier | Lives only in `config.ai.model`, sourced from `GEMINI_MODEL` in `.env`. Never hardcode a model string anywhere else in the codebase. |
| Structured output | Gemini structured JSON output — `responseMimeType: "application/json"` plus a Gemini-native `responseSchema` synthesized from the PRD §5.2 / §6.2 schemas, one schema per role. Do not change field names, types, or the enum value lists without updating the PRD first. |
| Application-level validation | Zod, mirroring each JSON schema exactly, including the `.max(40)` item cap and the real calendar-date check (PRD §7.1). Do not replace Zod or relax these checks. |
| Queue mechanism | Postgres row-locking (`SELECT ... FOR UPDATE SKIP LOCKED`) via a DB-polling worker (PRD §4). Do not introduce Redis, BullMQ, or any other queue technology unless the human has explicitly changed this locked decision (see PRD §12, item 2). |
| Data model | The six Prisma models in PRD §2 (`User`, `Receipt`, `Job`, `JobAttempt`, `ExtractionResult`, `Summary`), with their fields and enum values exactly as written — including `JobStatus` (`pending`/`processing`/`done`/`failed`) and `JobAttempt.outcome` (`"valid"`/`"invalid_schema"`/`"truncated"`/`"timeout"`/`"provider_error"`). Do not rename fields, add unrelated tables, or change these enums without flagging it. |
| Configuration | A single central module, `config/index.ts`, is the only place that reads `process.env`. Every other file imports from it. Do not scatter `process.env.X` reads elsewhere. |
| Storage | A `StorageDriver` interface (PRD §8) with `local` and `s3` implementations, selected via `STORAGE_DRIVER`. Do not read/write files any other way. |
| Credentials | `GEMINI_API_KEY` and `DATABASE_URL` are set manually in `.env` by the human. **You must never generate, invent, hardcode, print, log, or otherwise expose an API key or credential.** `.env.example` gets placeholders and comments only. |

---

## 3. What Must Never Happen

Everything below is a hard constraint, not a style preference. **Breaking any rule on this list means the task has failed, even if the code compiles, the tests pass, and the feature appears to work.** Where a rule traces to a specific PRD requirement, the section is cited.

**Data integrity & provider boundaries**
1. Never store the raw uploaded file binary in the database. Only `Receipt.storageKey` is stored; the file itself lives in the storage driver. (PRD §2, §8)
2. Never call the AI provider synchronously inside an upload/batch request handler. Role 1 extraction happens only inside the background worker. (PRD §3, §4)
3. Never send the original receipt image/PDF to Role 2. Role 2 receives only the validated `ExtractionResult` JSON, including `confidence_note`. (PRD §6)
4. Never let Role 2 re-interpret, "correct," or override any field from Role 1 (merchant, total, category, payment_method). It echoes them verbatim. (PRD §6.1, rules 1 and 7)
5. Never treat an HTTP 200 / successful API call as proof of success. A job or summary is only "successful" once its response passes Zod validation. (PRD §7.1)

**Validation, retries, and timeouts**
6. Never accept an `items` array longer than 40 entries. This cap must be enforced in the system prompt, the JSON schema, *and* the Zod schema — all three, not just one. (PRD §5.1 rule 9, §5.2, §7.1)
7. Never validate `purchase_date` with a format-only check. It must be a real, round-tripping calendar date. (PRD §7.1)
8. Never attempt to JSON-parse a response before checking the provider's truncation signal (Gemini `finishReason === "MAX_TOKENS"`, surfaced as outcome `"truncated"`). A truncated response is its own outcome, not a parsing crash and not `"invalid_schema"`. (PRD §7.1)
9. Never make an AI call without an enforced timeout (`config.ai.timeoutMs`). No unbounded waits. (PRD §7.4)
10. Never retry more than `config.ai.maxRetries` times, and never send an identical retry prompt — each retry must include the specific validation/truncation error that caused the previous attempt to fail. (PRD §7.3)
11. Never leave a job stuck in `processing` indefinitely. The staleness reaper must run on every worker poll cycle before claiming new work. (PRD §4.3)

**API contract**
12. Never let `/api/jobs/:id/retry` reset a job that isn't currently `failed`. Return HTTP 409 otherwise. (PRD §3)
13. Never let `/api/results/:id/summarize` create a second `Summary` for the same `extractionResultId`, and never let it trigger a second AI call if one already exists. Return the existing summary (HTTP 200) instead. (PRD §3)
14. Never write a file to storage or create a `Receipt`/`Job` row until that specific file has passed all four upload checks (MIME type, size/non-empty, image-decodes, PDF magic bytes). One bad file in a batch must not block the others. (PRD §8)
15. Never merge or skip the two rate-limit buckets. Upload and summarize are limited independently; a rejection returns HTTP 429 with a clear message, never a silent queue or drop. (PRD §9)

**Scope discipline**
16. A **minimal authentication system is in scope**: Register, Login, secure password hashing, session management, Logout, route protection, and user ownership checks. Never build beyond it — email verification, password reset, social login, profile management, account settings, and advanced account features are all **out of scope**. Never build, scaffold, or add UI/routes/tables for anything else listed as out of scope: editing extracted fields, export/sharing, invoicing, multi-page or multi-currency receipts, budgeting/dashboards, any AI role beyond the two specified, or file/data retention & cleanup tooling. (PRD §11)
17. Never silently pick an answer to an open decision on your own — deployment target, the exact `GEMINI_MODEL` value, and the rate-limit store technology (in-memory vs. Redis) are unresolved and require human sign-off. Build against the documented default/assumption, flag the open item, and do not treat your choice as final. (PRD §12)
18. Never state or imply, in code comments, UI copy, or documentation, that a validated extraction is "verified" or "confirmed correct." Validation confirms the response is well-formed, not that it is factually accurate. (PRD §5.2)

---

## 4. How the Work Is Arranged

Use this structure. Do not invent a parallel structure or reorganize it mid-build.

```
/config
  index.ts              # the ONLY place process.env is read

/prisma
  schema.prisma          # the six locked models — do not add unrelated tables here

/app                      # Next.js App Router
  /api
    /receipts/batch/route.ts
    /jobs/route.ts
    /jobs/[id]/route.ts
    /jobs/[id]/result/route.ts
    /jobs/[id]/retry/route.ts
    /results/[id]/summarize/route.ts
    /results/[id]/summary/route.ts
  /(screens)
    upload/               # Screen 1
    jobs/                 # Screen 2 — processing/job list
    results/[id]/         # Screen 3 — result + summarize

/worker
  index.ts                # long-running process, WORKER_CONCURRENCY loops
  claimJob.ts              # SKIP LOCKED claim query
  reapStaleJobs.ts         # staleness reaper, run each poll cycle
  processJob.ts            # per-job sequence: call -> validate -> retry -> persist

/lib
  /ai
    extractorPrompt.ts     # Role 1 system prompt (full text, PRD §5.1)
    extractorSchema.ts     # Role 1 JSON schema (PRD §5.2)
    analystPrompt.ts       # Role 2 system prompt (full text, PRD §6.1)
    analystSchema.ts       # Role 2 JSON schema (PRD §6.2)
    geminiClient.ts        # single wrapper around the Gemini SDK — timeout + call logic lives here, nowhere else
  /validation
    extraction.ts          # Zod schema mirroring extractorSchema, incl. maxItems + calendar-date check
    summary.ts             # Zod schema mirroring analystSchema
  /storage
    index.ts                # StorageDriver interface
    localDriver.ts
    s3Driver.ts
  /rateLimit
    index.ts                # two independent buckets: upload, summarize

/prisma-client.ts           # single Prisma client instance, imported everywhere else

.env.example
```

Rules for this layout:
- Application code (routes, UI) never imports the Gemini SDK directly — it goes through `lib/ai/geminiClient.ts`.
- Application code never reads or writes files directly — it goes through `lib/storage`.
- Only `worker/*` calls Role 1. Only the summarize route calls Role 2 (the one approved synchronous exception, PRD §7.2) — and it must go through the same `geminiClient.ts` wrapper so the timeout/retry logic isn't duplicated or drifted.
- Nothing outside `config/index.ts` reads `process.env`.

---

## 5. How the Code Should Look

- **TypeScript strict mode on.** No `any` unless you leave a comment explaining exactly why nothing else works, and even then, prefer `unknown` + a narrowing check.
- **Current LTS Node.js and current stable versions of Next.js/Prisma/Zod/the Gemini SDK (`@google/genai`)** at the time of scaffolding — don't pin to something old out of habit, and don't reach for a bleeding-edge/beta release either.
- Prefer `async`/`await` over raw `.then()` chains.
- No dead code, no commented-out blocks left in the codebase, no `console.log` debugging left behind — use structured error handling instead (see below).
- Every `catch` block does something real: log with enough context to debug, and either recover or re-throw/return an honest error. Never swallow an error silently.
- No magic numbers or strings in application code — anything configurable belongs in `config/index.ts`; anything domain-fixed (enum values, schema field names) belongs in the one file that owns that schema, not copy-pasted around.
- File naming: kebab-case for files (`claim-job.ts` is also acceptable if the team's linter prefers it — pick one convention and apply it uniformly), PascalCase for React components and TypeScript types/interfaces.
- Functions should do one thing. If a function is doing "call the AI, validate the response, and decide the retry" all in one block, split it — this codebase's whole value proposition is that these stages are distinct and inspectable (PRD's evidence requirements depend on this).
- Comments explain *why*, not *what* — the code should already say what it does. Reserve comments for the non-obvious tradeoffs (many of which are already documented as `// Justification:` in the PRD's config block — carry those through into the actual `config/index.ts` file verbatim).

---

## 6. What Counts as Done

Before reporting a task complete, produce a checklist covering everything relevant below, and confirm the project builds and type-checks with zero errors.

- [ ] The project builds with no TypeScript errors and no linter errors.
- [ ] Every "Locked" item in §2 is respected as written — no substitutions.
- [ ] Every rule in §3 is verifiably true in the code you wrote — not just "should be," but check each one against what you actually built.
- [ ] The Prisma schema matches PRD §2 exactly (models, fields, enums).
- [ ] Both system prompts (PRD §5.1, §6.1) are present verbatim, and both JSON schemas (§5.2, §6.2) match exactly, including `strict: true` and `additionalProperties: false`.
- [ ] The worker claims jobs via `FOR UPDATE SKIP LOCKED`, respects `WORKER_CONCURRENCY`, and runs the staleness reaper every poll cycle.
- [ ] Every route in PRD §3 exists, with the exact guard behavior specified (409 on invalid retry, idempotent summarize, batch-aware rate limiting).
- [ ] Upload validation runs all four checks, per file, before any storage write.
- [ ] Both rate-limit buckets exist and are independently configurable via `config/index.ts`.
- [ ] All three screens from PRD §10 exist, including the confidence badge on the job list.
- [ ] Nothing from the out-of-scope list (PRD §11) was built.
- [ ] The open decisions in PRD §12 are flagged back to the human (in your final report, not silently resolved) — deployment target, exact model value, rate-limit store.
- [ ] `.env.example` exists with every variable from PRD §1, commented, no real values.

---

## 7. What The Agent Does When Unsure

You will hit gaps the PRD does not cover. When you do:

- **Do not invent a new feature or expand scope to "fill the gap."** If something feels missing, that is a signal to ask, not a signal to design a solution and ship it.
- **Do not guess at a business rule.** If the PRD doesn't say what happens in a case (a currency you weren't told how to handle, a field format that's ambiguous), stop and flag it rather than picking a plausible-sounding default and moving on.
- **Do not write speculative, "just in case" code** for features that might be needed later. Build exactly what §10 and the PRD's route table describe — nothing extra, nothing scaffolded-but-unused.
- **Prefer the most conservative, most restrictive interpretation** of an ambiguous rule over the most permissive one. A stricter validation that's later relaxed is a small change; a permissive gap that let bad data through is a much bigger problem to unwind.
- **If you must make an assumption to keep moving, write it down explicitly** — as a comment at the point of the assumption and as a line item in your final report — rather than burying it silently in the implementation. An undocumented assumption is indistinguishable from a mistake later.
- **Never resolve one of the open decisions in PRD §12 on your own** (deployment target, exact model ID, rate-limit store). Build against the stated default, note that it's provisional, and move on.
- When you genuinely don't know how a specific Gemini API mechanism behaves, check the current official documentation rather than assuming it works like a similar, previously-known mechanism.
- When in doubt between "clever" and "obvious," pick obvious. This codebase is going to be read and defended line-by-line in review — do not introduce spaghetti code, clever one-liners, or deeply nested conditionals to save a few lines. A reviewer should be able to trace any job's lifecycle by reading, not by guessing.