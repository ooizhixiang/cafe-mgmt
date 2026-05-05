import { requireAuth } from "@/lib/auth";
import { DailyReportForm } from "@/components/daily-report/daily-report-form";
import { SalesAnalysisPanel } from "@/components/daily-report/sales-analysis";
import { SalesHistoryPanel } from "@/components/daily-report/sales-history";
import { SalesTabs } from "@/components/daily-report/sales-tabs";

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireAuth();
  const isManager = session.user.role === "MANAGER";
  const params = await searchParams;
  const tab = params.tab ?? "report";

  const subtitle =
    tab === "report"
      ? "Enter how many of each recipe were sold today"
      : tab === "history"
        ? "Past sales reports — merged per recipe"
        : "Sales performance overview";

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-1)]">Sales</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">
        {subtitle}
      </p>

      <SalesTabs activeTab={tab} />

      {tab === "report" ? (
        <DailyReportForm />
      ) : tab === "history" ? (
        <SalesHistoryPanel isManager={isManager} />
      ) : (
        <SalesAnalysisPanel />
      )}
    </div>
  );
}
