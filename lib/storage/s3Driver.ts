// lib/storage/s3Driver.ts — S3-compatible driver implementing the same
// StorageDriver interface as the local driver; the only change needed to move
// to production object storage is STORAGE_DRIVER=s3 (PRD §8).

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { config } from "../../config";
import type { StorageDriver } from "./index";

export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string = config.storage.s3.bucket;

  constructor() {
    const clientConfig: S3ClientConfig = {
      region: config.storage.s3.region,
      credentials: {
        accessKeyId: config.storage.s3.accessKeyId,
        secretAccessKey: config.storage.s3.secretAccessKey,
      },
    };
    // Local S3-compatible endpoints (MinIO, etc.) are configured via STORAGE_S3_ENDPOINT.
    if (config.storage.s3.endpoint) {
      clientConfig.endpoint = config.storage.s3.endpoint;
    }
    this.client = new S3Client(clientConfig);
  }

  async save(buffer: Buffer, key: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer }),
    );
  }

  async read(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = result.Body;
    if (!body) throw new Error(`Storage read returned no body for key ${key}`);
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }
}