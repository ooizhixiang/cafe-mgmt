import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { IngredientConfig } from "@/components/settings/ingredient-config";
import Link from "next/link";

export default async function IngredientSettingsPage() {
  const session = await requireRole("MANAGER");

  const [ingredients, suppliers] = await Promise.all([
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
        supplierId: true,
        isPinned: true,
      },
    }),
    prisma.supplier.findMany({
      where: { cafeId: session.user.cafeId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

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
