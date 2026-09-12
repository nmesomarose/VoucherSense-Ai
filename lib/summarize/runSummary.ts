// lib/summarize/runSummary.ts — Role 2 orchestration (the one approved
// synchronous AI call path, PRD §7.2). Kept out of the route so the retry /
// validation / persistence logic is reusable and testable. Never receives the
// original receipt — only the validated ExtractionResult JSON (PRD §6).

import { config } from "../../config";
import { prisma } from "../../prisma-client";
import { Prisma, Summary } from "../../generated/prisma/client";
import { analyzeExpense } from "../ai/geminiClient";
import { SummarySchema, type ValidatedSummary } from "../validation/summary";

export interface RunSummaryResult {
  summary: Summary;
  created: boolean;
}

function buildPayload(er: {
  merchant: string | null;
  purchaseDate: string | null;
  currency: string | null;
  total: number | null;
  paymentMethod: string;
  category: string;
  items: Prisma.JsonValue;
  confidenceNote: string | null;
}): Record<string, unknown> {
  return {
    merchant: er.merchant,
    purchase_date: er.purchaseDate,
    currency: er.currency,
    total: er.total,
    payment_method: er.paymentMethod,
    category: er.category,
    items: er.items,
    confidence_note: er.confidenceNote,
  };
}

export async function runOrGetSummary(extractionResultId: string): Promise<RunSummaryResult> {
  // Fast-path idempotency: if a Summary already exists, return it WITHOUT a
  // second AI call (PRD §3 — a repeat request returns the existing summary).
  const existing = await prisma.summary.findUnique({ where: { extractionResultId } });
  if (existing) {
    return { summary: existing, created: false };
  }

  const extractionResult = await prisma.extractionResult.findUnique({
    where: { id: extractionResultId },
  });
  if (!extractionResult) {
    throw new NotFoundForSummaryError();
  }

  let summary: Summary | null = null;
  try {
    summary = await prisma.summary.create({ data: { extractionResultId } });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const raced = await prisma.summary.findUnique({ where: { extractionResultId } });
      if (raced) return { summary: raced, created: false };
    }
    throw err;
  }

  const payload = buildPayload(extractionResult);
  let validated: ValidatedSummary | null = null;
  let terminalError: string | null = null;
  let retryContext: string | undefined;
  let attempts = 0;

  while (attempts < config.ai.maxRetries + 1) {
    attempts += 1;
    await prisma.summary.update({ where: { id: summary.id }, data: { attemptCount: attempts } });

    const ai = await analyzeExpense(payload, retryContext);

    if (ai.outcome === "timeout" || ai.outcome === "provider_error") {
      terminalError = ai.errorMessage;
      break;
    }

    if (ai.outcome === "truncated") {
      retryContext =
        "Your previous response was cut off. Return a complete, corrected JSON object.";
      continue;
    }

    const raw = ai.content ?? "";
    if (raw.trim() === "") {
      retryContext = "Your previous response was empty. Return the complete JSON object.";
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      retryContext = "Your previous response was not valid JSON. Return a complete, corrected JSON object.";
      continue;
    }

    const checked = SummarySchema.safeParse(parsed);
    if (!checked.success) {
      retryContext = `Your previous response failed validation. Return a corrected, complete JSON object. Issue: ${firstIssue(
        checked.error,
      )}`;
      continue;
    }

    validated = checked.data;
    break;
  }

  if (validated) {
    summary = await prisma.summary.update({
      where: { id: summary.id },
      data: {
        status: "done",
        summaryText: validated.summary,
        totalSpent: validated.total_spent,
        currency: validated.currency,
        category: validated.category,
        largestItem: validated.largest_item,
        itemCount: validated.item_count,
        errorMessage: null,
      },
    });
  } else {
    summary = await prisma.summary.update({
      where: { id: summary.id },
      data: {
        status: "failed",
        errorMessage: terminalError ?? "Summarisation failed after the maximum number of attempts.",
      },
    });
  }

  return { summary, created: true };
}

function firstIssue(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  const first = error.issues[0];
  if (!first) return "unknown validation error";
  const path = first.path.length > 0 ? first.path.join(".") : "(root)";
  return `${path}: ${first.message}`;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  );
}

export class NotFoundForSummaryError extends Error {
  constructor() {
    super("Extraction result not found.");
    this.name = "NotFoundForSummaryError";
  }
}