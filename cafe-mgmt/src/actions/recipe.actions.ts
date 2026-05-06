"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { getCafeToday } from "@/lib/format";
import { currentCostPerUnit } from "@/lib/fifo";
import {
  expandRecipeToLeaves,
  rollupCostPerYieldUnit,
  wouldCreateCycle,
  type CostRollupRecipe,
  type ExpandRecipeInput,
} from "@/lib/recipe-expand";
import type { ActionResult } from "@/types";

/**
 * Fetch the oldest non-empty `IngredientPurchase` for each ingredient in
 * `ingredientIds`. Returns a Map keyed by ingredientId. The oldest lot is the
 * one with the earliest `createdAt`; ties broken by id ascending so the
 * ordering stays stable across queries.
 */
async function fetchOldestLots(
  cafeId: string,
  ingredientIds: string[]
): Promise<
  Map<string, { totalPriceInCents: number; quantity: number }>
> {
  const map = new Map<
    string,
    { totalPriceInCents: number; quantity: number }
  >();
  if (ingredientIds.length === 0) return map;

  const rows = await prisma.ingredientPurchase.findMany({
    where: {
      cafeId,
      remainingQuantity: { gt: 0 },
      ingredientSupplier: { ingredientId: { in: ingredientIds } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      quantity: true,
      totalPriceInCents: true,
      ingredientSupplier: { select: { ingredientId: true } },
    },
  });

  for (const row of rows) {
    const id = row.ingredientSupplier.ingredientId;
    if (!map.has(id)) {
      map.set(id, {
        totalPriceInCents: row.totalPriceInCents.toNumber(),
        quantity: row.quantity,
      });
    }
  }
  return map;
}

// ─── Schemas ────────────────────────────────────────────────

const createRecipeSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  servingSize: z.string().max(50).optional(),
  imageUrl: z.string().optional(),
});

const updateRecipeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  servingSize: z.string().max(50).optional(),
  imageUrl: z.string().nullable().optional(),
});

const addIngredientSchema = z
  .object({
    recipeId: z.string().min(1),
    // Polymorphic: exactly one of ingredientId / subRecipeId must be set.
    ingredientId: z.string().min(1).nullable().optional(),
    subRecipeId: z.string().min(1).nullable().optional(),
    quantityPerServing: z.number().int().min(1),
  })
  .refine(
    (d) => (d.ingredientId ? 1 : 0) + (d.subRecipeId ? 1 : 0) === 1,
    { message: "Pick exactly one of ingredient or sub-recipe" }
  );

const setRecipeYieldSchema = z
  .object({
    recipeId: z.string().min(1),
    yieldQuantity: z.number().int().min(1).nullable(),
    yieldUnit: z.string().min(1).max(20).nullable(),
  })
  .refine(
    // Both fields must be set together OR both null. Partial config rejected.
    (d) =>
      (d.yieldQuantity === null && d.yieldUnit === null) ||
      (d.yieldQuantity !== null && d.yieldUnit !== null),
    { message: "Set both yield quantity and unit, or clear both together" }
  );

const addStepSchema = z.object({
  recipeId: z.string().min(1),
  instruction: z.string().min(1, "Instruction is required").max(500),
});

const updateStepSchema = z.object({
  id: z.string().min(1),
  instruction: z.string().min(1, "Instruction is required").max(500),
});

const reorderStepsSchema = z.object({
  recipeId: z.string().min(1),
  stepIds: z.array(z.string().min(1)).min(1),
});

// ─── Recipe CRUD (Story 4.3) ────────────────────────────────

// Pure helper: cost a list of recipe-or-variation ingredient rows. Returns
// null if any row has neither a `subtotalOverrideInCents` nor a derived cost
// for its ingredient. Otherwise returns the summed cents.
//
// Schema inconsistency note: `RecipeIngredient.subtotalOverrideInCents` is
// Decimal but `VariationIngredient.subtotalOverrideInCents` is Int. The helper
// accepts either via the `number | Decimal-like | null` union.
function sumServingCost(
  rows: Array<{
    ingredientId: string | null;
    subRecipeId?: string | null;
    quantityPerServing: number;
    subtotalOverrideInCents: number | { toNumber(): number } | null;
  }>,
  derivedCostByIngredientId: Map<string, number | null>,
  // When provided, composite rows (subRecipeId set, ingredientId null) are
  // resolved by `rollupCostPerYieldUnit`. Without it, composite rows force
  // a null result so callers that haven't been taught about composites
  // (e.g., variation ingredients in Phase 1, which forbid composites)
  // surface as "unresolvable" rather than silently undercounting.
  recipeRegistry?: Map<string, CostRollupRecipe>
): number | null {
  // Use `!= null` (loose) so a future caller that omits the column from a
  // Prisma `select` (yielding `undefined`) doesn't slip through and crash on
  // `.toNumber()`. The TS shape forbids `undefined` today, but defending
  // cheaply is worth it for a cross-recipe utility.
  const allResolved = rows.every((row) => {
    if (row.subtotalOverrideInCents != null) return true;
    if (row.ingredientId !== null) {
      return derivedCostByIngredientId.get(row.ingredientId) != null;
    }
    if (row.subRecipeId && recipeRegistry) {
      return (
        rollupCostPerYieldUnit(
          row.subRecipeId,
          recipeRegistry,
          derivedCostByIngredientId
        ) !== null
      );
    }
    return false;
  });
  if (!allResolved) return null;
  return rows.reduce((sum, row) => {
    const overrideRaw = row.subtotalOverrideInCents;
    const override =
      overrideRaw == null
        ? null
        : typeof overrideRaw === "number"
          ? overrideRaw
          : overrideRaw.toNumber();
    if (override !== null) return sum + override;
    if (row.ingredientId !== null) {
      const cost = derivedCostByIngredientId.get(row.ingredientId) ?? 0;
      return sum + row.quantityPerServing * cost;
    }
    if (row.subRecipeId && recipeRegistry) {
      const subCost = rollupCostPerYieldUnit(
        row.subRecipeId,
        recipeRegistry,
        derivedCostByIngredientId
      );
      return sum + row.quantityPerServing * (subCost ?? 0);
    }
    return sum;
  }, 0);
}

