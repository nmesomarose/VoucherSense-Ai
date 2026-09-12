import { NextResponse } from "next/server";
import { prisma } from "../../../../prisma-client";
import { requireCurrentUserId } from "../../../../lib/auth/current-user";
import { okJson, unauthorized, notFound, forbidden } from "../../../../lib/api/http";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;

  let userId: string;
  try {
    userId = await requireCurrentUserId();
  } catch {
    return unauthorized();
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      receipt: {
        select: {
          id: true,
          userId: true,
          originalFilename: true,
          mimeType: true,
          sizeBytes: true,
          batchId: true,
          uploadedAt: true,
        },
      },
    },
  });

  if (!job) return notFound("Job not found.");
  if (job.receipt.userId !== userId) return forbidden();

  return okJson({
    job: {
      id: job.id,
      receiptId: job.receiptId,
      status: job.status,
      attemptCount: job.attemptCount,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      receipt: job.receipt,
    },
  });
}

export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;

  let userId: string;
  try {
    userId = await requireCurrentUserId();
  } catch {
    return unauthorized();
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: { receipt: true },
  });

  if (!job) return notFound("Job not found.");
  if (job.receipt.userId !== userId) return forbidden();

  const extraction = await prisma.extractionResult.findUnique({
    where: { jobId: id },
    select: { id: true },
  });

  if (extraction) {
    await prisma.summary.deleteMany({ where: { extractionResultId: extraction.id } });
    await prisma.extractionResult.delete({ where: { id: extraction.id } });
  }

  await prisma.jobAttempt.deleteMany({ where: { jobId: id } });
  await prisma.job.delete({ where: { id } });
  await prisma.receipt.delete({ where: { id: job.receiptId } });

  return okJson({ deleted: true, id });
}