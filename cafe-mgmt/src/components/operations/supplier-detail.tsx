"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { updateSupplier } from "@/actions/supplier.actions";
import {
  addIngredientSupplier,
  removeIngredientSupplier,
  updateIngredientSupplier,
} from "@/actions/setup.actions";
import { parseRMToCents } from "@/lib/format";
import { useToast } from "@/components/ui/toast";

interface SupplierProduct {
  id: string;
  ingredientId: string;
  ingredientName: string;
  priceInCents: number;
  unit: string;
}

interface SupplierData {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  reminderDays: number;
  lastOrderDate: string | null;
  products: SupplierProduct[];
}

interface PurchaseRow {
  id: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  totalPriceInCents: number;
  createdAt: string;
}

interface IngredientOption {
  id: string;
  name: string;
  unit: string;
}

interface Props {
  supplier: SupplierData;
  purchases: PurchaseRow[];
  allIngredients: IngredientOption[];
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

export function SupplierDetail({
  supplier: initialSupplier,
  purchases,
  allIngredients,
  mode,
}: Props) {
  const isManager = mode === "manager";
  const [supplier, setSupplier] = useState(initialSupplier);
  const [products, setProducts] = useState<SupplierProduct[]>(
    initialSupplier.products
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(initialSupplier.name);
  const [editPhone, setEditPhone] = useState(initialSupplier.phone ?? "");
  const [editNotes, setEditNotes] = useState(initialSupplier.notes ?? "");
  const [editReminder, setEditReminder] = useState(initialSupplier.reminderDays);

  // Per-product inline edit state
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductPrice, setEditProductPrice] = useState("");
  const [editProductUnit, setEditProductUnit] = useState("");

  // Add product form state
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [addIngredientId, setAddIngredientId] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addUnit, setAddUnit] = useState("");

  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const availableToAdd = useMemo(() => {
    const linked = new Set(products.map((p) => p.ingredientId));
    return allIngredients
      .filter((i) => !linked.has(i.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, allIngredients]);

  function startEdit() {
    setEditName(supplier.name);
    setEditPhone(supplier.phone ?? "");
    setEditNotes(supplier.notes ?? "");
    setEditReminder(supplier.reminderDays);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
  }

  function handleSave() {
    if (!editName.trim()) {
      toast("Name is required");
      return;
    }
    if (
      !Number.isInteger(editReminder) ||
      editReminder < 1 ||
      editReminder > 90
    ) {
      toast("Reminder must be a whole number between 1 and 90");
      return;
    }
    startTransition(async () => {
      const result = await updateSupplier({
        id: supplier.id,
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
        notes: editNotes.trim() || undefined,
        reminderDays: editReminder,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      setSupplier((prev) => ({
        ...prev,
        name: editName.trim(),
        phone: editPhone.trim() || null,
        notes: editNotes.trim() || null,
        reminderDays: editReminder,
      }));
      setIsEditing(false);
      toast("Supplier updated");
    });
  }

  function startEditProduct(product: SupplierProduct) {
    setEditingProductId(product.id);
    setEditProductPrice((product.priceInCents / 100).toFixed(2));
    setEditProductUnit(product.unit);
  }

  function cancelEditProduct() {
    setEditingProductId(null);
    setEditProductPrice("");
    setEditProductUnit("");
  }

  function handleSaveProduct(product: SupplierProduct) {
    const priceInCents = parseRMToCents(editProductPrice);
    if (priceInCents === null || priceInCents < 0) {
      toast("Invalid price");
      return;
    }
    const unit = editProductUnit.trim();
    if (!unit) {
      toast("Unit required");
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateIngredientSupplier({
          id: product.id,
          priceInCents,
          unit,
        });
        if (!result.success) {
          toast(result.error);
          return;
        }
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id ? { ...p, priceInCents, unit } : p
          )
        );
        setEditingProductId(null);
        setEditProductPrice("");
        setEditProductUnit("");
        router.refresh();
        toast("Product updated");
      } catch {
        toast("Couldn't save changes — please try again");
      }
    });
  }

  function handleRemoveProduct(product: SupplierProduct) {
    if (!window.confirm("Remove this product from the supplier?")) return;
    startTransition(async () => {
      try {
        const result = await removeIngredientSupplier({ id: product.id });
        if (!result.success) {
          toast(result.error);
          return;
        }
        setProducts((prev) => prev.filter((p) => p.id !== product.id));
        if (editingProductId === product.id) {
          setEditingProductId(null);
          setEditProductPrice("");
          setEditProductUnit("");
        }
        router.refresh();
        toast("Product removed");
      } catch {
        toast("Couldn't remove — please try again");
      }
    });
  }

