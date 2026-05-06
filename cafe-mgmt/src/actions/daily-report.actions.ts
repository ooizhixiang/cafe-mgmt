"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { getCafeToday } from "@/lib/format";
import { checkThresholds } from "@/lib/threshold-check";
import { applyConsumeFifo, applyRestoreFifo } from "@/lib/lot-consume";
import { currentCostPerUnit } from "@/lib/fifo";
import {
  expandRecipeToLeaves,
  type ExpandRecipeInput,
} from "@/lib/recipe-expand";
import type { ActionResult } from "@/types";

const submitReportSchema = z.object({
  entries: z.array(
    z.object({
      recipeId: z.string().min(1),
      variationId: z.string().optional(),
      qtySold: z.number().int().min(0),
    })
  ),
  grabAndGoEntries: z.array(
    z.object({
      itemId: z.string().min(1),
      itemName: z.string().min(1),
      qtySold: z.number().int().min(0),
    })
  ).optional(),
});

export async function getRecipesForReport(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      imageUrl: string | null;
      ingredients: Array<{
        ingredientId: string;
        ingredientName: string;
        unit: string;
        quantityPerServing: number;
      }>;
      variations: Array<{
        id: string;
        name: string;
        ingredients: Array<{
          ingredientId: string;
          ingredientName: string;
          unit: string;
          quantityPerServing: number;
        }>;
      }>;
    }>
  >
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const recipes = await prisma.recipe.findMany({
      where: { cafeId, discontinued: false },
      include: {
        ingredients: {
          include: {
            ingredient: { select: { name: true, unit: true } },
          },
        },
        variations: {
          include: {
            ingredients: {
              include: {
                ingredient: { select: { name: true, unit: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return {
      success: true,
      data: recipes.map((r) => ({
        id: r.id,
        name: r.name,
        imageUrl: r.imageUrl,
        // Filter out composite (sub-recipe) rows here — this projection feeds
        // the sale-entry UI, which only cares about leaf raw ingredients for
        // its display. Sub-recipe expansion happens at deduction time in
        // submitDailyReport via expandRecipeToLeaves.
        ingredients: r.ingredients
          .filter(
            (ri): ri is typeof ri & { ingredientId: string; ingredient: NonNullable<typeof ri.ingredient> } =>
              ri.ingredientId !== null && ri.ingredient !== null
          )
          .map((ri) => ({
            ingredientId: ri.ingredientId,
            ingredientName: ri.ingredient.name,
            unit: ri.ingredient.unit,
            quantityPerServing: ri.quantityPerServing,
          })),
        variations: r.variations.map((v) => ({
          id: v.id,
          name: v.name,
          ingredients: v.ingredients
            .filter(
              (vi): vi is typeof vi & { ingredientId: string; ingredient: NonNullable<typeof vi.ingredient> } =>
                vi.ingredientId !== null && vi.ingredient !== null
            )
            .map((vi) => ({
              ingredientId: vi.ingredientId,
              ingredientName: vi.ingredient.name,
              unit: vi.ingredient.unit,
              quantityPerServing: vi.quantityPerServing,
            })),
        })),
      })),
    };
  } catch {
    return { success: false, error: "Failed to load recipes" };
  }
}

export async function submitDailyReport(
  input: z.infer<typeof submitReportSchema>
): Promise<ActionResult<{ deductions: Array<{ name: string; unit: string; deducted: number; newStock: number | null }> }>> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;
    const userId = session.user.id;

    const parsed = submitReportSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const entries = parsed.data.entries.filter((e) => e.qtySold > 0);
    const grabGoEntries = parsed.data.grabAndGoEntries?.filter((e) => e.qtySold > 0) ?? [];
    if (entries.length === 0 && grabGoEntries.length === 0) {
      return { success: false, error: "No sales to report" };
    }

    // Load recipes with ingredients and variations
    const recipeIds = entries.map((e) => e.recipeId);
    const variationIds = entries.map((e) => e.variationId).filter(Boolean) as string[];

    const recipes = await prisma.recipe.findMany({
      where: { id: { in: recipeIds }, cafeId },
      include: {
        ingredients: {
          include: {
            ingredient: { select: { id: true, name: true, unit: true, costPerUnitInCents: true } },
          },
        },
        variations: {
          where: variationIds.length > 0 ? { id: { in: variationIds } } : { id: "none" },
          include: {
            ingredients: {
              include: {
                ingredient: { select: { id: true, name: true, unit: true, costPerUnitInCents: true } },
              },
            },
          },
        },
      },
    });

    // Cafe-wide recipe registry for sub-recipe expansion. Includes EVERY
    // recipe in the cafe so the engine can walk through nested composites.
    // (The active `recipes` set above only includes recipes being SOLD; their
    // sub-recipes may be other recipes the engine needs to read.)
    const allRecipes = await prisma.recipe.findMany({
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
          },
        },
      },
    });
    const recipeRegistry: Map<string, ExpandRecipeInput> = new Map(
      allRecipes.map((r) => [r.id, r])
    );

    // Pre-load every ingredient in the cafe so we can attach name/unit/cost
    // metadata to leaf deductions surfaced by sub-recipe expansion (those
    // ingredients aren't necessarily in the active recipes' direct joins).
    const cafeIngredients = await prisma.ingredient.findMany({
      where: { cafeId },
      select: { id: true, name: true, unit: true, costPerUnitInCents: true },
    });
    const ingredientLookup = new Map(cafeIngredients.map((i) => [i.id, i]));

    // Calculate total deductions per ingredient
    const deductionMap = new Map<string, { name: string; unit: string; total: number; costPerUnit: number | null }>();

    function addLeafDeduction(ingredientId: string, qty: number) {
      if (qty <= 0) return;
      const meta = ingredientLookup.get(ingredientId);
      if (!meta) return; // ingredient deleted or cross-cafe; skip silently
      const existing = deductionMap.get(ingredientId);
      if (existing) {
        existing.total += qty;
      } else {
        deductionMap.set(ingredientId, {
          name: meta.name,
          unit: meta.unit,
          total: qty,
          costPerUnit:
            meta.costPerUnitInCents === null
              ? null
              : meta.costPerUnitInCents.toNumber(),
        });
      }
    }

    for (const entry of entries) {
      const recipe = recipes.find((r) => r.id === entry.recipeId);
      if (!recipe) continue;

      // Base recipe ingredients — expand sub-recipes via the engine. For raw
      // rows the engine returns leaf qty = quantityPerServing × scale; for
      // composite rows it walks down to leaves.
      // Engine throws on runtime cycles (defensive — action layer rejects
      // inserts that would create them, but a manual SQL or cycle race could
      // bypass that). Catch + log to avoid breaking the entire sale submission
      // for the cafe; the affected entry's leaves are skipped.
      try {
        const baseLeaves = expandRecipeToLeaves(
          entry.recipeId,
          recipeRegistry,
          entry.qtySold
        );
        for (const [leafId, qty] of baseLeaves) {
          addLeafDeduction(leafId, qty);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Expansion failed";
        console.error(
          `[submitDailyReport] expansion error on recipe ${entry.recipeId}: ${message}`
        );
      }

      // Variation-specific ingredients — Phase 1 forbids composites here, so
      // the existing per-row loop is correct (raw only). When variation
      // composites are added, route through the engine the same way.
      if (entry.variationId) {
        const variation = recipe.variations.find((v) => v.id === entry.variationId);
        if (variation) {
          for (const vi of variation.ingredients) {
            if (vi.ingredientId === null) continue; // defensive: future composite row
            const deduction = vi.quantityPerServing * entry.qtySold;
            addLeafDeduction(vi.ingredientId, deduction);
          }
        }
      }
    }

    const today = getCafeToday();

    // Derived per-unit cost per ingredient — drives InventoryCount.dollarValueInCents
    // so the valuation matches what the inventory/recipe pages display.
    // Falls back to the manual cost when no lots exist (or when manual override
    // is enabled). One batched query, results stored in a Map for O(1) lookup.
    const ingredientIdsForCost = Array.from(deductionMap.keys());
    const derivedCostByIngredient = new Map<string, number | null>();
    if (ingredientIdsForCost.length > 0) {
      const [ingredientMeta, oldestLots] = await Promise.all([
        prisma.ingredient.findMany({
          where: { id: { in: ingredientIdsForCost }, cafeId },
          select: {
            id: true,
            manualCostOverride: true,
            costPerUnitInCents: true,
          },
        }),
        prisma.ingredientPurchase.findMany({
          where: {
            cafeId,
            remainingQuantity: { gt: 0 },
            ingredientSupplier: { ingredientId: { in: ingredientIdsForCost } },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            quantity: true,
            totalPriceInCents: true,
            ingredientSupplier: { select: { ingredientId: true } },
          },
        }),
      ]);

      const oldestLotByIngredient = new Map<
        string,
        { totalPriceInCents: number; quantity: number }
      >();
      for (const row of oldestLots) {
        const id = row.ingredientSupplier.ingredientId;
        if (!oldestLotByIngredient.has(id)) {
          oldestLotByIngredient.set(id, {
            totalPriceInCents: row.totalPriceInCents.toNumber(),
            quantity: row.quantity,
          });
        }
      }

      for (const meta of ingredientMeta) {
        const rawCost =
          meta.costPerUnitInCents === null
            ? null
            : meta.costPerUnitInCents.toNumber();
        const derived = currentCostPerUnit(
          {
            manualCostOverride: meta.manualCostOverride,
            costPerUnitInCents: rawCost,
          },
          oldestLotByIngredient.get(meta.id) ?? null
        );
        derivedCostByIngredient.set(meta.id, derived);
      }
    }

    // Persist sales entries and deduct from inventory in a transaction
    const deductions: Array<{ name: string; unit: string; deducted: number; newStock: number | null }> = [];

    // One submission ID per call — stamped on every SalesEntry row created
    // below so the History view can group them. Multiple submissions per day
    // are allowed; merging happens at read-time.
    const submissionId = crypto.randomUUID();

    await prisma.$transaction(async (tx) => {
      // Save sales entries — per-entry FIFO consume drives `costInCents`.
      // Sales over-deduct silently (no confirm); the OVER_DEDUCTION row gets
      // priced at the most-recent lot.
      for (const entry of entries) {
        const recipe = recipes.find((r) => r.id === entry.recipeId);
        if (!recipe) continue;
        const variation = entry.variationId
          ? recipe.variations.find((v) => v.id === entry.variationId)
          : null;
        const sellingPrice =
          variation?.sellingPriceInCents ?? recipe.sellingPriceInCents ?? 0;

        // Create the SalesEntry first so we have its id to attribute consumes.
        const salesEntry = await tx.salesEntry.create({
          data: {
            cafeId,
            recipeId: entry.recipeId,
            recipeName: variation ? `${recipe.name} (${variation.name})` : recipe.name,
            qtySold: entry.qtySold,
            revenueInCents: sellingPrice * entry.qtySold,
            costInCents: 0,
            saleDate: today,
            createdById: userId,
            submissionId,
          },
        });

        // Compute per-ingredient deduction for this single entry.
        // overrides (recipeIngredient.subtotalOverrideInCents) bypass FIFO —
        // they're fixed per-serving costs that ignore lot prices.
        let entryCostInCents = 0;
        for (const ri of recipe.ingredients) {
          if (ri.ingredientId !== null) {
            // Raw ingredient row — existing path.
            const totalQty = ri.quantityPerServing * entry.qtySold;
            if (ri.subtotalOverrideInCents !== null) {
              entryCostInCents += ri.subtotalOverrideInCents.toNumber() * entry.qtySold;
              await applyConsumeFifo(tx, {
                cafeId,
                ingredientId: ri.ingredientId,
                requested: totalQty,
                sourceType: "SALES",
                sourceId: salesEntry.id,
              });
            } else {
              const fifoResult = await applyConsumeFifo(tx, {
                cafeId,
                ingredientId: ri.ingredientId,
                requested: totalQty,
                sourceType: "SALES",
                sourceId: salesEntry.id,
              });
              entryCostInCents += fifoResult.totalCostInCents;
            }
          } else if (ri.subRecipeId !== null) {
            // Composite row — expand sub-recipe to leaves and consume each.
            // The composite row's optional override applies at the row level
            // (replaces summed leaf cost); the leaves still consume from FIFO.
            // Engine throws on runtime cycles — catch defensively so a bad
            // edge doesn't break the whole transaction; that one row's
            // leaves are skipped. Cost remains 0 (or override) for that row.
            const sub = recipeRegistry.get(ri.subRecipeId);
            if (!sub || sub.yieldQuantity === null || sub.yieldQuantity <= 0) {
              continue; // sub deleted or yield cleared — defensive skip
            }
            const subScale = (ri.quantityPerServing * entry.qtySold) / sub.yieldQuantity;
            let rowFifoCost = 0;
            try {
              const leaves = expandRecipeToLeaves(
                ri.subRecipeId,
                recipeRegistry,
                subScale
              );
              for (const [leafId, leafQty] of leaves) {
                const fifoResult = await applyConsumeFifo(tx, {
                  cafeId,
                  ingredientId: leafId,
                  requested: leafQty,
                  sourceType: "SALES",
                  sourceId: salesEntry.id,
                });
                rowFifoCost += fifoResult.totalCostInCents;
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : "Expansion failed";
              console.error(
                `[submitDailyReport] composite expansion error on row ${ri.id}: ${message}`
              );
            }
            if (ri.subtotalOverrideInCents !== null) {
              entryCostInCents += ri.subtotalOverrideInCents.toNumber() * entry.qtySold;
            } else {
              entryCostInCents += rowFifoCost;
            }
          }
        }

        if (variation) {
          for (const vi of variation.ingredients) {
            // Phase 1 forbids composites on variation ingredients; defend
            // against malformed rows in case the future loosens this.
            if (vi.ingredientId === null) continue;
            const totalQty = vi.quantityPerServing * entry.qtySold;
            const overrideCents = vi.subtotalOverrideInCents ?? null;
            if (overrideCents !== null) {
              entryCostInCents += overrideCents * entry.qtySold;
              await applyConsumeFifo(tx, {
                cafeId,
                ingredientId: vi.ingredientId,
                requested: totalQty,
                sourceType: "SALES",
                sourceId: salesEntry.id,
              });
            } else {
              const fifoResult = await applyConsumeFifo(tx, {
                cafeId,
                ingredientId: vi.ingredientId,
                requested: totalQty,
                sourceType: "SALES",
                sourceId: salesEntry.id,
              });
              entryCostInCents += fifoResult.totalCostInCents;
            }
          }
        }

        // Round at the Int boundary.
        await tx.salesEntry.update({
          where: { id: salesEntry.id },
          data: { costInCents: Math.round(entryCostInCents) },
        });
      }

      // Save grab & go entries and deduct stock
      const grabEntries = parsed.data.grabAndGoEntries?.filter((e) => e.qtySold > 0) ?? [];
      for (const entry of grabEntries) {
        const grabItem = await tx.grabAndGoItem.findUnique({ where: { id: entry.itemId } });
        await tx.salesEntry.create({
          data: {
            cafeId,
            recipeId: `grab-${entry.itemId}`,
            recipeName: entry.itemName,
            qtySold: entry.qtySold,
            revenueInCents: (grabItem?.priceInCents ?? 0) * entry.qtySold,
            costInCents: 0,
            saleDate: today,
            createdById: userId,
            submissionId,
          },
        });
        // Auto-deduct stock
        const item = grabItem;
        if (item) {
          const newStock = Math.max(0, item.stockCount - entry.qtySold);
          await tx.grabAndGoItem.update({
            where: { id: entry.itemId },
            data: { stockCount: newStock },
          });
          deductions.push({
            name: entry.itemName,
            unit: "pcs",
            deducted: entry.qtySold,
            newStock,
          });
        }
      }

      for (const [ingredientId, info] of deductionMap) {
        const existing = await tx.inventoryCount.findUnique({
          where: { ingredientId_countDate: { ingredientId, countDate: today } },
        });

        const currentQty = existing?.quantity ?? null;
        const newQty = currentQty !== null ? Math.max(0, currentQty - info.total) : null;

        if (currentQty !== null) {
          // Use the derived cost (oldest non-empty lot, or manual fallback)
          // so InventoryCount.dollarValueInCents matches the per-unit cost
          // shown on inventory/recipe pages. `info.costPerUnit` is the raw
          // manual cost and diverged from the derived value when lots existed.
          const derivedCost = derivedCostByIngredient.get(ingredientId) ?? null;
          await tx.inventoryCount.update({
            where: { ingredientId_countDate: { ingredientId, countDate: today } },
            data: {
              quantity: newQty!,
              confirmedById: userId,
              confirmedAt: new Date(),
              dollarValueInCents: derivedCost ? Math.round(newQty! * derivedCost) : null,
            },
          });
        }

        deductions.push({
          name: info.name,
          unit: info.unit,
          deducted: info.total,
          newStock: newQty,
        });
      }
    });

    // Check thresholds after deductions
    for (const [ingredientId] of deductionMap) {
      await checkThresholds(cafeId, ingredientId).catch(() => {});
    }

    return { success: true, data: { deductions } };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to submit report" };
  }
}

// ─── Sales Analysis ─────────────────────────────────────────

export type SalesAnalysis = {
  period: string;
  recipes: Array<{
    recipeName: string;
    totalSold: number;
  }>;
  ingredients: Array<{
    ingredientName: string;
    unit: string;
    totalUsed: number;
  }>;
  totalItemsSold: number;
};

export async function getSalesAnalysis(
  range: "day" | "week" | "month"
): Promise<ActionResult<SalesAnalysis>> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const now = getCafeToday();

    const startDate = new Date(now);
    if (range === "week") {
      startDate.setUTCDate(startDate.getUTCDate() - 7);
    } else if (range === "month") {
      startDate.setUTCDate(startDate.getUTCDate() - 30);
    }

    // Get sales entries for the period (exclude voided submissions).
    const salesEntries = await prisma.salesEntry.findMany({
      where: {
        cafeId,
        saleDate: { gte: startDate, lte: now },
        voidedAt: null,
      },
    });

    // Aggregate by recipe
    const recipeMap = new Map<string, number>();
    for (const entry of salesEntries) {
      const existing = recipeMap.get(entry.recipeName) ?? 0;
      recipeMap.set(entry.recipeName, existing + entry.qtySold);
    }

    const recipes = Array.from(recipeMap.entries())
      .map(([recipeName, totalSold]) => ({ recipeName, totalSold }))
      .sort((a, b) => b.totalSold - a.totalSold);

    // Calculate ingredient usage from sold recipes
    const recipeIds = [...new Set(salesEntries.map((e) => e.recipeId))];
    const recipeData = await prisma.recipe.findMany({
      where: { id: { in: recipeIds } },
      include: {
        ingredients: {
          include: {
            ingredient: { select: { name: true, unit: true } },
          },
        },
      },
    });

    const ingredientMap = new Map<string, { name: string; unit: string; total: number }>();

    for (const entry of salesEntries) {
      const recipe = recipeData.find((r) => r.id === entry.recipeId);
      if (!recipe) continue;

      for (const ri of recipe.ingredients) {
        // Skip composite rows in this raw-ingredient summary. Sub-recipe
        // expansion in this view would require recursing through other
        // recipes' ingredients — out of scope for this aggregation surface
        // (it's a sales-summary, not the FIFO deduction). Composites are
        // accounted for at deduction time via the engine.
        if (ri.ingredientId === null || ri.ingredient === null) continue;
        const used = ri.quantityPerServing * entry.qtySold;
        const key = ri.ingredientId;
        const existing = ingredientMap.get(key);
        if (existing) {
          existing.total += used;
        } else {
          ingredientMap.set(key, {
            name: ri.ingredient.name,
            unit: ri.ingredient.unit,
            total: used,
          });
        }
      }
    }

    const ingredients = Array.from(ingredientMap.values())
      .map((v) => ({ ingredientName: v.name, unit: v.unit, totalUsed: v.total }))
      .sort((a, b) => b.totalUsed - a.totalUsed);

    const totalItemsSold = recipes.reduce((sum, r) => sum + r.totalSold, 0);

    const periodLabel =
      range === "day"
        ? "Today"
        : range === "week"
          ? "Last 7 days"
          : "Last 30 days";

    return {
      success: true,
      data: {
        period: periodLabel,
        recipes,
        ingredients,
        totalItemsSold,
      },
    };
  } catch {
    return { success: false, error: "Failed to load sales analysis" };
  }
}

// ─── Revenue Analysis ───────────────────────────────────────

export type RevenueData = {
  period: string;
  totalRevenueInCents: number;
  totalCostInCents: number;
  totalProfitInCents: number;
  profitMargin: number;
  dailyBreakdown: Array<{
    date: string;
    revenueInCents: number;
    costInCents: number;
    profitInCents: number;
  }>;
  topByRevenue: Array<{
    name: string;
    revenueInCents: number;
    costInCents: number;
    profitInCents: number;
    qtySold: number;
  }>;
};

export async function getRevenueAnalysis(
  range: "day" | "week" | "month"
): Promise<ActionResult<RevenueData>> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const now = getCafeToday();

    const startDate = new Date(now);
    if (range === "week") startDate.setUTCDate(startDate.getUTCDate() - 7);
    else if (range === "month") startDate.setUTCDate(startDate.getUTCDate() - 30);

    const entries = await prisma.salesEntry.findMany({
      where: { cafeId, saleDate: { gte: startDate, lte: now }, voidedAt: null },
    });

    const totalRevenueInCents = entries.reduce((s, e) => s + e.revenueInCents, 0);
    const totalCostInCents = entries.reduce((s, e) => s + e.costInCents, 0);
    const totalProfitInCents = totalRevenueInCents - totalCostInCents;
    const profitMargin = totalRevenueInCents > 0 ? Math.round((totalProfitInCents / totalRevenueInCents) * 100) : 0;

    // Daily breakdown
    const dailyMap = new Map<string, { revenue: number; cost: number }>();
    for (const e of entries) {
      const dateKey = e.saleDate.toISOString().slice(0, 10);
      const existing = dailyMap.get(dateKey) ?? { revenue: 0, cost: 0 };
      existing.revenue += e.revenueInCents;
      existing.cost += e.costInCents;
      dailyMap.set(dateKey, existing);
    }

    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, d]) => ({
        date,
        revenueInCents: d.revenue,
        costInCents: d.cost,
        profitInCents: d.revenue - d.cost,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top by revenue
    const recipeMap = new Map<string, { revenue: number; cost: number; qty: number }>();
    for (const e of entries) {
      const existing = recipeMap.get(e.recipeName) ?? { revenue: 0, cost: 0, qty: 0 };
      existing.revenue += e.revenueInCents;
      existing.cost += e.costInCents;
      existing.qty += e.qtySold;
      recipeMap.set(e.recipeName, existing);
    }

    const topByRevenue = Array.from(recipeMap.entries())
      .map(([name, d]) => ({
        name,
        revenueInCents: d.revenue,
        costInCents: d.cost,
        profitInCents: d.revenue - d.cost,
        qtySold: d.qty,
      }))
      .sort((a, b) => b.revenueInCents - a.revenueInCents);

    const periodLabel = range === "day" ? "Today" : range === "week" ? "Last 7 days" : "Last 30 days";

    return {
      success: true,
      data: {
        period: periodLabel,
        totalRevenueInCents,
        totalCostInCents,
        totalProfitInCents,
        profitMargin,
        dailyBreakdown,
        topByRevenue,
      },
    };
  } catch {
    return { success: false, error: "Failed to load revenue data" };
  }
}

