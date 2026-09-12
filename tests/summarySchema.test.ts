import { describe, expect, it } from "vitest";
import { SummarySchema } from "../lib/validation/summary";

describe("SummarySchema", () => {
  it("accepts a valid summary", () => {
    const good = {
      summary: "You spent £12.50 on groceries at Test Market.",
      total_spent: 12.5,
      currency: "GBP",
      category: "groceries",
      largest_item: "Milk",
      item_count: 2,
    };
    expect(SummarySchema.safeParse(good).success).toBe(true);
  });

  it("accepts an empty-bodied summary record", () => {
    const minimal = {
      summary: "A high-level summary.",
      total_spent: null,
      currency: null,
      category: "other",
      largest_item: null,
      item_count: 0,
    };
    expect(SummarySchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects an empty summary string", () => {
    const bad = {
      summary: "",
      total_spent: 5,
      currency: "GBP",
      category: "other",
      largest_item: null,
      item_count: 1,
    };
    expect(SummarySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a negative total_spent", () => {
    const bad = {
      summary: "A summary.",
      total_spent: -5,
      currency: null,
      category: "other",
      largest_item: null,
      item_count: 1,
    };
    expect(SummarySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a fractional item_count", () => {
    const bad = {
      summary: "A summary.",
      total_spent: null,
      currency: null,
      category: "other",
      largest_item: null,
      item_count: 2.5,
    };
    expect(SummarySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a two-character currency", () => {
    const bad = {
      summary: "A summary.",
      total_spent: 10,
      currency: "US",
      category: "other",
      largest_item: null,
      item_count: 1,
    };
    expect(SummarySchema.safeParse(bad).success).toBe(false);
  });
});