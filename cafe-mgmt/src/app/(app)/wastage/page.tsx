import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCafeToday } from "@/lib/format";
import { WastageLogger } from "@/components/wastage/wastage-logger";
import { WastageLog } from "@/components/wastage/wastage-log";
import { CompLogger } from "@/components/comp/comp-logger";
import { CompLog } from "@/components/comp/comp-log";
import { WeeklyTotals } from "@/components/reporting/weekly-totals";
import { WastageCompTabs } from "@/components/wastage/wastage-comp-tabs";

export default async function WastageCompPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireAuth();
  const cafeId = session.user.cafeId;
  const isManager = session.user.role === "MANAGER";
  const params = await searchParams;
  const tab = params.tab ?? "wastage";

  const today = getCafeToday();

  const [ingredients, counts] = await Promise.all([
    prisma.ingredient.findMany({
      where: { cafeId },
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
    prisma.inventoryCount.findMany({
      where: { cafeId, countDate: today },
      select: { ingredientId: true, quantity: true },
    }),
  ]);

  const stockMap: Record<string, number> = {};
  for (const c of counts) {
    stockMap[c.ingredientId] = c.quantity;
  }

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-1)]">Wastage & Complimentary</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">Log and track losses</p>

      <WeeklyTotals isManager={isManager} />

      <WastageCompTabs activeTab={tab} />

      <div className="mt-[var(--space-4)] space-y-[var(--space-4)] lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:items-start">
        {tab === "wastage" ? (
          <>
            <WastageLogger ingredients={ingredients} stockMap={stockMap} />
            <WastageLog isManager={isManager} />
          </>
        ) : (
          <>
            <CompLogger ingredients={ingredients} />
            <CompLog isManager={isManager} />
          </>
        )}
      </div>
    </div>
  );
}
