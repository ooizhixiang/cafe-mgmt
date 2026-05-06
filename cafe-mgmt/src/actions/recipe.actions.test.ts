import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ─── Mocks for getRecipes tests ───────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    recipe: { findMany: vi.fn() },
    ingredientPurchase: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/format", () => ({
  getCafeNow: vi.fn(() => new Date("2026-04-27T08:00:00.000Z")),
  getCafeToday: vi.fn(() => new Date("2026-04-27T00:00:00.000Z")),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getRecipes, getSubRecipeOptions } from "./recipe.actions";

// Prisma Decimal stub — production code calls `.toNumber()` only.
function dec(n: number) {
  return { toNumber: () => n };
}

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

// ─── getRecipes — cost-per-serving + variation range ───────

describe("getRecipes — cost per serving", () => {
  // Helper to build the Prisma include shape for a recipe row.
  // Each ingredient carries `costPerUnitInCents: number` (= cents per unit) and
  // `manualCostOverride: true` so the override branch in `currentCostPerUnit`
  // returns that value directly — keeps the math obvious in test assertions.
  function recipeRow(over: Record<string, unknown>) {
    return {
      id: "r1",
      name: "Recipe",
      description: null,
      category: null,
      discontinued: false,
      ingredients: [],
      variations: [],
      ...over,
    };
  }

  function baseIng(
    ingredientId: string,
    quantityPerServing: number,
    costPerUnitCents: number,
    subtotalOverride: number | null = null
  ) {
    return {
      ingredientId,
      quantityPerServing,
      subtotalOverrideInCents: subtotalOverride === null ? null : dec(subtotalOverride),
      ingredient: {
        id: ingredientId,
        costPerUnitInCents: dec(costPerUnitCents),
        manualCostOverride: true,
      },
    };
  }

  function variation(name: string, ingredients: ReturnType<typeof baseIng>[]) {
    return {
      id: `v-${name}`,
      name,
      ingredients,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "u1", cafeId: "cafe-1", role: "MANAGER" as const },
    } as never);
    // Default: no FIFO lots — costs come purely from each ingredient's
    // manual override (set above) so the math stays predictable.
    vi.mocked(prisma.ingredientPurchase.findMany).mockResolvedValue([] as never);
  });

  it("recipe with no variations: card shows the base single cost (unchanged behavior)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        id: "r1",
        name: "Espresso",
        ingredients: [baseIng("ing-coffee", 8, 50)], // 8g × $0.50/g = 400 cents
      }),
    ] as never);

    const result = await getRecipes();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]!.costPerServingInCents).toBe(400);
    expect(result.data[0]!.costPerServingRangeInCents).toBeNull();
  });

  it("recipe with no variations and missing ingredient cost: returns null (existing dash behavior)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        ingredients: [
          {
            ingredientId: "no-cost",
            quantityPerServing: 1,
            subtotalOverrideInCents: null,
            ingredient: {
              id: "no-cost",
              costPerUnitInCents: null,
              manualCostOverride: true,
            },
          },
        ],
      }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    expect(result.data[0]!.costPerServingInCents).toBeNull();
    expect(result.data[0]!.costPerServingRangeInCents).toBeNull();
  });

  it("variant-only recipe with distinct variation costs: returns range (the user's bug)", async () => {
    // Empty base, three variations with totals: 100, 250, 500 cents.
    // Distinct ingredientIds because the cost map is keyed by ingredient — two
    // variations sharing one ingredient share that ingredient's cost.
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        ingredients: [], // empty base — the vacuous-true bug condition
        variations: [
          variation("Small", [baseIng("milk-S", 1, 100)]), // $1.00
          variation("Medium", [baseIng("milk-M", 1, 250)]), // $2.50
          variation("Large", [baseIng("milk-L", 1, 500)]), // $5.00
        ],
      }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    // The bug returned costPerServingInCents=0; the fix surfaces a real range.
    expect(result.data[0]!.costPerServingInCents).toBeNull();
    expect(result.data[0]!.costPerServingRangeInCents).toEqual({
      minInCents: 100,
      maxInCents: 500,
    });
  });

  it("recipe with one variation: collapses to single value (no spurious 1-element range)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        ingredients: [],
        variations: [variation("Only", [baseIng("milk", 1, 300)])],
      }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    expect(result.data[0]!.costPerServingInCents).toBe(300);
    expect(result.data[0]!.costPerServingRangeInCents).toBeNull();
  });

  it("recipe with variations all at the same cost: collapses to single value", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        ingredients: [],
        variations: [
          variation("A", [baseIng("milk", 1, 400)]),
          variation("B", [baseIng("milk", 1, 400)]),
        ],
      }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    expect(result.data[0]!.costPerServingInCents).toBe(400);
    expect(result.data[0]!.costPerServingRangeInCents).toBeNull();
  });

  it("mixed: base has ingredients, variations add on top", async () => {
    // Base = 1 unit × 200 = 200 cents.
    // Variation A: + 1 unit × 50 = 50 cents → total 250.
    // Variation B: + 1 unit × 150 = 150 cents → total 350.
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        ingredients: [baseIng("base-ing", 1, 200)],
        variations: [
          variation("A", [baseIng("addon-a", 1, 50)]),
          variation("B", [baseIng("addon-b", 1, 150)]),
        ],
      }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    expect(result.data[0]!.costPerServingRangeInCents).toEqual({
      minInCents: 250,
      maxInCents: 350,
    });
  });

  it("any unresolved variation cost makes the entire recipe display dash", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        ingredients: [],
        variations: [
          variation("OK", [baseIng("milk", 1, 300)]),
          variation("Bad", [
            {
              ingredientId: "no-cost",
              quantityPerServing: 1,
              subtotalOverrideInCents: null,
              ingredient: {
                id: "no-cost",
                costPerUnitInCents: null,
                manualCostOverride: true,
              },
            },
          ]),
        ],
      }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    expect(result.data[0]!.costPerServingInCents).toBeNull();
    expect(result.data[0]!.costPerServingRangeInCents).toBeNull();
  });

  it("recipe with NO ingredients anywhere (base empty, variations all empty): returns null (avoids vacuous $0.00 trap)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        ingredients: [],
        variations: [
          variation("Empty A", []),
          variation("Empty B", []),
        ],
      }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    expect(result.data[0]!.costPerServingInCents).toBeNull();
    expect(result.data[0]!.costPerServingRangeInCents).toBeNull();
  });

  it("recipe with no variations AND no base ingredients: returns null (existing-pattern trap closed)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({ ingredients: [], variations: [] }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    expect(result.data[0]!.costPerServingInCents).toBeNull();
    expect(result.data[0]!.costPerServingRangeInCents).toBeNull();
  });

  it("variation costed at 0 (free sample): renders as $0.00 (real zero, not vacuous bug)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        ingredients: [],
        variations: [variation("Free", [baseIng("free-ing", 1, 0)])],
      }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    // Single variation, total 0 → collapses to single value 0.
    expect(result.data[0]!.costPerServingInCents).toBe(0);
    expect(result.data[0]!.costPerServingRangeInCents).toBeNull();
  });

  it("subtotalOverrideInCents on a variation ingredient bypasses per-unit math", async () => {
    // Override of 999 cents — quantity/cost ignored for that row.
    // Distinct ingredientIds so the per-ingredient cost map doesn't collide.
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        ingredients: [],
        variations: [
          variation("Override", [baseIng("ing-A", 99, 99, 999)]), // 999 wins
          variation("Normal",   [baseIng("ing-B", 1, 100)]),       // 100
        ],
      }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    expect(result.data[0]!.costPerServingRangeInCents).toEqual({
      minInCents: 100,
      maxInCents: 999,
    });
  });

  // ─── ingredientCount: count distinct ids across base ∪ all variations ──

  it("ingredientCount: no variations → counts base ingredients (unchanged)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        ingredients: [baseIng("milk", 1, 100), baseIng("espresso", 1, 200)],
      }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    expect(result.data[0]!.ingredientCount).toBe(2);
  });

  it("ingredientCount: variant-only with distinct ingredients per variation → counts unique union (the user's bug)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        ingredients: [], // empty base — was returning 0 before the fix
        variations: [
          variation("Small", [baseIng("milk", 1, 100), baseIng("espresso", 1, 200)]),
          variation("Large", [
            baseIng("milk", 1, 100),
            baseIng("espresso", 1, 200),
            baseIng("syrup", 1, 50),
          ]),
        ],
      }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    // 3 distinct ids (milk, espresso, syrup) — milk and espresso de-duplicated
    // across the two variations.
    expect(result.data[0]!.ingredientCount).toBe(3);
  });

  it("ingredientCount: all variations share the same single ingredient → counts 1", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        ingredients: [],
        variations: [
          variation("Small", [baseIng("milk", 1, 100)]),
          variation("Medium", [baseIng("milk", 1, 200)]),
          variation("Large", [baseIng("milk", 1, 300)]),
        ],
      }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    expect(result.data[0]!.ingredientCount).toBe(1);
  });

  it("ingredientCount: base + variation overlap → counts each ingredient once", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        ingredients: [baseIng("milk", 1, 100)],
        variations: [
          variation("WithSyrup", [baseIng("milk", 1, 100), baseIng("syrup", 1, 50)]),
        ],
      }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    // Union: {milk, syrup} = 2. Milk is NOT counted twice despite appearing in
    // both base and variation.
    expect(result.data[0]!.ingredientCount).toBe(2);
  });

  it("ingredientCount: empty everywhere → 0 (legitimate empty)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({ ingredients: [], variations: [variation("Empty", [])] }),
    ] as never);

    const result = await getRecipes();
    if (!result.success) return;
    expect(result.data[0]!.ingredientCount).toBe(0);
  });
});