// ─── Sales History (per-day with merge + void) ──────────────

export type SalesHistoryRow = {
  recipeName: string;
  qtySold: number;
  revenueInCents: number;
  costInCents: number;
};

export type SalesHistorySubmission = {
  id: string | null; // submissionId; null = legacy (pre-feature) rows
  createdAt: string; // ISO
  createdByName: string;
  voidedAt: string | null;
  rows: SalesHistoryRow[];
};

export type SalesHistoryDay = {
  saleDate: string; // YYYY-MM-DD
  submissions: SalesHistorySubmission[];
  mergedByRecipe: SalesHistoryRow[];
};

export async function getSalesHistory(): Promise<
  ActionResult<SalesHistoryDay[]>
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;
    const isManager = session.user.role === "MANAGER";

    const where: Record<string, unknown> = { cafeId };
    if (!isManager) {
      where.createdById = session.user.id;
    }

    const entries = await prisma.salesEntry.findMany({
      where: where as Parameters<typeof prisma.salesEntry.findMany>[0] extends {
        where?: infer W;
      }
        ? W
        : never,
      include: {
        createdBy: { select: { name: true } },
      },
      orderBy: [{ saleDate: "desc" }, { createdAt: "asc" }],
    });

    // Group by saleDate (YYYY-MM-DD), then by submissionId (NULL collapses
    // into a single synthetic "Legacy" submission per date).
    type BucketRow = SalesHistoryRow & { voidedAt: Date | null };
    const dayMap = new Map<
      string,
      Map<
        string, // submissionId or "__legacy__"
        {
          id: string | null;
          createdAt: Date;
          createdByName: string;
          voidedAt: Date | null;
          rows: BucketRow[];
        }
      >
    >();

    for (const e of entries) {
      const saleDate = e.saleDate.toISOString().slice(0, 10);
      const subKey = e.submissionId ?? "__legacy__";
      let dayBucket = dayMap.get(saleDate);
      if (!dayBucket) {
        dayBucket = new Map();
        dayMap.set(saleDate, dayBucket);
      }
      let sub = dayBucket.get(subKey);
      if (!sub) {
        sub = {
          id: e.submissionId ?? null,
          createdAt: e.createdAt,
          createdByName: e.submissionId ? e.createdBy.name : "Legacy",
          voidedAt: e.voidedAt,
          rows: [],
        };
        dayBucket.set(subKey, sub);
      }
      sub.rows.push({
        recipeName: e.recipeName,
        qtySold: e.qtySold,
        revenueInCents: e.revenueInCents,
        costInCents: e.costInCents,
        voidedAt: e.voidedAt,
      });
      if (e.createdAt < sub.createdAt) sub.createdAt = e.createdAt;
      // Real submissions (non-null submissionId) share void state across all
      // rows; the legacy bucket can be mixed. If any row is live, mark the
      // whole legacy bucket as not-voided so the per-row merge below decides
      // what to count.
      if (sub.voidedAt && !e.voidedAt) {
        sub.voidedAt = null;
      }
    }

    const result: SalesHistoryDay[] = [];
    for (const [saleDate, dayBucket] of dayMap) {
      const submissions: SalesHistorySubmission[] = [];
      const mergeMap = new Map<string, SalesHistoryRow>();

      for (const sub of dayBucket.values()) {
        submissions.push({
          id: sub.id,
          createdAt: sub.createdAt.toISOString(),
          createdByName: sub.createdByName,
          voidedAt: sub.voidedAt ? sub.voidedAt.toISOString() : null,
          rows: sub.rows.map(({ voidedAt: _v, ...r }) => r),
        });

        if (sub.voidedAt) continue;
        for (const row of sub.rows) {
          // Per-row voided check matters for the Legacy bucket which can
          // contain a mix of voided and non-voided rows. For real submissions
          // every row shares the bucket's void state so the check is a no-op.
          if (row.voidedAt) continue;
          const existing = mergeMap.get(row.recipeName);
          if (existing) {
            existing.qtySold += row.qtySold;
            existing.revenueInCents += row.revenueInCents;
            existing.costInCents += row.costInCents;
          } else {
            const { voidedAt: _v, ...rest } = row;
            mergeMap.set(row.recipeName, { ...rest });
          }
        }
      }

      // Sort submissions within a day by createdAt asc.
      submissions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      result.push({
        saleDate,
        submissions,
        mergedByRecipe: Array.from(mergeMap.values()).sort((a, b) =>
          a.recipeName.localeCompare(b.recipeName)
        ),
      });
    }

    // Most recent date first.
    result.sort((a, b) => b.saleDate.localeCompare(a.saleDate));

    return { success: true, data: result };
  } catch {
    return { success: false, error: "Failed to load sales history" };
  }
}

