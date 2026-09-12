// lib/storage/localDriver.ts — local filesystem driver, the documented
// dev-equivalent of object storage (PRD §8). Files live under
// config.storage.localBasePath, never in PostgreSQL.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { config } from "../../config";
import type { StorageDriver } from "./index";

export class LocalStorageDriver implements StorageDriver {
  private readonly basePath = config.storage.localBasePath;

  async save(buffer: Buffer, key: string): Promise<void> {
    const absolute = join(this.basePath, key);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, buffer);
  }

  async read(key: string): Promise<Buffer> {
    const absolute = join(this.basePath, key);
    return readFile(absolute);
  }
}