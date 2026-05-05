"use client";

import { useEffect, useState, useTransition, useMemo } from "react";
import Link from "next/link";
import {
  addSupplier,
  updateSupplier,
  deleteSupplier,
  logCallOutcome,
} from "@/actions/supplier.actions";
import {
  addIngredientSupplier,
  updateIngredientSupplier,
  removeIngredientSupplier,
} from "@/actions/setup.actions";
import { UnitPicker } from "@/components/ui/unit-picker";
import { DEFAULT_ENABLED_UNITS } from "@/lib/units";
import { parseRMToCentsPrecise } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { CallOutcomePrompt, type PurchasePayload } from "./call-outcome-prompt";
import { Phone, Plus, Check, X } from "lucide-react";

interface IngredientChoice {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  priceInCents: number;
  linkedToSupplier: boolean;
}

interface SupplierIngredient {
  id: string; // IngredientSupplier link id
  ingredientId: string;
  name: string;
  unit: string;
  priceInCents: number;
}

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  lastOrderDate: string | null;
  reminderDays: number;
  ingredients: Array<{ id: string; name: string; unit: string }>;
  ingredientChoices: IngredientChoice[];
}

interface AllIngredient {
  id: string;
  name: string;
  unit: string;
}

function formatRM(cents: number): string {
  return `RM ${(Math.floor(cents) / 100).toFixed(2)}`;
}

