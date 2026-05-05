"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { getCafeNow } from "@/lib/format";
import { calculateDollarValue } from "@/lib/dollar-attribution";
import { UNDO_TIMEOUT_MS } from "@/lib/constants";
import {
  applyConsumeFifo,
  applyRestoreFifo,
  encodeOverDeductionError,
  getAvailableQty,
  hasAnyLot,
  LOT_RACE,
} from "@/lib/lot-consume";
import type { ActionResult } from "@/types";

// ─── Schemas ────────────────────────────────────────────────

const logCompSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: z.number().int().min(1),
  reason: z.string().min(1, "Reason is required").max(200),
  confirmOverDeduction: z.boolean().optional(),
});

const updateBudgetSchema = z.object({
  amountInCents: z.number().int().min(1),
  resetDay: z.number().int().min(0).max(6),
});

// ─── Budget Helpers ─────────────────────────────────────────

function getWeekStart(now: Date, resetDay: number): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const currentDay = d.getDay();
  const diff = (currentDay - resetDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

async function calculateBudgetRemaining(cafeId: string, timezone: string) {
  const budget = await prisma.compBudget.findUnique({ where: { cafeId } });
  if (!budget) return null;

  const now = getCafeNow(timezone);
  const weekStart = getWeekStart(now, budget.resetDay);

  const result = await prisma.compEntry.aggregate({
    where: {
      cafeId,
      deletedAt: null,
      voidedAt: null,
      createdAt: { gte: weekStart },
    },
    _sum: { dollarValueInCents: true },
  });

  const spent = result._sum.dollarValueInCents ?? 0;
  return {
    remainingInCents: budget.amountInCents - spent,
    budgetInCents: budget.amountInCents,
    spentInCents: spent,
    resetDay: budget.resetDay,
  };
}

// ─── Comp Logging (Story 3.8) ───────────────────────────────

export async function logComp(
  input: z.infer<typeof logCompSchema>
): Promise<
  ActionResult<{
    id: string;
    dollarValueInCents: number;
    budgetRemainingInCents: number | null;
  }>
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;
    const parsed = logCompSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const { ingredientId, quantity, reason, confirmOverDeduction } = parsed.data;

    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, cafeId },
    });
    if (!ingredient) {
      return { success: false, error: "Ingredient not found" };
    }

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { timezone: true },
    });
    if (!cafe) return { success: false, error: "Cafe not found" };

    const dollarValueInCents = calculateDollarValue(ingredient, quantity);

    // Sentinel thrown inside the txn when the over-deduction confirm dialog
    // should be surfaced. Carries the `availableQty` snapshot read inside the
    // txn so the client sees a value consistent with the would-be consume.
    const OVER_DEDUCTION_THROW = "OVER_DEDUCTION_THROW";
    const NO_LOTS_THROW = "NO_LOTS_THROW";
    let availableLotQtySnapshot = 0;

    let entry;
    try {
      entry = await prisma.$transaction(async (tx) => {
        // Pre-flight FIFO over-deduction check INSIDE the transaction so the
        // available-qty read and the consume share the same snapshot (avoids
        // TOCTOU between pre-flight and consume).
        const availableLotQty = await getAvailableQty(tx, ingredientId, cafeId);
        if (availableLotQty < quantity) {
          // No purchase history at all → block regardless of confirm flag.
          // The OVER_DEDUCTION row would be priced at $0 (no most-recent lot),
          // silently losing cost data.
          const anyLot = await hasAnyLot(tx, ingredientId, cafeId);
          if (!anyLot) {
            throw new Error(NO_LOTS_THROW);
          }
          if (!confirmOverDeduction) {
            availableLotQtySnapshot = availableLotQty;
            throw new Error(OVER_DEDUCTION_THROW);
          }
        }

        const created = await tx.compEntry.create({
          data: {
            cafeId,
            ingredientId,
            quantity,
            reason,
            dollarValueInCents,
            createdById: session.user.id,
          },
        });
        await applyConsumeFifo(tx, {
          cafeId,
          ingredientId,
          requested: quantity,
          sourceType: "COMP",
          sourceId: created.id,
        });
        return created;
      });
    } catch (e) {
      if (e instanceof Error && e.message === NO_LOTS_THROW) {
        return {
          success: false,
          error: "NO_LOTS_RECORDED",
        };
      }
      if (e instanceof Error && e.message === OVER_DEDUCTION_THROW) {
        return {
          success: false,
          error: encodeOverDeductionError({
            availableQty: availableLotQtySnapshot,
            requestedQty: quantity,
          }),
        };
      }
      if (e instanceof Error && e.message === LOT_RACE) {
        return {
          success: false,
          error: "Lot updated by another action — please retry",
        };
      }
      throw e;
    }

    const budgetInfo = await calculateBudgetRemaining(cafeId, cafe.timezone);

    return {
      success: true,
      data: {
        id: entry.id,
        dollarValueInCents,
        budgetRemainingInCents: budgetInfo?.remainingInCents ?? null,
      },
    };
  } catch {
    return { success: false, error: "Failed to log comp" };
  }
}

