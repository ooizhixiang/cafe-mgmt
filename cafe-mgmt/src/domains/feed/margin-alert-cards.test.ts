import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    cafe: { findUnique: vi.fn() },
    recipe: { findMany: vi.fn() },
    ingredientPurchase: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { getMarginAlertCards } from "./margin-alert-cards";

// Prisma Decimal stub.
function dec(n: number) {
  return { toNumber: () => n };
}

function recipeRow(over: Record<string, unknown>) {
  return {
    id: "r1",
    name: "Recipe",
    sellingPriceInCents: null,
    ingredients: [],
    variations: [],
    ...over,
  };
}

function baseIng(
  ingredientId: string,
  quantityPerServing: number,
  costPerUnitCents: number,
  subtotalOverrideCents: number | null = null
) {
  return {
    ingredientId,
    quantityPerServing,
    subtotalOverrideInCents:
      subtotalOverrideCents === null ? null : dec(subtotalOverrideCents),
    ingredient: {
      id: ingredientId,
      costPerUnitInCents: dec(costPerUnitCents),
      manualCostOverride: true,
    },
  };
}

function variation(
  name: string,
  ingredients: ReturnType<typeof baseIng>[],
  sellingPriceInCents: number | null = null
) {
  return { id: `v-${name}`, name, sellingPriceInCents, ingredients };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no FIFO lots so costs come from each ingredient's manual override.
  vi.mocked(prisma.ingredientPurchase.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.cafe.findUnique).mockResolvedValue({
    minMarginPercent: 20,
  } as never);
});

describe("getMarginAlertCards — base recipe (no variations)", () => {
  it("emits no card when margin is healthy (cost $1.00, sells $5.00 → 80%)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        id: "r-good",
        name: "Latte",
        sellingPriceInCents: 500,
        ingredients: [baseIng("milk", 1, 100)],
      }),
    ] as never);

    const cards = await getMarginAlertCards("cafe-1");
    expect(cards).toEqual([]);
  });

  it("emits an URGENT card on outright loss (cost $2.00, sells $1.00)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        id: "r-loss",
        name: "Loss Latte",
        sellingPriceInCents: 100,
        ingredients: [baseIng("milk", 1, 200)],
      }),
    ] as never);

    const cards = await getMarginAlertCards("cafe-1");
    expect(cards.length).toBe(1);
    expect(cards[0]!.title).toBe("Loss Latte priced below cost");
    expect(cards[0]!.subtitle).toContain("Original loses");
    expect(cards[0]!.borderColor).toContain("urgent");
    expect(cards[0]!.priority).toBe(3);
  });

  it("emits a WARNING card on thin margin (cost $4.00, sells $4.50 ≈ 11% < 20%)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        id: "r-thin",
        name: "Thin Latte",
        sellingPriceInCents: 450,
        ingredients: [baseIng("milk", 1, 400)],
      }),
    ] as never);

    const cards = await getMarginAlertCards("cafe-1");
    expect(cards.length).toBe(1);
    expect(cards[0]!.title).toBe("Thin Latte margin below 20%");
    expect(cards[0]!.subtitle).toMatch(/Original \d+% margin/);
    expect(cards[0]!.borderColor).toContain("warning");
  });

  it("skips silently when selling price is null (pre-launch)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        sellingPriceInCents: null,
        ingredients: [baseIng("milk", 1, 200)],
      }),
    ] as never);

    expect(await getMarginAlertCards("cafe-1")).toEqual([]);
  });

  it("skips silently when base cost is null (no ingredients yet)", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({ sellingPriceInCents: 500, ingredients: [] }),
    ] as never);

    expect(await getMarginAlertCards("cafe-1")).toEqual([]);
  });
});

describe("getMarginAlertCards — recipes with variations", () => {
  it("lists ONLY losing variations in the subtitle", async () => {
    // Small healthy ($5 sells / $1 cost = 80%); Medium thin ($5 sells / $4.20 cost = 16%)
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        id: "r-mixed",
        name: "Mixed Latte",
        sellingPriceInCents: 500, // recipe-level fallback
        variations: [
          variation("Small", [baseIng("ing-S", 1, 100)]),
          variation("Medium", [baseIng("ing-M", 1, 420)]),
        ],
      }),
    ] as never);

    const cards = await getMarginAlertCards("cafe-1");
    expect(cards.length).toBe(1);
    expect(cards[0]!.subtitle).toContain("Medium");
    expect(cards[0]!.subtitle).not.toContain("Small");
  });

  it("uses variation's own selling price when set; falls back to recipe-level otherwise", async () => {
    // Variation A has its own selling price ($1) — outright loss vs cost $2
    // Variation B has no selling price — falls back to recipe-level $5 vs cost $1 = healthy
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        id: "r-fallback",
        name: "Fallback Latte",
        sellingPriceInCents: 500,
        variations: [
          variation("A", [baseIng("ing-A", 1, 200)], 100), // own price 100 vs cost 200 = loss
          variation("B", [baseIng("ing-B", 1, 100)]), // null → fallback 500 vs 100 = healthy
        ],
      }),
    ] as never);

    const cards = await getMarginAlertCards("cafe-1");
    expect(cards.length).toBe(1);
    expect(cards[0]!.subtitle).toContain("A");
    expect(cards[0]!.subtitle).not.toContain("B");
  });

  it("skips a variation whose effective selling price is null AND recipe-level is null", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        sellingPriceInCents: null,
        variations: [
          variation("Unpriced", [baseIng("ing", 1, 200)], null),
        ],
      }),
    ] as never);

    expect(await getMarginAlertCards("cafe-1")).toEqual([]);
  });

  it("silently skips a variation whose cost can't be resolved; still evaluates the others", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        id: "r-partial",
        name: "Partial Latte",
        sellingPriceInCents: 500,
        variations: [
          // This variation's ingredient has neither override nor derived cost
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
          // This variation is a real loss vs $5 selling
          variation("Loss", [baseIng("ing-loss", 1, 600)]),
        ],
      }),
    ] as never);

    const cards = await getMarginAlertCards("cafe-1");
    expect(cards.length).toBe(1);
    expect(cards[0]!.subtitle).toContain("Loss");
    expect(cards[0]!.subtitle).not.toContain("Bad");
  });

  it("includes per-variation cost = base + variation add-ons", async () => {
    // Base = $2; Variation adds $1 → variation cost $3. Selling $3.50 → 14% margin (thin).
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        id: "r-additive",
        name: "Additive",
        sellingPriceInCents: 350,
        ingredients: [baseIng("base", 1, 200)],
        variations: [variation("Plain", [baseIng("addon", 1, 100)])],
      }),
    ] as never);

    const cards = await getMarginAlertCards("cafe-1");
    expect(cards.length).toBe(1);
    expect(cards[0]!.subtitle).toContain("Plain");
  });
});

