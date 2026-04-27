import { describe, it, expect } from "vitest";
import { z } from "zod";

// Test Zod schemas used by IngredientSupplier CRUD actions

const addIngredientSupplierSchema = z.object({
  ingredientId: z.string().min(1),
  supplierId: z.string().min(1),
  priceInCents: z.number().int().min(0),
  unit: z.string().min(1).max(20),
});

const updateIngredientSupplierSchema = z.object({
  id: z.string().min(1),
  priceInCents: z.number().int().min(0),
  unit: z.string().min(1).max(20),
});

const removeIngredientSupplierSchema = z.object({
  id: z.string().min(1),
});

describe("addIngredientSupplierSchema", () => {
  it("accepts a valid payload", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "sup1",
      priceInCents: 1500,
      unit: "kg",
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero price", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "sup1",
      priceInCents: 0,
      unit: "kg",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative price", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "sup1",
      priceInCents: -1,
      unit: "kg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty ingredientId", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "",
      supplierId: "sup1",
      priceInCents: 100,
      unit: "kg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty supplierId", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "",
      priceInCents: 100,
      unit: "kg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty unit", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "sup1",
      priceInCents: 100,
      unit: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unit over 20 chars", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "sup1",
      priceInCents: 100,
      unit: "x".repeat(21),
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer price", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "sup1",
      priceInCents: 1.5,
      unit: "kg",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateIngredientSupplierSchema", () => {
  it("accepts valid update", () => {
    const result = updateIngredientSupplierSchema.safeParse({
      id: "link1",
      priceInCents: 2500,
      unit: "lb",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = updateIngredientSupplierSchema.safeParse({
      id: "",
      priceInCents: 2500,
      unit: "lb",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const result = updateIngredientSupplierSchema.safeParse({
      id: "link1",
      priceInCents: -10,
      unit: "lb",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty unit", () => {
    const result = updateIngredientSupplierSchema.safeParse({
      id: "link1",
      priceInCents: 1000,
      unit: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("removeIngredientSupplierSchema", () => {
  it("accepts a valid id", () => {
    const result = removeIngredientSupplierSchema.safeParse({ id: "link1" });
    expect(result.success).toBe(true);
  });

  it("rejects empty id", () => {
    const result = removeIngredientSupplierSchema.safeParse({ id: "" });
    expect(result.success).toBe(false);
  });
});
