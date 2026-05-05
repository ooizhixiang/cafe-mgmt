import { describe, it, expect } from "vitest";
import {
  expandRecipeToLeaves,
  wouldCreateCycle,
  rollupCostPerYieldUnit,
  type ExpandRecipeInput,
  type CostRollupRecipe,
} from "./recipe-expand";

function recipe(
  over: Partial<ExpandRecipeInput> & { id: string }
): ExpandRecipeInput {
  return {
    yieldQuantity: null,
    yieldUnit: null,
    ingredients: [],
    ...over,
  };
}

function rawIng(ingredientId: string, quantityPerServing: number) {
  return {
    ingredientId,
    subRecipeId: null,
    quantityPerServing,
  };
}

function subRow(subRecipeId: string, quantityPerServing: number) {
  return {
    ingredientId: null,
    subRecipeId,
    quantityPerServing,
  };
}

describe("expandRecipeToLeaves — single level", () => {
  it("returns the existing flat ingredient map for a raw recipe (backward compat)", () => {
    const registry = new Map<string, ExpandRecipeInput>([
      [
        "latte",
        recipe({
          id: "latte",
          ingredients: [rawIng("milk", 200), rawIng("espresso", 30)],
        }),
      ],
    ]);
    const result = expandRecipeToLeaves("latte", registry);
    expect(Object.fromEntries(result)).toEqual({ milk: 200, espresso: 30 });
  });

  it("expands a single sub-recipe row using the yield ratio (the user's case)", () => {
    // Latte uses 100 mL of foam. Foam yields 200 mL per recipe and contains
    // 250 mL of milk. So 1 latte → (100/200) × 250 = 125 mL of milk.
    const registry = new Map<string, ExpandRecipeInput>([
      [
        "latte",
        recipe({ id: "latte", ingredients: [subRow("foam", 100)] }),
      ],
      [
        "foam",
        recipe({
          id: "foam",
          yieldQuantity: 200,
          yieldUnit: "mL",
          ingredients: [rawIng("milk", 250)],
        }),
      ],
    ]);
    const result = expandRecipeToLeaves("latte", registry);
    expect(Object.fromEntries(result)).toEqual({ milk: 125 });
  });

  it("merges raw + sub-recipe rows in the same parent", () => {
    const registry = new Map<string, ExpandRecipeInput>([
      [
        "latte",
        recipe({
          id: "latte",
          ingredients: [rawIng("espresso", 30), subRow("foam", 100)],
        }),
      ],
      [
        "foam",
        recipe({
          id: "foam",
          yieldQuantity: 200,
          yieldUnit: "mL",
          ingredients: [rawIng("milk", 250)],
        }),
      ],
    ]);
    const result = expandRecipeToLeaves("latte", registry);
    expect(Object.fromEntries(result)).toEqual({ espresso: 30, milk: 125 });
  });

  it("merges the same leaf appearing through both raw and sub-recipe paths", () => {
    // Recipe uses 50 mL milk directly AND 100 mL of foam (which uses 250 mL/200 of milk).
    const registry = new Map<string, ExpandRecipeInput>([
      [
        "drink",
        recipe({
          id: "drink",
          ingredients: [rawIng("milk", 50), subRow("foam", 100)],
        }),
      ],
      [
        "foam",
        recipe({
          id: "foam",
          yieldQuantity: 200,
          yieldUnit: "mL",
          ingredients: [rawIng("milk", 250)],
        }),
      ],
    ]);
    const result = expandRecipeToLeaves("drink", registry);
    // 50 raw + 125 from foam expansion = 175
    expect(Object.fromEntries(result)).toEqual({ milk: 175 });
  });
});

describe("expandRecipeToLeaves — nested", () => {
  it("walks 3 levels: A → B → C", () => {
    // A uses 5 of B. B yields 10, contains 3 of raw C. So A → 5/10 × 3 = 1.5 → rounds to 2.
    const registry = new Map<string, ExpandRecipeInput>([
      ["a", recipe({ id: "a", ingredients: [subRow("b", 5)] })],
      [
        "b",
        recipe({
          id: "b",
          yieldQuantity: 10,
          yieldUnit: "g",
          ingredients: [rawIng("c", 3)],
        }),
      ],
    ]);
    const result = expandRecipeToLeaves("a", registry);
    // 1.5 rounds to 2 (banker's rounding rounds-half-to-even, but Math.round
    // is half-away-from-zero in JS — 1.5 → 2, -1.5 → -1).
    expect(Object.fromEntries(result)).toEqual({ c: 2 });
  });

  it("walks 4 levels: A → B → C → D (raw)", () => {
    const registry = new Map<string, ExpandRecipeInput>([
      ["a", recipe({ id: "a", ingredients: [subRow("b", 100)] })],
      [
        "b",
        recipe({
          id: "b",
          yieldQuantity: 100,
          yieldUnit: "g",
          ingredients: [subRow("c", 50)],
        }),
      ],
      [
        "c",
        recipe({
          id: "c",
          yieldQuantity: 50,
          yieldUnit: "g",
          ingredients: [rawIng("d", 10)],
        }),
      ],
    ]);
    const result = expandRecipeToLeaves("a", registry);
    // Scale chain: parent uses 100 of B (yield 100 → scale 1.0) → C (50 of B's ingredients = 50, yield 50 → scale 1.0) → 10 of D
    expect(Object.fromEntries(result)).toEqual({ d: 10 });
  });
});

