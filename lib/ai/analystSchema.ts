// lib/ai/analystSchema.ts — Role 2 structured-output schema, exactly as
// specified in PRD §6.2 (strict: true, additionalProperties: false).
// Owns the field names/types; the analyst prompt and Zod mirror reference it.

export interface SummaryData {
  summary: string;
  total_spent: number | null;
  currency: string | null;
  category: string;
  largest_item: string | null;
  item_count: number;
}

export const analystJsonSchema = {
  name: "expense_summary",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      total_spent: { type: ["number", "null"] },
      currency: { type: ["string", "null"] },
      category: { type: "string" },
      largest_item: { type: ["string", "null"] },
      item_count: { type: "integer" },
    },
    required: [
      "summary",
      "total_spent",
      "currency",
      "category",
      "largest_item",
      "item_count",
    ],
    additionalProperties: false,
  },
} as const;