export async function getRecipes(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      description: string | null;
      ingredientCount: number;
      costPerServingInCents: number | null;
      costPerServingRangeInCents: { minInCents: number; maxInCents: number } | null;
      category: string | null;
      discontinued: boolean;
    }>
  >
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const recipes = await prisma.recipe.findMany({
      where: { cafeId },
      include: {
        ingredients: {
          include: {
            ingredient: {
              select: {
                id: true,
                costPerUnitInCents: true,
                manualCostOverride: true,
              },
            },
          },
        },
        variations: {
          include: {
            ingredients: {
              include: {
                ingredient: {
                  select: {
                    id: true,
                    costPerUnitInCents: true,
                    manualCostOverride: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Collect every ingredient id touched by any base ingredient OR any
    // variation ingredient — fetchOldestLots needs the union to derive costs.
    // Composite rows (subRecipeId set, ingredientId null) contribute nothing
    // to this list — their leaves come via other recipes' rows.
    const ingredientIds = Array.from(
      new Set(
        recipes
          .flatMap((r) => [
            ...r.ingredients.map((ri) => ri.ingredientId),
            ...r.variations.flatMap((v) =>
              v.ingredients.map((vi) => vi.ingredientId)
            ),
          ])
          .filter((id): id is string => id !== null)
      )
    );
    const oldestLots = await fetchOldestLots(cafeId, ingredientIds);

    // Per-ingredient derived cost map, computed once, shared across all recipes.
    // Skip composite rows (subRecipeId set, ingredientId null) — their cost is
    // computed via `rollupCostPerYieldUnit` below.
    const derivedCostByIngredientId = new Map<string, number | null>();
    for (const r of recipes) {
      for (const ri of [
        ...r.ingredients,
        ...r.variations.flatMap((v) => v.ingredients),
      ]) {
        if (ri.ingredient === null) continue;
        const id = ri.ingredient.id;
        if (derivedCostByIngredientId.has(id)) continue;
        derivedCostByIngredientId.set(
          id,
          currentCostPerUnit(
            {
              manualCostOverride: ri.ingredient.manualCostOverride,
              costPerUnitInCents:
                ri.ingredient.costPerUnitInCents === null
                  ? null
                  : ri.ingredient.costPerUnitInCents.toNumber(),
            },
            oldestLots.get(id) ?? null
          )
        );
      }
    }

    // Sub-recipe registry built from the SAME loaded recipes (no extra query).
    // Used by `sumServingCost` on r.ingredients to compute composite-row costs
    // via `rollupCostPerYieldUnit`.
    const recipeRegistry: Map<string, CostRollupRecipe> = new Map(
      recipes.map((r) => [
        r.id,
        {
          id: r.id,
          yieldQuantity: r.yieldQuantity,
          ingredients: r.ingredients.map((ri) => ({
            ingredientId: ri.ingredientId,
            subRecipeId: ri.subRecipeId,
            quantityPerServing: ri.quantityPerServing,
            subtotalOverrideInCents: ri.subtotalOverrideInCents,
          })),
        },
      ])
    );

    return {
      success: true,
      data: recipes.map((r) => {
        // "No ingredients anywhere" guard: a recipe whose base AND every
        // variation are empty has no real cost to display. Without this, the
        // vacuous-true reduce returns 0 and the card shows a confident "$0.00"
        // — exactly the bug we're fixing, just one structural level up.
        const totalIngredientRows =
          r.ingredients.length +
          r.variations.reduce((acc, v) => acc + v.ingredients.length, 0);

        // Distinct ingredients across base + every variation. The same
        // ingredient appearing in base AND a variation, or in multiple
        // variations, counts once. Tells the manager "how many ingredients
        // does this recipe touch" in one number, regardless of how it's
        // structured into variations. Composite rows (subRecipeId set) don't
        // count as "an ingredient" — they're a structural reference.
        const uniqueIngredientCount = new Set(
          [
            ...r.ingredients.map((ri) => ri.ingredientId),
            ...r.variations.flatMap((v) =>
              v.ingredients.map((vi) => vi.ingredientId)
            ),
          ].filter((id): id is string => id !== null)
        ).size;

        const baseCost = sumServingCost(
          r.ingredients,
          derivedCostByIngredientId,
          recipeRegistry
        );

        if (r.variations.length === 0) {
          // Backward-compatible: no variations → return base cost as before.
          // If base is also empty we surface null (was previously a "$0.00" trap).
          return {
            id: r.id,
            name: r.name,
            description: r.description,
            ingredientCount: uniqueIngredientCount,
            costPerServingInCents:
              totalIngredientRows === 0 ? null : baseCost,
            costPerServingRangeInCents: null,
            category: r.category,
            discontinued: r.discontinued,
          };
        }

        if (totalIngredientRows === 0) {
          // Recipe has variations but no ingredients in any of them yet.
          return {
            id: r.id,
            name: r.name,
            description: r.description,
            ingredientCount: uniqueIngredientCount,
            costPerServingInCents: null,
            costPerServingRangeInCents: null,
            category: r.category,
            discontinued: r.discontinued,
          };
        }

        // Per-variation cost = base ingredients + this variation's add-ons.
        // Mirrors daily-report.actions.ts:161-199 (variation sale deducts both).
        const variationCosts: Array<number | null> = r.variations.map((v) => {
          const variationOnly = sumServingCost(
            v.ingredients,
            derivedCostByIngredientId
          );
          if (baseCost === null || variationOnly === null) return null;
          return baseCost + variationOnly;
        });

        const allResolved = variationCosts.every((c) => c !== null);
        if (!allResolved) {
          // Same threshold as today's single-recipe behavior: any unresolved
          // ingredient → entire range is null → card shows "—".
          return {
            id: r.id,
            name: r.name,
            description: r.description,
            ingredientCount: uniqueIngredientCount,
            costPerServingInCents: null,
            costPerServingRangeInCents: null,
            category: r.category,
            discontinued: r.discontinued,
          };
        }

        const numbers = variationCosts as number[];
        const minInCents = Math.min(...numbers);
        const maxInCents = Math.max(...numbers);

        // Collapse degenerate range (single variation, or all variations equal)
        // to a single value so the UI never renders "$X.XX–$X.XX".
        if (minInCents === maxInCents) {
          return {
            id: r.id,
            name: r.name,
            description: r.description,
            ingredientCount: uniqueIngredientCount,
            costPerServingInCents: minInCents,
            costPerServingRangeInCents: null,
            category: r.category,
            discontinued: r.discontinued,
          };
        }

        return {
          id: r.id,
          name: r.name,
          description: r.description,
          ingredientCount: uniqueIngredientCount,
          costPerServingInCents: null,
          costPerServingRangeInCents: { minInCents, maxInCents },
          category: r.category,
          discontinued: r.discontinued,
        };
      }),
    };
  } catch {
    return { success: false, error: "Failed to load recipes" };
  }
}

export async function getRecipe(
  id: string
): Promise<
  ActionResult<{
    id: string;
    name: string;
    description: string | null;
    servingSize: string | null;
    imageUrl: string | null;
    notes: string | null;
    category: string | null;
    sellingPriceInCents: number | null;
    discontinued: boolean;
    /** Phase 2: when set, this recipe is usable as a sub-recipe by others. */
    yieldQuantity: number | null;
    yieldUnit: string | null;
    ingredients: Array<{
      id: string;
      ingredientId: string;
      ingredientName: string;
      unit: string;
      quantityPerServing: number;
      costPerUnitInCents: number | null;
      subtotalOverrideInCents: number | null;
      currentStock: number | null;
      lowStockThreshold: number | null;
    }>;
    /**
     * Phase 2: composite (sub-recipe) rows on this recipe. Quantity is in
     * the sub-recipe's `subRecipeYieldUnit`. Render distinct from raw rows.
     */
    subRecipeRows: Array<{
      id: string;
      subRecipeId: string;
      subRecipeName: string;
      subRecipeYieldQuantity: number;
      subRecipeYieldUnit: string;
      quantityPerServing: number;
      subtotalOverrideInCents: number | null;
    }>;
    steps: Array<{
      id: string;
      stepNumber: number;
      instruction: string;
    }>;
    variations: Array<{
      id: string;
      name: string;
      sellingPriceInCents: number | null;
      ingredients: Array<{
        id: string;
        ingredientId: string;
        ingredientName: string;
        unit: string;
        quantityPerServing: number;
        costPerUnitInCents: number | null;
        subtotalOverrideInCents: number | null;
      }>;
      steps: Array<{
        id: string;
        stepNumber: number;
        instruction: string;
      }>;
    }>;
    costPerServingInCents: number | null;
  }>
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const today = getCafeToday();

    const recipe = await prisma.recipe.findFirst({
      where: { id, cafeId },
      include: {
        ingredients: {
          include: {
            ingredient: {
              select: {
                id: true,
                name: true,
                unit: true,
                costPerUnitInCents: true,
                manualCostOverride: true,
                lowStockThreshold: true,
                inventoryCounts: {
                  where: { countDate: today },
                  select: { quantity: true },
                  take: 1,
                },
              },
            },
            // Phase 2: composite-row join — surfaces sub-recipe metadata so
            // the editor can render "📋 {name} — {qty} {yieldUnit}" without
            // an extra round-trip per row.
            subRecipe: {
              select: {
                id: true,
                name: true,
                yieldQuantity: true,
                yieldUnit: true,
              },
            },
          },
        },
        steps: {
          orderBy: { stepNumber: "asc" },
        },
        variations: {
          include: {
            ingredients: {
              include: {
                ingredient: {
                  select: {
                    id: true,
                    name: true,
                    unit: true,
                    costPerUnitInCents: true,
                    manualCostOverride: true,
                  },
                },
              },
            },
            steps: {
              orderBy: { stepNumber: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!recipe) return { success: false, error: "Recipe not found" };

    // Batch oldest-lot fetch across base + variation ingredients. Composite
    // rows (subRecipeId set, ingredientId null) contribute via their leaves
    // which live in other recipes — handled at deduction time, not here.
    const ingredientIds = Array.from(
      new Set([
        ...recipe.ingredients.map((ri) => ri.ingredientId),
        ...recipe.variations.flatMap((v) =>
          v.ingredients.map((vi) => vi.ingredientId)
        ),
      ].filter((id): id is string => id !== null))
    );
    const oldestLots = await fetchOldestLots(cafeId, ingredientIds);

    function deriveCost(ing: {
      manualCostOverride: boolean;
      costPerUnitInCents: { toNumber: () => number } | null;
    }, ingredientId: string): number | null {
      return currentCostPerUnit(
        {
          manualCostOverride: ing.manualCostOverride,
          costPerUnitInCents:
            ing.costPerUnitInCents === null
              ? null
              : ing.costPerUnitInCents.toNumber(),
        },
        oldestLots.get(ingredientId) ?? null
      );
    }

    // Cost computation in this single-recipe DETAIL view considers raw rows
    // only — composite rows (subRecipeId set) need the cafe-wide registry to
    // roll up sub-recipe costs and that's out of scope here. The list view
    // (getRecipes) and the margin alerts both compute composite-aware cost.
    const baseDerivedCosts = recipe.ingredients.map((ri) =>
      ri.ingredient !== null && ri.ingredientId !== null
        ? deriveCost(ri.ingredient, ri.ingredientId)
        : null
    );

    const hasAllCosts = recipe.ingredients.every(
      (ri, idx) =>
        ri.subtotalOverrideInCents !== null || baseDerivedCosts[idx] !== null
    );
    const costPerServingInCents = hasAllCosts
      ? recipe.ingredients.reduce((sum, ri, idx) => {
          const override =
            ri.subtotalOverrideInCents === null
              ? null
              : ri.subtotalOverrideInCents.toNumber();
          const cost = baseDerivedCosts[idx] ?? 0;
          return sum + (override ?? ri.quantityPerServing * cost);
        }, 0)
      : null;

    return {
      success: true,
      data: {
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        servingSize: recipe.servingSize,
        imageUrl: recipe.imageUrl,
        notes: recipe.notes,
        category: recipe.category,
        sellingPriceInCents: recipe.sellingPriceInCents,
        discontinued: recipe.discontinued,
        // Phase 2: yield fields surface so the editor can render the
        // "Yield (use as sub-recipe)" section.
        yieldQuantity: recipe.yieldQuantity,
        yieldUnit: recipe.yieldUnit,
        // Raw ingredient rows only — composite rows are surfaced in the
        // separate `subRecipeRows` field below so the editor renders them
        // distinctly.
        ingredients: recipe.ingredients
          .map((ri, idx) => ({ ri, idx }))
          .filter((p): p is { ri: typeof p.ri & { ingredientId: string; ingredient: NonNullable<typeof p.ri.ingredient> }; idx: number } =>
            p.ri.ingredientId !== null && p.ri.ingredient !== null
          )
          .map(({ ri, idx }) => ({
            id: ri.id,
            ingredientId: ri.ingredientId,
            ingredientName: ri.ingredient.name,
            unit: ri.ingredient.unit,
            quantityPerServing: ri.quantityPerServing,
            costPerUnitInCents: baseDerivedCosts[idx],
            subtotalOverrideInCents:
              ri.subtotalOverrideInCents === null
                ? null
                : ri.subtotalOverrideInCents.toNumber(),
            currentStock: ri.ingredient.inventoryCounts[0]?.quantity ?? null,
            lowStockThreshold: ri.ingredient.lowStockThreshold,
          })),
        // Phase 2: composite rows surfaced for the editor. Quantity is in
        // the sub-recipe's `subRecipeYieldUnit` (e.g., "100 mL of Milk foam").
        // We only include rows where the join is intact (defense against the
        // both-null FK SET-NULL state, even though Phase 1's iteration patch
        // moved both FKs to RESTRICT — old data may still exist).
        subRecipeRows: recipe.ingredients
          .filter(
            (ri): ri is typeof ri & { subRecipeId: string; subRecipe: NonNullable<typeof ri.subRecipe> } =>
              ri.subRecipeId !== null &&
              ri.subRecipe !== null &&
              ri.subRecipe.yieldQuantity !== null &&
              ri.subRecipe.yieldUnit !== null
          )
          .map((ri) => ({
            id: ri.id,
            subRecipeId: ri.subRecipeId,
            subRecipeName: ri.subRecipe.name,
            subRecipeYieldQuantity: ri.subRecipe.yieldQuantity!,
            subRecipeYieldUnit: ri.subRecipe.yieldUnit!,
            quantityPerServing: ri.quantityPerServing,
            subtotalOverrideInCents:
              ri.subtotalOverrideInCents === null
                ? null
                : ri.subtotalOverrideInCents.toNumber(),
          })),
        steps: recipe.steps.map((s) => ({
          id: s.id,
          stepNumber: s.stepNumber,
          instruction: s.instruction,
        })),
        variations: recipe.variations.map((v) => ({
          id: v.id,
          name: v.name,
          sellingPriceInCents: v.sellingPriceInCents,
          // Same Phase 1 filter for variation ingredients.
          ingredients: v.ingredients
            .filter((vi): vi is typeof vi & { ingredientId: string; ingredient: NonNullable<typeof vi.ingredient> } =>
              vi.ingredientId !== null && vi.ingredient !== null
            )
            .map((vi) => ({
              id: vi.id,
              ingredientId: vi.ingredientId,
              ingredientName: vi.ingredient.name,
              unit: vi.ingredient.unit,
              quantityPerServing: vi.quantityPerServing,
              costPerUnitInCents: deriveCost(vi.ingredient, vi.ingredientId),
              subtotalOverrideInCents: vi.subtotalOverrideInCents,
            })),
          steps: v.steps.map((s) => ({
            id: s.id,
            stepNumber: s.stepNumber,
            instruction: s.instruction,
          })),
        })),
        costPerServingInCents,
      },
    };
  } catch {
    return { success: false, error: "Failed to load recipe" };
  }
}

export async function createRecipe(
  input: z.infer<typeof createRecipeSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = createRecipeSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const recipe = await prisma.recipe.create({
      data: {
        cafeId: session.user.cafeId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        servingSize: parsed.data.servingSize ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
      },
    });

    return { success: true, data: { id: recipe.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to create recipe" };
  }
}

export async function updateRecipe(
  input: z.infer<typeof updateRecipeSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = updateRecipeSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const existing = await prisma.recipe.findFirst({
      where: { id: parsed.data.id, cafeId: session.user.cafeId },
    });
    if (!existing) return { success: false, error: "Recipe not found" };

    await prisma.recipe.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        servingSize: parsed.data.servingSize ?? null,
        ...(parsed.data.imageUrl !== undefined && { imageUrl: parsed.data.imageUrl }),
      },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update recipe" };
  }
}

export async function deleteRecipe(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const existing = await prisma.recipe.findFirst({
      where: { id, cafeId: session.user.cafeId },
    });
    if (!existing) return { success: false, error: "Recipe not found" };

    await prisma.recipe.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to delete recipe" };
  }
}

export async function updateSellingPrice(
  id: string,
  sellingPriceInCents: number | null,
  type: "recipe" | "variation" = "recipe"
): Promise<ActionResult<void>> {
  try {
    await requireRole("MANAGER");
    if (type === "variation") {
      await prisma.recipeVariation.update({ where: { id }, data: { sellingPriceInCents } });
    } else {
      await prisma.recipe.update({ where: { id }, data: { sellingPriceInCents } });
    }
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") return { success: false, error: "Unauthorized" };
    return { success: false, error: "Failed to update price" };
  }
}

export async function updateRecipeCategory(
  id: string,
  category: string | null
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const recipe = await prisma.recipe.findFirst({ where: { id, cafeId: session.user.cafeId } });
    if (!recipe) return { success: false, error: "Recipe not found" };
    await prisma.recipe.update({ where: { id }, data: { category } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") return { success: false, error: "Unauthorized" };
    return { success: false, error: "Failed to update category" };
  }
}

export async function updateRecipeNotes(
  id: string,
  notes: string | null
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const recipe = await prisma.recipe.findFirst({ where: { id, cafeId: session.user.cafeId } });
    if (!recipe) return { success: false, error: "Recipe not found" };
    await prisma.recipe.update({ where: { id }, data: { notes } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") return { success: false, error: "Unauthorized" };
    return { success: false, error: "Failed to update notes" };
  }
}

export async function toggleDiscontinued(id: string): Promise<ActionResult<{ discontinued: boolean }>> {
  try {
    const session = await requireRole("MANAGER");
    const recipe = await prisma.recipe.findFirst({
      where: { id, cafeId: session.user.cafeId },
      select: { discontinued: true },
    });
    if (!recipe) return { success: false, error: "Recipe not found" };

    const updated = await prisma.recipe.update({
      where: { id },
      data: { discontinued: !recipe.discontinued },
      select: { discontinued: true },
    });
    return { success: true, data: { discontinued: updated.discontinued } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update recipe" };
  }
}

// ─── Recipe Ingredients ─────────────────────────────────────

export async function addRecipeIngredient(
  input: z.infer<typeof addIngredientSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = addIngredientSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const recipe = await prisma.recipe.findFirst({
      where: { id: parsed.data.recipeId, cafeId },
    });
    if (!recipe) return { success: false, error: "Recipe not found" };

    if (parsed.data.ingredientId) {
      // Raw ingredient row — existing behavior.
      const ingredient = await prisma.ingredient.findFirst({
        where: { id: parsed.data.ingredientId, cafeId },
      });
      if (!ingredient) return { success: false, error: "Ingredient not found" };
      const ri = await prisma.recipeIngredient.create({
        data: {
          recipeId: parsed.data.recipeId,
          ingredientId: parsed.data.ingredientId,
          quantityPerServing: parsed.data.quantityPerServing,
        },
      });
      return { success: true, data: { id: ri.id } };
    }

    // Sub-recipe (composite) row — Phase 1 validates yield + cycle.
    const sub = await prisma.recipe.findFirst({
      where: { id: parsed.data.subRecipeId!, cafeId },
      select: { id: true, yieldQuantity: true, yieldUnit: true },
    });
    if (!sub) return { success: false, error: "Sub-recipe not found" };
    if (sub.yieldQuantity === null || sub.yieldUnit === null) {
      return { success: false, error: "Sub-recipe must declare a yield first" };
    }

    // Cycle detection: load every recipe's polymorphic ingredient rows in
    // this cafe (cheap — ingredient counts are bounded), build the registry,
    // ask the engine.
    const registry = await loadCafeRecipeRegistry(cafeId);
    if (
      wouldCreateCycle(parsed.data.recipeId, parsed.data.subRecipeId!, registry)
    ) {
      return { success: false, error: "Adding this would create a cycle" };
    }

    const ri = await prisma.recipeIngredient.create({
      data: {
        recipeId: parsed.data.recipeId,
        subRecipeId: parsed.data.subRecipeId,
        quantityPerServing: parsed.data.quantityPerServing,
      },
    });
    return { success: true, data: { id: ri.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to add ingredient" };
  }
}

/**
 * Phase 2: list every recipe in the cafe that has a yield set (i.e., usable
 * as a sub-recipe), excluding the current recipe to prevent self-reference at
 * the picker level. Cycle detection at insert time still defends against
 * indirect cycles.
 */
export async function getSubRecipeOptions(
  currentRecipeId: string
): Promise<
  ActionResult<
    Array<{ id: string; name: string; yieldQuantity: number; yieldUnit: string }>
  >
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;
    const rows = await prisma.recipe.findMany({
      where: {
        cafeId,
        id: { not: currentRecipeId },
        yieldQuantity: { not: null },
        yieldUnit: { not: null },
        discontinued: false,
      },
      select: { id: true, name: true, yieldQuantity: true, yieldUnit: true },
      orderBy: { name: "asc" },
    });
    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        // Both fields are non-null per the WHERE clause; assert for TS.
        yieldQuantity: r.yieldQuantity!,
        yieldUnit: r.yieldUnit!,
      })),
    };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to load sub-recipe options" };
  }
}

export async function setRecipeYield(
  input: z.infer<typeof setRecipeYieldSchema>
): Promise<ActionResult<{ yieldQuantity: number | null; yieldUnit: string | null }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = setRecipeYieldSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const recipe = await prisma.recipe.findFirst({
      where: { id: parsed.data.recipeId, cafeId },
    });
    if (!recipe) return { success: false, error: "Recipe not found" };

    // If clearing the yield: refuse when the recipe is still referenced as a
    // sub-recipe by another row. Otherwise the engine would silently skip
    // those composite rows at sale time → silent under-deduction.
    if (parsed.data.yieldQuantity === null) {
      const inUseCount = await prisma.recipeIngredient.count({
        where: { subRecipeId: parsed.data.recipeId },
      });
      if (inUseCount > 0) {
        return {
          success: false,
          error: `Cannot clear yield: this recipe is still used as a sub-recipe by ${inUseCount} ${
            inUseCount === 1 ? "row" : "rows"
          }. Remove those references first.`,
        };
      }
    }

    const updated = await prisma.recipe.update({
      where: { id: parsed.data.recipeId },
      data: {
        yieldQuantity: parsed.data.yieldQuantity,
        yieldUnit: parsed.data.yieldUnit,
      },
      select: { yieldQuantity: true, yieldUnit: true },
    });
    return { success: true, data: updated };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update yield" };
  }
}

/**
 * Build the registry shape `expandRecipeToLeaves` / `wouldCreateCycle` /
 * `rollupCostPerYieldUnit` accept. One query per cafe; the result is shared
 * across both expansion and cost rollup callers (extra `subtotalOverrideInCents`
 * field is ignored by interfaces that don't read it).
 */
async function loadCafeRecipeRegistry(
  cafeId: string
): Promise<Map<string, ExpandRecipeInput & CostRollupRecipe>> {
  const recipes = await prisma.recipe.findMany({
    where: { cafeId },
    select: {
      id: true,
      yieldQuantity: true,
      yieldUnit: true,
      ingredients: {
        select: {
          ingredientId: true,
          subRecipeId: true,
          quantityPerServing: true,
          subtotalOverrideInCents: true,
        },
      },
    },
  });
  return new Map(recipes.map((r) => [r.id, r]));
}

export async function removeRecipeIngredient(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const ri = await prisma.recipeIngredient.findUnique({
      where: { id },
      include: { recipe: { select: { cafeId: true } } },
    });
    if (!ri || ri.recipe.cafeId !== session.user.cafeId) {
      return { success: false, error: "Not found" };
    }

    await prisma.recipeIngredient.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to remove ingredient" };
  }
}

// ─── Recipe Steps ───────────────────────────────────────────

export async function addRecipeStep(
  input: z.infer<typeof addStepSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = addStepSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const recipe = await prisma.recipe.findFirst({
      where: { id: parsed.data.recipeId, cafeId: session.user.cafeId },
    });
    if (!recipe) return { success: false, error: "Recipe not found" };

    const maxStep = await prisma.recipeStep.aggregate({
      where: { recipeId: parsed.data.recipeId },
      _max: { stepNumber: true },
    });

    const step = await prisma.recipeStep.create({
      data: {
        recipeId: parsed.data.recipeId,
        stepNumber: (maxStep._max.stepNumber ?? 0) + 1,
        instruction: parsed.data.instruction,
      },
    });

    return { success: true, data: { id: step.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to add step" };
  }
}

export async function updateRecipeStep(
  input: z.infer<typeof updateStepSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = updateStepSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const step = await prisma.recipeStep.findUnique({
      where: { id: parsed.data.id },
      include: { recipe: { select: { cafeId: true } } },
    });
    if (!step || step.recipe.cafeId !== session.user.cafeId) {
      return { success: false, error: "Step not found" };
    }

    await prisma.recipeStep.update({
      where: { id: parsed.data.id },
      data: { instruction: parsed.data.instruction },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update step" };
  }
}

export async function deleteRecipeStep(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const step = await prisma.recipeStep.findUnique({
      where: { id },
      include: { recipe: { select: { cafeId: true } } },
    });
    if (!step || step.recipe.cafeId !== session.user.cafeId) {
      return { success: false, error: "Step not found" };
    }

    await prisma.recipeStep.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to delete step" };
  }
}

export async function reorderRecipeSteps(
  input: z.infer<typeof reorderStepsSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = reorderStepsSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input" };
    }

    const recipe = await prisma.recipe.findFirst({
      where: { id: parsed.data.recipeId, cafeId: session.user.cafeId },
    });
    if (!recipe) return { success: false, error: "Recipe not found" };

    await prisma.$transaction(
      parsed.data.stepIds.map((stepId, index) =>
        prisma.recipeStep.update({
          where: { id: stepId },
          data: { stepNumber: index + 1 },
        })
      )
    );

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to reorder steps" };
  }
}

export async function updateSubtotalOverride(
  recipeIngredientId: string,
  subtotalOverrideInCents: number | null
): Promise<ActionResult<void>> {
  try {
    await requireRole("MANAGER");
    await prisma.recipeIngredient.update({
      where: { id: recipeIngredientId },
      data: { subtotalOverrideInCents },
    });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update subtotal" };
  }
}

export async function updateVariationSubtotalOverride(
  variationIngredientId: string,
  subtotalOverrideInCents: number | null
): Promise<ActionResult<void>> {
  try {
    await requireRole("MANAGER");
    await prisma.variationIngredient.update({
      where: { id: variationIngredientId },
      data: { subtotalOverrideInCents },
    });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update subtotal" };
  }
}

// ─── Variation CRUD ─────────────────────────────────────────

const createVariationSchema = z.object({
  recipeId: z.string().min(1),
  name: z.string().min(1, "Name is required").max(100),
  duplicateFromId: z.string().optional(),
});

const addVariationIngredientSchema = z.object({
  variationId: z.string().min(1),
  ingredientId: z.string().min(1),
  quantityPerServing: z.number().int().min(1),
});

export async function createVariation(
  input: z.infer<typeof createVariationSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = createVariationSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const recipe = await prisma.recipe.findFirst({
      where: { id: parsed.data.recipeId, cafeId: session.user.cafeId },
    });
    if (!recipe) return { success: false, error: "Recipe not found" };

    const variation = await prisma.$transaction(async (tx) => {
      const v = await tx.recipeVariation.create({
        data: {
          recipeId: parsed.data.recipeId,
          name: parsed.data.name,
        },
      });

      // Duplicate ingredients and steps from source
      if (parsed.data.duplicateFromId) {
        const source = parsed.data.duplicateFromId;

        if (source === "__base__") {
          // Duplicate from base recipe
          const baseIngs = await tx.recipeIngredient.findMany({ where: { recipeId: parsed.data.recipeId } });
          const baseSteps = await tx.recipeStep.findMany({ where: { recipeId: parsed.data.recipeId }, orderBy: { stepNumber: "asc" } });
          for (const ing of baseIngs) {
            await tx.variationIngredient.create({ data: { variationId: v.id, ingredientId: ing.ingredientId, quantityPerServing: ing.quantityPerServing } });
          }
          for (const step of baseSteps) {
            await tx.variationStep.create({ data: { variationId: v.id, instruction: step.instruction, stepNumber: step.stepNumber } });
          }
        } else {
          // Duplicate from another variation
          const srcIngs = await tx.variationIngredient.findMany({ where: { variationId: source } });
          const srcSteps = await tx.variationStep.findMany({ where: { variationId: source }, orderBy: { stepNumber: "asc" } });
          for (const ing of srcIngs) {
            await tx.variationIngredient.create({ data: { variationId: v.id, ingredientId: ing.ingredientId, quantityPerServing: ing.quantityPerServing } });
          }
          for (const step of srcSteps) {
            await tx.variationStep.create({ data: { variationId: v.id, instruction: step.instruction, stepNumber: step.stepNumber } });
          }
        }
      }

      return v;
    });

    return { success: true, data: { id: variation.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to create variation" };
  }
}

export async function deleteVariation(
  id: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");

    const variation = await prisma.recipeVariation.findUnique({
      where: { id },
      include: { recipe: { select: { cafeId: true } } },
    });
    if (!variation || variation.recipe.cafeId !== session.user.cafeId) {
      return { success: false, error: "Variation not found" };
    }

    await prisma.recipeVariation.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to delete variation" };
  }
}

export async function addVariationIngredient(
  input: z.infer<typeof addVariationIngredientSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = addVariationIngredientSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const variation = await prisma.recipeVariation.findUnique({
      where: { id: parsed.data.variationId },
      include: { recipe: { select: { cafeId: true } } },
    });
    if (!variation || variation.recipe.cafeId !== session.user.cafeId) {
      return { success: false, error: "Variation not found" };
    }

    const ingredient = await prisma.ingredient.findFirst({
      where: { id: parsed.data.ingredientId, cafeId: session.user.cafeId },
    });
    if (!ingredient) return { success: false, error: "Ingredient not found" };

    const vi = await prisma.variationIngredient.create({
      data: {
        variationId: parsed.data.variationId,
        ingredientId: parsed.data.ingredientId,
        quantityPerServing: parsed.data.quantityPerServing,
      },
    });

    return { success: true, data: { id: vi.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to add variation ingredient" };
  }
}

export async function removeVariationIngredient(
  id: string
): Promise<ActionResult<void>> {
  try {
    await requireRole("MANAGER");
    await prisma.variationIngredient.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to remove variation ingredient" };
  }
}

export async function addVariationStep(
  input: { variationId: string; instruction: string }
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole("MANAGER");
    const maxStep = await prisma.variationStep.findFirst({
      where: { variationId: input.variationId },
      orderBy: { stepNumber: "desc" },
      select: { stepNumber: true },
    });
    const step = await prisma.variationStep.create({
      data: {
        variationId: input.variationId,
        instruction: input.instruction,
        stepNumber: (maxStep?.stepNumber ?? 0) + 1,
      },
    });
    return { success: true, data: { id: step.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to add step" };
  }
}

export async function deleteVariationStep(
  id: string
): Promise<ActionResult<void>> {
  try {
    await requireRole("MANAGER");
    await prisma.variationStep.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to delete step" };
  }
}

export async function updateVariationStep(
  input: { id: string; instruction: string }
): Promise<ActionResult<void>> {
  try {
    await requireRole("MANAGER");
    await prisma.variationStep.update({
      where: { id: input.id },
      data: { instruction: input.instruction },
    });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update step" };
  }
}
