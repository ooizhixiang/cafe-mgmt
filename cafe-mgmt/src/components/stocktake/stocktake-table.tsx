"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  cancelStocktake,
  completeStocktake,
  saveStocktakeItemCount,
  type StocktakeItemRow,
  type StocktakeView,
} from "@/actions/stocktake.actions";
import { useToast } from "@/components/ui/toast";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Check, Equal } from "lucide-react";

interface Props {
  view: StocktakeView;
}

export function StocktakeTable({ view }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState(view.search);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Keep local search state in sync if the URL changes (e.g. tab switch).
  useEffect(() => {
    setSearchInput(view.search);
  }, [view.search]);

  const { stocktake, items, page, totalPages, totalRecords, tab } = view;
  const isFinalized = stocktake.status !== "IN_PROGRESS";

  function buildHref(overrides: {
    tab?: "uncounted" | "counted";
    page?: number;
    search?: string;
  }): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("id", stocktake.id);
    if (overrides.tab !== undefined) params.set("tab", overrides.tab);
    if (overrides.page !== undefined) params.set("page", String(overrides.page));
    if (overrides.search !== undefined) {
      if (overrides.search === "") params.delete("search");
      else params.set("search", overrides.search);
      // When search changes, reset page to 1 unless caller overrode it.
      if (overrides.page === undefined) params.set("page", "1");
    }
    return `/stocktake?${params.toString()}`;
  }

  function navigate(href: string) {
    router.push(href);
  }

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    navigate(buildHref({ search: searchInput.trim() }));
  }

  function handleConfirmRow(item: StocktakeItemRow, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      toast("Counted quantity required");
      return;
    }
    const qty = Number(trimmed);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
      toast("Enter a non-negative whole number");
      return;
    }
    startTransition(async () => {
      const result = await saveStocktakeItemCount({
        itemId: item.id,
        quantity: qty,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleMarkCompleted() {
    if (stocktake.uncountedItems > 0) {
      setConfirmComplete(true);
    } else {
      runComplete();
    }
  }

  function runComplete() {
    setConfirmComplete(false);
    startTransition(async () => {
      const result = await completeStocktake({ id: stocktake.id });
      if (!result.success) {
        toast(result.error);
        return;
      }
      toast(
        `Completed: ${result.data.wastageCount} loss, ${result.data.adjustmentCount} adjusted, ${result.data.skippedCount} skipped`
      );
      router.push("/stocktake");
      router.refresh();
    });
  }

  function runCancel() {
    setConfirmCancel(false);
    startTransition(async () => {
      const result = await cancelStocktake({ id: stocktake.id });
      if (!result.success) {
        toast(result.error);
        return;
      }
      router.push("/stocktake");
      router.refresh();
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)] mb-[var(--space-3)]">
        <div>
          <h1 className="text-headline">Stocktake</h1>
          <p className="text-meta text-[var(--text-secondary)]">
            Started by {stocktake.startedByName} · {stocktake.totalItems} items
            · {stocktake.countedItems} counted · {stocktake.uncountedItems}{" "}
            uncounted
          </p>
        </div>
        <div className="flex items-center gap-[var(--space-2)]">
          <button
            type="button"
            onClick={handleMarkCompleted}
            disabled={isPending || isFinalized}
            className="rounded bg-[var(--color-success)] text-white px-[var(--space-3)] py-[var(--space-2)] text-meta font-medium disabled:opacity-50"
          >
            Mark As Completed
          </button>
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            disabled={isPending || isFinalized}
            className="rounded border border-[var(--border-default)] px-[var(--space-3)] py-[var(--space-2)] text-meta font-medium text-[var(--color-urgent)] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-[var(--space-1)] border-b border-[var(--border-default)] mb-[var(--space-3)]">
        <TabLink
          href={buildHref({ tab: "uncounted", page: 1 })}
          active={tab === "uncounted"}
          label={`Uncounted Items (${stocktake.uncountedItems})`}
        />
        <TabLink
          href={buildHref({ tab: "counted", page: 1 })}
          active={tab === "counted"}
          label={`Counted Items (${stocktake.countedItems})`}
        />
      </div>

      {/* Pagination summary + search */}
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)] mb-[var(--space-3)]">
        <div className="text-meta text-[var(--text-secondary)]">
          Page {page} of {totalPages} · View {view.pageSize} records · Found
          total {totalRecords} records
        </div>
        <form
          onSubmit={handleSearchSubmit}
          className="flex items-center gap-[var(--space-2)]"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, SKU, barcode"
            aria-label="Search stocktake items"
            className="min-h-[40px] rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-[var(--space-2)] py-1 text-meta"
          />
          <button
            type="submit"
            className="min-h-[40px] rounded border border-[var(--border-default)] px-[var(--space-3)] py-1 text-meta font-medium"
          >
            Search
          </button>
        </form>
      </div>

      {/* Table */}
      <div
        className="overflow-x-auto rounded-lg border border-[var(--border-default)]"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <table className="min-w-full text-meta">
          <thead className="bg-[var(--bg-secondary)]">
            <tr>
              <Th>Product Name</Th>
              <Th>SKU</Th>
              <Th>Barcode</Th>
              <Th>Expected Qty</Th>
              <Th>Counted Qty</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-[var(--space-3)] py-[var(--space-4)] text-center text-body text-[var(--text-secondary)]"
                >
                  No items in this view.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                disabled={isPending || isFinalized}
                onConfirm={handleConfirmRow}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-[var(--space-2)] mt-[var(--space-3)]">
          <button
            type="button"
            onClick={() => navigate(buildHref({ page: Math.max(1, page - 1) }))}
            disabled={page <= 1}
            className="rounded border border-[var(--border-default)] px-[var(--space-3)] py-[var(--space-1)] text-meta disabled:opacity-30"
          >
            Prev
          </button>
          <span className="text-meta self-center">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() =>
              navigate(buildHref({ page: Math.min(totalPages, page + 1) }))
            }
            disabled={page >= totalPages}
            className="rounded border border-[var(--border-default)] px-[var(--space-3)] py-[var(--space-1)] text-meta disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}

      <ConfirmationDialog
        open={confirmComplete}
        title="Complete stocktake?"
        message={`${stocktake.uncountedItems} items still uncounted — they will be treated as expected (no variance). Continue?`}
        confirmLabel="Mark Completed"
        onConfirm={runComplete}
        onCancel={() => setConfirmComplete(false)}
      />
      <ConfirmationDialog
        open={confirmCancel}
        title="Cancel stocktake?"
        message="Cancelling will discard the session. No wastage or adjustments will be written."
        confirmLabel="Cancel session"
        destructive
        onConfirm={runCancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}

function TabLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className={`px-[var(--space-3)] py-[var(--space-2)] text-meta font-medium border-b-2 -mb-px ${
        active
          ? "border-[var(--color-info)] text-[var(--text-primary)]"
          : "border-transparent text-[var(--text-secondary)]"
      }`}
    >
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-meta font-semibold text-[var(--text-secondary)] px-[var(--space-2)] py-[var(--space-2)] whitespace-nowrap">
      {children}
    </th>
  );
}

