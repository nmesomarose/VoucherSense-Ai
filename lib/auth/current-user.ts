// lib/auth/current-user.ts — derives the current user from the signed session
// cookie in the request. Ownership must always be derived from this value;
// a client-supplied user id is never trusted.

import { cookies } from "next/headers";
import { config } from "../../config";
import { verifySessionCookie } from "./session";

export async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(config.auth.cookieName)?.value;
  if (!token) return null;
  return verifySessionCookie(token);
}

/** Returns the authenticated user id or null (for use in route handlers). */
export async function requireCurrentUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new UnauthorizedError();
  }
  return userId;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("A valid session is required.");
    this.name = "UnauthorizedError";
  }
}