  function openAddProduct() {
    setShowAddProduct(true);
    setAddIngredientId("");
    setAddPrice("");
    setAddUnit("");
  }

  function cancelAddProduct() {
    setShowAddProduct(false);
    setAddIngredientId("");
    setAddPrice("");
    setAddUnit("");
  }

  function handleAddProduct() {
    if (!addIngredientId) {
      toast("Choose an ingredient");
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
    const ingredient = allIngredients.find((i) => i.id === addIngredientId);
    if (!ingredient) {
      toast("Ingredient not found");
      return;
    }

    startTransition(async () => {
      try {
        const result = await addIngredientSupplier({
          ingredientId: addIngredientId,
          supplierId: supplier.id,
          priceInCents,
          unit,
        });
        if (!result.success) {
          toast(result.error);
          return;
        }
        setProducts((prev) => [
          ...prev,
          {
            id: result.data.id,
            ingredientId: ingredient.id,
            ingredientName: ingredient.name,
            priceInCents,
            unit,
          },
        ]);
        setShowAddProduct(false);
        setAddIngredientId("");
        setAddPrice("");
        setAddUnit("");
        router.refresh();
        toast("Product added");
      } catch {
        toast("Couldn't add — please try again");
      }
    });
  }

  return (
    <div className="space-y-[var(--space-6)]">
      {/* Back link */}
      <Link
        href="/suppliers"
        className="inline-flex items-center gap-1 text-meta text-[var(--color-info)] font-medium"
      >
        <ArrowLeft size={14} /> Suppliers
      </Link>

      {/* Contact section */}
      <section>
        {isEditing && isManager ? (
          <div className="space-y-[var(--space-2)]">
            <div>
              <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                Name
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                placeholder="Name"
              />
            </div>
            <div>
              <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                Phone
              </label>
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                placeholder="Phone"
              />
            </div>
            <div>
              <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                Notes
              </label>
              <input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                placeholder="Notes"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-meta text-[var(--text-secondary)]">
                Reminder every
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={editReminder}
                onChange={(e) => setEditReminder(Number(e.target.value))}
                className="w-16 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-meta"
              />
              <span className="text-meta text-[var(--text-secondary)]">days</span>
            </div>
            <div className="flex gap-[var(--space-2)] pt-[var(--space-1)]">
              <button
                type="button"
                onClick={cancelEdit}
                className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-meta"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="flex-1 rounded-lg bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-headline mb-[var(--space-1)]">{supplier.name}</h1>
              {supplier.phone ? (
                <p className="text-body">
                  <a
                    href={`tel:${supplier.phone}`}
                    className="text-[var(--color-info)] font-medium"
                  >
                    {supplier.phone}
                  </a>
                </p>
              ) : (
                <p className="text-body text-[var(--text-secondary)]">
                  No phone number
                </p>
              )}
              {supplier.notes && (
                <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
                  {supplier.notes}
                </p>
              )}
              <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
                Reminder every {supplier.reminderDays}{" "}
                {supplier.reminderDays === 1 ? "day" : "days"}
              </p>
              {supplier.lastOrderDate && (
                <p className="text-meta text-[var(--text-secondary)]">
                  Last order:{" "}
                  {new Date(supplier.lastOrderDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
            {isManager && (
              <button
                type="button"
                onClick={startEdit}
                className="touch-target inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-meta text-[var(--color-info)] font-medium"
                aria-label="Edit supplier"
              >
                <Pencil size={14} /> Edit
              </button>
            )}
          </div>
        )}
      </section>

      {/* Products supplied */}
      <section className="pt-[var(--space-4)] border-t border-[var(--border-default)]">
        <h2 className="text-body font-semibold mb-[var(--space-2)]">
          Products supplied
        </h2>
        {products.length === 0 ? (
          <p className="text-meta text-[var(--text-secondary)]">
            No ingredients linked yet
          </p>
        ) : (
          <div className="space-y-[var(--space-1)]">
            {products.map((p) => {
              const isEditingProduct = editingProductId === p.id;

              if (!isManager) {
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded border border-[var(--border-default)] p-[var(--space-2)] text-meta"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {p.ingredientName}
                      </div>
                    </div>
                    <div className="text-[var(--text-secondary)] shrink-0">
                      {formatRM(p.priceInCents)}/{p.unit}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={p.id}
                  className="rounded border border-[var(--border-default)] p-[var(--space-2)]"
                >
                  {isEditingProduct ? (
                    <div className="space-y-[var(--space-2)]">
                      <div className="text-meta font-medium">
                        {p.ingredientName}
                      </div>
                      <div className="grid grid-cols-2 gap-[var(--space-2)]">
                        <div>
                          <label
                            htmlFor={`edit-price-${p.id}`}
                            className="text-meta text-[var(--text-secondary)] block mb-0.5"
                          >
                            Price (RM)
                          </label>
                          <input
                            id={`edit-price-${p.id}`}
                            type="number"
                            step="0.01"
                            min="0"
                            value={editProductPrice}
                            onChange={(e) =>
                              setEditProductPrice(e.target.value)
                            }
                            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-unit-${p.id}`}
                            className="text-meta text-[var(--text-secondary)] block mb-0.5"
                          >
                            Unit
                          </label>
                          <input
                            id={`edit-unit-${p.id}`}
                            type="text"
                            maxLength={20}
                            value={editProductUnit}
                            onChange={(e) =>
                              setEditProductUnit(e.target.value)
                            }
                            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-[var(--space-2)]">
                        <button
                          type="button"
                          onClick={cancelEditProduct}
                          className="rounded-lg border border-[var(--border-default)] px-3 py-1 text-meta"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveProduct(p)}
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
                          {p.ingredientName}
                        </div>
                        <div className="text-meta text-[var(--text-secondary)]">
                          {formatRM(p.priceInCents)}/{p.unit}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-[var(--space-2)]">
                        <button
                          type="button"
                          onClick={() => startEditProduct(p)}
                          disabled={isPending}
                          className="touch-target p-1 text-[var(--text-secondary)] disabled:opacity-40"
                          aria-label={`Edit ${p.ingredientName}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveProduct(p)}
                          disabled={isPending}
                          className="touch-target p-1 text-[var(--color-urgent,#dc2626)] disabled:opacity-40"
                          aria-label={`Remove ${p.ingredientName}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isManager && (
          <div className="mt-[var(--space-2)]">
            {showAddProduct ? (
              <div className="rounded border border-dashed border-[var(--border-default)] p-[var(--space-2)] space-y-[var(--space-2)]">
                <div>
                  <label
                    htmlFor="add-product-ingredient"
                    className="text-meta text-[var(--text-secondary)] block mb-0.5"
                  >
                    Ingredient
                  </label>
                  <select
                    id="add-product-ingredient"
                    value={addIngredientId}
                    onChange={(e) => setAddIngredientId(e.target.value)}
                    className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
                  >
                    <option value="">Choose…</option>
                    {availableToAdd.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-[var(--space-2)]">
                  <div>
                    <label
                      htmlFor="add-product-price"
                      className="text-meta text-[var(--text-secondary)] block mb-0.5"
                    >
                      Price (RM)
                    </label>
                    <input
                      id="add-product-price"
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
                    <label
                      htmlFor="add-product-unit"
                      className="text-meta text-[var(--text-secondary)] block mb-0.5"
                    >
                      Unit
                    </label>
                    <input
                      id="add-product-unit"
                      type="text"
                      maxLength={20}
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
                    onClick={cancelAddProduct}
                    className="rounded-lg border border-[var(--border-default)] px-3 py-1 text-meta"
                  >
                    <X size={14} className="inline" /> Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddProduct}
                    disabled={isPending}
                    className="rounded-lg bg-[var(--color-info)] px-3 py-1 text-meta font-medium text-white disabled:opacity-50"
                  >
                    <Check size={14} className="inline" /> Add
                  </button>
                </div>
              </div>
            ) : availableToAdd.length === 0 ? (
              <div className="space-y-[var(--space-1)]">
                <button
                  type="button"
                  disabled
                  className="flex items-center gap-1 text-meta text-[var(--text-secondary)] font-medium opacity-50 cursor-not-allowed"
                >
                  <Plus size={14} /> Add product
                </button>
                <p className="text-meta text-[var(--text-secondary)]">
                  {allIngredients.length === 0
                    ? "No ingredients exist yet. Add one in Settings → Ingredients."
                    : "All cafe ingredients are linked to this supplier."}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={openAddProduct}
                className="flex items-center gap-1 text-meta text-[var(--color-info)] font-medium"
              >
                <Plus size={14} /> Add product
              </button>
            )}
          </div>
        )}
      </section>

      {/* Purchase history */}
      <section className="pt-[var(--space-4)] border-t border-[var(--border-default)]">
        <h2 className="text-body font-semibold mb-[var(--space-2)]">
          Purchase history
        </h2>
        {purchases.length === 0 ? (
          <p className="text-meta text-[var(--text-secondary)]">
            No purchases logged yet
          </p>
        ) : (
          <div className="space-y-[var(--space-1)]">
            {purchases.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded border border-[var(--border-default)] p-[var(--space-2)] text-meta"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.ingredientName}</div>
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
      </section>
    </div>
  );
}
