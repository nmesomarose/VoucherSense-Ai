import { NextResponse } from "next/server";
import { prisma } from "../../../prisma-client";
import { requireCurrentUserId } from "../../../lib/auth/current-user";
import { okJson, unauthorized } from "../../../lib/api/http";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  let userId: string;
  try {
    userId = await requireCurrentUserId();
  } catch {
    return unauthorized();
  }

  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId") ?? undefined;

  const jobs = await prisma.job.findMany({
    where: {
      receipt: {
        userId,
        ...(batchId ? { batchId } : {}),
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      receipt: {
        select: {
          id: true,
          originalFilename: true,
          mimeType: true,
          sizeBytes: true,
          batchId: true,
          uploadedAt: true,
        },
      },
      extractionResult: {
        select: { id: true, confidenceNote: true },
      },
    },
  });

  return okJson({ jobs });
}