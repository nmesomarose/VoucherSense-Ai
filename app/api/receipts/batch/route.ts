import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { config } from "../../../../config";
import { prisma } from "../../../../prisma-client";
import { storage, storageKeyFor } from "../../../../lib/storage";
import { validateFile, type FileValidationErrorCode } from "../../../../lib/files/validateFile";
import { requireCurrentUserId } from "../../../../lib/auth/current-user";
import { consumeUpload } from "../../../../lib/rateLimit";
import {
  badRequest,
  tooManyRequests,
  unauthorized,
} from "../../../../lib/api/http";

interface UploadOutcome {
  filename: string;
  status: "queued" | "rejected";
  receiptId?: string;
  jobId?: string;
  errorCode?: FileValidationErrorCode | "STORAGE_FAILED" | "DATABASE_FAILED";
  message?: string;
}

const FRIENDLY_ERROR: Record<FileValidationErrorCode | "STORAGE_FAILED" | "DATABASE_FAILED", string> = {
  UNSUPPORTED_MIME:
    "Unsupported file type. Supported formats are JPG, PNG and PDF.",
  FILE_TOO_LARGE: `That file is larger than ${Math.round(
    config.uploads.maxSizeBytes / (1024 * 1024),
  )} MB.`,
  FILE_EMPTY: "That file appears to be empty.",
  CORRUPTED_IMAGE: "That image is damaged and could not be read.",
  CORRUPTED_PDF: "That PDF is corrupted and could not be read.",
  STORAGE_FAILED: "Your file was received but could not be stored. Please try again.",
  DATABASE_FAILED: "Your file could not be registered. Please try again.",
};

export async function POST(request: Request): Promise<NextResponse> {
  let userId: string;
  try {
    userId = await requireCurrentUserId();
  } catch {
    return unauthorized();
  }

  const rate = consumeUpload(userId);
  if (!rate.allowed) {
    return tooManyRequests(
      "Too many uploads — please wait a moment before uploading again.",
      rate.retryAfterSeconds,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Expected a multipart/form-data request.");
  }

  const incoming = form
    .getAll("files")
    .filter((value): value is File => value instanceof File);

  if (incoming.length === 0) {
    return badRequest("No files were submitted. Select at least one receipt.");
  }

  if (incoming.length > config.uploads.maxFilesPerBatch) {
    return badRequest(
      `Too many files in one upload. A batch accepts up to ${config.uploads.maxFilesPerBatch} files.`,
    );
  }

  const batchId = randomUUID();
  const outcomes: UploadOutcome[] = [];
  const jobs: Array<{ id: string; receiptId: string; status: "pending" }> = [];

  for (const file of incoming) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name;

    // Per-file validation (PRD §8): MIME, size/non-empty, image-decode, PDF magic.
    const validation = await validateFile(buffer, file.type || file.name);

    if (!validation.ok) {
      outcomes.push({
        filename,
        status: "rejected",
        errorCode: validation.code,
        message: FRIENDLY_ERROR[validation.code],
      });
      continue;
    }

    const receiptId = randomUUID();
    const storageKey = storageKeyFor(validation.mimeType, receiptId);

    // 1. Persist the file through the storage abstraction.
    try {
      await storage().save(validation.buffer, storageKey);
    } catch (err) {
      console.error(`[upload] storage save failed for ${filename}:`, err);
      outcomes.push({
        filename,
        status: "rejected",
        errorCode: "STORAGE_FAILED",
        message: FRIENDLY_ERROR.STORAGE_FAILED,
      });
      continue;
    }

    // 2. Create the Receipt + exactly one pending Job atomically.
    try {
      const { receipt, job } = await prisma.$transaction(async (tx) => {
        const receipt = await tx.receipt.create({
          data: {
            id: receiptId,
            userId,
            storageKey,
            originalFilename: filename,
            mimeType: validation.mimeType,
            sizeBytes: validation.sizeBytes,
            batchId,
          },
        });
        const job = await tx.job.create({
          data: {
            receiptId,
            status: "pending",
          },
        });
        return { receipt, job };
      });

      outcomes.push({ filename, status: "queued", receiptId: receipt.id, jobId: job.id });
      jobs.push({ id: job.id, receiptId: receipt.id, status: "pending" });
    } catch (err) {
      // No Receipt/Job rows exist for this file — the failed transaction rolled
      // back atomically, so no orphaned job records. (PRD defines no delete
      // operation on the storage interface, so the stored object remains; this
      // is recorded as a LIMITATION, not as success.)
      console.error(`[upload] database registration failed for ${filename}:`, err);
      outcomes.push({
        filename,
        status: "rejected",
        errorCode: "DATABASE_FAILED",
        message: FRIENDLY_ERROR.DATABASE_FAILED,
      });
    }
  }

  const accepted = jobs.length;
  return NextResponse.json(
    {
      batchId,
      accepted,
      rejected: outcomes.filter((o) => o.status === "rejected").length,
      uploads: outcomes,
      jobs,
    },
    { status: 201 },
  );
}

export const runtime = "nodejs";