import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { IngredientConfig } from "@/components/settings/ingredient-config";
import Link from "next/link";

export default async function IngredientSettingsPage() {
  const session = await requireRole("MANAGER");

  const [ingredientsRaw, suppliers] = await Promise.all([
    prisma.ingredient.findMany({
      where: { cafeId: session.user.cafeId },
      orderBy: [{ isPinned: "desc" }, { displayOrder: "asc" }],
      select: {
        id: true,
        name: true,
        unit: true,
        costPerUnitInCents: true,
        snapIncrement: true,
        containerProfile: true,
        category: true,
        lowStockThreshold: true,
        unitsPerContainer: true,
        isPinned: true,
        ingredientSuppliers: {
          include: { supplier: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.supplier.findMany({
      where: { cafeId: session.user.cafeId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const ingredientIds = ingredientsRaw.map((i) => i.id);
  const supplierLinkIds = ingredientsRaw.flatMap((i) =>
    i.ingredientSuppliers.map((l) => l.id)
  );

  const purchases =
    ingredientIds.length === 0 || supplierLinkIds.length === 0
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

  const ingredients = ingredientsRaw.map((ing) => ({
    id: ing.id,
    name: ing.name,
    unit: ing.unit,
    costPerUnitInCents: ing.costPerUnitInCents,
    snapIncrement: ing.snapIncrement,
    containerProfile: ing.containerProfile,
    category: ing.category,
    lowStockThreshold: ing.lowStockThreshold,
    unitsPerContainer: ing.unitsPerContainer,
    isPinned: ing.isPinned,
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
  }));

  return (
    <div className="p-[var(--space-4)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <div className="flex items-center gap-[var(--space-2)] mb-[var(--space-4)]">
        <Link
          href="/settings"
          className="text-body text-[var(--color-info)]"
        >
          ← Settings
        </Link>
      </div>

      <h1 className="text-headline mb-[var(--space-4)]">Ingredient Configuration</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">
        Set costs, thresholds, snap increments, and categories for each ingredient.
      </p>

      <IngredientConfig initialIngredients={ingredients} suppliers={suppliers} />
    </div>
  );
}