export async function undoComp(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    // Look up first to disambiguate "not found" vs "already voided".
    const entry = await prisma.compEntry.findFirst({
      where: { id, cafeId, deletedAt: null },
    });
    if (!entry) return { success: false, error: "Entry not found" };
    if (entry.voidedAt) return { success: false, error: "Already voided" };

    const elapsed = Date.now() - entry.createdAt.getTime();
    if (elapsed > UNDO_TIMEOUT_MS) {
      return { success: false, error: "Undo window has expired" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.compEntry.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await applyRestoreFifo(tx, { sourceType: "COMP", sourceId: id });
    });

    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Failed to undo comp" };
  }
}

// ─── Comp Log ───────────────────────────────────────────────

export async function getCompLog(filters?: {
  ingredientId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<
  ActionResult<
    Array<{
      id: string;
      ingredientName: string;
      quantity: number;
      unit: string;
      reason: string;
      dollarValueInCents: number;
      createdByName: string;
      createdAt: string;
      flaggedForReview: boolean;
      voidedAt: string | null;
    }>
  >
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const where: Record<string, unknown> = { cafeId, deletedAt: null };

    if (filters?.ingredientId) where.ingredientId = filters.ingredientId;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {
        ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
      };
    }

    const entries = await prisma.compEntry.findMany({
      where: where as Parameters<typeof prisma.compEntry.findMany>[0] extends { where?: infer W } ? W : never,
      include: {
        ingredient: { select: { name: true, unit: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return {
      success: true,
      data: entries.map((e) => ({
        id: e.id,
        ingredientName: e.ingredient.name,
        quantity: e.quantity,
        unit: e.ingredient.unit,
        reason: e.reason,
        dollarValueInCents: e.dollarValueInCents,
        createdByName: e.createdBy.name,
        createdAt: e.createdAt.toISOString(),
        flaggedForReview: e.flaggedForReview,
        voidedAt: e.voidedAt?.toISOString() ?? null,
      })),
    };
  } catch {
    return { success: false, error: "Failed to load comp log" };
  }
}

// ─── Budget Management (Story 3.8) ─────────────────────────

export async function getCompBudget(): Promise<
  ActionResult<{
    amountInCents: number;
    resetDay: number;
  } | null>
> {
  try {
    const session = await requireAuth();
    const budget = await prisma.compBudget.findUnique({
      where: { cafeId: session.user.cafeId },
    });

    return {
      success: true,
      data: budget
        ? { amountInCents: budget.amountInCents, resetDay: budget.resetDay }
        : null,
    };
  } catch {
    return { success: false, error: "Failed to load budget" };
  }
}

export async function getCompBudgetRemaining(): Promise<
  ActionResult<{
    remainingInCents: number;
    budgetInCents: number;
    spentInCents: number;
  } | null>
> {
  try {
    const session = await requireAuth();
    const cafe = await prisma.cafe.findUnique({
      where: { id: session.user.cafeId },
      select: { timezone: true },
    });
    if (!cafe) return { success: false, error: "Cafe not found" };

    const info = await calculateBudgetRemaining(session.user.cafeId, cafe.timezone);
    if (!info) return { success: true, data: null };

    return {
      success: true,
      data: {
        remainingInCents: info.remainingInCents,
        budgetInCents: info.budgetInCents,
        spentInCents: info.spentInCents,
      },
    };
  } catch {
    return { success: false, error: "Failed to load budget remaining" };
  }
}

export async function updateCompBudget(
  input: z.infer<typeof updateBudgetSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = updateBudgetSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    await prisma.compBudget.upsert({
      where: { cafeId },
      create: {
        cafeId,
        amountInCents: parsed.data.amountInCents,
        resetDay: parsed.data.resetDay,
      },
      update: {
        amountInCents: parsed.data.amountInCents,
        resetDay: parsed.data.resetDay,
      },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update budget" };
  }
}

// ─── Flag & Void (Story 3.8) ───────────────────────────────

export async function flagCompForReview(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const entry = await prisma.compEntry.findFirst({
      where: { id, cafeId, deletedAt: null },
    });
    if (!entry) return { success: false, error: "Entry not found" };

    await prisma.compEntry.update({
      where: { id },
      data: { flaggedForReview: true },
    });

    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Failed to flag comp" };
  }
}

export async function dismissFlag(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const entry = await prisma.compEntry.findFirst({
      where: { id, cafeId },
    });
    if (!entry) return { success: false, error: "Entry not found" };

    await prisma.compEntry.update({
      where: { id },
      data: { flaggedForReview: false },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to dismiss flag" };
  }
}

export async function voidComp(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const entry = await prisma.compEntry.findFirst({
      where: { id, cafeId, deletedAt: null, voidedAt: null },
    });
    if (!entry) return { success: false, error: "Entry not found" };

    await prisma.$transaction(async (tx) => {
      await tx.compEntry.update({
        where: { id },
        data: {
          voidedAt: new Date(),
          voidedById: session.user.id,
        },
      });
      await applyRestoreFifo(tx, { sourceType: "COMP", sourceId: id });
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to void comp" };
  }
}
