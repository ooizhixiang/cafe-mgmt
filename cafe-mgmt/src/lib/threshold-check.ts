import { prisma } from "@/lib/db";
import { getCafeNow } from "@/lib/format";

/**
 * Check ingredient thresholds and create/resolve FeedAlerts.
 */
export async function checkThresholds(
  cafeId: string,
  ingredientId?: string
) {
  const today = getCafeNow();
  today.setHours(0, 0, 0, 0);

  const ingredients = await prisma.ingredient.findMany({
    where: {
      ...(ingredientId ? { id: ingredientId } : {}),
      cafeId,
      lowStockThreshold: { not: null },
    },
    select: {
      id: true,
      name: true,
      lowStockThreshold: true,
      inventoryCounts: {
        where: { countDate: today },
        select: { quantity: true },
        take: 1,
      },
    },
  });

  for (const ingredient of ingredients) {
    if (ingredient.lowStockThreshold === null) continue;

    const currentQty = ingredient.inventoryCounts[0]?.quantity;
    if (currentQty === undefined) continue;

    const isLow = currentQty <= ingredient.lowStockThreshold;

    // Find existing active alert
    const existingAlert = await prisma.feedAlert.findFirst({
      where: {
        cafeId,
        ingredientId: ingredient.id,
        type: "LOW_STOCK",
        resolvedAt: null,
      },
    });

    if (isLow && !existingAlert) {
      // Create new alert
      await prisma.feedAlert.create({
        data: {
          cafeId,
          type: "LOW_STOCK",
          ingredientId: ingredient.id,
          title: `Low stock: ${ingredient.name}`,
          message: `${ingredient.name} is at ${currentQty} (threshold: ${ingredient.lowStockThreshold})`,
          severity: currentQty === 0 ? "URGENT" : "WARNING",
        },
      });
    } else if (!isLow && existingAlert) {
      // Resolve alert
      await prisma.feedAlert.update({
        where: { id: existingAlert.id },
        data: { resolvedAt: new Date() },
      });
    }
  }
}
