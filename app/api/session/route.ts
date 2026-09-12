import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/prisma-client";
import { config } from "@/config";
import { sessionCookieAttributes, verifySessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

// GET /api/session — session status, used to gate the landing screen.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = verifyFromRequest(request);
  if (!userId) {
    return NextResponse.json({ authenticated: false, userId: null });
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ authenticated: false, userId: null });
  }
  return NextResponse.json({ authenticated: true, userId });
}

// DELETE /api/session — clear the session cookie (logout).
export async function DELETE(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(config.auth.cookieName, "", {
    ...sessionCookieAttributes(),
    maxAge: 0,
  });
  return res;
}

function verifyFromRequest(request: NextRequest): string | null {
  const token = request.cookies.get(config.auth.cookieName)?.value;
  if (!token) return null;
  return verifySessionCookie(token);
}