describe("getMarginAlertCards — floor edges", () => {
  it("with floor 0, fires only on outright loss (margin < 0)", async () => {
    vi.mocked(prisma.cafe.findUnique).mockResolvedValue({
      minMarginPercent: 0,
    } as never);

    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      // Zero margin (cost = selling) — should NOT fire when floor is 0
      recipeRow({
        id: "r-zero",
        name: "Zero Margin",
        sellingPriceInCents: 200,
        ingredients: [baseIng("ing", 1, 200)],
      }),
      // Outright loss — should fire even at floor 0
      recipeRow({
        id: "r-loss",
        name: "Outright Loss",
        sellingPriceInCents: 100,
        ingredients: [baseIng("ing2", 1, 200)],
      }),
    ] as never);

    const cards = await getMarginAlertCards("cafe-1");
    expect(cards.length).toBe(1);
    expect(cards[0]!.title).toContain("Outright Loss");
  });
});

describe("getMarginAlertCards — empty inputs", () => {
  it("returns empty array when no recipes", async () => {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([] as never);
    expect(await getMarginAlertCards("cafe-1")).toEqual([]);
  });

  it("returns empty array when cafe not found", async () => {
    vi.mocked(prisma.cafe.findUnique).mockResolvedValue(null as never);
    expect(await getMarginAlertCards("cafe-1")).toEqual([]);
  });
});

describe("getMarginAlertCards — discontinued + no-ingredients guards", () => {
  it("excludes discontinued recipes from card emission (filter at emit step, not WHERE)", async () => {
    // The Phase 1 sub-recipes change moved the discontinued filter from the
    // WHERE clause to the per-recipe emit loop, so the cafe-wide registry
    // can still resolve composites that reference recipes which happen to
    // be marked discontinued.
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        id: "r-discontinued",
        name: "Old Recipe",
        sellingPriceInCents: 100,
        // @ts-expect-error — field added in this story's Prisma update; stub here
        discontinued: true,
        ingredients: [baseIng("milk", 1, 200)],
      }),
      recipeRow({
        id: "r-active",
        name: "Active Recipe",
        sellingPriceInCents: 100,
        // @ts-expect-error — field added in this story's Prisma update; stub here
        discontinued: false,
        ingredients: [baseIng("milk", 1, 200)],
      }),
    ] as never);

    const cards = await getMarginAlertCards("cafe-1");
    // Only the active losing recipe should emit a card.
    expect(cards.length).toBe(1);
    expect(cards[0]!.title).toContain("Active Recipe");
  });

  it("skips a recipe whose base AND every variation are empty (pre-launch state, no false 100% margin)", async () => {
    // Without the guard: sumServingCost([]) returns vacuous 0 → margin = 100%
    // → no card (correct outcome by accident). Test pins the explicit skip so
    // a future refactor can't change the math without us noticing.
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        sellingPriceInCents: 500,
        ingredients: [],
        variations: [variation("Empty A", []), variation("Empty B", [])],
      }),
    ] as never);

    expect(await getMarginAlertCards("cafe-1")).toEqual([]);
  });
});

describe("getMarginAlertCards — mixed loss + thin in same recipe", () => {
  it("emits a single URGENT card listing both losing variations in the subtitle", async () => {
    // Outright loss: Small (cost $2 / sells $1)
    // Thin margin:   Large (cost $4.20 / sells $5.00 → 16% < 20%)
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      recipeRow({
        id: "r-mixed",
        name: "Mixed Loss Latte",
        sellingPriceInCents: 500, // recipe-level fallback (Large uses this)
        variations: [
          variation("Small", [baseIng("ing-S", 1, 200)], 100), // own price 100 vs cost 200 → loss
          variation("Large", [baseIng("ing-L", 1, 420)]), // null → fallback 500 vs 420 → 16% thin
        ],
      }),
    ] as never);

    const cards = await getMarginAlertCards("cafe-1");
    expect(cards.length).toBe(1);
    // URGENT title because at least one variation is an outright loss
    expect(cards[0]!.title).toBe("Mixed Loss Latte priced below cost");
    expect(cards[0]!.borderColor).toContain("urgent");
    // Subtitle itemizes BOTH variations with their respective wording
    expect(cards[0]!.subtitle).toContain("Small loses");
    expect(cards[0]!.subtitle).toContain("Large");
    expect(cards[0]!.subtitle).toMatch(/Large \d+% margin/);
  });
});
