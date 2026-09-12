// lib/storage/index.ts — the only module that knows about the storage driver
// (PRD §8). It exposes the StorageDriver interface, the driver-selection
// function, and a storage-key builder. Application code elsewhere never
// constructs a raw path or binary; it only ever asks the driver by key.

import { config } from "../../config";
import { LocalStorageDriver } from "./localDriver";
import { S3StorageDriver } from "./s3Driver";

export interface StorageDriver {
  save(buffer: Buffer, key: string): Promise<void>;
  read(key: string): Promise<Buffer>;
}

let cachedDriver: StorageDriver | null = null;

/**
 * Returns the active storage driver for the configured STORAGE_DRIVER value.
 * The driver is cached for the lifetime of the process.
 */
export function storage(): StorageDriver {
  if (cachedDriver) return cachedDriver;
  cachedDriver = resolveDriver();
  return cachedDriver;
}

function resolveDriver(): StorageDriver {
  switch (config.storage.driver) {
    case "s3":
      if (config.storage.s3.bucket.trim() === "") {
        throw new Error(
          "STORAGE_DRIVER=s3 but STORAGE_S3_BUCKET is not set in the environment.",
        );
      }
      return new S3StorageDriver();
    case "local":
      return new LocalStorageDriver();
    default:
      throw new Error(
        `Unknown STORAGE_DRIVER "${config.storage.driver}" (expected "local" or "s3").`,
      );
  }
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

/**
 * Builds a storage key using the same shape as PRD §2's example:
 * "receipts/<yyyy>/<mm>/<id>.<ext>". The extension derives from the validated
 * MIME type — never from a client-supplied filename.
 */
export function storageKeyFor(mimeType: string, id: string): string {
  const now = new Date();
  const ext = EXTENSION_BY_MIME[mimeType] ?? "bin";
  return `receipts/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}/${id}.${ext}`;
}