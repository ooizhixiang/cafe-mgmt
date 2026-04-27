"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2, X, Check } from "lucide-react";
import {
  addIngredientSupplier,
  updateIngredientSupplier,
  removeIngredientSupplier,
} from "@/actions/setup.actions";
import { createIngredientPurchase } from "@/actions/inventory.actions";
import { parseRMToCents } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

export interface IngredientSupplierRow {
  id: string;
  supplierId: string;
  supplierName: string;
  priceInCents: number;
  unit: string;
}

export interface IngredientPurchaseRow {
  id: string;
  ingredientSupplierId: string;
  supplierName: string;
  quantity: number;
  unit: string;
  totalPriceInCents: number;
  createdAt: string;
}

export interface SupplierOption {
  id: string;
  name: string;
}

interface Props {
  ingredientId: string;
  suppliers: IngredientSupplierRow[];
  purchases: IngredientPurchaseRow[];
  allSuppliers: SupplierOption[];
  mode: "manager" | "readonly";
}

function formatRM(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function IngredientSuppliersPanel({
  ingredientId,
  suppliers: initialSuppliers,
  purchases: initialPurchases,
  allSuppliers,
  mode,
}: Props) {
  const isManager = mode === "manager";
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [purchases, setPurchases] = useState(initialPurchases);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editUnit, setEditUnit] = useState("kg");
  const [showAdd, setShowAdd] = useState(false);
  const [addSupplierId, setAddSupplierId] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addUnit, setAddUnit] = useState("kg");
  const [purchaseFor, setPurchaseFor] = useState<IngredientSupplierRow | null>(
    null
  );
  const [purchaseQty, setPurchaseQty] = useState("");
  const [purchaseUnit, setPurchaseUnit] = useState("kg");
  const [purchaseTotal, setPurchaseTotal] = useState("");
  const [removeTarget, setRemoveTarget] = useState<IngredientSupplierRow | null>(
    null
  );
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const suppliersSorted = useMemo(
    () => [...suppliers].sort((a, b) => a.priceInCents - b.priceInCents),
    [suppliers]
  );
  const purchasesSorted = useMemo(
    () =>
      [...purchases].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      ),
    [purchases]
  );

  const availableSuppliers = useMemo(() => {
    const linked = new Set(suppliers.map((s) => s.supplierId));
    return allSuppliers.filter((s) => !linked.has(s.id));
  }, [suppliers, allSuppliers]);

  function startEdit(row: IngredientSupplierRow) {
    setEditingId(row.id);
    setEditPrice((row.priceInCents / 100).toFixed(2));
    setEditUnit(row.unit);
  }

  function handleSaveEdit(row: IngredientSupplierRow) {
    const priceInCents = parseRMToCents(editPrice);
    if (priceInCents === null || priceInCents < 0) {
      toast("Invalid price");
      return;
    }
    const unit = editUnit.trim();
    if (!unit) {
      toast("Unit required");
      return;
    }

    startTransition(async () => {
      const result = await updateIngredientSupplier({
        id: row.id,
        priceInCents,
        unit,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === row.id ? { ...s, priceInCents, unit } : s
        )
      );
      setEditingId(null);
      toast("Updated");
    });
  }

  function handleAdd() {
    if (!addSupplierId) {
      toast("Choose a supplier");
      return;
    }
    const priceInCents = parseRMToCents(addPrice);
    if (priceInCents === null || priceInCents < 0) {
      toast("Invalid price");
      return;
    }
    const unit = addUnit.trim();
    if (!unit) {
      toast("Unit required");
      return;
    }

    startTransition(async () => {
      const result = await addIngredientSupplier({
        ingredientId,
        supplierId: addSupplierId,
        priceInCents,
        unit,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      const supplier = allSuppliers.find((s) => s.id === addSupplierId);
      setSuppliers((prev) => [
        ...prev,
        {
          id: result.data.id,
          supplierId: addSupplierId,
          supplierName: supplier?.name ?? "Supplier",
          priceInCents,
          unit,
        },
      ]);
      setAddSupplierId("");
      setAddPrice("");
      setAddUnit("kg");
      setShowAdd(false);
      toast("Supplier added");
    });
  }

  function handleRemove() {
    if (!removeTarget) return;
    const id = removeTarget.id;
    startTransition(async () => {
      const result = await removeIngredientSupplier({ id });
      if (!result.success) {
        toast(result.error);
        setRemoveTarget(null);
        return;
      }
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      setRemoveTarget(null);
      toast("Supplier removed");
    });
  }

  function handleLogPurchase() {
    if (!purchaseFor) return;
    const qty = parseInt(purchaseQty, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast("Enter a quantity");
      return;
    }
    const unit = purchaseUnit.trim();
    if (!unit) {
      toast("Unit required");
      return;
    }
    const totalPriceInCents = parseRMToCents(purchaseTotal);
    if (totalPriceInCents === null || totalPriceInCents < 0) {
      toast("Invalid total");
      return;
    }
    const link = purchaseFor;

    startTransition(async () => {
      const result = await createIngredientPurchase({
        ingredientSupplierId: link.id,
        quantity: qty,
        unit,
        totalPriceInCents,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      setPurchases((prev) => [
        {
          id: result.data.id,
          ingredientSupplierId: link.id,
          supplierName: link.supplierName,
          quantity: qty,
          unit,
          totalPriceInCents,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setPurchaseFor(null);
      setPurchaseQty("");
      setPurchaseUnit("kg");
      setPurchaseTotal("");
      toast("Purchase logged");
    });
  }

  return (
    <div className="space-y-[var(--space-3)]">
      {/* Suppliers table */}
      <div>
        <p className="text-meta font-semibold text-[var(--text-secondary)] mb-[var(--space-1)]">
          Suppliers
        </p>
        {suppliersSorted.length === 0 ? (
          <p className="text-meta text-[var(--text-secondary)]">
            No suppliers linked yet.
          </p>
        ) : (
          <div className="space-y-[var(--space-1)]">
            {suppliersSorted.map((row) => {
              const isEditing = editingId === row.id;
              return (
                <div
                  key={row.id}
                  className="rounded border border-[var(--border-default)] p-[var(--space-2)]"
                >
                  {isEditing ? (
                    <div className="space-y-[var(--space-2)]">
                      <div className="text-meta font-medium">
                        <Link
                          href={`/suppliers/${row.supplierId}`}
                          className="hover:underline"
                        >
                          {row.supplierName}
                        </Link>
                      </div>
                      <div className="grid grid-cols-2 gap-[var(--space-2)]">
                        <div>
                          <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                            Price (RM)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
                          />
                        </div>
                        <div>
                          <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                            Unit
                          </label>
                          <input
                            type="text"
                            value={editUnit}
                            onChange={(e) => setEditUnit(e.target.value)}
                            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-[var(--space-2)]">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-[var(--border-default)] px-3 py-1 text-meta"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(row)}
                          disabled={isPending}
                          className="rounded-lg bg-[var(--color-info)] px-3 py-1 text-meta font-medium text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-meta font-medium truncate">
                          <Link
                            href={`/suppliers/${row.supplierId}`}
                            className="hover:underline"
                          >
                            {row.supplierName}
                          </Link>
                        </div>
                        <div className="text-meta text-[var(--text-secondary)]">
                          {formatRM(row.priceInCents)}/{row.unit}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-[var(--space-2)]">
                        <button
                          type="button"
                          onClick={() => setPurchaseFor(row)}
                          className="text-meta text-[var(--color-info)] font-medium"
                        >
                          Log purchase
                        </button>
                        {isManager && (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="touch-target p-1 text-[var(--text-secondary)]"
                              aria-label="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoveTarget(row)}
                              className="touch-target p-1 text-[var(--color-urgent,#dc2626)]"
                              aria-label="Remove"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isManager && (showAdd ? (
          <div className="mt-[var(--space-2)] rounded border border-dashed border-[var(--border-default)] p-[var(--space-2)] space-y-[var(--space-2)]">
            <div>
              <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                Supplier
              </label>
              <select
                value={addSupplierId}
                onChange={(e) => setAddSupplierId(e.target.value)}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
              >
                <option value="">Choose…</option>
                {availableSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-[var(--space-2)]">
              <div>
                <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                  Price (RM)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={addPrice}
                  onChange={(e) => setAddPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
                />
              </div>
              <div>
                <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                  Unit
                </label>
                <input
                  type="text"
                  value={addUnit}
                  onChange={(e) => setAddUnit(e.target.value)}
                  placeholder="kg"
                  className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
                />
              </div>
            </div>
            <div className="flex justify-end gap-[var(--space-2)]">
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setAddSupplierId("");
                  setAddPrice("");
                  setAddUnit("kg");
                }}
                className="rounded-lg border border-[var(--border-default)] px-3 py-1 text-meta"
              >
                <X size={14} className="inline" /> Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={isPending}
                className="rounded-lg bg-[var(--color-info)] px-3 py-1 text-meta font-medium text-white disabled:opacity-50"
              >
                <Check size={14} className="inline" /> Add
              </button>
            </div>
          </div>
        ) : (
          availableSuppliers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="mt-[var(--space-2)] flex items-center gap-1 text-meta text-[var(--color-info)] font-medium"
            >
              <Plus size={14} /> Add supplier
            </button>
          )
        ))}
      </div>

      {/* Purchase history */}
      <div>
        <p className="text-meta font-semibold text-[var(--text-secondary)] mb-[var(--space-1)]">
          Purchase history
        </p>
        {purchasesSorted.length === 0 ? (
          <p className="text-meta text-[var(--text-secondary)]">
            No purchases recorded.
          </p>
        ) : (
          <div className="space-y-[var(--space-1)]">
            {purchasesSorted.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded border border-[var(--border-default)] p-[var(--space-2)] text-meta"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.supplierName}</div>
                  <div className="text-[var(--text-secondary)]">
                    {p.quantity} {p.unit} · {formatRM(p.totalPriceInCents)}
                  </div>
                </div>
                <div className="text-[var(--text-secondary)] shrink-0">
                  {formatDate(p.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log purchase modal */}
      {purchaseFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm p-[var(--space-4)]">
          <div
            className="w-full max-w-[480px] rounded-t-2xl bg-[var(--bg-primary)] p-[var(--space-5)] space-y-[var(--space-3)]"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <h3 className="text-body font-semibold">
              Log purchase from {purchaseFor.supplierName}
            </h3>
            <div className="grid grid-cols-2 gap-[var(--space-2)]">
              <div>
                <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={purchaseQty}
                  onChange={(e) => setPurchaseQty(e.target.value)}
                  className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                />
              </div>
              <div>
                <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                  Unit
                </label>
                <input
                  type="text"
                  value={purchaseUnit}
                  onChange={(e) => setPurchaseUnit(e.target.value)}
                  className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                />
              </div>
            </div>
            <div>
              <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                Total (RM)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={purchaseTotal}
                onChange={(e) => setPurchaseTotal(e.target.value)}
                placeholder="0.00"
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
              />
            </div>
            <div className="flex justify-end gap-[var(--space-2)]">
              <button
                type="button"
                onClick={() => {
                  setPurchaseFor(null);
                  setPurchaseQty("");
                  setPurchaseUnit("kg");
                  setPurchaseTotal("");
                }}
                className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-meta"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogPurchase}
                disabled={isPending}
                className="rounded-lg bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50"
              >
                Log purchase
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationDialog
        open={!!removeTarget}
        title="Remove supplier?"
        message={`Remove ${removeTarget?.supplierName ?? ""} from this ingredient?`}
        confirmLabel="Remove"
        destructive
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
