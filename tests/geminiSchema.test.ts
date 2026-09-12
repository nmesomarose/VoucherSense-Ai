import { describe, expect, it } from "vitest";
import { jsonSchemaToGeminiSchema } from "../lib/ai/geminiClient";
import { extractorJsonSchema } from "../lib/ai/extractorSchema";
import { analystJsonSchema } from "../lib/ai/analystSchema";
import { MAX_ITEMS } from "../lib/ai/extractorSchema";

describe("jsonSchemaToGeminiSchema (PRD -> Gemini response_schema mapping)", () => {
  it("maps the extractor schema without emitting unsupported fields", () => {
    const gemini = jsonSchemaToGeminiSchema(extractorJsonSchema.schema);

    expect(gemini.type).toBe("OBJECT");
    expect(gemini.required).toEqual([
      "merchant",
      "purchase_date",
      "currency",
      "total",
      "payment_method",
      "category",
      "items",
      "confidence_note",
    ]);
    const keys = Object.keys(gemini);
    expect(keys).not.toContain("additionalProperties");
    expect(keys).not.toContain("address");

    const items = gemini.properties?.items;
    expect(items?.type).toBe("ARRAY");
    expect(items?.maxItems).toBe(String(MAX_ITEMS));
    const itemProps = items?.items?.properties;
    expect(itemProps?.name?.type).toBe("STRING");
    expect(itemProps?.quantity?.nullable).toBe(true);

    const payment = gemini.properties?.payment_method;
    expect(payment?.type).toBe("STRING");
    expect(payment?.enum).toEqual([
      "cash",
      "card",
      "transfer",
      "pos",
      "unknown",
    ]);
    expect(gemini.properties?.merchant?.nullable).toBe(true);
    expect(gemini.properties?.total?.nullable).toBe(true);
  });

  it("maps the analyst schema", () => {
    const gemini = jsonSchemaToGeminiSchema(analystJsonSchema.schema);

    expect(gemini.type).toBe("OBJECT");
    expect(gemini.properties?.item_count?.type).toBe("INTEGER");
    expect(gemini.properties?.total_spent?.nullable).toBe(true);
    expect(gemini.required).toContain("summary");
  });

  it("preserves descriptions when present", () => {
    const gemini = jsonSchemaToGeminiSchema(extractorJsonSchema.schema);
    expect(gemini.properties?.purchase_date?.description).toContain("YYYY-MM-DD");
  });
});