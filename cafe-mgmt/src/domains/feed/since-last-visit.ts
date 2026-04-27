import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/format";
import type { FeedCard } from "@/types/feed";

/**
 * Generates a "Since Last Visit" summary card for the user.
 * Shows what happened since they last opened the app.
 */
export async function getSinceLastVisitCard(
  cafeId: string,
  userId: string
): Promise<FeedCard[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastSeenAt: true },
  });

  if (!user?.lastSeenAt) return [];

  const since = user.lastSeenAt;
  const now = new Date();

  // Only show if at least 1 hour has passed
  const hoursSince = (now.getTime() - since.getTime()) / (1000 * 60 * 60);
  if (hoursSince < 1) return [];

  // Aggregate what happened since lastSeenAt
  const [completedItems, wastageEntries, compEntries, inventoryCounts] =
    await Promise.all([
      prisma.dailyChecklistItem.count({
        where: {
          dailyChecklist: { cafeId },
          completedAt: { gte: since },
        },
      }),
      prisma.wastageEntry.aggregate({
        where: {
          cafeId,
          deletedAt: null,
          createdAt: { gte: since },
        },
        _count: true,
        _sum: { dollarValueInCents: true },
      }),
      prisma.compEntry.aggregate({
        where: {
          cafeId,
          deletedAt: null,
          createdAt: { gte: since },
        },
        _count: true,
        _sum: { dollarValueInCents: true },
      }),
      prisma.inventoryCount.count({
        where: {
          cafeId,
          confirmedAt: { gte: since },
        },
      }),
    ]);

  const parts: string[] = [];

  if (completedItems > 0) {
    parts.push(`${completedItems} checklist item${completedItems > 1 ? "s" : ""} completed`);
  }
  if (wastageEntries._count > 0) {
    const total = wastageEntries._sum.dollarValueInCents ?? 0;
    parts.push(
      `${wastageEntries._count} wastage entr${wastageEntries._count > 1 ? "ies" : "y"} (${formatCents(total)})`
    );
  }
  if (compEntries._count > 0) {
    const total = compEntries._sum.dollarValueInCents ?? 0;
    parts.push(
      `${compEntries._count} comp entr${compEntries._count > 1 ? "ies" : "y"} (${formatCents(total)})`
    );
  }
  if (inventoryCounts > 0) {
    parts.push(`${inventoryCounts} inventory count${inventoryCounts > 1 ? "s" : ""} updated`);
  }

  if (parts.length === 0) return [];

  // Format time label
  const hours = Math.floor(hoursSince);
  const timeLabel =
    hours >= 24
      ? `${Math.floor(hours / 24)}d ago`
      : `${hours}h ago`;

  return [
    {
      id: "since-last-visit",
      variant: "summary",
      priority: 4,
      title: `Since ${timeLabel}`,
      subtitle: parts.join(", "),
      borderColor: "var(--color-muted)",
      data: {
        type: "SINCE_LAST_VISIT",
        sinceTimestamp: since.toISOString(),
        completedItems,
        wastageCount: wastageEntries._count,
        compCount: compEntries._count,
        inventoryCounts,
      },
      createdAt: now.toISOString(),
    },
  ];
}
