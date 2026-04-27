"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getRecipesForReport,
  submitDailyReport,
} from "@/actions/daily-report.actions";
import { getGrabAndGoItems } from "@/actions/grab-and-go.actions";
import { useToast } from "@/components/ui/toast";
import { Minus, Plus } from "lucide-react";

interface Variation {
  id: string;
  name: string;
  ingredients: Array<{
    ingredientId: string;
    ingredientName: string;
    unit: string;
    quantityPerServing: number;
  }>;
}

interface Recipe {
  id: string;
  name: string;
  imageUrl: string | null;
  ingredients: Array<{
    ingredientId: string;
    ingredientName: string;
    unit: string;
    quantityPerServing: number;
  }>;
  variations: Variation[];
}

interface Deduction {
  name: string;
  unit: string;
  deducted: number;
  newStock: number | null;
}

// Key format: "recipeId" for base, "recipeId:variationId" for variation
type SalesKey = string;

function makeKey(recipeId: string, variationId?: string): SalesKey {
  return variationId ? `${recipeId}:${variationId}` : recipeId;
}

function parseKey(key: SalesKey): { recipeId: string; variationId?: string } {
  const parts = key.split(":");
  return { recipeId: parts[0], variationId: parts[1] };
}

export function DailyReportForm() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [quantities, setQuantities] = useState<Record<SalesKey, number>>({});
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [grabItems, setGrabItems] = useState<Array<{ id: string; name: string; imageUrl: string | null; priceInCents: number; stockCount: number }>>([]);
  const [grabQty, setGrabQty] = useState<Record<string, number>>({});
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      const [recipeResult, grabResult] = await Promise.all([
        getRecipesForReport(),
        getGrabAndGoItems(),
      ]);
      if (recipeResult.success) {
        setRecipes(recipeResult.data);
        resetQuantities(recipeResult.data);
      }
      if (grabResult.success) {
        const active = grabResult.data.filter((i) => i.isActive);
        setGrabItems(active);
        const gInit: Record<string, number> = {};
        active.forEach((i) => (gInit[i.id] = 0));
        setGrabQty(gInit);
      }
      setLoading(false);
    }
    load();
  }, []);

  function resetQuantities(data: Recipe[]) {
    const init: Record<SalesKey, number> = {};
    for (const r of data) {
      if (r.variations.length === 0) {
        init[makeKey(r.id)] = 0;
      } else {
        if (r.ingredients.length > 0) init[makeKey(r.id)] = 0;
        for (const v of r.variations) {
          init[makeKey(r.id, v.id)] = 0;
        }
      }
    }
    setQuantities(init);
  }

  function setQty(key: SalesKey, qty: number) {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(0, qty) }));
  }

  function handleSubmit() {
    const entries = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([key, qtySold]) => {
        const { recipeId, variationId } = parseKey(key);
        return { recipeId, variationId, qtySold };
      });

    const grabAndGoEntries = Object.entries(grabQty)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qtySold]) => {
        const item = grabItems.find((i) => i.id === itemId);
        return { itemId, itemName: item?.name ?? "", qtySold };
      });

    if (entries.length === 0 && grabAndGoEntries.length === 0) {
      toast("Enter at least one sale");
      return;
    }

    startTransition(async () => {
      const result = await submitDailyReport({ entries, grabAndGoEntries });
      if (!result.success) {
        toast(result.error);
        return;
      }
      setDeductions(result.data.deductions);
      setSubmitted(true);
      toast("Sales report submitted");
    });
  }

  function handleReset() {
    setSubmitted(false);
    setDeductions([]);
    resetQuantities(recipes);
    const gInit: Record<string, number> = {};
    grabItems.forEach((i) => (gInit[i.id] = 0));
    setGrabQty(gInit);
  }

  if (loading) {
    return <div className="text-meta text-[var(--text-secondary)]">Loading recipes...</div>;
  }

  if (recipes.length === 0) {
    return (
      <p className="text-body text-[var(--text-secondary)] text-center py-[var(--space-4)]">
        No recipes yet. Add recipes in Recipes first.
      </p>
    );
  }

  if (submitted) {
    return (
      <div className="space-y-[var(--space-4)]">
        <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
          <h2 className="text-body font-semibold mb-[var(--space-3)]">Inventory Deductions</h2>
          <div className="space-y-[var(--space-2)]">
            {deductions.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-body">
                <span>{d.name}</span>
                <div className="text-right">
                  <span className="text-[var(--color-urgent,#dc2626)]">
                    -{d.deducted} {d.unit}
                  </span>
                  {d.newStock !== null && (
                    <span className="text-meta text-[var(--text-secondary)] ml-2">
                      ({d.newStock} left)
                    </span>
                  )}
                  {d.newStock === null && (
                    <span className="text-meta text-[var(--text-secondary)] ml-2">
                      (no count today)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleReset}
          className="w-full rounded-lg bg-[var(--color-info)] px-4 py-3 text-body font-medium text-white active:scale-[0.98]"
        >
          Submit Another Report
        </button>
      </div>
    );
  }

  const totalItems = Object.values(quantities).reduce((sum, q) => sum + q, 0) + Object.values(grabQty).reduce((sum, q) => sum + q, 0);

  return (
    <div className="space-y-[var(--space-2)]">
      {recipes.map((recipe) => (
        <div key={recipe.id}>
          {recipe.variations.length === 0 ? (
            // Simple recipe — no variations
            <SalesRow
              label={recipe.name}
              imageUrl={recipe.imageUrl}
              sublabel={`${recipe.ingredients.length} ingredients`}
              qty={quantities[makeKey(recipe.id)] ?? 0}
              onSetQty={(q) => setQty(makeKey(recipe.id), q)}
            />
          ) : (
            // Recipe with variations
            <div
              className="rounded-lg bg-[var(--bg-primary)] overflow-hidden"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              {/* Recipe header */}
              <div className="p-[var(--space-3)] flex items-center gap-[var(--space-3)] border-b border-[var(--border-default)]">
                {recipe.imageUrl ? (
                  <img src={recipe.imageUrl} alt={recipe.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-[var(--bg-secondary,#f3f4f6)] shrink-0 flex items-center justify-center text-[var(--text-secondary)]">
                    {recipe.name.charAt(0)}
                  </div>
                )}
                <span className="text-body font-medium">{recipe.name}</span>
              </div>

              {/* Base row — only show if it has ingredients */}
              {recipe.ingredients.length > 0 && (
                <div className="px-[var(--space-3)] py-[var(--space-2)] flex items-center justify-between">
                  <div>
                    <span className="text-meta">Original</span>
                    <span className="text-meta text-[var(--text-secondary)] ml-1">
                      ({recipe.ingredients.length} ingredients)
                    </span>
                  </div>
                  <QtyControl
                    qty={quantities[makeKey(recipe.id)] ?? 0}
                    onSetQty={(q) => setQty(makeKey(recipe.id), q)}
                  />
                </div>
              )}

              {/* Variation rows */}
              {recipe.variations.map((v) => (
                <div
                  key={v.id}
                  className="px-[var(--space-3)] py-[var(--space-2)] flex items-center justify-between border-t border-[var(--border-default)]"
                >
                  <div>
                    <span className="text-meta">{v.name}</span>
                    {v.ingredients.length > 0 && (
                      <span className="text-meta text-[var(--text-secondary)] ml-1">
                        (+{v.ingredients.length} extra)
                      </span>
                    )}
                  </div>
                  <QtyControl
                    qty={quantities[makeKey(recipe.id, v.id)] ?? 0}
                    onSetQty={(q) => setQty(makeKey(recipe.id, v.id), q)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Grab & Go section */}
      {grabItems.length > 0 && (
        <>
          <h3 className="text-body font-semibold mt-[var(--space-4)] mb-[var(--space-1)]">Grab & Go</h3>
          {grabItems.map((item) => (
            <SalesRow
              key={item.id}
              label={item.name}
              imageUrl={item.imageUrl}
              sublabel={`${item.priceInCents > 0 ? `RM ${(item.priceInCents / 100).toFixed(2)} · ` : ""}Stock: ${item.stockCount}`}
              qty={grabQty[item.id] ?? 0}
              onSetQty={(q) => setGrabQty((prev) => ({ ...prev, [item.id]: Math.max(0, q) }))}
            />
          ))}
        </>
      )}

      <button
        onClick={handleSubmit}
        disabled={isPending || totalItems === 0}
        className="w-full rounded-lg bg-[var(--color-info)] px-4 py-3 text-body font-medium text-white disabled:opacity-50 active:scale-[0.98] mt-[var(--space-4)]"
      >
        {isPending ? "Submitting..." : `Submit Report (${totalItems} items sold)`}
      </button>
    </div>
  );
}

function SalesRow({
  label,
  imageUrl,
  sublabel,
  qty,
  onSetQty,
}: {
  label: string;
  imageUrl: string | null;
  sublabel: string;
  qty: number;
  onSetQty: (q: number) => void;
}) {
  return (
    <div
      className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-3)] flex items-center gap-[var(--space-3)]"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={label} className="w-12 h-12 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-[var(--bg-secondary,#f3f4f6)] shrink-0 flex items-center justify-center text-[var(--text-secondary)] text-lg">
          {label.charAt(0)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className="text-body font-medium block truncate">{label}</span>
        <span className="text-meta text-[var(--text-secondary)]">{sublabel}</span>
      </div>
      <QtyControl qty={qty} onSetQty={onSetQty} />
    </div>
  );
}

function QtyControl({
  qty,
  onSetQty,
}: {
  qty: number;
  onSetQty: (q: number) => void;
}) {
  return (
    <div className="flex items-center gap-[var(--space-2)] shrink-0">
      <button
        onClick={() => onSetQty(qty - 1)}
        disabled={!qty}
        className="touch-target flex size-9 items-center justify-center rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] disabled:opacity-30 active:scale-95"
      >
        <Minus size={16} />
      </button>
      <input
        type="number"
        min={0}
        value={qty}
        onChange={(e) => onSetQty(Math.max(0, parseInt(e.target.value) || 0))}
        className="w-14 text-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] py-1.5 text-body font-medium"
      />
      <button
        onClick={() => onSetQty(qty + 1)}
        className="touch-target flex size-9 items-center justify-center rounded-lg border border-[var(--border-default)] text-[var(--color-info)] active:scale-95"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
