// lib/validation/extraction.ts — Zod schema mirroring extractorSchema exactly
// (PRD §7.1), including the 40-item cap and a real round-tripping calendar-date
// check. This is the actual gate — not "the API call succeeded".

import { z } from "zod";
import { CATEGORIES, MAX_ITEMS, PAYMENT_METHODS } from "../ai/extractorSchema";

function isValidCalendarDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

export const ExtractionSchema = z.object({
  merchant: z.string().nullable(),
  purchase_date: z
    .string()
    .refine(isValidCalendarDate, {
      message: "purchase_date must be a real calendar date in YYYY-MM-DD format",
    })
    .nullable(),
  currency: z.string().length(3).nullable(),
  total: z.number().nonnegative().nullable(),
  payment_method: z.enum(PAYMENT_METHODS),
  category: z.enum(CATEGORIES),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().nonnegative().nullable(),
        unit_price: z.number().nonnegative().nullable(),
        line_total: z.number().nonnegative().nullable(),
      }),
    )
    .max(MAX_ITEMS),
  confidence_note: z.string().nullable(),
});

export type ValidatedExtraction = z.infer<typeof ExtractionSchema>;

export type ExtractionOutcome =
  | "invalid_schema"
  | "truncated"
  | "timeout"
  | "provider_error"
  | "valid";

// Truncation check — run BEFORE attempting to parse/validate the response body.
// Gemini reports a token-cap cut-off via `finishReason === "MAX_TOKENS"`.
export function checkTruncation(finishReason: string): boolean {
  return finishReason === "MAX_TOKENS";
}