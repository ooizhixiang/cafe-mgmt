"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateIngredient,
  deleteIngredient,
  addIngredient,
  reorderIngredient,
} from "@/actions/setup.actions";
import { useToast } from "@/components/ui/toast";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Pencil, Trash2, ChevronUp, ChevronDown, Plus, Check, X } from "lucide-react";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  displayOrder: number;
}

export function IngredientReview({
  initialIngredients,
}: {
  initialIngredients: Ingredient[];
}) {
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("Pieces");
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function startEdit(ingredient: Ingredient) {
    setEditingId(ingredient.id);
    setEditName(ingredient.name);
    setEditUnit(ingredient.unit);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditUnit("");
  }

  function handleSaveEdit(id: string) {
    startTransition(async () => {
      const result = await updateIngredient(id, editName, editUnit);
      if (result.success) {
        setIngredients((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, name: editName, unit: editUnit } : i
          )
        );
        setEditingId(null);
        toast("Ingredient updated");
      } else {
        toast(result.error);
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;

    startTransition(async () => {
      const result = await deleteIngredient(id);
      if (result.success) {
        setIngredients((prev) => prev.filter((i) => i.id !== id));
        setDeleteTarget(null);
        toast("Ingredient removed");
      } else {
        toast(result.error);
      }
    });
  }

  function handleAdd() {
    if (!newName.trim() || !newUnit.trim()) return;

    startTransition(async () => {
      const result = await addIngredient(newName.trim(), newUnit.trim(), "Unassigned");
      if (result.success) {
        setIngredients((prev) => [
          ...prev,
          {
            id: result.data.id,
            name: newName.trim(),
            unit: newUnit.trim(),
            displayOrder: prev.length,
          },
        ]);
        setNewName("");
        setNewUnit("");
        setShowAdd(false);
        toast("Ingredient added");
      } else {
        toast(result.error);
      }
    });
  }

  function handleReorder(id: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await reorderIngredient(id, direction);
      if (result.success) {
        setIngredients((prev) => {
          const list = [...prev];
          const idx = list.findIndex((i) => i.id === id);
          const swapIdx = direction === "up" ? idx - 1 : idx + 1;
          if (swapIdx < 0 || swapIdx >= list.length) return list;
          [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
          return list;
        });
      }
    });
  }

  function handleDone() {
    router.push("/");
    router.refresh();
  }

  return (
    <div>
      <div className="space-y-[var(--space-2)]">
        {ingredients.map((ingredient, idx) => (
          <div
            key={ingredient.id}
            className="flex items-center gap-[var(--space-2)] rounded-lg border border-[var(--border-default)] p-[var(--space-3)]"
          >
            {editingId === ingredient.id ? (
              <div className="flex-1 flex items-center gap-[var(--space-2)]">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 rounded border border-[var(--border-default)] px-2 py-1 text-body"
                />
                <input
                  type="text"
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  className="w-20 rounded border border-[var(--border-default)] px-2 py-1 text-body"
                />
                <button
                  onClick={() => handleSaveEdit(ingredient.id)}
                  disabled={isPending}
                  className="touch-target p-1 text-[var(--color-success)]"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={cancelEdit}
                  className="touch-target p-1 text-[var(--text-secondary)]"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <span className="text-body">{ingredient.name}</span>
                  <span className="text-meta text-[var(--text-secondary)] ml-[var(--space-2)]">
                    ({ingredient.unit})
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleReorder(ingredient.id, "up")}
                    disabled={idx === 0 || isPending}
                    className="touch-target p-1 text-[var(--text-secondary)] disabled:opacity-30"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    onClick={() => handleReorder(ingredient.id, "down")}
                    disabled={
                      idx === ingredients.length - 1 || isPending
                    }
                    className="touch-target p-1 text-[var(--text-secondary)] disabled:opacity-30"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    onClick={() => startEdit(ingredient)}
                    disabled={isPending}
                    className="touch-target p-1 text-[var(--color-info)]"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(ingredient)}
                    disabled={isPending}
                    className="touch-target p-1 text-[var(--color-urgent)]"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </>
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
            className="flex-1 rounded border border-[var(--border-default)] px-2 py-1 text-body"
          />
          <input
            type="text"
            placeholder="Unit (e.g. lbs, oz, bags)"
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            className="w-20 rounded border border-[var(--border-default)] px-2 py-1 text-body"
          />
          <button
            onClick={handleAdd}
            disabled={isPending || !newName.trim() || !newUnit.trim()}
            className="touch-target p-1 text-[var(--color-success)] disabled:opacity-30"
          >
            <Check size={18} />
          </button>
          <button
            onClick={() => {
              setShowAdd(false);
              setNewName("");
              setNewUnit("");
            }}
            className="touch-target p-1 text-[var(--text-secondary)]"
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-[var(--space-3)] flex items-center gap-[var(--space-2)] text-body text-[var(--color-info)]"
        >
          <Plus size={18} />
          Add ingredient
        </button>
      )}

      <button
        type="button"
        onClick={handleDone}
        className="w-full touch-target rounded-lg bg-[var(--color-info)] text-white text-body font-medium py-3 mt-[var(--space-6)]"
      >
        Looks good — go to my cafe
      </button>

      <ConfirmationDialog
        open={!!deleteTarget}
        title="Remove ingredient?"
        message={`Remove "${deleteTarget?.name}" from your ingredient list?`}
        confirmLabel="Remove"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
