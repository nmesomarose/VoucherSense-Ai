# VoucherSense AI

> **AI-Powered Receipt Processing — Engineering Integration Slice**

VoucherSense AI is a full-stack receipt processing application built as an AI engineering integration slice. Users upload receipt photos or scanned PDFs, and an asynchronous background worker extracts structured expense data using Google Gemini. Once extracted and validated against strict schemas, users can generate a one-time plain-language expense summary.

Rather than a generic demo or a surface-level API call, this repository demonstrates the production-grade engineering required around LLMs: strict file validation, durable database-backed queueing, structured JSON schema guarantees, honest multi-attempt failure handling, rate limiting, session security, and per-user data ownership.

For an exhaustive architectural deep dive, real production-failure retrospectives, and conceptual explanations, see [DOCUMENTATION.md](./DOCUMENTATION.md).

---

## Implemented Flow & Features

The application implements a single, complete user journey:

```text
Register ──> Login ──> Upload Receipts ──> Background Processing ──> Extraction Results ──> One-Time Summary
```

### Core Features

- **Authentication & Session Management:**
  - Secure account registration with scrypt salted password hashing (`POST /api/auth/register`).
  - Constant-time password verification and `httpOnly`, `SameSite=Lax` HMAC-SHA256 signed session cookies (`vs_session`).
  - Automatic session expiration checking (`SESSION_MAX_AGE_SECONDS`) and explicit logout (`DELETE /api/session`).
  - Strict resource ownership enforcement (`403 Forbidden` on unauthorized access; user data is strictly isolated).

- **Resilient Upload & File Integrity:**
  - Batch upload support for up to 50 files per request (`POST /api/receipts/batch`).
  - Fail-fast, per-file validation: size bound (8 MB), MIME type allowlist (`image/jpeg`, `image/png`, `application/pdf`).
  - Deep file inspection: image decoding validation via `sharp` to catch spoofed extensions and `%PDF-` magic-byte verification for PDFs. One invalid file does not fail the batch.

- **Durable Queue & Background Worker:**
  - PostgreSQL-backed job queue leveraging `SELECT ... FOR UPDATE SKIP LOCKED` for atomic, race-free job claiming across worker loops.
  - Decoupled worker process (`worker/index.ts`) with configurable concurrency (`WORKER_CONCURRENCY`).
  - Stale job reaper (`worker/reapStaleJobs.ts`) that reclaims jobs orphaned by crashed workers after `STALE_JOB_TIMEOUT_MS`.

- **Role 1 — Extractor (Vision AI):**
  - Sends receipt image/PDF buffers inline to Google Gemini via the official `@google/genai` SDK.
  - Enforces JSON output with native Gemini schema constraints and re-validates against a strict Zod `ExtractionSchema` (merchant, date, currency, total, payment method, category, line items up to 40, confidence note).
  - Enforced per-call timeouts (`AI_TIMEOUT_MS`) using `AbortController`.

- **Audit Trail & Honest Failure Handling:**
  - Every AI interaction is recorded in a `JobAttempt` row with explicit outcomes: `valid`, `invalid_schema`, `truncated`, `timeout`, or `provider_error`.
  - Context-aware retries: truncation and schema errors are retried with the exact error payload injected back into the retry prompt (never identical prompts).
  - Timeouts and provider errors are terminal to prevent silent retry loops.
  - Manual retry endpoint (`POST /api/jobs/:id/retry`) continues attempt sequence numbers without resetting history.

- **Role 2 — Analyst (Summary AI):**
  - Synchronous, idempotent expense analysis (`POST /api/results/:id/summarize`).
  - Role separation: the analyst receives **only** the validated extraction JSON — never the raw image or receipt file.
  - Output validated via Zod `SummarySchema` (summary text, total spent, item count, largest item, category).

- **Rate Limiting & Cost Safeguards:**
  - Independent in-memory token buckets per user: Upload/Retry (`RATE_LIMIT_UPLOAD`, 10 req/min) and Summarize (`RATE_LIMIT_SUMMARIZE`, 20 req/min).
  - Explicit `HTTP 429 Too Many Requests` responses with informative retry guidance.

- **Storage Abstraction:**
  - Pluggable `StorageDriver` interface storing opaque keys (e.g., `receipts/2026/09/<id>.png`), keeping binary payloads out of the relational database.
  - Supports `local` filesystem driver for development and an `s3` driver for AWS S3 / Cloudflare R2 / MinIO.

---

## Architecture & Tech Stack

