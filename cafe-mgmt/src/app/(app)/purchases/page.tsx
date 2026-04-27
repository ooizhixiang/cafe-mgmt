import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PurchasesForm } from "@/components/purchases/purchases-form";

export default async function PurchasesPage() {
  const session = await requireAuth();
  const cafeId = session.user.cafeId;

  const suppliers = await prisma.supplier.findMany({
    where: { cafeId },
    include: {
      ingredientSuppliers: {
        include: {
          ingredient: { select: { id: true, name: true, unit: true } },
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  const supplierData = suppliers.map((s) => {
    const links = s.ingredientSuppliers.map((link) => ({
      id: link.id,
      ingredientId: link.ingredient.id,
      ingredientName: link.ingredient.name,
      unit: link.unit,
      priceInCents: link.priceInCents,
    }));
    links.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
    return {
      id: s.id,
      name: s.name,
      links,
    };
  });

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-1)]">Purchases</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">
        Pick a supplier, add lines, log them all at once.
      </p>
      <PurchasesForm initialSuppliers={supplierData} />
    </div>
  );
}
