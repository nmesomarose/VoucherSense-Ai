// lib/ai/geminiClient.ts â€” the ONLY module that talks to the Gemini SDK.
// (AGENTS.md Â§4: application code imports the SDK nowhere else.)
//
// Responsibilities:
//   - single shared client instance + a GLOBAL AI concurrency semaphore
//     (config.queue.concurrency) applied across BOTH roles â€” extraction and
//     summarisation share one cap, never separate unlimited pools
//   - enforced per-call timeout via AbortSignal
//   - finish-reason truncation detection BEFORE any parse
//   - normalised AiCallResult so callers classify: ok | truncated | timeout |
//     provider_error
//
// Gemini understands images AND PDFs through the same inline_data part, so both
// roles (Role 1 extraction, Role 2 summarisation) share ONE code path — no
// separate PDF branch is needed (contrast with the previous provider's split
// image/PDF paths).
// Structured JSON output is requested with response_mime_type application/json
// plus a Gemini-native response_schema synthesised from the PRD JSON schemas;
// the Zod mirrors in lib/validation remain the final validity gate.

import {
  FinishReason,
  GoogleGenAI,
  Type,
  type Part,
  type Schema,
} from "@google/genai";
import { config } from "../../config";
import { EXTRACTOR_SYSTEM_PROMPT } from "./extractorPrompt";
import { extractorJsonSchema } from "./extractorSchema";
import { ANALYST_SYSTEM_PROMPT } from "./analystPrompt";
import { analystJsonSchema } from "./analystSchema";

export type AiOutcome = "ok" | "truncated" | "timeout" | "provider_error";

export interface AiCallResult {
  outcome: AiOutcome;
  /** Raw model output text (present for ok/truncated). Never parsed here. */
  content: string | null;
  /** Safe, non-secret description for timeout / provider_error. */
  errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// Global AI concurrency semaphore
// ---------------------------------------------------------------------------

interface Waiter {
  resolve: () => void;
}

class Semaphore {
  private active = 0;
  private readonly queue: Waiter[] = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.limit <= 0) {
      throw new Error("AI concurrency limit must be greater than zero.");
    }
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.queue.push({ resolve });
    });
    this.active += 1;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next.resolve();
  }

  get activeCount(): number {
    return this.active;
  }
}

const aiSemaphore = new Semaphore(config.queue.concurrency);

// Lazily constructed so a missing credential surfaces as a normal
// provider_error from inside the callers' try/catch rather than failing module
// evaluation (matches the lazy-construction semantics used before the provider swap).
let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: config.ai.apiKey });
  return client;
}

/** Runs `fn` while holding a slot in the single global AI concurrency cap. */
export async function withAiConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  await aiSemaphore.acquire();
  try {
    return await fn();
  } finally {
    aiSemaphore.release();
  }
}

/** Exposed for diagnosis and tests â€” count of in-flight AI calls. */
export function getActiveAiCallCount(): number {
  return aiSemaphore.activeCount;
}

// ---------------------------------------------------------------------------
// Timeout + error normalisation
// ---------------------------------------------------------------------------

function isTimeoutSignalError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" ||
      err.name === "TimeoutError" ||
      /aborted|timed ?out/i.test(err.message ?? ""))
  );
}

function isTransientError(err: unknown): boolean {
  if (!err) return false;
  const status = (err as { status?: number })?.status;
  if (status === 503 || status === 429 || status === 500 || status === 502 || status === 504) {
    return true;
  }
  const msg = (err as Error)?.message ?? "";
  return /high demand|temporar|try again|503|429|econnreset|etimedout|socket hang up|fetch failed|rate limit/i.test(msg);
}

function toProviderError(err: unknown): AiCallResult {
  // Log server-side for diagnosis without exposing provider internals to users.
  console.error("[ai] provider call failed:", err);
  return { outcome: "provider_error", content: null, errorMessage: "The AI provider returned an error." };
}

