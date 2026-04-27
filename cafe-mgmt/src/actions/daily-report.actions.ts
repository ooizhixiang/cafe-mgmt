"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getCafeNow } from "@/lib/format";
import { checkThresholds } from "@/lib/threshold-check";
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
        ingredients: r.ingredients.map((ri) => ({
          ingredientId: ri.ingredientId,
          ingredientName: ri.ingredient.name,
          unit: ri.ingredient.unit,
          quantityPerServing: ri.quantityPerServing,
        })),
        variations: r.variations.map((v) => ({
          id: v.id,
          name: v.name,
          ingredients: v.ingredients.map((vi) => ({
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

    // Calculate total deductions per ingredient
    const deductionMap = new Map<string, { name: string; unit: string; total: number; costPerUnit: number | null }>();

    for (const entry of entries) {
      const recipe = recipes.find((r) => r.id === entry.recipeId);
      if (!recipe) continue;

      // Base recipe ingredients
      for (const ri of recipe.ingredients) {
        const deduction = ri.quantityPerServing * entry.qtySold;
        const existing = deductionMap.get(ri.ingredientId);
        if (existing) {
          existing.total += deduction;
        } else {
          deductionMap.set(ri.ingredientId, {
            name: ri.ingredient.name,
            unit: ri.ingredient.unit,
            total: deduction,
            costPerUnit: ri.ingredient.costPerUnitInCents,
          });
        }
      }

      // Variation-specific ingredients
      if (entry.variationId) {
        const variation = recipe.variations.find((v) => v.id === entry.variationId);
        if (variation) {
          for (const vi of variation.ingredients) {
            const deduction = vi.quantityPerServing * entry.qtySold;
            const existing = deductionMap.get(vi.ingredientId);
            if (existing) {
              existing.total += deduction;
            } else {
              deductionMap.set(vi.ingredientId, {
                name: vi.ingredient.name,
                unit: vi.ingredient.unit,
                total: deduction,
                costPerUnit: vi.ingredient.costPerUnitInCents,
              });
            }
          }
        }
      }
    }

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { timezone: true },
    });
    if (!cafe) return { success: false, error: "Cafe not found" };

    const today = getCafeNow(cafe.timezone);
    today.setHours(0, 0, 0, 0);

    // Persist sales entries and deduct from inventory in a transaction
    const deductions: Array<{ name: string; unit: string; deducted: number; newStock: number | null }> = [];

    await prisma.$transaction(async (tx) => {
      // Save sales entries
      for (const entry of entries) {
        const recipe = recipes.find((r) => r.id === entry.recipeId);
        if (!recipe) continue;
        const variation = entry.variationId
          ? recipe.variations.find((v) => v.id === entry.variationId)
          : null;
        // Calculate cost per serving
        const costPerServing = recipe.ingredients.reduce((sum, ri) => {
          return sum + (ri.subtotalOverrideInCents ?? ri.quantityPerServing * (ri.ingredient.costPerUnitInCents ?? 0));
        }, 0);
        // Get selling price
        const sellingPrice = variation?.sellingPriceInCents ?? recipe.sellingPriceInCents ?? 0;

        await tx.salesEntry.create({
          data: {
            cafeId,
            recipeId: entry.recipeId,
            recipeName: variation ? `${recipe.name} (${variation.name})` : recipe.name,
            qtySold: entry.qtySold,
            revenueInCents: sellingPrice * entry.qtySold,
            costInCents: costPerServing * entry.qtySold,
            saleDate: today,
            createdById: userId,
          },
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
          await tx.inventoryCount.update({
            where: { ingredientId_countDate: { ingredientId, countDate: today } },
            data: {
              quantity: newQty!,
              confirmedById: userId,
              confirmedAt: new Date(),
              dollarValueInCents: info.costPerUnit ? newQty! * info.costPerUnit : null,
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
      await checkThresholds(cafeId, cafe.timezone, ingredientId).catch(() => {});
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

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { timezone: true },
    });
    if (!cafe) return { success: false, error: "Cafe not found" };

    const now = getCafeNow(cafe.timezone);
    now.setHours(0, 0, 0, 0);

    const startDate = new Date(now);
    if (range === "week") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (range === "month") {
      startDate.setDate(startDate.getDate() - 30);
    }

    // Get sales entries for the period
    const salesEntries = await prisma.salesEntry.findMany({
      where: {
        cafeId,
        saleDate: { gte: startDate, lte: now },
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

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { timezone: true },
    });
    if (!cafe) return { success: false, error: "Cafe not found" };

    const now = getCafeNow(cafe.timezone);
    now.setHours(0, 0, 0, 0);

    const startDate = new Date(now);
    if (range === "week") startDate.setDate(startDate.getDate() - 7);
    else if (range === "month") startDate.setDate(startDate.getDate() - 30);

    const entries = await prisma.salesEntry.findMany({
      where: { cafeId, saleDate: { gte: startDate, lte: now } },
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