function ItemRow({
  item,
  disabled,
  onConfirm,
}: {
  item: StocktakeItemRow;
  disabled: boolean;
  onConfirm: (item: StocktakeItemRow, value: string) => void;
}) {
  const [value, setValue] = useState<string>(
    item.countedQuantity !== null ? String(item.countedQuantity) : ""
  );
  const isCounted = item.countedQuantity !== null;
  // Disable the tick when there's nothing in the input AND nothing was
  // previously counted — there'd be no value to save.
  const tickDisabled = disabled || (value === "" && !isCounted);
  return (
    <tr className="border-t border-[var(--border-default)]">
      <td className="px-[var(--space-2)] py-[var(--space-2)] align-middle">
        {item.ingredientName}
        <span className="text-[var(--text-secondary)]"> ({item.ingredientUnit})</span>
      </td>
      <td className="px-[var(--space-2)] py-[var(--space-2)] align-middle text-[var(--text-secondary)]">
        {item.sku ?? "—"}
      </td>
      <td className="px-[var(--space-2)] py-[var(--space-2)] align-middle text-[var(--text-secondary)]">
        {item.barcode ?? "—"}
      </td>
      <td className="px-[var(--space-2)] py-[var(--space-2)] align-middle">
        {item.expectedQuantity}
      </td>
      <td className="px-[var(--space-2)] py-[var(--space-2)] align-middle">
        <input
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          aria-label={`Counted quantity for ${item.ingredientName}`}
          className="w-[100px] min-h-[40px] rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-[var(--space-2)] py-1 text-meta"
        />
      </td>
      <td className="px-[var(--space-2)] py-[var(--space-2)] align-middle">
        <div className="flex items-center justify-end gap-[var(--space-1)]">
          {/* Tick = save the typed counted quantity. */}
          <button
            type="button"
            onClick={() => onConfirm(item, value)}
            disabled={tickDisabled}
            aria-label={isCounted ? `Re-confirm ${item.ingredientName}` : `Confirm ${item.ingredientName}`}
            title={isCounted ? "Re-confirm" : "Confirm"}
            className={`touch-target flex size-9 items-center justify-center rounded ${
              isCounted
                ? "border border-[var(--border-default)] text-[var(--text-secondary)]"
                : "bg-[var(--color-success)] text-white"
            } disabled:opacity-40`}
          >
            <Check size={16} />
          </button>
          {/* Mark unchanged = save expected as the counted value (no variance). */}
          <button
            type="button"
            onClick={() => {
              setValue(String(item.expectedQuantity));
              onConfirm(item, String(item.expectedQuantity));
            }}
            disabled={disabled}
            aria-label={`Mark ${item.ingredientName} as unchanged`}
            title="Mark as unchanged (counted = expected)"
            className="touch-target flex size-9 items-center justify-center rounded border border-[var(--border-default)] text-[var(--text-secondary)] disabled:opacity-40"
          >
            <Equal size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
}
