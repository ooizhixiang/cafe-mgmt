"use server";

import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { getCafeToday, getWeekStart } from "@/lib/format";
import type { ActionResult } from "@/types";

interface WeekData {
  weekStart: string; // ISO date
  weekEnd: string;
  wastageTotalInCents: number;
  compTotalInCents: number;
}

export async function getWeeklyTotals(): Promise<ActionResult<WeekData[]>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const budget = await prisma.compBudget.findUnique({ where: { cafeId } });
    const resetDay = budget?.resetDay ?? 1; // Default Monday

    const today = getCafeToday();
    const weeks: WeekData[] = [];

    for (let i = 0; i < 5; i++) {
      const refDate = new Date(today);
      refDate.setUTCDate(refDate.getUTCDate() - i * 7);
      const weekStart = getWeekStart(refDate, resetDay);
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

      const [wastageResult, compResult] = await Promise.all([
        prisma.wastageEntry.aggregate({
          where: {
            cafeId,
            deletedAt: null,
            voidedAt: null,
            createdAt: { gte: weekStart, lt: weekEnd },
          },
          _sum: { dollarValueInCents: true },
        }),
        prisma.compEntry.aggregate({
          where: {
            cafeId,
            deletedAt: null,
            voidedAt: null,
            createdAt: { gte: weekStart, lt: weekEnd },
          },
          _sum: { dollarValueInCents: true },
        }),
      ]);

      weeks.push({
        weekStart: weekStart.toISOString().slice(0, 10),
        weekEnd: weekEnd.toISOString().slice(0, 10),
        wastageTotalInCents: wastageResult._sum.dollarValueInCents ?? 0,
        compTotalInCents: compResult._sum.dollarValueInCents ?? 0,
      });
    }

    return { success: true, data: weeks };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to load weekly totals" };
  }
}

export async function getCurrentWeekTotals(): Promise<
  ActionResult<{
    wastageTotalInCents: number;
    compTotalInCents: number;
  }>
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const budget = await prisma.compBudget.findUnique({ where: { cafeId } });
    const resetDay = budget?.resetDay ?? 1;

    const today = getCafeToday();
    const weekStart = getWeekStart(today, resetDay);

    const [wastageResult, compResult] = await Promise.all([
      prisma.wastageEntry.aggregate({
        where: {
          cafeId,
          deletedAt: null,
          voidedAt: null,
          createdAt: { gte: weekStart },
        },
        _sum: { dollarValueInCents: true },
      }),
      prisma.compEntry.aggregate({
        where: {
          cafeId,
          deletedAt: null,
          voidedAt: null,
          createdAt: { gte: weekStart },
        },
        _sum: { dollarValueInCents: true },
      }),
    ]);

    return {
      success: true,
      data: {
        wastageTotalInCents: wastageResult._sum.dollarValueInCents ?? 0,
        compTotalInCents: compResult._sum.dollarValueInCents ?? 0,
      },
    };
  } catch {
    return { success: false, error: "Failed to load totals" };
  }
}
