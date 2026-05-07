import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MergedIngredientsPage } from "@/components/ingredients/merged-ingredients-page";
import { currentCostPerUnit, findOldestNonEmptyLot } from "@/lib/fifo";
import { getCafeToday } from "@/lib/format";

export default async function IngredientsPage() {
  const session = await requireAuth();
  const cafeId = session.user.cafeId;
  const userRole = session.user.role;

  const today = getCafeToday();
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  // Load both datasets unconditionally — the page must support both views
  // (spreadsheet for managers, count for everyone) and the queries are fast +
  // overlap heavily. Toggling client-side is then instant.
  const [ingredientsRaw, suppliers, cafe] = await Promise.all([
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

  const enabledUnits = cafe?.enabledUnits ?? [];

  // No early empty-state branch: when ingredientsRaw is empty, fall through
  // to MergedIngredientsPage with empty arrays. The Spreadsheet view's
  // bottom add-row is the manager's add affordance; the Count view's empty
  // state already exists inside InventoryList. The previous early-return
  // bypassed the toggle entirely and linked to the same URL (dead-end).

  const supplierLinkIds = ingredientsRaw.flatMap((i) =>
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

  const todayKey = today.toISOString().slice(0, 10);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  const spreadsheetIngredients = ingredientsRaw.map((ing) => {
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

  const inventoryIngredients = ingredientsRaw.map((ing) => {
    const todayEntry = ing.inventoryCounts.find(
      (c) => c.countDate.toISOString().slice(0, 10) === todayKey
    );
    const yesterdayEntry = ing.inventoryCounts.find(
      (c) => c.countDate.toISOString().slice(0, 10) === yesterdayKey
    );

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
    <MergedIngredientsPage
      userRole={userRole}
      spreadsheetProps={{
        initialIngredients: spreadsheetIngredients,
        suppliers,
        distinctCategories,
        enabledUnits,
      }}
      inventoryListProps={{
        initialIngredients: inventoryIngredients,
        suppliers,
        userRole,
        enabledUnits,
      }}
    />
  );
}
