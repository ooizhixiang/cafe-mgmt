import { DailyReportForm } from "@/components/daily-report/daily-report-form";
import { SalesAnalysisPanel } from "@/components/daily-report/sales-analysis";
import { SalesTabs } from "@/components/daily-report/sales-tabs";

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab ?? "report";

  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-1)]">Sales</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">
        {tab === "report" ? "Enter how many of each recipe were sold today" : "Sales performance overview"}
      </p>

      <SalesTabs activeTab={tab} />

      {tab === "report" ? <DailyReportForm /> : <SalesAnalysisPanel />}
    </div>
  );
}
