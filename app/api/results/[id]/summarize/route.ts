import { NextResponse } from "next/server";
import { prisma } from "@/prisma-client";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import { consumeSummarize } from "@/lib/rateLimit";
import { runOrGetSummary } from "@/lib/summarize/runSummary";
import {
  okJson,
  unauthorized,
  notFound,
  forbidden,
  conflict,
  tooManyRequests,
  serverError,
} from "@/lib/api/http";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;

  let userId: string;
  try {
    userId = await requireCurrentUserId();
  } catch {
    return unauthorized();
  }

  const rate = consumeSummarize(userId);
  if (!rate.allowed) {
    return tooManyRequests(
      "Too many summarisation requests — please wait a moment.",
      rate.retryAfterSeconds,
    );
  }

  // Locate the extraction result and verify ownership through its job→receipt.
  const extractionResult = await prisma.extractionResult.findUnique({
    where: { id },
    include: {
      job: {
        include: {
          receipt: { select: { userId: true, storageKey: true } },
        },
      },
    },
  });

  if (!extractionResult) return notFound("Result not found.");
  if (extractionResult.job.receipt.userId !== userId) return forbidden();

  // Summarisation is only available once extraction is complete and valid.
  if (extractionResult.job.status !== "done") {
    return conflict("Extraction has not completed yet — summarisation is not available.");
  }

  try {
    const { summary, created } = await runOrGetSummary(id);
    return okJson({ summary, created });
  } catch (err) {
    console.error("[summarize] failed to run summary:", err);
    return serverError();
  }
}