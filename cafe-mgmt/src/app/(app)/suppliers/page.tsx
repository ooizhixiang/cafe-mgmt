import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SupplierList } from "@/components/operations/supplier-list";

export default async function SuppliersPage() {
  const session = await requireAuth();
  const cafeId = session.user.cafeId;
  const isManager = session.user.role === "MANAGER";

  const suppliers = await prisma.supplier.findMany({
    where: { cafeId },
    include: {
      ingredients: {
        select: { id: true, name: true, unit: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  const supplierData = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    notes: s.notes,
    lastOrderDate: s.lastOrderDate?.toISOString() ?? null,
    reminderDays: s.reminderDays,
    ingredients: s.ingredients,
  }));

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-1)]">Suppliers</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">Manage your suppliers</p>
      <SupplierList
        initialSuppliers={supplierData}
        isManager={isManager}
      />
    </div>
  );
}
