// lib/api/http.ts — small, consistent HTTP response builders for route
// handlers. User-facing errors are separated from technical details: handlers
// return safe codes/messages; server logs may retain diagnosis detail.

import { NextResponse } from "next/server";

interface ApiError {
  error: {
    code:
      | "BAD_REQUEST"
      | "UNAUTHENTICATED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "RATE_LIMITED"
      | "SERVER_ERROR";
    message: string;
  };
}

export function okJson<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function createdJson<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function acceptedJson<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 202 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json(
    { error: { code: "BAD_REQUEST", message } } satisfies ApiError,
    { status: 400 },
  );
}

export function unauthorized(message = "A valid session is required."): NextResponse {
  return NextResponse.json(
    { error: { code: "UNAUTHENTICATED", message } } satisfies ApiError,
    { status: 401 },
  );
}

export function forbidden(message = "You do not own this resource."): NextResponse {
  return NextResponse.json(
    { error: { code: "FORBIDDEN", message } } satisfies ApiError,
    { status: 403 },
  );
}

export function notFound(message = "Not found."): NextResponse {
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message } } satisfies ApiError,
    { status: 404 },
  );
}

export function conflict(message: string): NextResponse {
  return NextResponse.json(
    { error: { code: "CONFLICT", message } } satisfies ApiError,
    { status: 409 },
  );
}

export function tooManyRequests(message: string, retryAfterSeconds: number): NextResponse {
  const body = {
    error: {
      code: "RATE_LIMITED" as const,
      message,
      retryAfterSeconds,
    },
  };
  return NextResponse.json(body, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}

export function serverError(message = "Something went wrong. Please try again."): NextResponse {
  return NextResponse.json(
    { error: { code: "SERVER_ERROR", message } } satisfies ApiError,
    { status: 500 },
  );
}