async function runGeminiCall(params: {
  systemPrompt: string;
  parts: Part[];
  schema: Schema;
}): Promise<AiCallResult> {
  const maxCallAttempts = 3;
  for (let attempt = 1; attempt <= maxCallAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
    try {
      const response = await getClient().models.generateContent({
        model: config.ai.model,
        contents: [
          {
            role: "user",
            parts: params.parts,
          },
        ],
        config: {
          systemInstruction: { parts: [{ text: params.systemPrompt }] },
          temperature: config.ai.temperature,
          maxOutputTokens: config.ai.maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: params.schema,
          abortSignal: controller.signal,
        },
      });

      const finishReason = response.candidates?.[0]?.finishReason ?? null;
      const content = response.text ?? "";
      if (finishReason === FinishReason.MAX_TOKENS) {
        return { outcome: "truncated", content, errorMessage: null };
      }
      if (!response.candidates || response.candidates.length === 0) {
        console.error("[ai] no candidates returned; promptFeedback:", response.promptFeedback);
        return toProviderError(new Error("Gemini returned no response candidates."));
      }
      return { outcome: "ok", content, errorMessage: null };
    } catch (err) {
      if (isTimeoutSignalError(err)) {
        return { outcome: "timeout", content: null, errorMessage: "The AI provider did not respond in time." };
      }
      if (isTransientError(err) && attempt < maxCallAttempts) {
        const delayMs = attempt * 1500;
        console.warn(`[ai] transient provider error (attempt ${attempt}/${maxCallAttempts}), retrying in ${delayMs}ms:`, (err as Error)?.message ?? err);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      return toProviderError(err);
    } finally {
      clearTimeout(timer);
    }
  }
  return { outcome: "provider_error", content: null, errorMessage: "The AI provider returned an error." };
}

// ---------------------------------------------------------------------------
// JSON Schema -> Gemini Schema mapping
// ---------------------------------------------------------------------------

/**
 * Translates the PRD JSON Schemas (stored in extractorSchema.ts / analystSchema.ts,
 * plain JSON-Schema shapes) into the Gemini-native `Schema` used by
 * response_schema. Only well-supported Gemini fields are emitted: type,
 * properties, required, enum, items, maxItems, nullable, description.
 * Anything unrecognised degrades to Type.ANY rather than risking a 400.
 */
export function jsonSchemaToGeminiSchema(node: Record<string, unknown>): Schema {
  const description = typeof node.description === "string" ? node.description : undefined;
  const typeDecl = node.type;
  const typeList: string[] = Array.isArray(typeDecl) ? (typeDecl as string[]) : [String(typeDecl)];
  const nullable = Array.isArray(typeDecl) && typeDecl.includes("null");
  const primitive = typeList[0] ?? "string";

  switch (primitive) {
    case "object": {
      const properties: Record<string, Schema> = {};
      const raw = (node.properties ?? {}) as Record<string, Record<string, unknown>>;
      for (const [key, value] of Object.entries(raw)) {
        properties[key] = jsonSchemaToGeminiSchema(value);
      }
      const schema: Schema = { type: Type.OBJECT, properties };
      if (description !== undefined) schema.description = description;
      if (Array.isArray(node.required) && node.required.length > 0) {
        schema.required = node.required as string[];
      }
      return schema;
    }
    case "array": {
      const schema: Schema = { type: Type.ARRAY };
      if (node.items && typeof node.items === "object") {
        schema.items = jsonSchemaToGeminiSchema(node.items as Record<string, unknown>);
      }
      if (typeof node.maxItems === "number") {
        schema.maxItems = String(node.maxItems);
      }
      if (description !== undefined) schema.description = description;
      return schema;
    }
    case "string": {
      const schema: Schema = { type: Type.STRING };
      if (Array.isArray(node.enum) && node.enum.every((e) => typeof e === "string")) {
        schema.enum = node.enum as string[];
      }
      if (nullable) schema.nullable = true;
      if (description !== undefined) schema.description = description;
      return schema;
    }
    case "number":
    case "integer":
    case "boolean": {
      const kind: Type = primitive === "number" ? Type.NUMBER : primitive === "integer" ? Type.INTEGER : Type.BOOLEAN;
      const schema: Schema = { type: kind };
      if (nullable) schema.nullable = true;
      if (description !== undefined) schema.description = description;
      return schema;
    }
default:
      // Only the PRD schemas feed this mapper, so this branch is defensive.
      return { type: Type.STRING };
  }
}

const extractorGeminiSchema = jsonSchemaToGeminiSchema(extractorJsonSchema.schema);
const analystGeminiSchema = jsonSchemaToGeminiSchema(analystJsonSchema.schema);

// ---------------------------------------------------------------------------
// Public role entry points
// ---------------------------------------------------------------------------

export interface ReceiptInput {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

/** Role 1 â€” extract structured receipt data from an image or PDF. */
export async function extractReceipt(
  input: ReceiptInput,
  retryContext?: string,
): Promise<AiCallResult> {
  const parts: Part[] = [
    {
      inlineData: {
        mimeType: input.mimeType,
        data: input.buffer.toString("base64"),
      },
    },
  ];
  if (retryContext) {
    parts.push({ text: retryContext });
  }
  return withAiConcurrency(() =>
    runGeminiCall({ systemPrompt: EXTRACTOR_SYSTEM_PROMPT, parts, schema: extractorGeminiSchema }),
  );
}

/**
 * Role 2 â€” summarise a validated extraction. Receives ONLY the validated JSON
 * (never the original receipt file). Input is `unknown` and serialised by the
 * caller-provided payload, echoed back by the model without reinterpretation.
 */
export async function analyzeExpense(
  payload: unknown,
  retryContext?: string,
): Promise<AiCallResult> {
  const parts: Part[] = [
    { text: `Here is the validated expense record:\n${JSON.stringify(payload)}` },
  ];
  if (retryContext) {
    parts.push({ text: retryContext });
  }
  return withAiConcurrency(() =>
    runGeminiCall({ systemPrompt: ANALYST_SYSTEM_PROMPT, parts, schema: analystGeminiSchema }),
  );
}
