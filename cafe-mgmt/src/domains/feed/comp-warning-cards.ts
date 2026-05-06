import { prisma } from "@/lib/db";
import { getCafeToday, getWeekStart, formatCents } from "@/lib/format";
import type { FeedCard } from "@/types/feed";

export async function getCompWarningCards(
  cafeId: string
): Promise<FeedCard[]> {
  const budget = await prisma.compBudget.findUnique({ where: { cafeId } });
  if (!budget) return [];

  const today = getCafeToday();
  const weekStart = getWeekStart(today, budget.resetDay);

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
  const percentage = spent / budget.amountInCents;
  const remaining = Math.max(0, budget.amountInCents - spent);

  if (percentage >= 1.0) {
    return [
      {
        id: "comp-warning-exceeded",
        variant: "alert",
        priority: 1,
        title: "Comp budget exceeded",
        subtitle: `${formatCents(remaining)} remaining this week`,
        borderColor: "var(--color-urgent, red)",
        data: { type: "COMP_WARNING", percentage: Math.round(percentage * 100) },
        createdAt: new Date().toISOString(),
      },
    ];
  }

  if (percentage >= 0.8) {
    return [
      {
        id: "comp-warning-80",
        variant: "alert",
        priority: 3,
        title: `Comp budget at ${Math.round(percentage * 100)}%`,
        subtitle: `${formatCents(remaining)} remaining this week`,
        borderColor: "var(--color-warning, amber)",
        data: { type: "COMP_WARNING", percentage: Math.round(percentage * 100) },
        createdAt: new Date().toISOString(),
      },
    ];
  }

  return [];
}
