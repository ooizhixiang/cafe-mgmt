import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PurchasesForm } from "@/components/purchases/purchases-form";
import { PurchaseTabs } from "@/components/purchases/purchase-tabs";
import {
  PurchaseHistoryList,
  type SerializableReceipt,
} from "@/components/purchases/purchase-history-list";
import { getPurchaseHistory } from "@/actions/inventory.actions";

interface PageProps {
  searchParams: Promise<{ tab?: string; page?: string }>;
}

export default async function PurchasesPage({ searchParams }: PageProps) {
  const session = await requireAuth();
  const cafeId = session.user.cafeId;
  const isManager = session.user.role === "MANAGER";

  const params = await searchParams;
  const activeTab = params.tab === "history" ? "history" : "log";
  const requestedPage = (() => {
    const n = Number(params.page);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  })();

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-1)]">Purchases</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">
        {activeTab === "history"
          ? "Past receipts. Attach an invoice photo to any one."
          : "Pick a supplier, add lines, log them all at once."}
      </p>
      <PurchaseTabs activeTab={activeTab} />
      {activeTab === "log" ? (
        <LogTab cafeId={cafeId} />
      ) : (
        <HistoryTab requestedPage={requestedPage} isManager={isManager} />
      )}
    </div>
  );
}

async function LogTab({ cafeId }: { cafeId: string }) {
  const [suppliers, allIngredients, cafe] = await Promise.all([
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
    prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { enabledUnits: true },
    }),
  ]);

  const supplierData = suppliers.map((s) => {
    const links = s.ingredientSuppliers.map((link) => ({
      id: link.id,
      ingredientId: link.ingredient.id,
      ingredientName: link.ingredient.name,
      unit: link.unit,
      priceInCents: link.priceInCents.toNumber(),
    }));
    links.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
    return { id: s.id, name: s.name, links };
  });

  return (
    <PurchasesForm
      initialSuppliers={supplierData}
      allIngredients={allIngredients}
      enabledUnits={cafe?.enabledUnits ?? []}
    />
  );
}

async function HistoryTab({
  requestedPage,
  isManager,
}: {
  requestedPage: number;
  isManager: boolean;
}) {
  const result = await getPurchaseHistory({ page: requestedPage });
  if (!result.success) {
    return (
      <p className="mt-[var(--space-4)] text-body text-[var(--color-urgent)]">
        Could not load purchase history: {result.error}
      </p>
    );
  }

  const serialized: SerializableReceipt[] = result.data.receipts.map((r) => ({
    batchKey: r.batchKey,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    createdById: r.createdById,
    createdByName: r.createdByName,
    minuteStart: r.minuteStart.toISOString(),
    totalInCents: r.totalInCents,
    invoiceImageUrl: r.invoiceImageUrl,
    lines: r.lines.map((l) => ({
      id: l.id,
      ingredientId: l.ingredientId,
      ingredientName: l.ingredientName,
      supplierName: l.supplierName,
      quantity: l.quantity,
      unit: l.unit,
      totalPriceInCents: l.totalPriceInCents,
      createdAt: l.createdAt.toISOString(),
    })),
  }));

  return (
    <PurchaseHistoryList
      initialReceipts={serialized}
      page={result.data.page}
      totalReceipts={result.data.totalReceipts}
      pageSize={result.data.pageSize}
      isManager={isManager}
    />
  );
}
