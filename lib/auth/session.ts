// lib/auth/session.ts — signed, httpOnly, tamper-evident session cookie
// (server-only). Register/login issue a cookie; every protected endpoint and
// server page derives ownership from this token and never from a
// client-supplied user id.

import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../../config";

interface SessionPayload {
  sub: string; // user id
  iat: number; // issued-at epoch seconds
}

export function issueSessionCookie(userId: string): string {
  const payload: SessionPayload = {
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifySessionCookie(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    if (typeof payload.iat !== "number") return null;

    const ageSeconds = Math.floor(Date.now() / 1000) - payload.iat;
    if (ageSeconds < 0 || ageSeconds > config.auth.sessionMaxAgeSeconds) return null;

    return payload.sub;
  } catch {
    return null;
  }
}

/** Cookie attributes shared by the login and session routes. */
export function sessionCookieAttributes(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.nodeEnv === "production",
    path: "/",
  };
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", config.auth.sessionSecret)
    .update(encodedPayload)
    .digest("base64url");
}