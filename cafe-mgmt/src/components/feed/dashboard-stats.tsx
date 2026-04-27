"use client";

import { useState, useEffect } from "react";
import { getSalesAnalysis } from "@/actions/daily-report.actions";
import type { SalesAnalysis } from "@/actions/daily-report.actions";
import { UtensilsCrossed, TrendingUp, Package, ShoppingCart } from "lucide-react";

export function DashboardStats() {
  const [todayData, setTodayData] = useState<SalesAnalysis | null>(null);
  const [weekData, setWeekData] = useState<SalesAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [today, week] = await Promise.all([
        getSalesAnalysis("day"),
        getSalesAnalysis("week"),
      ]);
      if (today.success) setTodayData(today.data);
      if (week.success) setWeekData(week.data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--space-3)]">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)] animate-shimmer h-24" />
        ))}
      </div>
    );
  }

  const todaySold = todayData?.totalItemsSold ?? 0;
  const weekSold = weekData?.totalItemsSold ?? 0;
  const todayRecipes = todayData?.recipes.length ?? 0;
  const todayIngredients = todayData?.ingredients.length ?? 0;

  const cards = [
    {
      label: "Sales Today",
      value: todaySold,
      icon: ShoppingCart,
      gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    },
    {
      label: "This Week",
      value: weekSold,
      icon: TrendingUp,
      gradient: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
    },
    {
      label: "Recipes Today",
      value: todayRecipes,
      icon: UtensilsCrossed,
      gradient: "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)",
    },
    {
      label: "Ingredients Used",
      value: todayIngredients,
      icon: Package,
      gradient: "linear-gradient(135deg, #ef4444 0%, #ec4899 100%)",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--space-3)]">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-lg p-[var(--space-4)] text-white"
            style={{ background: card.gradient, boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center gap-[var(--space-3)]">
              <div className="flex size-10 items-center justify-center rounded-lg bg-white/20">
                <Icon size={20} />
              </div>
              <div>
                <p className="text-[1.5rem] font-bold leading-tight">
                  {card.value}
                </p>
                <p className="text-[12px] text-white/80">{card.label}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TopSellingRecipes() {
  const [data, setData] = useState<SalesAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await getSalesAnalysis("week");
      if (result.success) setData(result.data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)] animate-shimmer h-48" />;
  }

  const recipes = data?.recipes.slice(0, 5) ?? [];
  const maxQty = recipes[0]?.totalSold ?? 1;

  return (
    <div
      className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)]"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <h3 className="text-body font-semibold mb-[var(--space-3)]">Top Selling (This Week)</h3>
      {recipes.length === 0 ? (
        <p className="text-meta text-[var(--text-secondary)]">No sales this week</p>
      ) : (
        <div className="space-y-[var(--space-3)]">
          {recipes.map((r, i) => {
            const pct = Math.round((r.totalSold / maxQty) * 100);
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-meta">{r.recipeName}</span>
                  <span className="text-meta font-medium">{r.totalSold}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TopIngredients() {
  const [data, setData] = useState<SalesAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await getSalesAnalysis("week");
      if (result.success) setData(result.data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)] animate-shimmer h-48" />;
  }

  const ingredients = data?.ingredients.slice(0, 5) ?? [];
  const maxUsed = ingredients[0]?.totalUsed ?? 1;

  return (
    <div
      className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)]"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <h3 className="text-body font-semibold mb-[var(--space-3)]">Most Used Ingredients (This Week)</h3>
      {ingredients.length === 0 ? (
        <p className="text-meta text-[var(--text-secondary)]">No usage this week</p>
      ) : (
        <div className="space-y-[var(--space-3)]">
          {ingredients.map((ing, i) => {
            const pct = Math.round((ing.totalUsed / maxUsed) * 100);
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-meta">{ing.ingredientName}</span>
                  <span className="text-meta font-medium">{ing.totalUsed} {ing.unit}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: "linear-gradient(90deg, #f59e0b, #f97316)" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
