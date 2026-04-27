"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { getCafeNow } from "@/lib/format";
import { calculateDollarValue } from "@/lib/dollar-attribution";
import { checkThresholds } from "@/lib/threshold-check";
import { UNDO_TIMEOUT_MS } from "@/lib/constants";
import type { ActionResult } from "@/types";

// ─── Schemas ────────────────────────────────────────────────

const logWastageSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: z.number().int().min(1),
  reason: z.enum(["SPILLED", "EXPIRED", "INCORRECT"]),
});

const voidWastageSchema = z.object({
  id: z.string().min(1),
  voidReason: z.string().min(1, "Void reason is required").max(200),
});

const correctWastageSchema = z.object({
  id: z.string().min(1),
  newQuantity: z.number().int().min(1),
});

// ─── Wastage Logging (Story 3.5 & 3.6) ─────────────────────

export async function logWastage(
  input: z.infer<typeof logWastageSchema>
): Promise<
  ActionResult<{
    id: string;
    dollarValueInCents: number;
    previousQty: number | null;
    newQty: number | null;
  }>
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;
    const parsed = logWastageSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const { ingredientId, quantity, reason } = parsed.data;

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
    const today = getCafeNow(cafe.timezone);
    today.setHours(0, 0, 0, 0);

    // Atomic: create wastage entry + deduct inventory
    const currentCount = await prisma.inventoryCount.findUnique({
      where: {
        ingredientId_countDate: { ingredientId, countDate: today },
      },
    });

    const previousQty = currentCount?.quantity ?? null;

    // Reject if wastage exceeds available stock
    if (previousQty !== null && quantity > previousQty) {
      return {
        success: false,
        error: `Only ${previousQty} in stock. Cannot log ${quantity} as wastage.`,
      };
    }

    const newQty = previousQty !== null ? previousQty - quantity : null;

    const entry = await prisma.$transaction(async (tx) => {
      const wastage = await tx.wastageEntry.create({
        data: {
          cafeId,
          ingredientId,
          quantity,
          reason,
          dollarValueInCents,
          createdById: session.user.id,
        },
      });

      // Auto-deduct from inventory if count exists for today
      if (currentCount && newQty !== null) {
        await tx.inventoryCount.update({
          where: { id: currentCount.id },
          data: { quantity: newQty },
        });
      }

      return wastage;
    });

    // Check thresholds after deduction
    await checkThresholds(cafeId, cafe.timezone, ingredientId);

    return {
      success: true,
      data: {
        id: entry.id,
        dollarValueInCents,
        previousQty,
        newQty,
      },
    };
  } catch {
    return { success: false, error: "Failed to log wastage" };
  }
}

export async function undoWastage(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const entry = await prisma.wastageEntry.findFirst({
      where: { id, cafeId, deletedAt: null },
    });
    if (!entry) {
      return { success: false, error: "Entry not found" };
    }

    // Check undo window
    const elapsed = Date.now() - entry.createdAt.getTime();
    if (elapsed > UNDO_TIMEOUT_MS) {
      return { success: false, error: "Undo window has expired" };
    }

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { timezone: true },
    });
    if (!cafe) return { success: false, error: "Cafe not found" };

    const today = getCafeNow(cafe.timezone);
    today.setHours(0, 0, 0, 0);

    await prisma.$transaction(async (tx) => {
      // Soft-delete the wastage entry
      await tx.wastageEntry.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // Restore inventory
      const currentCount = await tx.inventoryCount.findUnique({
        where: {
          ingredientId_countDate: {
            ingredientId: entry.ingredientId,
            countDate: today,
          },
        },
      });

      if (currentCount) {
        await tx.inventoryCount.update({
          where: { id: currentCount.id },
          data: { quantity: currentCount.quantity + entry.quantity },
        });
      }
    });

    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Failed to undo wastage" };
  }
}

// ─── Wastage Log & History ──────────────────────────────────

