import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SupplierList } from "@/components/operations/supplier-list";

export default async function SuppliersPage() {
  const session = await requireAuth();
  const cafeId = session.user.cafeId;
  const isManager = session.user.role === "MANAGER";

  const [suppliers, allIngredients] = await Promise.all([
    prisma.supplier.findMany({
      where: { cafeId },
      include: {
        ingredientSuppliers: {
          include: {
            ingredient: { select: { id: true, name: true, unit: true } },
          },
        },
      },
      orderBy: { displayOrder: "asc" },
    }),
    prisma.ingredient.findMany({
      where: { cafeId },
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const supplierData = suppliers.map((s) => {
    const seen = new Set<string>();
    const ingredients: Array<{ id: string; name: string; unit: string }> = [];
    const choices: Array<{
      id: string;
      ingredientId: string;
      ingredientName: string;
      unit: string;
      priceInCents: number;
      linkedToSupplier: boolean;
    }> = [];

    for (const link of s.ingredientSuppliers) {
      if (!seen.has(link.ingredient.id)) {
        seen.add(link.ingredient.id);
        ingredients.push({
          id: link.ingredient.id,
          name: link.ingredient.name,
          unit: link.ingredient.unit,
        });
      }
      choices.push({
        id: link.id,
        ingredientId: link.ingredient.id,
        ingredientName: link.ingredient.name,
        unit: link.unit,
        priceInCents: link.priceInCents,
        linkedToSupplier: true,
      });
    }
    ingredients.sort((a, b) => a.name.localeCompare(b.name));
    choices.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));

    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      notes: s.notes,
      lastOrderDate: s.lastOrderDate?.toISOString() ?? null,
      reminderDays: s.reminderDays,
      ingredients,
      ingredientChoices: choices,
    };
  });

  const fallbackIngredients = allIngredients.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
  }));

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-1)]">Suppliers</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">Manage your suppliers</p>
      <SupplierList
        initialSuppliers={supplierData}
        allIngredients={fallbackIngredients}
        isManager={isManager}
      />
    </div>
  );
}
