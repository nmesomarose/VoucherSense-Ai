import { NextResponse } from "next/server";
import { prisma } from "@/prisma-client";
import { requireCurrentUserId } from "@/lib/auth/current-user";
import { okJson, unauthorized, notFound, forbidden } from "@/lib/api/http";

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

  const extractionResult = await prisma.extractionResult.findUnique({
    where: { id },
    include: {
      summary: true,
      job: { include: { receipt: { select: { userId: true } } } },
    },
  });

  if (!extractionResult) return notFound("Result not found.");
  if (extractionResult.job.receipt.userId !== userId) return forbidden();

  if (!extractionResult.summary) {
    return notFound("No summary has been generated for this result yet.");
  }

  return okJson({ summary: extractionResult.summary });
}