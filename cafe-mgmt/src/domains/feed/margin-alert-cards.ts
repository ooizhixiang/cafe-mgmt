import { prisma } from "@/lib/db";
import { currentCostPerUnit, findOldestNonEmptyLot } from "@/lib/fifo";
import { formatCents } from "@/lib/format";
import {
  computeMargin,
  effectiveSellingPrice,
  isBelowFloor,
} from "@/lib/margin";
import {
  rollupCostPerYieldUnit,
  type CostRollupRecipe,
} from "@/lib/recipe-expand";
import type { FeedCard } from "@/types/feed";

interface VariationLossDetail {
  variationName: string; // "Original" for base, otherwise the variation's name
  costInCents: number;
  sellingInCents: number;
  margin: number; // ratio, may be negative
}

/**
 * Sum cost per serving over a list of recipe-or-variation ingredient rows.
 * Mirrors the helper in `getRecipes` (recipe.actions.ts:101) — same shape, same
 * null semantics: returns null when any row's cost can't be resolved.
 */
function sumServingCost(
  rows: Array<{
    ingredientId: string | null;
    subRecipeId?: string | null;
    quantityPerServing: number;
    subtotalOverrideInCents: number | { toNumber(): number } | null;
  }>,
  derivedCostByIngredientId: Map<string, number | null>,
  // Optional registry so composite rows can be resolved via the rollup
  // engine. Same shape used by recipe.actions.ts:sumServingCost.
  recipeRegistry?: Map<string, CostRollupRecipe>
): number | null {
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

function describeLoss(detail: VariationLossDetail, floorPercent: number): string {
  const lossCents = detail.costInCents - detail.sellingInCents;
  if (lossCents > 0) {
    return `${detail.variationName} loses ${formatCents(lossCents)}/serving`;
  }
  // Thin margin (between 0 and floor)
  const marginPercent = Math.round(detail.margin * 100);
  return `${detail.variationName} ${marginPercent}% margin (below ${floorPercent}%)`;
}

export async function getMarginAlertCards(cafeId: string): Promise<FeedCard[]> {
  const cafe = await prisma.cafe.findUnique({
    where: { id: cafeId },
    select: { minMarginPercent: true },
  });
  if (!cafe) return [];
  const floor = cafe.minMarginPercent;

  // Load every recipe in the cafe (not just `discontinued: false`) so the
  // sub-recipe registry can resolve composites that reference recipes which
  // happen to be marked discontinued or used only as components. Filter out
  // discontinued AT THE CARD-EMITTING STEP, not at load time.
  const recipes = await prisma.recipe.findMany({
    where: { cafeId },
    select: {
      id: true,
      name: true,
      sellingPriceInCents: true,
      discontinued: true,
      yieldQuantity: true,
      yieldUnit: true,
      ingredients: {
        select: {
          ingredientId: true,
          subRecipeId: true,
          quantityPerServing: true,
          subtotalOverrideInCents: true,
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
        select: {
          id: true,
          name: true,
          sellingPriceInCents: true,
          ingredients: {
            select: {
              ingredientId: true,
              quantityPerServing: true,
              subtotalOverrideInCents: true,
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
  });

  if (recipes.length === 0) return [];

  // Per-ingredient derived cost map. The ingredient's cost depends on its own
  // override + lots, NOT on the recipe context, so a single map shared across
  // all recipes is correct (same approach as getRecipes). Filter out null
  // ingredient IDs that come from composite (sub-recipe) rows.
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
  const oldestLots = new Map<
    string,
    { totalPriceInCents: number; quantity: number }
  >();
  if (ingredientIds.length > 0) {
    const purchases = await prisma.ingredientPurchase.findMany({
      where: {
        cafeId,
        remainingQuantity: { gt: 0 },
        ingredientSupplier: { ingredientId: { in: ingredientIds } },
      },
      select: {
        id: true,
        createdAt: true,
        remainingQuantity: true,
        totalPriceInCents: true,
        quantity: true,
        ingredientSupplier: { select: { ingredientId: true } },
      },
    });
    // Group by ingredientId, then pick the oldest non-empty per the helper.
    const byIngredient = new Map<
      string,
      Array<{
        id: string;
        createdAt: Date;
        remainingQuantity: number;
        totalPriceInCents: number;
        quantity: number;
      }>
    >();
    for (const p of purchases) {
      const id = p.ingredientSupplier.ingredientId;
      const bucket = byIngredient.get(id) ?? [];
      bucket.push({
        id: p.id,
        createdAt: p.createdAt,
        remainingQuantity: p.remainingQuantity,
        totalPriceInCents: p.totalPriceInCents.toNumber(),
        quantity: p.quantity,
      });
      byIngredient.set(id, bucket);
    }
    for (const [id, bucket] of byIngredient) {
      const oldest = findOldestNonEmptyLot(bucket);
      if (oldest) oldestLots.set(id, oldest);
    }
  }

  const derivedCostByIngredientId = new Map<string, number | null>();
  for (const r of recipes) {
    for (const ri of [
      ...r.ingredients,
      ...r.variations.flatMap((v) => v.ingredients),
    ]) {
      // Composite rows have ingredient: null — handled by the rollup helper.
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
  // Used by `sumServingCost` to resolve composite-row costs.
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

  const cards: FeedCard[] = [];

  for (const r of recipes) {
    // Skip discontinued recipes for ALERTING (we still loaded them above so
    // the registry can resolve composite references that point at them).
    if (r.discontinued) continue;

    // "No ingredients anywhere" guard: a recipe whose base AND every variation
    // are empty has no real cost to compare against — `sumServingCost([])`
    // returns vacuous-true 0, which would compute as 100% margin and look
    // "healthy". Match the explicit guard in recipe.actions.ts:230 so the
    // skip is intentional, not accidental.
    const totalIngredientRows =
      r.ingredients.length +
      r.variations.reduce((acc, v) => acc + v.ingredients.length, 0);
    if (totalIngredientRows === 0) continue;

    const baseCost = sumServingCost(
      r.ingredients,
      derivedCostByIngredientId,
      recipeRegistry
    );
    const losses: VariationLossDetail[] = [];

    if (r.variations.length === 0) {
      // No variations — evaluate the base recipe alone.
      const sellingCents = effectiveSellingPrice(null, r.sellingPriceInCents);
      if (sellingCents !== null && baseCost !== null) {
        const margin = computeMargin(sellingCents, baseCost);
        if (margin !== null && isBelowFloor(margin, floor)) {
          losses.push({
            variationName: "Original",
            costInCents: baseCost,
            sellingInCents: sellingCents,
            margin,
          });
        }
      }
    } else {
      // For each variation: cost = base + this variation's add-ons; selling =
      // variation's own → fall back to recipe-level. Skip silently if either
      // side is unresolvable.
      for (const v of r.variations) {
        const variationOnly = sumServingCost(
          v.ingredients,
          derivedCostByIngredientId
        );
        if (baseCost === null || variationOnly === null) continue;
        const variationCost = baseCost + variationOnly;
        const sellingCents = effectiveSellingPrice(
          v.sellingPriceInCents,
          r.sellingPriceInCents
        );
        if (sellingCents === null) continue;
        const margin = computeMargin(sellingCents, variationCost);
        if (margin !== null && isBelowFloor(margin, floor)) {
          losses.push({
            variationName: v.name,
            costInCents: variationCost,
            sellingInCents: sellingCents,
            margin,
          });
        }
      }
    }

    if (losses.length === 0) continue;

    const subtitle = losses
      .map((l) => describeLoss(l, floor))
      .join(" · ");

    // Outright loss anywhere → urgent border; otherwise thin-margin warning amber.
    const hasOutrightLoss = losses.some(
      (l) => l.costInCents > l.sellingInCents
    );

    cards.push({
      id: `margin-alert-${r.id}`,
      variant: "alert",
      priority: 3,
      title: hasOutrightLoss
        ? `${r.name} priced below cost`
        : `${r.name} margin below ${floor}%`,
      subtitle,
      borderColor: hasOutrightLoss
        ? "var(--color-urgent, red)"
        : "var(--color-warning, amber)",
      data: {
        type: "MARGIN_ALERT",
        recipeId: r.id,
        floorPercent: floor,
        actionRoute: "/recipes",
      },
      createdAt: new Date().toISOString(),
    });
  }

  return cards;
}
