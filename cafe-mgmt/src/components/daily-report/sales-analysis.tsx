"use client";

import { useState, useEffect, useTransition } from "react";
import { getSalesAnalysis } from "@/actions/daily-report.actions";
import type { SalesAnalysis } from "@/actions/daily-report.actions";
import { Printer } from "lucide-react";

const RANGES = [
  { value: "day" as const, label: "Today" },
  { value: "week" as const, label: "Week" },
  { value: "month" as const, label: "Month" },
];

export function SalesAnalysisPanel() {
  const [range, setRange] = useState<"day" | "week" | "month">("day");
  const [data, setData] = useState<SalesAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    loadData(range);
  }, [range]);

  function loadData(r: "day" | "week" | "month") {
    setLoading(true);
    startTransition(async () => {
      const result = await getSalesAnalysis(r);
      if (result.success) {
        setData(result.data);
      }
      setLoading(false);
    });
  }

  return (
    <div className="space-y-[var(--space-4)]">
      {/* Range selector — hidden in print */}
      <div className="flex rounded-lg bg-[var(--bg-secondary,#f3f4f6)] p-1 print:hidden">
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

      {loading || isPending ? (
        <div className="text-meta text-[var(--text-secondary)] text-center py-[var(--space-4)]">
          Loading...
        </div>
      ) : !data || (data.recipes.length === 0 && data.ingredients.length === 0) ? (
        <div className="text-body text-[var(--text-secondary)] text-center py-[var(--space-6)]">
          No sales recorded for {data?.period?.toLowerCase() ?? "this period"}
        </div>
      ) : (
        <>
          {/* Print header — only visible in print */}
          <div className="hidden print:block print:mb-4" suppressHydrationWarning>
            <h2 className="text-xl font-bold">Sales Report — {data.period}</h2>
            <p className="text-sm text-gray-500" suppressHydrationWarning>
              Printed {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>

          {/* Summary card */}
          <div
            className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)] text-center print:text-left print:p-0 print:mb-4"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <p className="text-meta text-[var(--text-secondary)] print:hidden">{data.period}</p>
            <p className="text-[2rem] font-bold text-[var(--text-primary)] leading-tight print:text-xl">
              {data.totalItemsSold}
            </p>
            <p className="text-meta text-[var(--text-secondary)]">items sold</p>
          </div>

          {/* Recipes table */}
          <div
            className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)] print:p-0 print:shadow-none"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <h3 className="text-body font-semibold mb-[var(--space-3)]">Recipes Sold</h3>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)]">
                  <th className="text-left text-meta font-medium text-[var(--text-secondary)] pb-2 pr-2">#</th>
                  <th className="text-left text-meta font-medium text-[var(--text-secondary)] pb-2">Recipe</th>
                  <th className="text-right text-meta font-medium text-[var(--text-secondary)] pb-2">Qty Sold</th>
                </tr>
              </thead>
              <tbody>
                {data.recipes.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--border-default)] last:border-b-0">
                    <td className="text-meta text-[var(--text-secondary)] py-2 pr-2">{i + 1}</td>
                    <td className="text-body py-2">{r.recipeName}</td>
                    <td className="text-body font-medium text-right py-2">{r.totalSold}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-[var(--text-primary)]">
                  <td className="py-2" />
                  <td className="text-body font-semibold py-2">Total</td>
                  <td className="text-body font-bold text-right py-2">{data.totalItemsSold}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Ingredients table */}
          <div
            className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)] print:p-0 print:shadow-none"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <h3 className="text-body font-semibold mb-[var(--space-3)]">Ingredients Used</h3>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)]">
                  <th className="text-left text-meta font-medium text-[var(--text-secondary)] pb-2 pr-2">#</th>
                  <th className="text-left text-meta font-medium text-[var(--text-secondary)] pb-2">Ingredient</th>
                  <th className="text-right text-meta font-medium text-[var(--text-secondary)] pb-2">Amount Used</th>
                  <th className="text-right text-meta font-medium text-[var(--text-secondary)] pb-2 pl-2">Unit</th>
                </tr>
              </thead>
              <tbody>
                {data.ingredients.map((ing, i) => (
                  <tr key={i} className="border-b border-[var(--border-default)] last:border-b-0">
                    <td className="text-meta text-[var(--text-secondary)] py-2 pr-2">{i + 1}</td>
                    <td className="text-body py-2">{ing.ingredientName}</td>
                    <td className="text-body font-medium text-right py-2">{ing.totalUsed}</td>
                    <td className="text-meta text-[var(--text-secondary)] text-right py-2 pl-2">{ing.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Print button — hidden in print */}
          <button
            onClick={() => window.print()}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-[var(--border-default)] px-4 py-3 text-body font-medium text-[var(--text-primary)] active:scale-[0.98] print:hidden"
          >
            <Printer size={18} />
            Print Report
          </button>
        </>
      )}
    </div>
  );
}