```text
┌────────────────────────────────────────────────────────┐
│               Next.js 16 App Router                   │
│   (Auth, Upload UI, Job Polling, Results & Summary)   │
└───────────────┬────────────────────────▲───────────────┘
                │ API Requests           │ GET /api/jobs
                ▼                        │
┌────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                   │
│      Users ─ Receipts ─ Jobs ─ JobAttempts             │
│            ExtractionResults ─ Summaries               │
└───────────────▲────────────────────────────────────────┘
                │ Claim (SKIP LOCKED) / Update
                ▼
┌────────────────────────────────────────────────────────┐
│            Background Worker (worker/index.ts)         │
│     Reap Stale Jobs ──> Claim Job ──> Process Job      │
└───────────────┬────────────────────────────────────────┘
                │ Inline Media + Schema
                ▼
┌────────────────────────────────────────────────────────┐
│            Google Gemini (@google/genai)               │
│   Role 1: Extractor (Image/PDF -> Structured JSON)     │
│   Role 2: Analyst (Structured JSON -> Summary)         │
└────────────────────────────────────────────────────────┘
```

- **Frontend & API:** Next.js 16 (App Router), React 19, TypeScript
- **Database & ORM:** PostgreSQL, Prisma ORM 7 (`@prisma/adapter-pg`)
- **AI Integration:** Google Gemini (`@google/genai`), centralized in `lib/ai/geminiClient.ts`
- **Validation & Parsing:** Zod 4, Sharp (image verification)
- **Testing:** Vitest 5
- **Configuration:** Centralized validation via `config/index.ts` (the sole reader of `process.env`)

