// worker/processJob.ts — per-job processing sequence (PRD §4.2):
//
//   claim(s)──────────────────> [done in claimJob.ts]
//   loop:
//     attempt++  -> record JobAttempt
//     call Role 1 (timeout enforced, truncation detected BEFORE parse)
//     truncated                 -> retry with truncation context
//     ok: JSON.parse + Zod      -> valid: persist ExtractionResult, job done
//     ok but invalid schema     -> retry with the specific error context
//     timeout / provider error  -> terminal: job failed (PRD §4.2)
//   retries bounded by config.ai.maxRetries; never unbounded, never identical
//   prompts (PRD §7.3).

import { config } from "../config";
import { prisma } from "../prisma-client";
import { Prisma } from "../generated/prisma/client";
import { storage } from "../lib/storage";
import { extractReceipt, type AiCallResult } from "../lib/ai/geminiClient";
import { ExtractionSchema, type ValidatedExtraction } from "../lib/validation/extraction";

export async function processJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { receipt: true },
  });

  if (!job) {
    console.error(`[processJob] job ${jobId} not found`);
    return;
  }
  if (job.status !== "processing") {
    // Claimed state was changed while we were en route (e.g. reaped). Do not
    // process a job we no longer own.
    console.warn(`[processJob] job ${jobId} no longer processing (${job.status}); skipping`);
    return;
  }

  const receipt = job.receipt;
  let validated: ValidatedExtraction | null = null;
  let terminalError: string | null = null;
  let attempts = job.attemptCount;

  try {
    const buffer = await storage().read(receipt.storageKey);
    const input = {
      buffer,
      mimeType: receipt.mimeType,
      filename: receipt.originalFilename,
    };

    let retryContext: string | undefined;

    while (attempts < config.ai.maxRetries + 1) {
      attempts += 1;
      await prisma.job.update({
        where: { id: jobId },
        data: { attemptCount: attempts },
      });

      const ai: AiCallResult = await extractReceipt(input, retryContext);

      if (ai.outcome === "timeout" || ai.outcome === "provider_error") {
        // Terminal per PRD §4.2.
        await recordAttempt(jobId, attempts, "", ai.outcome, ai.errorMessage ?? undefined);
        terminalError = ai.errorMessage;
        break;
      }

      if (ai.outcome === "truncated") {
        await recordAttempt(jobId, attempts, ai.content ?? "", "truncated");
        retryContext =
          "Your previous response was cut off before completing. Return a complete, corrected " +
          "JSON object — if the receipt has more than 40 items, include only the 40 highest-value " +
          "ones and note the omission in confidence_note.";
        continue;
      }

      // outcome === "ok": parse and validate. Never trust the raw content.
      const raw = ai.content ?? "";
      if (raw.trim() === "") {
        await recordAttempt(jobId, attempts, "", "invalid_schema", "The model returned an empty response.");
        retryContext =
          "Your previous response was empty. Return the complete JSON object for the receipt.";
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        await recordAttempt(jobId, attempts, raw, "invalid_schema", "Response was not valid JSON.");
        retryContext = buildInvalidRetryContext("the response was not valid JSON");
        continue;
      }

      const checked = ExtractionSchema.safeParse(parsed);
      if (!checked.success) {
        const message = formatZodIssue(checked.error);
        await recordAttempt(jobId, attempts, raw, "invalid_schema", message);
        retryContext = buildInvalidRetryContext(message);
        continue;
      }

      validated = checked.data;
      await recordAttempt(jobId, attempts, raw, "valid");
      break;
    }

    if (validated) {
      await persistResult(jobId, validated);
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "done", errorMessage: null },
      });
      console.log(`[processJob] job ${jobId} done`);
      return;
    }

    const message = terminalError ?? "Processing failed after the maximum number of attempts.";
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "failed", errorMessage: message },
    });
    console.error(`[processJob] job ${jobId} failed: ${message}`);
  } catch (err) {
    console.error(`[processJob] job ${jobId} fatal`, err);
    await prisma.job
      .update({
        where: { id: jobId },
        data: { status: "failed", errorMessage: "Processing failed unexpectedly." },
      })
      .catch((updateErr) => {
        console.error(`[processJob] could not mark job ${jobId} failed:`, updateErr);
      });
  }
}

async function recordAttempt(
  jobId: string,
  attemptNumber: number,
  rawResponse: string,
  outcome: string,
  validationError?: string,
): Promise<void> {
  await prisma.jobAttempt.create({
    data: { jobId, attemptNumber, rawResponse, outcome, validationError },
  });
}

async function persistResult(jobId: string, data: ValidatedExtraction): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.extractionResult.create({
      data: {
        jobId,
        merchant: data.merchant,
        purchaseDate: data.purchase_date,
        currency: data.currency,
        total: data.total,
        paymentMethod: data.payment_method,
        category: data.category,
        items: data.items as unknown as Prisma.InputJsonValue,
        confidenceNote: data.confidence_note,
      },
    });
  });
}

function buildInvalidRetryContext(issue: string): string {
  return `Your previous response failed validation: ${issue}. Return a corrected, complete JSON object fixing this issue.`;
}

function formatZodIssue(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  const first = error.issues[0];
  if (!first) return "unknown validation error";
  const path = first.path.length > 0 ? first.path.join(".") : "(root)";
  return `${path}: ${first.message}`;
}