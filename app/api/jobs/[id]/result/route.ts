import { NextResponse } from "next/server";
import { prisma } from "@/prisma-client";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import { okJson, unauthorized, notFound, forbidden, conflict } from "@/lib/api/http";

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
      receipt: { select: { userId: true } },
      extractionResult: true,
    },
  });

  if (!job) return notFound("Job not found.");
  if (job.receipt.userId !== userId) return forbidden();

  if (job.status !== "done") {
    return conflict("Extraction is not complete yet.");
  }

  if (!job.extractionResult) {
    return conflict("No validated result is available for this job.");
  }

  const er = job.extractionResult;
  return okJson({
    result: {
      id: er.id,
      jobId: er.jobId,
      merchant: er.merchant,
      purchase_date: er.purchaseDate,
      currency: er.currency,
      total: er.total,
      payment_method: er.paymentMethod,
      category: er.category,
      items: er.items,
      confidence_note: er.confidenceNote,
      createdAt: er.createdAt,
    },
  });
}