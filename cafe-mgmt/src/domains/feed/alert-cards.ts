import { prisma } from "@/lib/db";
import type { FeedCard } from "@/types/feed";

export async function getAlertCards(cafeId: string): Promise<FeedCard[]> {
  const alerts = await prisma.feedAlert.findMany({
    where: {
      cafeId,
      resolvedAt: null,
    },
    include: {
      ingredient: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return alerts.map((alert) => ({
    id: `alert-${alert.id}`,
    variant: "alert" as const,
    priority: alert.severity === "URGENT" ? 1 : 3,
    title: alert.title,
    subtitle: alert.message,
    borderColor: alert.severity === "URGENT" ? "var(--color-urgent, red)" : "var(--color-warning, amber)",
    data: {
      alertId: alert.id,
      type: alert.type,
      ingredientId: alert.ingredientId,
      ingredientName: alert.ingredient?.name,
      actionRoute: "/ingredients",
    },
    createdAt: alert.createdAt.toISOString(),
  }));
}
