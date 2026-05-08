import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  getActiveStocktakes,
  getStocktake,
} from "@/actions/stocktake.actions";
import { StocktakeList } from "@/components/stocktake/stocktake-list";
import { StocktakeTable } from "@/components/stocktake/stocktake-table";

export default async function StocktakePage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    tab?: string;
    page?: string;
    search?: string;
  }>;
}) {
  // Manager-only: redirect non-managers to dashboard. (Middleware already
  // blocks staff at this path; this is the page-layer defense.)
  try {
    await requireRole("MANAGER");
  } catch {
    redirect("/");
  }

  const params = await searchParams;
  const id = params.id;

  if (!id) {
    const result = await getActiveStocktakes();
    const stocktakes = result.success ? result.data.stocktakes : [];
    return (
      <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[1080px] lg:mx-auto">
        <h1 className="text-headline mb-[var(--space-1)]">Stocktake</h1>
        <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">
          Run a structured count and reconcile variances.
        </p>
        <StocktakeList stocktakes={stocktakes} />
      </div>
    );
  }

  const tab = params.tab === "counted" ? "counted" : "uncounted";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const search = params.search ?? "";

  const result = await getStocktake({ id, tab, page, search });

  if (!result.success) {
    return (
      <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[1080px] lg:mx-auto">
        <h1 className="text-headline mb-[var(--space-3)]">Stocktake</h1>
        <p className="text-meta text-[var(--color-urgent)]">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[1080px] lg:mx-auto">
      <StocktakeTable view={result.data} />
    </div>
  );
}