// Build the picker-friendly view of a supplier's ingredient links from its
// `ingredientChoices` (which includes the link id). The list page passes
// `ingredients` (deduped names for display) plus `ingredientChoices` (full
// link rows). Picker editing needs the link rows.
function deriveSupplierIngredients(
  choices: IngredientChoice[]
): SupplierIngredient[] {
  return choices
    .filter((c) => c.linkedToSupplier)
    .map((c) => ({
      id: c.id,
      ingredientId: c.ingredientId,
      name: c.ingredientName,
      unit: c.unit,
      priceInCents: c.priceInCents,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function SupplierList({
  initialSuppliers,
  allIngredients,
  isManager,
  enabledUnits = DEFAULT_ENABLED_UNITS,
}: {
  initialSuppliers: Supplier[];
  allIngredients: AllIngredient[];
  isManager: boolean;
  enabledUnits?: string[];
}) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [callPromptId, setCallPromptId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  // Add form state
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editReminder, setEditReminder] = useState(7);

  // Per-supplier ingredient picker state.
  // Tracks: (a) which supplier card is currently showing the "+ Add ingredient"
  // expanded form, (b) which existing link is in inline-edit mode, and
  // (c) which link is pending a remove confirmation.
  const [addingForSupplierId, setAddingForSupplierId] = useState<string | null>(
    null
  );
  const [addIngredientId, setAddIngredientId] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addUnit, setAddUnit] = useState("");

  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editLinkPrice, setEditLinkPrice] = useState("");
  const [editLinkUnit, setEditLinkUnit] = useState("");

  const [removeTarget, setRemoveTarget] = useState<
    | {
        linkId: string;
        supplierId: string;
        supplierName: string;
        ingredientName: string;
      }
    | null
  >(null);

  // Reset any open manager-only UI when the role flips to non-manager. Without
  // this, an already-open picker / edit form / pending remove confirmation
  // could fire after `isManager` has gone false (e.g. session change), which
  // would either render orphaned forms or trigger a confirmed remove against
  // a now-read-only view.
  useEffect(() => {
    if (!isManager) {
      setAddingForSupplierId(null);
      setAddIngredientId("");
      setAddPrice("");
      setAddUnit("");
      setEditingLinkId(null);
      setEditLinkPrice("");
      setEditLinkUnit("");
      setRemoveTarget(null);
    }
  }, [isManager]);

  function startEdit(s: Supplier) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditPhone(s.phone ?? "");
    setEditNotes(s.notes ?? "");
    setEditReminder(s.reminderDays);
  }

  function handleAdd() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const result = await addSupplier({
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        notes: newNotes.trim() || undefined,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      setSuppliers((prev) => [
        ...prev,
        {
          id: result.data.id,
          name: newName.trim(),
          phone: newPhone.trim() || null,
          notes: newNotes.trim() || null,
          lastOrderDate: null,
          reminderDays: 7,
          ingredients: [],
          ingredientChoices: [],
        },
      ]);
      setNewName("");
      setNewPhone("");
      setNewNotes("");
      setShowAdd(false);
      toast("Supplier added");
    });
  }

  function handleUpdate(id: string) {
    startTransition(async () => {
      const result = await updateSupplier({
        id,
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
        notes: editNotes.trim() || undefined,
        reminderDays: editReminder,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                name: editName.trim(),
                phone: editPhone.trim() || null,
                notes: editNotes.trim() || null,
                reminderDays: editReminder,
              }
            : s
        )
      );
      setEditingId(null);
      toast("Supplier updated");
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this supplier?")) return;
    startTransition(async () => {
      const result = await deleteSupplier(id);
      if (!result.success) {
        toast(result.error);
        return;
      }
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      toast("Supplier deleted");
    });
  }

  function handleCallOutcome(
    supplierId: string,
    outcome: "ORDERED" | "NO_ANSWER" | "CALL_BACK",
    purchase?: PurchasePayload
  ) {
    startTransition(async () => {
      const result = await logCallOutcome({ supplierId, outcome, purchase });
      if (!result.success) {
        toast(result.error);
        return;
      }
      if (outcome === "ORDERED") {
        setSuppliers((prev) =>
          prev.map((s) =>
            s.id === supplierId
              ? { ...s, lastOrderDate: new Date().toISOString() }
              : s
          )
        );
      }
      setCallPromptId(null);
      toast(
        outcome === "ORDERED"
          ? purchase
            ? "Order + purchase logged"
            : "Order logged"
          : outcome === "NO_ANSWER"
            ? "No answer recorded"
            : "Call back reminder set"
      );
    });
  }

  // ---- Ingredient-link helpers (per-card) ----------------------------------

  function openAddIngredient(supplierId: string) {
    setAddingForSupplierId(supplierId);
    setAddIngredientId("");
    setAddPrice("");
    setAddUnit("");
    // Cancel any in-flight chip edit for clarity.
    setEditingLinkId(null);
  }

  function cancelAddIngredient() {
    setAddingForSupplierId(null);
    setAddIngredientId("");
    setAddPrice("");
    setAddUnit("");
  }

  function startEditLink(link: SupplierIngredient) {
    setEditingLinkId(link.id);
    setEditLinkPrice((Math.floor(link.priceInCents) / 100).toFixed(2));
    setEditLinkUnit(link.unit);
    // Close any open add picker on the same card to avoid two forms at once.
    setAddingForSupplierId(null);
  }

  function cancelEditLink() {
    setEditingLinkId(null);
    setEditLinkPrice("");
    setEditLinkUnit("");
  }

  function applySupplierLinkUpdate(
    supplierId: string,
    update: (s: Supplier) => Supplier
  ) {
    setSuppliers((prev) =>
      prev.map((s) => (s.id === supplierId ? update(s) : s))
    );
  }

  function handleAddIngredient(supplierId: string) {
    if (isPending) return;
    if (!addIngredientId) return;
    const priceInCents = parseRMToCentsPrecise(addPrice);
    if (priceInCents === null || priceInCents <= 0) return;
    const unit = addUnit.trim();
    if (!unit) return;

    const ingredient = allIngredients.find((i) => i.id === addIngredientId);
    if (!ingredient) {
      toast("Ingredient not found");
      return;
    }

    // Optimistic insert with a temporary id; replace it with the real id on
    // success or roll back on failure.
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticChoice: IngredientChoice = {
      id: tempId,
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      unit,
      priceInCents,
      linkedToSupplier: true,
    };

    applySupplierLinkUpdate(supplierId, (s) => ({
      ...s,
      ingredients: [
        ...s.ingredients.filter((i) => i.id !== ingredient.id),
        { id: ingredient.id, name: ingredient.name, unit },
      ].sort((a, b) => a.name.localeCompare(b.name)),
      ingredientChoices: [...s.ingredientChoices, optimisticChoice].sort(
        (a, b) => a.ingredientName.localeCompare(b.ingredientName)
      ),
    }));

    startTransition(async () => {
      const result = await addIngredientSupplier({
        ingredientId: ingredient.id,
        supplierId,
        priceInCents,
        unit,
      });
      if (!result.success) {
        // Rollback
        applySupplierLinkUpdate(supplierId, (s) => ({
          ...s,
          ingredients: s.ingredients.filter(
            (i) => !(i.id === ingredient.id && !s.ingredientChoices.some(
              (c) => c.id !== tempId && c.ingredientId === ingredient.id
            ))
          ),
          ingredientChoices: s.ingredientChoices.filter((c) => c.id !== tempId),
        }));
        toast(result.error);
        return;
      }
      // Replace temp id with real id
      const realId = result.data.id;
      applySupplierLinkUpdate(supplierId, (s) => ({
        ...s,
        ingredientChoices: s.ingredientChoices.map((c) =>
          c.id === tempId ? { ...c, id: realId } : c
        ),
      }));
      cancelAddIngredient();
      toast("Ingredient added");
    });
  }

  function handleSaveLink(link: SupplierIngredient, supplierId: string) {
    if (isPending) return;
    const priceInCents = parseRMToCentsPrecise(editLinkPrice);
    if (priceInCents === null || priceInCents <= 0) return;
    const unit = editLinkUnit.trim();
    if (!unit) return;

    const previousPrice = link.priceInCents;
    const previousUnit = link.unit;

    // Optimistic update
    applySupplierLinkUpdate(supplierId, (s) => ({
      ...s,
      ingredients: s.ingredients.map((i) =>
        i.id === link.ingredientId ? { ...i, unit } : i
      ),
      ingredientChoices: s.ingredientChoices.map((c) =>
        c.id === link.id ? { ...c, priceInCents, unit } : c
      ),
    }));

    startTransition(async () => {
      const result = await updateIngredientSupplier({
        id: link.id,
        priceInCents,
        unit,
      });
      if (!result.success) {
        // Rollback
        applySupplierLinkUpdate(supplierId, (s) => ({
          ...s,
          ingredients: s.ingredients.map((i) =>
            i.id === link.ingredientId ? { ...i, unit: previousUnit } : i
          ),
          ingredientChoices: s.ingredientChoices.map((c) =>
            c.id === link.id
              ? { ...c, priceInCents: previousPrice, unit: previousUnit }
              : c
          ),
        }));
        toast(result.error);
        return;
      }
      cancelEditLink();
      toast("Ingredient updated");
    });
  }

  function confirmRemoveLink() {
    if (isPending) return;
    if (!removeTarget) return;
    const { linkId, supplierId } = removeTarget;
    const target = suppliers.find((s) => s.id === supplierId);
    const linkToRemove = target?.ingredientChoices.find((c) => c.id === linkId);
    if (!target || !linkToRemove) {
      setRemoveTarget(null);
      return;
    }
    const previousChoices = target.ingredientChoices;
    const previousIngredients = target.ingredients;

    // Optimistic remove
    applySupplierLinkUpdate(supplierId, (s) => {
      const remainingChoices = s.ingredientChoices.filter(
        (c) => c.id !== linkId
      );
      const stillHasIngredient = remainingChoices.some(
        (c) => c.ingredientId === linkToRemove.ingredientId
      );
      return {
        ...s,
        ingredientChoices: remainingChoices,
        ingredients: stillHasIngredient
          ? s.ingredients
          : s.ingredients.filter((i) => i.id !== linkToRemove.ingredientId),
      };
    });
    setRemoveTarget(null);

    startTransition(async () => {
      const result = await removeIngredientSupplier({ id: linkId });
      if (!result.success) {
        // Rollback
        applySupplierLinkUpdate(supplierId, (s) => ({
          ...s,
          ingredientChoices: previousChoices,
          ingredients: previousIngredients,
        }));
        toast(result.error);
        return;
      }
      // Close edit form if the removed link was being edited.
      if (editingLinkId === linkId) cancelEditLink();
      toast("Ingredient removed");
    });
  }

  const activeChoices = useMemo<IngredientChoice[]>(() => {
    if (!callPromptId) return [];
    const supplier = suppliers.find((s) => s.id === callPromptId);
    if (!supplier) return [];
    if (supplier.ingredientChoices.length > 0) return supplier.ingredientChoices;
    return allIngredients.map((ing) => ({
      id: ing.id, // unused — fallback choices are not real IngredientSupplier ids
      ingredientId: ing.id,
      ingredientName: ing.name,
      unit: ing.unit,
      priceInCents: 0,
      linkedToSupplier: false,
    }));
  }, [callPromptId, suppliers, allIngredients]);

  return (
    <div className="space-y-[var(--space-2)] lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
      {suppliers.map((supplier) => {
        const supplierLinks = deriveSupplierIngredients(
          supplier.ingredientChoices
        );
        const linkedIngredientIds = new Set(
          supplierLinks.map((l) => l.ingredientId)
        );
        const availableToAdd = allIngredients
          .filter((i) => !linkedIngredientIds.has(i.id))
          .sort((a, b) => a.name.localeCompare(b.name));
        const isAdding = addingForSupplierId === supplier.id;
        const addPriceCents = parseRMToCentsPrecise(addPrice);
        const canSubmitAdd =
          isAdding &&
          addIngredientId !== "" &&
          addPriceCents !== null &&
          addPriceCents > 0 &&
          addUnit.trim() !== "";

        return (
          <div
            key={supplier.id}
            className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)]"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            {editingId === supplier.id ? (
              <div className="space-y-[var(--space-2)]">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                  placeholder="Name"
                />
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                  placeholder="Phone"
                />
                <input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                  placeholder="Notes"
                />
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
                <div className="flex gap-[var(--space-2)]">
                  <button
                    onClick={() => setEditingId(null)}
                    className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-meta"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleUpdate(supplier.id)}
                    disabled={isPending}
                    className="flex-1 rounded-lg bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Link
                      href={`/suppliers/${supplier.id}`}
                      className="text-body font-medium hover:underline"
                    >
                      {supplier.name}
                    </Link>
                    {supplier.notes && (
                      <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
                        {supplier.notes}
                      </p>
                    )}
                    {supplier.lastOrderDate && (
                      <p className="text-meta text-[var(--text-secondary)]">
                        Last order:{" "}
                        {new Date(supplier.lastOrderDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    )}
                  </div>

                  {/* Tap-to-call */}
                  {supplier.phone && (
                    <a
                      href={`tel:${supplier.phone}`}
                      onClick={() => setCallPromptId(supplier.id)}
                      className="touch-target flex size-[44px] items-center justify-center rounded-lg bg-[var(--color-info)]/10 text-[var(--color-info)] active:scale-95"
                      title={`Call ${supplier.phone}`}
                    >
                      <Phone size={20} />
                    </a>
                  )}
                </div>

                {/* Ingredient links */}
                {(supplierLinks.length > 0 || (isManager && availableToAdd.length > 0)) && (
                  <div className="mt-[var(--space-2)] pt-[var(--space-2)] border-t border-[var(--border-default)]">
                    <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-1)]">
                      Supplies
                    </p>

                    {!isManager ? (
                      // Staff: read-only chips (legacy display)
                      <div className="flex flex-wrap gap-1">
                        {supplierLinks.map((link) => (
                          <span
                            key={link.id}
                            className="text-meta rounded-full bg-[var(--bg-secondary,#f3f4f6)] px-2 py-0.5"
                          >
                            {link.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-[var(--space-1)]">
                        {supplierLinks.map((link) => {
                          const isEditingThis = editingLinkId === link.id;
                          const editPriceCents =
                            parseRMToCentsPrecise(editLinkPrice);
                          const canSaveEdit =
                            isEditingThis &&
                            editPriceCents !== null &&
                            editPriceCents > 0 &&
                            editLinkUnit.trim() !== "";

                          if (isEditingThis) {
                            return (
                              <div
                                key={link.id}
                                className="flex flex-wrap items-center gap-[var(--space-1)] rounded border border-[var(--border-default)] bg-[var(--bg-secondary,#f3f4f6)] p-[var(--space-1)]"
                              >
                                <span className="text-meta font-medium">
                                  {link.name}
                                </span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={editLinkPrice}
                                  onChange={(e) =>
                                    setEditLinkPrice(e.target.value)
                                  }
                                  aria-label={`Price for ${link.name}`}
                                  className="w-20 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-meta"
                                />
                                <UnitPicker
                                  value={editLinkUnit}
                                  onChange={setEditLinkUnit}
                                  enabledUnits={enabledUnits}
                                  ariaLabel={`Unit for ${link.name}`}
                                  className="w-20 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-meta"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSaveLink(link, supplier.id)
                                  }
                                  disabled={isPending || !canSaveEdit}
                                  aria-label={`Save ${link.name}`}
                                  className="touch-target inline-flex size-[28px] items-center justify-center rounded text-[var(--color-info)] disabled:opacity-40"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditLink}
                                  aria-label={`Cancel editing ${link.name}`}
                                  className="touch-target inline-flex size-[28px] items-center justify-center rounded text-[var(--text-secondary)]"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            );
                          }

                          return (
                            <span
                              key={link.id}
                              className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-secondary,#f3f4f6)] pl-2 pr-0.5 py-0.5 text-meta"
                            >
                              <button
                                type="button"
                                onClick={() => startEditLink(link)}
                                aria-label={`Edit ${link.name}`}
                                className="text-meta"
                              >
                                {link.name}
                                <span className="ml-1 text-[var(--text-secondary)]">
                                  {formatRM(link.priceInCents)}/{link.unit}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setRemoveTarget({
                                    linkId: link.id,
                                    supplierId: supplier.id,
                                    supplierName: supplier.name,
                                    ingredientName: link.name,
                                  })
                                }
                                aria-label={`Remove ${link.name}`}
                                className="touch-target inline-flex items-center justify-center rounded-full text-[var(--color-urgent,#dc2626)]"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          );
                        })}

                        {/* Add picker */}
                        {isAdding ? (
                          <div className="w-full rounded border border-dashed border-[var(--border-default)] p-[var(--space-2)] mt-[var(--space-1)] space-y-[var(--space-2)]">
                            <div>
                              <label
                                htmlFor={`add-ing-${supplier.id}`}
                                className="text-meta text-[var(--text-secondary)] block mb-0.5"
                              >
                                Ingredient
                              </label>
                              <select
                                id={`add-ing-${supplier.id}`}
                                value={addIngredientId}
                                onChange={(e) =>
                                  setAddIngredientId(e.target.value)
                                }
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
                                  htmlFor={`add-price-${supplier.id}`}
                                  className="text-meta text-[var(--text-secondary)] block mb-0.5"
                                >
                                  Price (RM)
                                </label>
                                <input
                                  id={`add-price-${supplier.id}`}
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
                                  htmlFor={`add-unit-${supplier.id}`}
                                  className="text-meta text-[var(--text-secondary)] block mb-0.5"
                                >
                                  Unit
                                </label>
                                <UnitPicker
                                  id={`add-unit-${supplier.id}`}
                                  value={addUnit}
                                  onChange={setAddUnit}
                                  enabledUnits={enabledUnits}
                                  ariaLabel={`Unit for ingredient added to supplier ${supplier.name}`}
                                  className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-[var(--space-2)]">
                              <button
                                type="button"
                                onClick={cancelAddIngredient}
                                aria-label="Cancel add ingredient"
                                className="rounded-lg border border-[var(--border-default)] px-3 py-1 text-meta"
                              >
                                <X size={14} className="inline" /> Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddIngredient(supplier.id)}
                                disabled={isPending || !canSubmitAdd}
                                aria-label="Save new ingredient"
                                className="rounded-lg bg-[var(--color-info)] px-3 py-1 text-meta font-medium text-white disabled:opacity-50"
                              >
                                <Check size={14} className="inline" /> Add
                              </button>
                            </div>
                          </div>
                        ) : (
                          availableToAdd.length > 0 && (
                            <button
                              type="button"
                              onClick={() => openAddIngredient(supplier.id)}
                              className="touch-target inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border-default)] px-3 py-0.5 text-meta text-[var(--color-info)] font-medium"
                            >
                              <Plus size={12} /> Add ingredient
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Manager actions */}
                {isManager && (
                  <div className="flex gap-[var(--space-3)] mt-[var(--space-2)]">
                    <button
                      onClick={() => startEdit(supplier)}
                      className="text-meta text-[var(--color-info)] font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(supplier.id)}
                      className="text-meta text-[var(--color-urgent,#dc2626)] font-medium"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Call outcome prompt */}
      {callPromptId && (
        <CallOutcomePrompt
          ingredientChoices={activeChoices}
          onSelect={(outcome, purchase) =>
            handleCallOutcome(callPromptId, outcome, purchase)
          }
          onClose={() => setCallPromptId(null)}
        />
      )}

      {/* Add supplier */}
      {isManager && !showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full rounded-lg border-2 border-dashed border-[var(--border-default)] p-[var(--space-3)] text-body text-[var(--color-info)] font-medium active:scale-[0.98]"
        >
          + Add Supplier
        </button>
      )}

      {isManager && showAdd && (
        <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)] space-y-[var(--space-2)]" style={{ boxShadow: "var(--shadow-card)" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
            placeholder="Supplier name"
            autoFocus
          />
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
            placeholder="Phone number"
          />
          <input
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
            placeholder="Notes (optional)"
          />
          <div className="flex gap-[var(--space-2)]">
            <button
              onClick={() => setShowAdd(false)}
              className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-meta"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={isPending || !newName.trim()}
              className="flex-1 rounded-lg bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Remove confirmation */}
      <ConfirmationDialog
        open={removeTarget !== null}
        title="Remove ingredient"
        message={
          removeTarget
            ? `Remove ${removeTarget.ingredientName} from ${removeTarget.supplierName}?`
            : ""
        }
        confirmLabel="Remove"
        destructive
        onConfirm={confirmRemoveLink}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
