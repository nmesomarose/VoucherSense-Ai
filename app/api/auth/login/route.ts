// POST /api/auth/login — verify credentials and issue the session cookie.
// The same generic 401 is returned for unknown email and wrong password so an
// attacker cannot enumerate registered addresses.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/prisma-client";
import { config } from "@/config";
import { badRequest, unauthorized } from "@/lib/api/http";
import { issueSessionCookie, sessionCookieAttributes } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/passwords";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let email = "";
  let password = "";

  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return badRequest("Invalid request body.");
  }

  const user = email.length > 0 ? await prisma.user.findUnique({ where: { email } }) : null;
  const valid =
    user?.passwordHash !== null && user?.passwordHash !== undefined
      ? await verifyPassword(password, user.passwordHash)
      : false;

  if (!user || !valid) {
    return unauthorized("Invalid email or password.");
  }

  const token = issueSessionCookie(user.id);
  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set(config.auth.cookieName, token, {
    ...sessionCookieAttributes(),
    maxAge: config.auth.sessionMaxAgeSeconds,
  });
  return res;
}