import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SupplierDetail } from "@/components/operations/supplier-detail";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();
  const cafeId = session.user.cafeId;
  const isManager = session.user.role === "MANAGER";

  const supplier = await prisma.supplier.findFirst({
    where: { id, cafeId },
    include: {
      ingredientSuppliers: {
        include: {
          ingredient: { select: { id: true, name: true, unit: true } },
        },
        orderBy: { ingredient: { name: "asc" } },
      },
    },
  });

  if (!supplier) {
    notFound();
  }

  const linkIds = supplier.ingredientSuppliers.map((l) => l.id);

  const purchases =
    linkIds.length === 0
      ? []
      : await prisma.ingredientPurchase.findMany({
          where: { ingredientSupplierId: { in: linkIds }, cafeId },
          orderBy: { createdAt: "desc" },
          include: {
            ingredientSupplier: {
              select: {
                ingredient: { select: { name: true } },
              },
            },
          },
        });

  const supplierData = {
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    notes: supplier.notes,
    reminderDays: supplier.reminderDays,
    lastOrderDate: supplier.lastOrderDate?.toISOString() ?? null,
    products: supplier.ingredientSuppliers.map((l) => ({
      id: l.id,
      ingredientId: l.ingredient.id,
      ingredientName: l.ingredient.name,
      priceInCents: l.priceInCents,
      unit: l.unit,
    })),
  };

  const purchaseData = purchases.map((p) => ({
    id: p.id,
    ingredientName: p.ingredientSupplier.ingredient.name,
    quantity: p.quantity,
    unit: p.unit,
    totalPriceInCents: p.totalPriceInCents,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <SupplierDetail
        supplier={supplierData}
        purchases={purchaseData}
        mode={isManager ? "manager" : "readonly"}
      />
    </div>
  );
}
