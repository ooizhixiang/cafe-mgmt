"use client";

import { useState, useEffect, useTransition } from "react";
import { getRevenueAnalysis } from "@/actions/daily-report.actions";
import type { RevenueData } from "@/actions/daily-report.actions";
import { TrendingUp, TrendingDown, DollarSign, Percent } from "lucide-react";

const RANGES = [
  { value: "day" as const, label: "Today" },
  { value: "week" as const, label: "Week" },
  { value: "month" as const, label: "Month" },
];

function formatRM(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}

export function RevenueCharts() {
  const [range, setRange] = useState<"day" | "week" | "month">("week");
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setLoading(true);
    startTransition(async () => {
      const result = await getRevenueAnalysis(range);
      if (result.success) setData(result.data);
      setLoading(false);
    });
  }, [range]);

  return (
    <div className="space-y-[var(--space-4)]">
      {/* Range selector */}
      <div className="flex rounded-lg bg-[var(--bg-secondary,#f3f4f6)] p-1">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`flex-1 rounded-lg py-2 text-meta font-medium transition-all ${
              range === r.value
                ? "bg-[var(--bg-primary)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)]"
            }`}
            style={range === r.value ? { boxShadow: "var(--shadow-card)" } : undefined}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--space-3)]">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)] animate-shimmer h-24" />
          ))}
        </div>
      ) : !data ? (
        <p className="text-body text-[var(--text-secondary)] text-center py-[var(--space-6)]">Failed to load data</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--space-3)]">
            <SummaryCard
              label="Revenue"
              value={formatRM(data.totalRevenueInCents)}
              icon={DollarSign}
              gradient="linear-gradient(135deg, #10b981, #06b6d4)"
            />
            <SummaryCard
              label="Cost"
              value={formatRM(data.totalCostInCents)}
              icon={TrendingDown}
              gradient="linear-gradient(135deg, #ef4444, #ec4899)"
            />
            <SummaryCard
              label="Profit"
              value={formatRM(data.totalProfitInCents)}
              icon={TrendingUp}
              gradient="linear-gradient(135deg, #6366f1, #8b5cf6)"
            />
            <SummaryCard
              label="Margin"
              value={`${data.profitMargin}%`}
              icon={Percent}
              gradient="linear-gradient(135deg, #f59e0b, #f97316)"
            />
          </div>

          {/* Daily chart */}
          {data.dailyBreakdown.length > 1 && (
            <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
              <h3 className="text-body font-semibold mb-[var(--space-3)]">Daily Revenue vs Cost</h3>
              <DailyChart data={data.dailyBreakdown} />
            </div>
          )}

          {/* Top items by revenue */}
          {data.topByRevenue.length > 0 && (
            <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
              <h3 className="text-body font-semibold mb-[var(--space-3)]">Revenue by Item</h3>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    <th className="text-left text-meta font-medium text-[var(--text-secondary)] pb-2">Item</th>
                    <th className="text-right text-meta font-medium text-[var(--text-secondary)] pb-2">Qty</th>
                    <th className="text-right text-meta font-medium text-[var(--text-secondary)] pb-2">Revenue</th>
                    <th className="text-right text-meta font-medium text-[var(--text-secondary)] pb-2">Cost</th>
                    <th className="text-right text-meta font-medium text-[var(--text-secondary)] pb-2">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topByRevenue.map((item, i) => (
                    <tr key={i} className="border-b border-[var(--border-default)] last:border-b-0">
                      <td className="text-meta py-2">{item.name}</td>
                      <td className="text-meta text-right py-2">{item.qtySold}</td>
                      <td className="text-meta text-right py-2 text-[var(--color-success)]">{formatRM(item.revenueInCents)}</td>
                      <td className="text-meta text-right py-2 text-[var(--color-urgent,#dc2626)]">{formatRM(item.costInCents)}</td>
                      <td className={`text-meta font-medium text-right py-2 ${item.profitInCents >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-urgent,#dc2626)]"}`}>
                        {formatRM(item.profitInCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--text-primary)]">
                    <td className="text-meta font-semibold py-2">Total</td>
                    <td className="text-meta font-semibold text-right py-2">{data.topByRevenue.reduce((s, i) => s + i.qtySold, 0)}</td>
                    <td className="text-meta font-bold text-right py-2 text-[var(--color-success)]">{formatRM(data.totalRevenueInCents)}</td>
                    <td className="text-meta font-bold text-right py-2 text-[var(--color-urgent,#dc2626)]">{formatRM(data.totalCostInCents)}</td>
                    <td className={`text-meta font-bold text-right py-2 ${data.totalProfitInCents >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-urgent,#dc2626)]"}`}>
                      {formatRM(data.totalProfitInCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {data.topByRevenue.length === 0 && (
            <p className="text-body text-[var(--text-secondary)] text-center py-[var(--space-6)]">
              No sales data for {data.period.toLowerCase()}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  gradient,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number }>;
  gradient: string;
}) {
  return (
    <div className="rounded-lg p-[var(--space-4)] text-white" style={{ background: gradient, boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center gap-[var(--space-3)]">
        <div className="flex size-10 items-center justify-center rounded-lg bg-white/20">
          <Icon size={20} />
        </div>
        <div>
          <p className="text-[1.25rem] font-bold leading-tight">{value}</p>
          <p className="text-[12px] text-white/80">{label}</p>
        </div>
      </div>
    </div>
  );
}

function DailyChart({
  data,
}: {
  data: Array<{ date: string; revenueInCents: number; costInCents: number; profitInCents: number }>;
}) {
  const maxValue = Math.max(...data.map((d) => Math.max(d.revenueInCents, d.costInCents)), 1);

  return (
    <div className="space-y-[var(--space-3)]">
      {/* Legend */}
      <div className="flex gap-[var(--space-4)] text-meta">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)" }} />
          Revenue
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ background: "linear-gradient(135deg, #ef4444, #ec4899)" }} />
          Cost
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }} />
          Profit
        </span>
      </div>

      {/* Bars */}
      <div className="space-y-[var(--space-2)]">
        {data.map((d) => {
          const revPct = Math.round((d.revenueInCents / maxValue) * 100);
          const costPct = Math.round((d.costInCents / maxValue) * 100);
          const profitPct = Math.max(0, Math.round((d.profitInCents / maxValue) * 100));
          const dateLabel = new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

          return (
            <div key={d.date}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-meta text-[var(--text-secondary)]">{dateLabel}</span>
                <span className="text-meta font-medium">{formatRM(d.profitInCents)}</span>
              </div>
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${revPct}%`, background: "linear-gradient(90deg, #10b981, #06b6d4)" }} />
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${costPct}%`, background: "linear-gradient(90deg, #ef4444, #ec4899)" }} />
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${profitPct}%`, background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
