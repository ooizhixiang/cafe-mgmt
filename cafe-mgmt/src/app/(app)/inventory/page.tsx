import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { InventoryList } from "@/components/inventory/inventory-list";
import { getCafeNow } from "@/lib/format";
import Link from "next/link";

export default async function InventoryPage() {
  const session = await requireAuth();
  const cafeId = session.user.cafeId;
  const userRole = session.user.role;

  const cafe = await prisma.cafe.findUnique({
    where: { id: cafeId },
    select: { timezone: true },
  });

  if (!cafe) {
    return <div className="p-[var(--space-4)]">Cafe not found</div>;
  }

  const today = getCafeNow(cafe.timezone);
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const [ingredients, suppliers] = await Promise.all([
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
            href="/settings/ingredients"
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

  const mapped = ingredients.map((ing) => {
    const todayEntry = ing.inventoryCounts.find(
      (c) => c.countDate.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)
    );
    const yesterdayEntry = ing.inventoryCounts.find(
      (c) => c.countDate.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10)
    );

    return {
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      category: ing.category,
      isPinned: ing.isPinned,
      snapIncrement: ing.snapIncrement,
      containerProfile: ing.containerProfile,
      costPerUnitInCents: ing.costPerUnitInCents,
      unitsPerContainer: ing.unitsPerContainer,
      lowStockThreshold: ing.lowStockThreshold,
      ingredientSuppliers: ing.ingredientSuppliers.map((link) => ({
        id: link.id,
        supplierId: link.supplierId,
        supplierName: link.supplier.name,
        priceInCents: link.priceInCents,
        unit: link.unit,
      })),
      ingredientPurchases: purchases
        .filter((p) => p.ingredientSupplier.ingredientId === ing.id)
        .map((p) => ({
          id: p.id,
          ingredientSupplierId: p.ingredientSupplierId,
          supplierName: p.ingredientSupplier.supplier.name,
          quantity: p.quantity,
          unit: p.unit,
          totalPriceInCents: p.totalPriceInCents,
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
      />
    </div>
  );
}