// ─── Phase 2: getSubRecipeOptions ────────────────────────────

describe("getSubRecipeOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "u1", cafeId: "cafe-1", role: "MANAGER" as const },
    } as never);
  });

  it("returns recipes that have a yield set, in name order", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      { id: "foam", name: "Milk foam", yieldQuantity: 200, yieldUnit: "mL" },
      { id: "ganache", name: "Ganache", yieldQuantity: 500, yieldUnit: "g" },
    ] as never);

    const result = await getSubRecipeOptions("latte");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([
      { id: "foam", name: "Milk foam", yieldQuantity: 200, yieldUnit: "mL" },
      { id: "ganache", name: "Ganache", yieldQuantity: 500, yieldUnit: "g" },
    ]);
  });

  it("filters out the current recipe (no self-reference at the picker level)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([] as never);
    await getSubRecipeOptions("latte");
    const where = vi.mocked(prisma.recipe.findMany).mock.calls[0]![0]!.where;
    expect((where as { id: { not: string } }).id.not).toBe("latte");
  });

  it("scopes the query to the caller's cafe + non-null yield + non-discontinued", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([] as never);
    await getSubRecipeOptions("latte");
    const where = vi.mocked(prisma.recipe.findMany).mock.calls[0]![0]!.where;
    const w = where as {
      cafeId: string;
      yieldQuantity: { not: null };
      yieldUnit: { not: null };
      discontinued: boolean;
    };
    expect(w.cafeId).toBe("cafe-1");
    expect(w.yieldQuantity).toEqual({ not: null });
    expect(w.yieldUnit).toEqual({ not: null });
    expect(w.discontinued).toBe(false);
  });

  it("returns Unauthorized when not signed in", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(new Error("Unauthorized"));
    const result = await getSubRecipeOptions("latte");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Unauthorized");
  });

  it("returns empty array when no recipes have yield set", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([] as never);
    const result = await getSubRecipeOptions("latte");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([]);
  });
});
