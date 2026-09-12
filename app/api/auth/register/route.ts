// POST /api/auth/register — create an account. The basic register->login flow
// is the documented auth surface; this is deliberately NOT a larger account
// system (no password reset, email verification, roles, or recovery).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/prisma-client";
import { config } from "@/config";
import { badRequest, conflict } from "@/lib/api/http";
import { hashPassword } from "@/lib/auth/passwords";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  if (!EMAIL_PATTERN.test(email)) {
    return badRequest("Enter a valid email address.");
  }
  if (password.length < config.auth.minPasswordLength) {
    return badRequest(
      `Password must be at least ${config.auth.minPasswordLength} characters.`,
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return conflict("An account with this email already exists.");
  }

  const passwordHash = await hashPassword(password);
  try {
    await prisma.user.create({ data: { email, passwordHash } });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return conflict("An account with this email already exists.");
    }
    throw err;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}