// lib/validation/summary.ts — Zod schema mirroring analystSchema exactly
// (PRD §7.1 applies to both roles). Gate for Role 2 output before persisting.

import { z } from "zod";

export const SummarySchema = z.object({
  summary: z.string().min(1),
  total_spent: z.number().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  category: z.string().min(1),
  largest_item: z.string().nullable(),
  item_count: z.number().int().nonnegative(),
});

export type ValidatedSummary = z.infer<typeof SummarySchema>;