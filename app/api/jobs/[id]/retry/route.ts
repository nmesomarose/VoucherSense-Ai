import { NextResponse } from "next/server";
import { prisma } from "@/prisma-client";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import { consumeUpload } from "@/lib/rateLimit";
import {
  okJson,
  unauthorized,
  notFound,
  forbidden,
  conflict,
  tooManyRequests,
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

  // Retries flow through the upload bucket (PRD §3 "Upload bucket").
  const rate = consumeUpload(userId);
  if (!rate.allowed) {
    return tooManyRequests(
      "Too many requests — please wait a moment before retrying.",
      rate.retryAfterSeconds,
    );
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: { receipt: { select: { userId: true } } },
  });

  if (!job) return notFound("Job not found.");
  if (job.receipt.userId !== userId) return forbidden();

  // Only 'failed' jobs may be retried; anything else returns 409 (PRD §3).
  if (job.status !== "failed") {
    return conflict(
      `Only failed jobs can be retried. This job is currently "${job.status}".`,
    );
  }

  // Continue from the highest attempt already recorded so the audit trail keeps
  // one record per attempt with unique numbers (PRD §4/§7 rely on readable history).
  // An exhausted-cycle reset to 0 would re-number retried attempts from 1.
  const lastAttempt = await prisma.jobAttempt.findFirst({
    where: { jobId: id },
    orderBy: { attemptNumber: "desc" },
    select: { attemptNumber: true },
  });
  const attemptCount = lastAttempt?.attemptNumber ?? 0;

  const retried = await prisma.job.update({
    where: { id },
    data: {
      status: "pending",
      attemptCount,
      errorMessage: null,
      claimedBy: null,
      claimedAt: null,
    },
  });

  return okJson({
    job: {
      id: retried.id,
      receiptId: retried.receiptId,
      status: retried.status,
      attemptCount: retried.attemptCount,
    },
    message: "Job re-enqueued.",
  });
}