// lib/files/validateFile.ts — per-file upload validation, PRD §8.
// Checks run in this order and are fail-fast: MIME allow-list, size/non-empty,
// then content-level checks (image actually decodes, PDF magic bytes).
// Filename extensions and browser-supplied metadata are never trusted.

import sharp from "sharp";
import { config } from "../../config";

export type FileValidationErrorCode =
  | "UNSUPPORTED_MIME"
  | "FILE_TOO_LARGE"
  | "FILE_EMPTY"
  | "CORRUPTED_IMAGE"
  | "CORRUPTED_PDF";

export type FileValidationResult =
  | { ok: true; mimeType: string; sizeBytes: number; buffer: Buffer }
  | { ok: false; code: FileValidationErrorCode; mimeType: string };

const PDF_MAGIC = Buffer.from("%PDF-", "ascii");

async function isDecodableImage(buffer: Buffer): Promise<boolean> {
  try {
    await sharp(buffer).metadata();
    return true;
  } catch {
    return false;
  }
}

export async function validateFile(
  buffer: Buffer,
  declaredMimeType: string,
): Promise<FileValidationResult> {
  const mimeType = declaredMimeType.toLowerCase();

  // 1. MIME type must be in the configured allow-list.
  if (!(config.uploads.allowedMimeTypes as readonly string[]).includes(mimeType)) {
    return { ok: false, code: "UNSUPPORTED_MIME", mimeType };
  }

  // 2. Size: bounded above and must be non-empty.
  if (buffer.length === 0) {
    return { ok: false, code: "FILE_EMPTY", mimeType };
  }
  if (buffer.length > config.uploads.maxSizeBytes) {
    return { ok: false, code: "FILE_TOO_LARGE", mimeType };
  }

  // 3/4. Content-level checks.
  if (mimeType === "application/pdf") {
    if (buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      return { ok: true, mimeType, sizeBytes: buffer.length, buffer };
    }
    return { ok: false, code: "CORRUPTED_PDF", mimeType };
  }

  const decodes = await isDecodableImage(buffer);
  if (!decodes) {
    return { ok: false, code: "CORRUPTED_IMAGE", mimeType };
  }

  return { ok: true, mimeType, sizeBytes: buffer.length, buffer };
}