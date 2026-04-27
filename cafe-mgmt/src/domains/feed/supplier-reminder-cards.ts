import { prisma } from "@/lib/db";
import { getCafeNow } from "@/lib/format";
import type { FeedCard } from "@/types/feed";

export async function getSupplierReminderCards(
  cafeId: string,
  timezone: string
): Promise<FeedCard[]> {
  const now = getCafeNow(timezone);

  const suppliers = await prisma.supplier.findMany({
    where: { cafeId },
    select: {
      id: true,
      name: true,
      lastOrderDate: true,
      reminderDays: true,
    },
  });

  const cards: FeedCard[] = [];

  for (const supplier of suppliers) {
    const needsReminder =
      supplier.lastOrderDate === null ||
      daysSince(supplier.lastOrderDate, now) >= supplier.reminderDays;

    if (needsReminder) {
      const daysSinceOrder = supplier.lastOrderDate
        ? daysSince(supplier.lastOrderDate, now)
        : null;

      cards.push({
        id: `supplier-reminder-${supplier.id}`,
        variant: "alert",
        priority: 3,
        title: `Call ${supplier.name} today`,
        subtitle: daysSinceOrder !== null
          ? `Last order: ${daysSinceOrder} days ago`
          : "No orders recorded yet",
        borderColor: "var(--color-info)",
        data: {
          type: "SUPPLIER_REMINDER",
          supplierId: supplier.id,
          actionRoute: "/suppliers",
        },
        createdAt: new Date().toISOString(),
      });
    }
  }

  return cards;
}

function daysSince(date: Date, now: Date): number {
  const ms = now.getTime() - date.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