For full details on the 6 Prisma models and data relationships, see [DOCUMENTATION.md §4 (The Data Model)](./DOCUMENTATION.md#4-the-data-model).

---

## Getting Started

### Prerequisites

- **Node.js:** Current LTS or stable (tested on Node v20+ / v26).
- **PostgreSQL:** Running PostgreSQL database (local or cloud-hosted).
- **npm:** Included with Node.js.
- **Google Gemini API Key:** An active key from [Google AI Studio](https://aistudio.google.com/).

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create your local `.env` from the provided example template:

```bash
# On Linux/macOS
cp .env.example .env

# On Windows (PowerShell / Command Prompt)
copy .env.example .env
```

Populate the required credentials in `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/vouchersense_ai"
GEMINI_API_KEY="your-gemini-api-key"
```

> **Security Note:** Never commit `.env` or real credentials. `.gitignore` is configured to exclude all real environment files while keeping `.env.example` tracked.

### 3. Initialize the Database

Run Prisma migrations to create the database schema and generate the Prisma Client:

```bash
npm run db:generate
npm run db:migrate
```

*(Optional)* Seed a baseline demo user row:

```bash
npm run db:seed
```

### 4. Run the Application

The system requires two processes running concurrently:

**Terminal 1 — Next.js Web Application:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Development Note:** Always access the development server via `http://localhost:3000`, not `http://127.0.0.1:3000`. Next.js 16 development HMR is host-scoped and can stall hydration when loaded via IP.

**Terminal 2 — Background Worker:**

```bash
npm run worker
```

The worker continuously polls for pending jobs, processes receipt extractions via Gemini, and reclaims stale tasks.

---

## Environment Configuration

All environment variables are parsed and validated through [config/index.ts](./config/index.ts). Below are the verified configuration options:

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string (`postgresql://...`). |
| `GEMINI_API_KEY` | **Yes** | — | Google Gemini API key. Never exposed to client. |
| `SESSION_SECRET` | No | *auto-generated* | Secret for signing session cookies. If unset in dev, an ephemeral key is generated (sessions reset on restart). |
| `SESSION_MAX_AGE_SECONDS` | No | `43200` | Session validity duration in seconds (12 hours). |
| `GEMINI_MODEL` | No | `gemini-3.6-flash` | Vision-capable Gemini model used for both extraction and analysis. |
| `AI_TIMEOUT_MS` | No | `30000` | Enforced timeout for a single AI request in milliseconds (30 s). |
| `AI_MAX_OUTPUT_TOKENS` | No | `2000` | Maximum token ceiling for structured JSON output. |
| `AI_TEMPERATURE` | No | `0` | Model temperature (pinned to 0 for deterministic extraction). |
| `AI_MAX_RETRIES` | No | `2` | Max automatic retry attempts for retryable errors (truncation / invalid schema). |
| `WORKER_CONCURRENCY` | No | `4` | Number of worker loops; doubles as the global AI concurrency ceiling. |
| `WORKER_POLL_INTERVAL_MS` | No | `1000` | Polling cadence for pending database jobs in milliseconds. |
| `STALE_JOB_TIMEOUT_MS` | No | `60000` | Time before a job stuck in `processing` is reclaimed by the reaper (2× `AI_TIMEOUT_MS`). |
| `MAX_UPLOAD_BYTES` | No | `8388608` | Maximum file size in bytes (8 MB per file). |
| `MAX_FILES_PER_BATCH` | No | `50` | Maximum number of files permitted in a single batch upload request. |
| `RATE_LIMIT_UPLOAD` | No | `10` | Allowed upload/retry requests per user per minute. |
| `RATE_LIMIT_SUMMARIZE` | No | `20` | Allowed summarize requests per user per minute. |
| `STORAGE_DRIVER` | No | `local` | Storage driver to use: `local` or `s3`. |
| `STORAGE_LOCAL_PATH` | No | `./storage` | Directory where uploaded files are stored when using the `local` driver. |
| `STORAGE_S3_BUCKET` | Cond. | — | S3 bucket name (required if `STORAGE_DRIVER=s3`). |
| `STORAGE_S3_REGION` | No | `auto` | S3 region. |
| `STORAGE_S3_ENDPOINT` | No | — | Custom S3 endpoint URL (e.g., for MinIO or Cloudflare R2). |
| `STORAGE_S3_ACCESS_KEY_ID` | Cond. | — | S3 access key ID (if `STORAGE_DRIVER=s3`). |
| `STORAGE_S3_SECRET_ACCESS_KEY` | Cond. | — | S3 secret access key (if `STORAGE_DRIVER=s3`). |

> **Latency Tuning Note:** On high-latency connections or when experiencing Gemini rate limits, you can tune `AI_TIMEOUT_MS=90000` and `STALE_JOB_TIMEOUT_MS=180000` in your local `.env`. See [DOCUMENTATION.md §2 (Local-timeout note)](./DOCUMENTATION.md#local-timeout-note-this-machine).

---

## Testing & Quality Assurance

The codebase includes automated unit and integration tests covering business-critical paths without requiring live Gemini calls or live database instances.

### Available Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm test` | `vitest run` | Runs all test suites once. |
| `npm run test:watch` | `vitest` | Runs Vitest in watch mode for active development. |
| `npm run test-watch` | `vitest` | Kebab-case alias for watch mode. |
| `npm run lint` | `eslint .` | Runs ESLint checks. |
| `npm run typecheck` | `tsc --noEmit` | Runs TypeScript static type analysis. |
| `npm run build` | `next build` | Produces the production Next.js build. |

### Verified Test Coverage

Running `npm test` executes 45 unit and integration tests across 8 test suites:

- `passwords.test.ts`: Scrypt hashing, salting, and verification.
- `aiConcurrency.test.ts`: Global semaphore bounding simultaneous in-flight AI calls.
- `validateFile.test.ts`: MIME checking, file size constraints, image corruption detection via Sharp, and PDF magic-byte validation.
- `extractionSchema.test.ts`: Zod schema validation for Role 1 (40-item cap, date checks, enum values, non-negative totals).
- `summarySchema.test.ts`: Zod schema validation for Role 2.
- `sessionExpiry.test.ts`: HMAC signature verification and session lifetime expiration.
- `geminiSchema.test.ts`: Translation of JSON schemas to Gemini-native response schemas.
- `rateLimit.test.ts`: In-memory rate limiting and independent token-bucket tracking.

---

## Known Limitations & Out-of-Scope Items

To preserve architectural clarity and focus on the core AI integration slice, the following features are intentionally out of scope:

1. **No In-App Field Correction:** Extracted data is presented as verified model output; there is no manual editing interface.
2. **No Export Tooling:** CSV, Excel, or PDF report generation is not implemented.
3. **No Multi-Page Merging:** Each uploaded file is processed as an individual receipt.
4. **No Multi-Currency Normalization:** Currencies are captured as detected (ISO 4217), without currency conversion.
5. **Single-Node Rate Limiting:** The current rate limiter uses in-memory token buckets; multi-instance horizontal scaling would require Redis or Postgres backing.
6. **Persistent Worker Requirement:** The worker relies on persistent Node processes polling PostgreSQL with `SKIP LOCKED`, which requires containerized hosting (e.g., Docker, ECS, Fly.io, Railway) rather than pure serverless Next.js functions.
7. **Advanced Auth Excluded:** Email verification, password reset flows, OAuth/social login, and multi-tenant teams are omitted in favor of a minimal, secure authentication slice.

For an in-depth breakdown of confirmed boundaries, see [DOCUMENTATION.md §7 (What This Slice Does Not Handle)](./DOCUMENTATION.md#7-what-this-slice-does-not-handle).

---

## Deployment & Demo Status

- **Status:** Functional local AI Integration Slice with live end-to-end receipt verification.
- **Production Readiness Considerations:**
  - **Worker Hosting:** The worker process must run as a managed long-running service alongside the Next.js web application.
  - **Storage:** Switch `STORAGE_DRIVER=s3` and configure an S3 bucket (or compatible store like Cloudflare R2) for persistent asset storage.
  - **Production Retrospective:** See [DOCUMENTATION.md §6 (What Went Wrong)](./DOCUMENTATION.md#6-what-went-wrong) for operational lessons learned during verification, and [DOCUMENTATION.md §8 (If I Built This Again)](./DOCUMENTATION.md#8-if-i-built-this-again) for recommendations on telemetry, queue scaling, and platform timeout sizing.
