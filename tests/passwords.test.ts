import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../lib/auth/passwords";

describe("scrypt password hashing", () => {
  it("round-trips a password through hash/verify", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("right-password");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("uses a unique salt per hash", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("rejects malformed stored values", async () => {
    await expect(verifyPassword("x", "scrypt$abcd")).resolves.toBe(false);
    await expect(verifyPassword("x", "$salt$hash")).resolves.toBe(false);
    await expect(verifyPassword("x", "not-a-hash")).resolves.toBe(false);
  });
});