describe("expandRecipeToLeaves — rounding floor", () => {
  it("rounds to nearest integer", () => {
    const registry = new Map<string, ExpandRecipeInput>([
      [
        "a",
        recipe({
          id: "a",
          ingredients: [{ ingredientId: "x", subRecipeId: null, quantityPerServing: 3 }],
        }),
      ],
    ]);
    // scale 0.4 × 3 = 1.2 → rounds to 1
    expect(Object.fromEntries(expandRecipeToLeaves("a", registry, 0.4))).toEqual({ x: 1 });
    // scale 0.5 × 3 = 1.5 → Math.round → 2
    expect(Object.fromEntries(expandRecipeToLeaves("a", registry, 0.5))).toEqual({ x: 2 });
  });

  it("rounds sub-1 quantities down to 0 (drops them from the leaf map)", () => {
    // 3 × 0.1 = 0.3 → Math.round = 0 → not added to map.
    // Tracing trace amounts of garnishes via deeply-nested composites would
    // otherwise systematically over-deduct (1-min floor × N sales).
    const registry = new Map<string, ExpandRecipeInput>([
      ["a", recipe({ id: "a", ingredients: [rawIng("x", 3)] })],
    ]);
    expect(Object.fromEntries(expandRecipeToLeaves("a", registry, 0.1))).toEqual({});
  });

  it("does NOT add an entry when raw qty is zero (real zero, not rounding)", () => {
    const registry = new Map<string, ExpandRecipeInput>([
      ["a", recipe({ id: "a", ingredients: [rawIng("x", 0)] })],
    ]);
    expect(Object.fromEntries(expandRecipeToLeaves("a", registry))).toEqual({});
  });
});

describe("expandRecipeToLeaves — cycle defense + dangling refs", () => {
  it("throws when a runtime cycle is detected", () => {
    // Both A and B need yields set, otherwise the missing-yield defense at
    // descent skips the recursion before the cycle path is exercised.
    const registry = new Map<string, ExpandRecipeInput>([
      [
        "a",
        recipe({
          id: "a",
          yieldQuantity: 1,
          yieldUnit: "g",
          ingredients: [subRow("b", 1)],
        }),
      ],
      [
        "b",
        recipe({
          id: "b",
          yieldQuantity: 1,
          yieldUnit: "g",
          ingredients: [subRow("a", 1)],
        }),
      ],
    ]);
    expect(() => expandRecipeToLeaves("a", registry)).toThrow(/Cycle/);
  });

  it("skips a sub-recipe with missing yield (defensive — action should reject inserts)", () => {
    const registry = new Map<string, ExpandRecipeInput>([
      ["a", recipe({ id: "a", ingredients: [subRow("orphan", 5)] })],
      [
        "orphan",
        recipe({
          id: "orphan",
          yieldQuantity: null,
          yieldUnit: null,
          ingredients: [rawIng("x", 100)],
        }),
      ],
    ]);
    expect(Object.fromEntries(expandRecipeToLeaves("a", registry))).toEqual({});
  });

  it("skips a dangling subRecipeId (FK SET NULL elsewhere or stale id)", () => {
    const registry = new Map<string, ExpandRecipeInput>([
      ["a", recipe({ id: "a", ingredients: [subRow("ghost", 5)] })],
    ]);
    expect(Object.fromEntries(expandRecipeToLeaves("a", registry))).toEqual({});
  });

  it("ignores XOR-violating rows (defensive)", () => {
    const registry = new Map<string, ExpandRecipeInput>([
      [
        "a",
        recipe({
          id: "a",
          ingredients: [
            { ingredientId: "x", subRecipeId: "y", quantityPerServing: 1 }, // both set
            { ingredientId: null, subRecipeId: null, quantityPerServing: 1 }, // both null
          ],
        }),
      ],
    ]);
    expect(Object.fromEntries(expandRecipeToLeaves("a", registry))).toEqual({});
  });
});

