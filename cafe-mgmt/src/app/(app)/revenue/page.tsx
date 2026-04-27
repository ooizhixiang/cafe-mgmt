import { RevenueCharts } from "@/components/revenue/revenue-charts";

export default function RevenuePage() {
  return (
    <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[1200px] lg:mx-auto">
      <h1 className="text-headline mb-[var(--space-1)]">Revenue</h1>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">
        Track revenue, costs, and profit
      </p>
      <RevenueCharts />
    </div>
  );
}
