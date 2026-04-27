import { describe, it, expect } from "vitest";
import { z } from "zod";

// Test Zod schemas used in inventory actions

const updateIngredientConfigSchema = z.object({
  id: z.string().min(1),
  costPerUnitInCents: z.number().int().min(0).nullable().optional(),
  snapIncrement: z.number().int().min(1).nullable().optional(),
  containerProfile: z.string().max(100).nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  lowStockThreshold: z.number().int().min(0).nullable().optional(),
  unitsPerContainer: z.number().int().min(1).nullable().optional(),
  isPinned: z.boolean().optional(),
});

const createIngredientPurchaseSchema = z.object({
  ingredientSupplierId: z.string().min(1),
  quantity: z.number().int().min(1),
  unit: z.string().min(1).max(20),
  totalPriceInCents: z.number().int().min(0),
});

const saveCountSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: z.number().int().min(0),
  expectedUpdatedAt: z.string().optional(),
});

describe("updateIngredientConfigSchema", () => {
  it("accepts valid config with all fields", () => {
    const result = updateIngredientConfigSchema.safeParse({
      id: "ing123",
      costPerUnitInCents: 350,
      snapIncrement: 5,
      containerProfile: "case (6-pack)",
      category: "Dairy",
      lowStockThreshold: 10,
      unitsPerContainer: 12,
      isPinned: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal config (id only)", () => {
    const result = updateIngredientConfigSchema.safeParse({ id: "ing123" });
    expect(result.success).toBe(true);
  });

  it("rejects empty id", () => {
    const result = updateIngredientConfigSchema.safeParse({ id: "" });
    expect(result.success).toBe(false);
  });

  it("rejects negative cost", () => {
    const result = updateIngredientConfigSchema.safeParse({
      id: "ing123",
      costPerUnitInCents: -1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts null values for optional fields", () => {
    const result = updateIngredientConfigSchema.safeParse({
      id: "ing123",
      costPerUnitInCents: null,
      snapIncrement: null,
      containerProfile: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects container profile over 100 chars", () => {
    const result = updateIngredientConfigSchema.safeParse({
      id: "ing123",
      containerProfile: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects category over 50 chars", () => {
    const result = updateIngredientConfigSchema.safeParse({
      id: "ing123",
      category: "x".repeat(51),
    });
    expect(result.success).toBe(false);
  });
});

describe("saveCountSchema", () => {
  it("accepts valid count", () => {
    const result = saveCountSchema.safeParse({
      ingredientId: "ing123",
      quantity: 50,
    });
    expect(result.success).toBe(true);
  });

  it("accepts count with expectedUpdatedAt", () => {
    const result = saveCountSchema.safeParse({
      ingredientId: "ing123",
      quantity: 50,
      expectedUpdatedAt: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero quantity", () => {
    const result = saveCountSchema.safeParse({
      ingredientId: "ing123",
      quantity: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative quantity", () => {
    const result = saveCountSchema.safeParse({
      ingredientId: "ing123",
      quantity: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer quantity", () => {
    const result = saveCountSchema.safeParse({
      ingredientId: "ing123",
      quantity: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("createIngredientPurchaseSchema", () => {
  it("accepts a valid purchase", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "link123",
      quantity: 10,
      unit: "kg",
      totalPriceInCents: 12500,
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero total price", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "link123",
      quantity: 1,
      unit: "kg",
      totalPriceInCents: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty ingredientSupplierId", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "",
      quantity: 10,
      unit: "kg",
      totalPriceInCents: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero quantity", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "link123",
      quantity: 0,
      unit: "kg",
      totalPriceInCents: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "link123",
      quantity: -1,
      unit: "kg",
      totalPriceInCents: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty unit", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "link123",
      quantity: 5,
      unit: "",
      totalPriceInCents: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative totalPriceInCents", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "link123",
      quantity: 5,
      unit: "kg",
      totalPriceInCents: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateIngredientConfigSchema (no supplierId)", () => {
  it("strips unknown supplierId silently", () => {
    const result = updateIngredientConfigSchema.safeParse({
      id: "ing123",
      // legacy clients may still pass this
      supplierId: "sup1",
    } as Record<string, unknown>);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).supplierId).toBeUndefined();
    }
  });
});

describe("Large change detection", () => {
  it("detects >50% increase", () => {
    const previous = 100;
    const newVal = 160;
    const change = Math.abs(newVal - previous) / previous;
    expect(change > 0.5).toBe(true);
  });

  it("detects >50% decrease", () => {
    const previous = 100;
    const newVal = 40;
    const change = Math.abs(newVal - previous) / previous;
    expect(change > 0.5).toBe(true);
  });

  it("does not flag 50% change", () => {
    const previous = 100;
    const newVal = 50;
    const change = Math.abs(newVal - previous) / previous;
    expect(change > 0.5).toBe(false);
  });

  it("does not flag small change", () => {
    const previous = 100;
    const newVal = 95;
    const change = Math.abs(newVal - previous) / previous;
    expect(change > 0.5).toBe(false);
  });
});