describe("wouldCreateCycle", () => {
  it("returns true for self-reference", () => {
    const registry = new Map<string, ExpandRecipeInput>([
      ["a", recipe({ id: "a" })],
    ]);
    expect(wouldCreateCycle("a", "a", registry)).toBe(true);
  });

  it("returns true for direct loop A → B → A", () => {
    const registry = new Map<string, ExpandRecipeInput>([
      ["a", recipe({ id: "a", ingredients: [subRow("b", 1)] })],
      ["b", recipe({ id: "b", yieldQuantity: 1, yieldUnit: "g" })],
    ]);
    // Trying to add B → A: walk forward from A (the candidate sub-recipe)
    // — A references B, no path back to B (the parent). So adding B → A
    // SHOULD return true (the new edge would create a cycle).
    expect(wouldCreateCycle("b", "a", registry)).toBe(true);
  });

  it("returns true for indirect loop A → B → C → A", () => {
    const registry = new Map<string, ExpandRecipeInput>([
      ["a", recipe({ id: "a", ingredients: [subRow("b", 1)] })],
      [
        "b",
        recipe({
          id: "b",
          yieldQuantity: 1,
          yieldUnit: "g",
          ingredients: [subRow("c", 1)],
        }),
      ],
      ["c", recipe({ id: "c", yieldQuantity: 1, yieldUnit: "g" })],
    ]);
    // Adding C → A: walk forward from A → B → C. The candidate's ancestry
    // path passes through C (the new parent) — wait, the test is "would
    // adding C → A create a cycle". Walk from A (the candidate sub) and see
    // if C (the parent) is reachable. A → B → C → ... — C is reachable.
    expect(wouldCreateCycle("c", "a", registry)).toBe(true);
  });

  it("returns false for no cycle", () => {
    const registry = new Map<string, ExpandRecipeInput>([
      ["a", recipe({ id: "a" })],
      ["b", recipe({ id: "b", yieldQuantity: 1, yieldUnit: "g" })],
    ]);
    expect(wouldCreateCycle("a", "b", registry)).toBe(false);
  });
});

describe("rollupCostPerYieldUnit", () => {
  function costRecipe(
    over: Partial<CostRollupRecipe> & { id: string }
  ): CostRollupRecipe {
    return { yieldQuantity: null, ingredients: [], ...over };
  }

  it("returns null when recipe has no yield (can't be used as sub-recipe)", () => {
    const registry = new Map<string, CostRollupRecipe>([
      [
        "x",
        costRecipe({
          id: "x",
          yieldQuantity: null,
          ingredients: [
            { ingredientId: "milk", subRecipeId: null, quantityPerServing: 250, subtotalOverrideInCents: null },
          ],
        }),
      ],
    ]);
    expect(
      rollupCostPerYieldUnit("x", registry, new Map([["milk", 5]]))
    ).toBeNull();
  });

  it("computes per-yield-unit cost for a single-level sub-recipe", () => {
    // Foam yields 200 mL of foam, contains 250 mL milk at 5¢/mL = $12.50 → per yield unit = 1250/200 = 6.25¢
    const registry = new Map<string, CostRollupRecipe>([
      [
        "foam",
        costRecipe({
          id: "foam",
          yieldQuantity: 200,
          ingredients: [
            { ingredientId: "milk", subRecipeId: null, quantityPerServing: 250, subtotalOverrideInCents: null },
          ],
        }),
      ],
    ]);
    expect(
      rollupCostPerYieldUnit("foam", registry, new Map([["milk", 5]]))
    ).toBe(6.25);
  });

  it("returns null when any leaf can't be costed", () => {
    const registry = new Map<string, CostRollupRecipe>([
      [
        "foam",
        costRecipe({
          id: "foam",
          yieldQuantity: 200,
          ingredients: [
            { ingredientId: "no-cost", subRecipeId: null, quantityPerServing: 250, subtotalOverrideInCents: null },
          ],
        }),
      ],
    ]);
    expect(
      rollupCostPerYieldUnit("foam", registry, new Map())
    ).toBeNull();
  });

  it("accepts an override that bypasses per-leaf cost lookup", () => {
    const registry = new Map<string, CostRollupRecipe>([
      [
        "foam",
        costRecipe({
          id: "foam",
          yieldQuantity: 200,
          ingredients: [
            { ingredientId: "no-cost", subRecipeId: null, quantityPerServing: 999, subtotalOverrideInCents: 1000 },
          ],
        }),
      ],
    ]);
    // Override 1000¢ / 200 yield = 5¢/unit
    expect(rollupCostPerYieldUnit("foam", registry, new Map())).toBe(5);
  });

  it("rolls up nested sub-recipes", () => {
    // C raw 5¢/g; B yields 10g, uses 2g of C → 10/10 = 1¢/g; A yields 100g, uses 50g of B → (50*1)/100 = 0.5¢/g
    const registry = new Map<string, CostRollupRecipe>([
      [
        "c-raw-stub",
        costRecipe({ id: "c-raw-stub" }),
      ], // not used directly; raw cost map carries it
      [
        "b",
        costRecipe({
          id: "b",
          yieldQuantity: 10,
          ingredients: [
            { ingredientId: "c", subRecipeId: null, quantityPerServing: 2, subtotalOverrideInCents: null },
          ],
        }),
      ],
      [
        "a",
        costRecipe({
          id: "a",
          yieldQuantity: 100,
          ingredients: [
            { ingredientId: null, subRecipeId: "b", quantityPerServing: 50, subtotalOverrideInCents: null },
          ],
        }),
      ],
    ]);
    expect(
      rollupCostPerYieldUnit("a", registry, new Map([["c", 5]]))
    ).toBe(0.5);
  });
});
