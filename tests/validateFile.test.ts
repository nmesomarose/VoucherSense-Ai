import { describe, expect, it } from "vitest";
import { validateFile } from "../lib/files/validateFile";

// A real 1x1 PNG and a real 1x1 JPEG, so the "file actually decodes" check is
// exercised honestly rather than against fake bytes.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
  "base64",
);

describe("validateFile", () => {
  it("accepts a decodable PNG", async () => {
    const result = await validateFile(TINY_PNG, "image/png");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mimeType).toBe("image/png");
      expect(result.buffer).toEqual(TINY_PNG);
    }
  });

  it("accepts a decodable JPEG", async () => {
    const result = await validateFile(TINY_JPEG, "image/jpeg");
    expect(result.ok).toBe(true);
  });

  it("accepts a PDF with valid magic bytes", async () => {
    const buffer = Buffer.from("%PDF-1.7 hello", "ascii");
    const result = await validateFile(buffer, "application/pdf");
    expect(result.ok).toBe(true);
  });

  it("rejects an unlisted MIME type", async () => {
    const result = await validateFile(TINY_PNG, "text/plain");
    expect(result).toEqual({
      ok: false,
      code: "UNSUPPORTED_MIME",
      mimeType: "text/plain",
    });
  });

  it("case-insensitively matches the declared MIME type", async () => {
    const result = await validateFile(TINY_PNG, "IMAGE/PNG");
    expect(result.ok).toBe(true);
  });

  it("rejects an empty file", async () => {
    const result = await validateFile(Buffer.alloc(0), "image/png");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FILE_EMPTY");
  });

  it("rejects a MIME-typed blob that is not an image", async () => {
    const result = await validateFile(Buffer.from("not an image at all"), "image/png");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CORRUPTED_IMAGE");
  });

  it("rejects a PDF missing the %PDF- magic bytes", async () => {
    const result = await validateFile(Buffer.from("This is definitely a pdf", "ascii"), "application/pdf");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CORRUPTED_PDF");
  });

  it("rejects a file exceeding the configured size limit", async () => {
    const oversized = Buffer.concat([TINY_PNG, Buffer.alloc(11 * 1024 * 1024, 0)]);
    const result = await validateFile(oversized, "image/png");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FILE_TOO_LARGE");
  });
});