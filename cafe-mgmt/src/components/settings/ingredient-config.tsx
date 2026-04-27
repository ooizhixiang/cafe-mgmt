"use client";

import { useState, useTransition } from "react";
import { updateIngredientConfig, togglePin } from "@/actions/inventory.actions";
import { addIngredient, updateIngredient, deleteIngredient } from "@/actions/setup.actions";
import { useToast } from "@/components/ui/toast";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Plus, Trash2, Check, X, Star } from "lucide-react";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  costPerUnitInCents: number | null;
  snapIncrement: number | null;
  containerProfile: string | null;
  category: string | null;
  lowStockThreshold: number | null;
  unitsPerContainer: number | null;
  supplierId: string | null;
  isPinned: boolean;
}

interface SupplierOption {
  id: string;
  name: string;
}

export function IngredientConfig({
  initialIngredients,
  suppliers,
}: {
  initialIngredients: Ingredient[];
  suppliers: SupplierOption[];
}) {
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);
  const { toast } = useToast();

  function handleSave(id: string, data: Partial<Ingredient>) {
    startTransition(async () => {
      const result = await updateIngredientConfig({
        id,
        costPerUnitInCents: data.costPerUnitInCents,
        snapIncrement: data.snapIncrement,
        containerProfile: data.containerProfile,
        category: data.category,
        lowStockThreshold: data.lowStockThreshold,
        unitsPerContainer: data.unitsPerContainer,
        supplierId: data.supplierId,
        isPinned: data.isPinned,
      });

      if (!result.success) {
        toast(result.error);
        return;
      }
      toast(`${ingredients.find((i) => i.id === id)?.name} updated`);
      setIngredients((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...data } : i))
      );
      setExpandedId(null);
    });
  }

  function handleTogglePin(id: string) {
    startTransition(async () => {
      const result = await togglePin(id);
      if (result.success) {
        setIngredients((prev) =>
          prev.map((i) => (i.id === id ? { ...i, isPinned: !i.isPinned } : i))
        );
      }
    });
  }

  function handleRename(id: string, name: string, unit: string) {
    startTransition(async () => {
      const result = await updateIngredient(id, name, unit);
      if (!result.success) {
        toast(result.error);
        return;
      }
      setIngredients((prev) =>
        prev.map((i) => (i.id === id ? { ...i, name, unit } : i))
      );
      toast("Ingredient renamed");
    });
  }

  function handleAdd() {
    if (!newName.trim() || !newUnit.trim()) return;
    startTransition(async () => {
      const result = await addIngredient(newName.trim(), newUnit.trim());
      if (!result.success) {
        toast(result.error);
        return;
      }
      setIngredients((prev) => [
        ...prev,
        {
          id: result.data.id,
          name: newName.trim(),
          unit: newUnit.trim(),
          costPerUnitInCents: null,
          snapIncrement: null,
          containerProfile: null,
          category: null,
          lowStockThreshold: null,
          unitsPerContainer: null,
          supplierId: null,
          isPinned: false,
        },
      ]);
      setNewName("");
      setNewUnit("");
      setShowAdd(false);
      toast("Ingredient added");
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      const result = await deleteIngredient(id);
      if (!result.success) {
        toast(result.error);
        return;
      }
      setIngredients((prev) => prev.filter((i) => i.id !== id));
      setDeleteTarget(null);
      if (expandedId === id) setExpandedId(null);
      toast("Ingredient removed");
    });
  }

  return (
    <div>
      <div className="space-y-[var(--space-2)]">
        {ingredients.length === 0 && !showAdd && (
          <p className="text-body text-[var(--text-secondary)] py-[var(--space-4)] text-center">
            No ingredients yet. Add your first one below.
          </p>
        )}

        {ingredients.map((ing) => (
          <div
            key={ing.id}
            className="rounded-lg border border-[var(--border-default)] overflow-hidden"
          >
            <button
              onClick={() =>
                setExpandedId(expandedId === ing.id ? null : ing.id)
              }
              className="w-full flex items-center justify-between p-[var(--space-3)] text-left"
            >
              <div className="flex items-center gap-[var(--space-2)]">
                {ing.isPinned && <Star size={14} className="text-[var(--color-warning)] fill-current" />}
                <span className="text-body font-medium">{ing.name}</span>
                <span className="text-meta text-[var(--text-secondary)]">
                  ({ing.unit})
                </span>
              </div>
              <span className="text-meta text-[var(--text-secondary)]">
                {expandedId === ing.id ? "▲" : "▼"}
              </span>
            </button>

            {expandedId === ing.id && (
              <IngredientConfigForm
                ingredient={ing}
                suppliers={suppliers}
                onSave={(data) => handleSave(ing.id, data)}
                onRename={(name, unit) => handleRename(ing.id, name, unit)}
                onTogglePin={() => handleTogglePin(ing.id)}
                onDelete={() => setDeleteTarget(ing)}
                isPending={isPending}
              />
            )}
          </div>
        ))}
      </div>

      {showAdd ? (
        <div className="mt-[var(--space-3)] flex items-center gap-[var(--space-2)] rounded-lg border border-dashed border-[var(--border-default)] p-[var(--space-3)]">
          <input
            type="text"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
            autoFocus
          />
          <input
            type="text"
            placeholder="Unit (e.g. lbs, oz, bags)"
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            className="w-24 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
          />
          <button
            onClick={handleAdd}
            disabled={isPending || !newName.trim() || !newUnit.trim()}
            className="touch-target p-1 text-[var(--color-success)] disabled:opacity-30"
          >
            <Check size={20} />
          </button>
          <button
            onClick={() => { setShowAdd(false); setNewName(""); setNewUnit(""); }}
            className="touch-target p-1 text-[var(--text-secondary)]"
          >
            <X size={20} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-[var(--space-3)] flex items-center gap-[var(--space-2)] text-body text-[var(--color-info)] font-medium"
        >
          <Plus size={18} />
          Add ingredient
        </button>
      )}

      <ConfirmationDialog
        open={!!deleteTarget}
        title="Remove ingredient?"
        message={`Remove "${deleteTarget?.name}" from your ingredient list? This cannot be undone.`}
        confirmLabel="Remove"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function IngredientConfigForm({
  ingredient,
  suppliers,
  onSave,
  onRename,
  onTogglePin,
  onDelete,
  isPending,
}: {
  ingredient: Ingredient;
  suppliers: SupplierOption[];
  onSave: (data: Partial<Ingredient>) => void;
  onRename: (name: string, unit: string) => void;
  onTogglePin: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(ingredient.name);
  const [unit, setUnit] = useState(ingredient.unit);
  const [cost, setCost] = useState(
    ingredient.costPerUnitInCents ? (ingredient.costPerUnitInCents / 100).toFixed(2) : ""
  );
  const [snap, setSnap] = useState(ingredient.snapIncrement?.toString() ?? "");
  const [container, setContainer] = useState(ingredient.containerProfile ?? "");
  const [category, setCategory] = useState(ingredient.category ?? "");
  const [threshold, setThreshold] = useState(ingredient.lowStockThreshold?.toString() ?? "");
  const [unitsPerContainer, setUnitsPerContainer] = useState(
    ingredient.unitsPerContainer?.toString() ?? ""
  );
  const [supplierId, setSupplierId] = useState(ingredient.supplierId ?? "");

  const nameChanged = name !== ingredient.name || unit !== ingredient.unit;

  function handleSubmit() {
    if (nameChanged) {
      onRename(name, unit);
    }
    onSave({
      costPerUnitInCents: cost ? Math.round(parseFloat(cost) * 100) : null,
      snapIncrement: snap ? parseInt(snap) : null,
      containerProfile: container || null,
      category: category || null,
      lowStockThreshold: threshold ? parseInt(threshold) : null,
      unitsPerContainer: unitsPerContainer ? parseInt(unitsPerContainer) : null,
      supplierId: supplierId || null,
    });
  }

  return (
    <div className="px-[var(--space-3)] pb-[var(--space-3)] space-y-[var(--space-2)] border-t border-[var(--border-default)]">
      {/* Name & unit (editable) */}
      <div className="grid grid-cols-2 gap-[var(--space-2)] pt-[var(--space-2)]">
        <div>
          <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
          />
        </div>
        <div>
          <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
            Unit
          </label>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
          />
        </div>
      </div>

      {/* Config fields */}
      <div className="grid grid-cols-2 gap-[var(--space-2)]">
        <div>
          <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
            Cost per unit ($)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0.00"
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
          />
        </div>
        <div>
          <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
            Snap increment
          </label>
          <input
            type="number"
            min="1"
            value={snap}
            onChange={(e) => setSnap(e.target.value)}
            placeholder="e.g. 5"
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
          />
        </div>
        <div>
          <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
            Container profile
          </label>
          <input
            type="text"
            maxLength={100}
            value={container}
            onChange={(e) => setContainer(e.target.value)}
            placeholder="e.g. case (6-pack)"
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
          />
        </div>
        <div>
          <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
            Category
          </label>
          <input
            type="text"
            maxLength={50}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Dairy"
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
          />
        </div>
        <div>
          <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
            Low stock threshold
          </label>
          <input
            type="number"
            min="0"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="e.g. 10"
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
          />
        </div>
        <div>
          <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
            Units per container
          </label>
          <input
            type="number"
            min="1"
            value={unitsPerContainer}
            onChange={(e) => setUnitsPerContainer(e.target.value)}
            placeholder="e.g. 12"
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
          />
        </div>
        <div className="col-span-2">
          <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
            Supplier
          </label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
          >
            <option value="">— None —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between pt-[var(--space-1)]">
        <div className="flex items-center gap-[var(--space-3)]">
          <button
            onClick={onTogglePin}
            className="text-meta text-[var(--color-warning)] font-medium"
          >
            {ingredient.isPinned ? "Unpin" : "Pin to top"}
          </button>
          <button
            onClick={onDelete}
            disabled={isPending}
            className="text-meta text-[var(--color-urgent)] font-medium flex items-center gap-1"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-lg bg-[var(--color-info)] px-4 py-1.5 text-meta font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
