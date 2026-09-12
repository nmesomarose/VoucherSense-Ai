import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

// A fixed secret + 1-hour lifetime, set before config is imported (dynamic
// import below), so tokens can be crafted with arbitrary iat values and the
// expiry path is tested deterministically instead of by sleeping.
process.env.SESSION_SECRET = "test-secret-not-for-production";
process.env.SESSION_MAX_AGE_SECONDS = "3600";

const MAX_AGE_SECONDS = 3_600;

function makeToken(sub: string, iat: number): string {
  const encoded = Buffer.from(JSON.stringify({ sub, iat })).toString("base64url");
  const signature = createHmac("sha256", "test-secret-not-for-production")
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

describe("session cookies", () => {
  it("verifies a freshly issued token", async () => {
    const { issueSessionCookie, verifySessionCookie } = await import(
      "../lib/auth/session"
    );
    const token = issueSessionCookie("user-1");
    expect(verifySessionCookie(token)).toBe("user-1");
  });

  it("rejects tampered or malformed tokens", async () => {
    const { verifySessionCookie } = await import("../lib/auth/session");
    const token = makeToken("user-1", Math.floor(Date.now() / 1000));
    const [encoded] = token.split(".");
    expect(verifySessionCookie(`${encoded}.tampered-signature`)).toBeNull();
    expect(verifySessionCookie("not-a-token")).toBeNull();
    expect(verifySessionCookie("")).toBeNull();
  });

  it("rejects a token older than the session lifetime", async () => {
    const { verifySessionCookie } = await import("../lib/auth/session");
    const now = Math.floor(Date.now() / 1000);
    expect(verifySessionCookie(makeToken("user-1", now))).toBe("user-1");
    expect(verifySessionCookie(makeToken("user-1", now - MAX_AGE_SECONDS - 1))).toBeNull();
  });

  it("rejects a token with an iat in the future", async () => {
    const { verifySessionCookie } = await import("../lib/auth/session");
    const now = Math.floor(Date.now() / 1000);
    expect(verifySessionCookie(makeToken("user-1", now + 60))).toBeNull();
  });
});