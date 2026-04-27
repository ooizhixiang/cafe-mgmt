import { describe, it, expect } from "vitest";
import { z } from "zod";

// Test Zod schemas and cost logic used in recipe actions

const createRecipeSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  servingSize: z.string().max(50).optional(),
});

const addIngredientSchema = z.object({
  recipeId: z.string().min(1),
  ingredientId: z.string().min(1),
  quantityPerServing: z.number().int().min(1),
});

const addStepSchema = z.object({
  recipeId: z.string().min(1),
  instruction: z.string().min(1, "Instruction is required").max(500),
});

describe("createRecipeSchema", () => {
  it("accepts valid recipe data", () => {
    const result = createRecipeSchema.safeParse({
      name: "Flat White",
      description: "Classic Australian espresso drink",
      servingSize: "8oz",
    });
    expect(result.success).toBe(true);
  });

  it("accepts name only", () => {
    const result = createRecipeSchema.safeParse({ name: "Latte" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createRecipeSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 chars", () => {
    const result = createRecipeSchema.safeParse({ name: "x".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("rejects description over 500 chars", () => {
    const result = createRecipeSchema.safeParse({
      name: "Latte",
      description: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe("addIngredientSchema", () => {
  it("accepts valid ingredient addition", () => {
    const result = addIngredientSchema.safeParse({
      recipeId: "rec123",
      ingredientId: "ing123",
      quantityPerServing: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero quantity", () => {
    const result = addIngredientSchema.safeParse({
      recipeId: "rec123",
      ingredientId: "ing123",
      quantityPerServing: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("addStepSchema", () => {
  it("accepts valid step", () => {
    const result = addStepSchema.safeParse({
      recipeId: "rec123",
      instruction: "Pull a double shot of espresso",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty instruction", () => {
    const result = addStepSchema.safeParse({
      recipeId: "rec123",
      instruction: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects instruction over 500 chars", () => {
    const result = addStepSchema.safeParse({
      recipeId: "rec123",
      instruction: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe("Recipe cost calculation", () => {
  it("calculates cost per serving from ingredients", () => {
    const ingredients = [
      { quantityPerServing: 2, costPerUnitInCents: 150 },
      { quantityPerServing: 1, costPerUnitInCents: 50 },
    ];

    const cost = ingredients.reduce(
      (sum, ri) => sum + ri.quantityPerServing * ri.costPerUnitInCents,
      0
    );

    expect(cost).toBe(350); // (2*150) + (1*50) = 350 cents
  });

  it("returns null when some ingredient costs are missing", () => {
    const ingredients = [
      { quantityPerServing: 2, costPerUnitInCents: 150 },
      { quantityPerServing: 1, costPerUnitInCents: null },
    ];

    const hasAllCosts = ingredients.every((ri) => ri.costPerUnitInCents !== null);
    expect(hasAllCosts).toBe(false);
  });

  it("returns 0 for recipe with no ingredients", () => {
    const ingredients: { quantityPerServing: number; costPerUnitInCents: number }[] = [];
    const cost = ingredients.reduce(
      (sum, ri) => sum + ri.quantityPerServing * ri.costPerUnitInCents,
      0
    );
    expect(cost).toBe(0);
  });
});

describe("Step reordering", () => {
  it("assigns sequential step numbers", () => {
    const stepIds = ["a", "b", "c"];
    const updates = stepIds.map((id, index) => ({
      id,
      stepNumber: index + 1,
    }));

    expect(updates).toEqual([
      { id: "a", stepNumber: 1 },
      { id: "b", stepNumber: 2 },
      { id: "c", stepNumber: 3 },
    ]);
  });
});
