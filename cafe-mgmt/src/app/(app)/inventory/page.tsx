import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { InventoryList } from "@/components/inventory/inventory-list";
import { getCafeToday } from "@/lib/format";
import { currentCostPerUnit } from "@/lib/fifo";
import Link from "next/link";

export default async function InventoryPage() {
  const session = await requireAuth();
  const cafeId = session.user.cafeId;
  const userRole = session.user.role;

  const today = getCafeToday();

  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const [ingredients, suppliers, cafeForUnits] = await Promise.all([
    prisma.ingredient.findMany({
      where: { cafeId },
      orderBy: [{ isPinned: "desc" }, { displayOrder: "asc" }],
      include: {
        ingredientSuppliers: {
          include: { supplier: { select: { id: true, name: true } } },
        },
        inventoryCounts: {
          where: { countDate: { in: [today, yesterday] } },
          orderBy: { countDate: "desc" },
        },
      },
    }),
    prisma.supplier.findMany({
      where: { cafeId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { enabledUnits: true },
    }),
  ]);

  if (ingredients.length === 0) {
    return (
      <div className="p-[var(--space-4)]">
        <h1 className="text-headline mb-[var(--space-4)]">Inventory</h1>
        <div className="rounded-lg border border-[var(--border-default)] p-[var(--space-6)] text-center">
          <p className="text-body font-medium mb-[var(--space-2)]">No ingredients yet</p>
          <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">
            Add ingredients to start tracking your inventory.
          </p>
          <Link
            href="/ingredients"
            className="inline-block rounded-lg bg-[var(--color-info)] px-5 py-2.5 text-body font-medium text-white"
          >
            Add ingredients
          </Link>
        </div>
      </div>
    );
  }

  const supplierLinkIds = ingredients.flatMap((i) =>
    i.ingredientSuppliers.map((l) => l.id)
  );
  const purchases =
    supplierLinkIds.length === 0
      ? []
      : await prisma.ingredientPurchase.findMany({
          where: { ingredientSupplierId: { in: supplierLinkIds } },
          orderBy: { createdAt: "desc" },
          include: {
            ingredientSupplier: {
              select: {
                id: true,
                ingredientId: true,
                supplier: { select: { name: true } },
              },
            },
          },
        });

  // Oldest non-empty lot per ingredient — drives the derived cost displayed
  // when manualCostOverride is false. Tie-break on id ascending to match FIFO
  // consume's `[createdAt asc, id asc]` ordering — otherwise lots created in
  // the same millisecond could pick a different "oldest" here than the
  // consume path.
  const oldestLotByIngredient = new Map<
    string,
    { totalPriceInCents: number; quantity: number; createdAt: Date; id: string }
  >();
  for (const purchase of purchases) {
    if (purchase.remainingQuantity <= 0) continue;
    const ingId = purchase.ingredientSupplier.ingredientId;
    const existing = oldestLotByIngredient.get(ingId);
    const isOlder =
      !existing ||
      purchase.createdAt < existing.createdAt ||
      (purchase.createdAt.getTime() === existing.createdAt.getTime() &&
        purchase.id < existing.id);
    if (isOlder) {
      oldestLotByIngredient.set(ingId, {
        totalPriceInCents: purchase.totalPriceInCents.toNumber(),
        quantity: purchase.quantity,
        createdAt: purchase.createdAt,
        id: purchase.id,
      });
    }
  }

  const mapped = ingredients.map((ing) => {
    const todayEntry = ing.inventoryCounts.find(
      (c) => c.countDate.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)
    );
    const yesterdayEntry = ing.inventoryCounts.find(
      (c) => c.countDate.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10)
    );

    const rawCost =
      ing.costPerUnitInCents === null ? null : ing.costPerUnitInCents.toNumber();
    const derivedCost = currentCostPerUnit(
      {
        manualCostOverride: ing.manualCostOverride,
        costPerUnitInCents: rawCost,
      },
      oldestLotByIngredient.get(ing.id) ?? null
    );

    return {
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      displayUnit: ing.displayUnit,
      category: ing.category,
      isPinned: ing.isPinned,
      snapIncrement: ing.snapIncrement,
      containerProfile: ing.containerProfile,
      costPerUnitInCents: rawCost,
      derivedCostPerUnitInCents: derivedCost,
      unitsPerContainer: ing.unitsPerContainer,
      lowStockThreshold: ing.lowStockThreshold,
      ingredientSuppliers: ing.ingredientSuppliers.map((link) => ({
        id: link.id,
        supplierId: link.supplierId,
        supplierName: link.supplier.name,
        priceInCents: link.priceInCents.toNumber(),
        unit: link.unit,
      })),
      ingredientPurchases: purchases
        .filter((p) => p.ingredientSupplier.ingredientId === ing.id)
        .map((p) => ({
          id: p.id,
          ingredientSupplierId: p.ingredientSupplierId,
          supplierName: p.ingredientSupplier.supplier.name,
          quantity: p.quantity,
          remainingQuantity: p.remainingQuantity,
          unit: p.unit,
          totalPriceInCents: p.totalPriceInCents.toNumber(),
          createdAt: p.createdAt.toISOString(),
        })),
      todayCount: todayEntry?.quantity ?? null,
      todayUpdatedAt: todayEntry?.updatedAt.toISOString() ?? null,
      previousCount: yesterdayEntry?.quantity ?? null,
    };
  });

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-1)]">Inventory</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">Track and manage your stock</p>
      <InventoryList
        initialIngredients={mapped}
        suppliers={suppliers}
        userRole={userRole}
        enabledUnits={cafeForUnits?.enabledUnits ?? []}
      />
    </div>
  );
}
