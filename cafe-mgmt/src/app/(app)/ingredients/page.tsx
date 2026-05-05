import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { IngredientSpreadsheet } from "@/components/ingredients/ingredient-spreadsheet";
import { currentCostPerUnit, findOldestNonEmptyLot } from "@/lib/fifo";

export default async function IngredientsPage() {
  const session = await requireRole("MANAGER");

  const [ingredientsRaw, suppliers, cafe] = await Promise.all([
    prisma.ingredient.findMany({
      where: { cafeId: session.user.cafeId },
      orderBy: [{ isPinned: "desc" }, { displayOrder: "asc" }],
      select: {
        id: true,
        name: true,
        unit: true,
        displayUnit: true,
        costPerUnitInCents: true,
        snapIncrement: true,
        containerProfile: true,
        category: true,
        lowStockThreshold: true,
        unitsPerContainer: true,
        isPinned: true,
        manualCostOverride: true,
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
    prisma.cafe.findUnique({
      where: { id: session.user.cafeId },
      select: { enabledUnits: true },
    }),
  ]);

  const supplierLinkIds = ingredientsRaw.flatMap((i) =>
    i.ingredientSuppliers.map((l) => l.id)
  );

  const purchases =
    ingredientsRaw.length === 0 || supplierLinkIds.length === 0
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

  const distinctCategories = Array.from(
    new Set(
      ingredientsRaw
        .map((i) => i.category)
        .filter(Boolean) as string[]
    )
  ).sort();

  // Group purchases per ingredient so the per-ingredient oldest-lot lookup
  // doesn't re-scan the whole array N times.
  const purchasesByIngredient = new Map<
    string,
    Array<{
      id: string;
      createdAt: Date;
      remainingQuantity: number;
      totalPriceInCents: number;
      quantity: number;
    }>
  >();
  for (const p of purchases) {
    const ingId = p.ingredientSupplier.ingredientId;
    let bucket = purchasesByIngredient.get(ingId);
    if (!bucket) {
      bucket = [];
      purchasesByIngredient.set(ingId, bucket);
    }
    bucket.push({
      id: p.id,
      createdAt: p.createdAt,
      remainingQuantity: p.remainingQuantity,
      totalPriceInCents: p.totalPriceInCents.toNumber(),
      quantity: p.quantity,
    });
  }

  const ingredients = ingredientsRaw.map((ing) => {
    const oldestLot = findOldestNonEmptyLot(
      purchasesByIngredient.get(ing.id) ?? []
    );
    const rawCost =
      ing.costPerUnitInCents === null ? null : ing.costPerUnitInCents.toNumber();
    const derivedCost = currentCostPerUnit(
      {
        manualCostOverride: ing.manualCostOverride,
        costPerUnitInCents: rawCost,
      },
      oldestLot
    );
    return {
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      displayUnit: ing.displayUnit,
      costPerUnitInCents: rawCost,
      derivedCostPerUnitInCents: derivedCost,
      snapIncrement: ing.snapIncrement,
      containerProfile: ing.containerProfile,
      category: ing.category,
      lowStockThreshold: ing.lowStockThreshold,
      unitsPerContainer: ing.unitsPerContainer,
      isPinned: ing.isPinned,
      manualCostOverride: ing.manualCostOverride,
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
    };
  });

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[1280px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-1)]">Ingredients</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">
        Set costs, thresholds, snap increments, and categories for each ingredient.
      </p>

      <IngredientSpreadsheet
        initialIngredients={ingredients}
        suppliers={suppliers}
        distinctCategories={distinctCategories}
        enabledUnits={cafe?.enabledUnits ?? []}
      />
    </div>
  );
}
