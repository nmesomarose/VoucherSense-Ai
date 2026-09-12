// lib/ai/extractorSchema.ts — Role 1 structured-output schema, exactly as
// specified in PRD §5.2 (strict: true, additionalProperties: false, max 40 items).
// This file is the single owner of the field names, enum values, and the item
// cap so the prompt and Zod mirror never drift.

export const MAX_ITEMS = 40;

export const PAYMENT_METHODS = ["cash", "card", "transfer", "pos", "unknown"] as const;
export const CATEGORIES = [
  "groceries",
  "fuel",
  "transport",
  "dining",
  "utilities",
  "office_supplies",
  "equipment",
  "services",
  "other",
] as const;

export interface ExtractedItem {
  name: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
}

export interface ExtractionData {
  merchant: string | null;
  purchase_date: string | null;
  currency: string | null;
  total: number | null;
  payment_method: (typeof PAYMENT_METHODS)[number];
  category: (typeof CATEGORIES)[number];
  items: ExtractedItem[];
  confidence_note: string | null;
}

export const extractorJsonSchema = {
  name: "receipt_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      merchant: { type: ["string", "null"] },
      purchase_date: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
      currency: { type: ["string", "null"], description: "ISO 4217 code or null" },
      total: { type: ["number", "null"] },
      payment_method: {
        type: "string",
        enum: [...PAYMENT_METHODS],
      },
      category: {
        type: "string",
        enum: [...CATEGORIES],
      },
      items: {
        type: "array",
        maxItems: MAX_ITEMS,
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            quantity: { type: ["number", "null"] },
            unit_price: { type: ["number", "null"] },
            line_total: { type: ["number", "null"] },
          },
          required: ["name", "quantity", "unit_price", "line_total"],
          additionalProperties: false,
        },
      },
      confidence_note: { type: ["string", "null"] },
    },
    required: [
      "merchant",
      "purchase_date",
      "currency",
      "total",
      "payment_method",
      "category",
      "items",
      "confidence_note",
    ],
    additionalProperties: false,
  },
} as const;