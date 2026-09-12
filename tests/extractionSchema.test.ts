import { describe, expect, it } from "vitest";
import { ExtractionSchema } from "../lib/validation/extraction";
import { MAX_ITEMS } from "../lib/ai/extractorSchema";

function validExtraction(): Record<string, unknown> {
  return {
    merchant: "Test Market",
    purchase_date: "2024-02-29",
    currency: "GBP",
    total: 12.5,
    payment_method: "card",
    category: "groceries",
    items: [
      { name: "Milk", quantity: 2, unit_price: 1.1, line_total: 2.2 },
      { name: "Bread", quantity: 1, unit_price: 1.5, line_total: 1.5 },
    ],
    confidence_note: "Some fields were unclear.",
  };
}

describe("ExtractionSchema", () => {
  it("accepts a fully valid extraction", () => {
    const result = ExtractionSchema.safeParse(validExtraction());
    expect(result.success).toBe(true);
  });

  it("accepts nullable optional fields with a legitimately minimal receipt", () => {
    const minimal = {
      merchant: null,
      purchase_date: null,
      currency: null,
      total: null,
      payment_method: "unknown",
      category: "other",
      items: [],
      confidence_note: null,
    };
    expect(ExtractionSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects a structurally invalid calendar date (Feb 30)", () => {
    const bad = { ...validExtraction(), purchase_date: "2023-02-30" };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-existent day (2023-13-01)", () => {
    const bad = { ...validExtraction(), purchase_date: "2023-13-01" };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts leap day 2024-02-29", () => {
    expect(ExtractionSchema.safeParse(validExtraction()).success).toBe(true);
  });

  it("rejects a purchase_date that is not YYYY-MM-DD", () => {
    const bad = { ...validExtraction(), purchase_date: "29/02/2024" };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown payment methods", () => {
    const bad = { ...validExtraction(), payment_method: "bitcoin" };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown categories", () => {
    const bad = { ...validExtraction(), category: "luxury" };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a negative total", () => {
    const bad = { ...validExtraction(), total: -3 };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a currency that is not 3 characters", () => {
    const bad = { ...validExtraction(), currency: "POUNDS" };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty item name", () => {
    const bad = { ...validExtraction(), items: [{ name: "", quantity: null, unit_price: null, line_total: null }] };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects more than MAX_ITEMS line items", () => {
    const items = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({
      name: `Item ${i}`,
      quantity: null,
      unit_price: null,
      line_total: null,
    }));
    const bad = { ...validExtraction(), items };
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts exactly MAX_ITEMS line items", () => {
    const items = Array.from({ length: MAX_ITEMS }, (_, i) => ({
      name: `Item ${i}`,
      quantity: null,
      unit_price: null,
      line_total: null,
    }));
    const good = { ...validExtraction(), items };
    expect(ExtractionSchema.safeParse(good).success).toBe(true);
  });
});