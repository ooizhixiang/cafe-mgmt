import { prisma } from "@/lib/db";
import { getCafeNow } from "@/lib/format";

/**
 * Deduct inventory quantity, capping at 0 (never negative).
 * Must be called within a Prisma transaction.
 */
export async function deductInventory(
  ingredientId: string,
  quantity: number,
  cafeId: string,
  timezone: string
) {
  const today = getCafeNow(timezone);
  today.setHours(0, 0, 0, 0);

  const currentCount = await prisma.inventoryCount.findUnique({
    where: {
      ingredientId_countDate: {
        ingredientId,
        countDate: today,
      },
    },
  });

  if (!currentCount) return;

  const newQuantity = Math.max(0, currentCount.quantity - quantity);

  await prisma.inventoryCount.update({
    where: { id: currentCount.id },
    data: {
      quantity: newQuantity,
      updatedAt: new Date(),
    },
  });

  return { previousQty: currentCount.quantity, newQty: newQuantity };
}

/**
 * Restore inventory quantity (for undo/void operations).
 * Must be called within a Prisma transaction.
 */
export async function restoreInventory(
  ingredientId: string,
  quantity: number,
  cafeId: string,
  timezone: string
) {
  const today = getCafeNow(timezone);
  today.setHours(0, 0, 0, 0);

  const currentCount = await prisma.inventoryCount.findUnique({
    where: {
      ingredientId_countDate: {
        ingredientId,
        countDate: today,
      },
    },
  });

  if (!currentCount) return;

  await prisma.inventoryCount.update({
    where: { id: currentCount.id },
    data: {
      quantity: currentCount.quantity + quantity,
      updatedAt: new Date(),
    },
  });
}