export async function getWastageLog(filters?: {
  reason?: string;
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
      voidedAt: string | null;
      voidReason: string | null;
      originalQuantity: number | null;
      correctedQuantity: number | null;
    }>
  >
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const where: Record<string, unknown> = {
      cafeId,
      deletedAt: null,
    };

    if (filters?.reason) {
      where.reason = filters.reason;
    }
    if (filters?.ingredientId) {
      where.ingredientId = filters.ingredientId;
    }
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {
        ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
      };
    }

    const entries = await prisma.wastageEntry.findMany({
      where: where as Parameters<typeof prisma.wastageEntry.findMany>[0] extends { where?: infer W } ? W : never,
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
        voidedAt: e.voidedAt?.toISOString() ?? null,
        voidReason: e.voidReason,
        originalQuantity: e.originalQuantity,
        correctedQuantity: e.correctedQuantity,
      })),
    };
  } catch {
    return { success: false, error: "Failed to load wastage log" };
  }
}

// ─── Manager Void & Correct (Story 3.7) ─────────────────────

export async function voidWastage(
  input: z.infer<typeof voidWastageSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = voidWastageSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const entry = await prisma.wastageEntry.findFirst({
      where: { id: parsed.data.id, cafeId, deletedAt: null, voidedAt: null },
    });
    if (!entry) {
      return { success: false, error: "Entry not found" };
    }

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { timezone: true },
    });
    if (!cafe) return { success: false, error: "Cafe not found" };

    const today = getCafeNow(cafe.timezone);
    today.setHours(0, 0, 0, 0);

    await prisma.$transaction(async (tx) => {
      await tx.wastageEntry.update({
        where: { id: entry.id },
        data: {
          voidedAt: new Date(),
          voidedById: session.user.id,
          voidReason: parsed.data.voidReason,
        },
      });

      // Restore inventory
      const currentCount = await tx.inventoryCount.findUnique({
        where: {
          ingredientId_countDate: {
            ingredientId: entry.ingredientId,
            countDate: today,
          },
        },
      });

      if (currentCount) {
        await tx.inventoryCount.update({
          where: { id: currentCount.id },
          data: { quantity: currentCount.quantity + entry.quantity },
        });
      }
    });

    // Recheck thresholds
    await checkThresholds(cafeId, cafe.timezone, entry.ingredientId);

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to void wastage" };
  }
}

export async function correctWastage(
  input: z.infer<typeof correctWastageSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = correctWastageSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const entry = await prisma.wastageEntry.findFirst({
      where: { id: parsed.data.id, cafeId, deletedAt: null, voidedAt: null },
      include: { ingredient: true },
    });
    if (!entry) {
      return { success: false, error: "Entry not found" };
    }

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { timezone: true },
    });
    if (!cafe) return { success: false, error: "Cafe not found" };

    const today = getCafeNow(cafe.timezone);
    today.setHours(0, 0, 0, 0);

    const quantityDifference = entry.quantity - parsed.data.newQuantity;
    const newDollarValue = calculateDollarValue(entry.ingredient, parsed.data.newQuantity);

    await prisma.$transaction(async (tx) => {
      await tx.wastageEntry.update({
        where: { id: entry.id },
        data: {
          originalQuantity: entry.quantity,
          correctedQuantity: parsed.data.newQuantity,
          quantity: parsed.data.newQuantity,
          dollarValueInCents: newDollarValue,
        },
      });

      // Adjust inventory by difference
      if (quantityDifference !== 0) {
        const currentCount = await tx.inventoryCount.findUnique({
          where: {
            ingredientId_countDate: {
              ingredientId: entry.ingredientId,
              countDate: today,
            },
          },
        });

        if (currentCount) {
          await tx.inventoryCount.update({
            where: { id: currentCount.id },
            data: {
              quantity: Math.max(0, currentCount.quantity + quantityDifference),
            },
          });
        }
      }
    });

    await checkThresholds(cafeId, cafe.timezone, entry.ingredientId);

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to correct wastage" };
  }
}