const voidSalesSubmissionSchema = z.object({
  submissionId: z.string().min(1),
  reason: z.string().max(200).optional(),
});

export async function voidSalesSubmission(
  input: z.infer<typeof voidSalesSubmissionSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = voidSalesSubmissionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const { submissionId, reason } = parsed.data;

    // Find all live (non-voided) rows belonging to the submission.
    const rows = await prisma.salesEntry.findMany({
      where: { submissionId, cafeId, voidedAt: null },
      select: { id: true },
    });
    if (rows.length === 0) {
      // Idempotent: already-voided or unknown submission → success no-op.
      return { success: true, data: undefined };
    }

    const today = getCafeToday();

    const affectedIngredientIds = new Set<string>();

    await prisma.$transaction(async (tx) => {
      // Mark every row voided in one update.
      await tx.salesEntry.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: {
          voidedAt: new Date(),
          voidedById: session.user.id,
          voidReason: reason ?? null,
        },
      });

      // Sum LotConsumption qty per ingredient (across LOT-kind rows that
      // still reference an active IngredientPurchase). This is the amount we
      // need to add back to today's InventoryCount per ingredient.
      const consumptions = await tx.lotConsumption.findMany({
        where: {
          sourceType: "SALES",
          sourceId: { in: rows.map((r) => r.id) },
        },
        select: {
          quantityConsumed: true,
          ingredientPurchaseId: true,
          consumptionKind: true,
          ingredientPurchase: {
            select: {
              ingredientSupplier: { select: { ingredientId: true } },
            },
          },
        },
      });

      const restoreByIngredient = new Map<string, number>();
      for (const c of consumptions) {
        // OVER_DEDUCTION rows have no lot to restore — they aren't part of
        // any ingredient's stock. We still need them to count toward the
        // inventory restore though, since the original sale deducted from
        // InventoryCount as if the qty was real. Walk via the ingredient
        // linkage on the purchase row when present; over-deduction rows
        // without a purchase need a fallback path. Here we conservatively
        // skip OVER_DEDUCTION rows (they had no lot stock backing them).
        if (c.consumptionKind !== "LOT") continue;
        const ingredientId =
          c.ingredientPurchase?.ingredientSupplier.ingredientId;
        if (!ingredientId) continue;
        affectedIngredientIds.add(ingredientId);
        restoreByIngredient.set(
          ingredientId,
          (restoreByIngredient.get(ingredientId) ?? 0) + c.quantityConsumed
        );
      }

      // Restore FIFO lots for every voided row. This refills
      // IngredientPurchase.remainingQuantity and deletes the LotConsumption
      // rows (LOT and OVER_DEDUCTION alike).
      for (const row of rows) {
        await applyRestoreFifo(tx, {
          sourceType: "SALES",
          sourceId: row.id,
        });
      }

      // Bump today's InventoryCount per affected ingredient by the leaf
      // qty restored. Recompute `dollarValueInCents` using the same derived-
      // cost source the submit path uses (oldest non-empty lot, or manual
      // override) so the inventory page's qty and dollar value stay in
      // sync after a void.
      const restoreIds = Array.from(restoreByIngredient.keys());
      const [ingredientMeta, oldestLots] = await Promise.all([
        tx.ingredient.findMany({
          where: { id: { in: restoreIds }, cafeId },
          select: { id: true, manualCostOverride: true, costPerUnitInCents: true },
        }),
        tx.ingredientPurchase.findMany({
          where: {
            cafeId,
            remainingQuantity: { gt: 0 },
            ingredientSupplier: { ingredientId: { in: restoreIds } },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            quantity: true,
            totalPriceInCents: true,
            ingredientSupplier: { select: { ingredientId: true } },
          },
        }),
      ]);
      const oldestLotByIngredient = new Map<string, { totalPriceInCents: number; quantity: number }>();
      for (const row of oldestLots) {
        const id = row.ingredientSupplier.ingredientId;
        if (!oldestLotByIngredient.has(id)) {
          oldestLotByIngredient.set(id, {
            totalPriceInCents: row.totalPriceInCents.toNumber(),
            quantity: row.quantity,
          });
        }
      }
      const derivedCostByIngredient = new Map<string, number | null>();
      for (const meta of ingredientMeta) {
        const rawCost = meta.costPerUnitInCents === null ? null : meta.costPerUnitInCents.toNumber();
        derivedCostByIngredient.set(
          meta.id,
          currentCostPerUnit(
            { manualCostOverride: meta.manualCostOverride, costPerUnitInCents: rawCost },
            oldestLotByIngredient.get(meta.id) ?? null
          )
        );
      }

      for (const [ingredientId, addQty] of restoreByIngredient) {
        const count = await tx.inventoryCount.findUnique({
          where: { ingredientId_countDate: { ingredientId, countDate: today } },
        });
        if (!count) continue;
        const newQty = count.quantity + addQty;
        const derived = derivedCostByIngredient.get(ingredientId) ?? null;
        await tx.inventoryCount.update({
          where: { id: count.id },
          data: {
            quantity: newQty,
            dollarValueInCents: derived !== null ? Math.round(newQty * derived) : null,
          },
        });
      }
    });

    // Recheck thresholds outside the transaction (mirror wastage flow).
    for (const ingredientId of affectedIngredientIds) {
      await checkThresholds(cafeId, ingredientId).catch(() => {});
    }

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to void submission" };
  }
}
