"use client";

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  ingredientName: string;
  ingredientUnit: string;
  loading: boolean;
  recipes: Array<{
    id: string;
    name: string;
    quantityPerServing: number;
    variationName: string | null;
  }>;
  onClose: () => void;
}

export function RecipesUsingDialog({
  open,
  ingredientName,
  ingredientUnit,
  loading,
  recipes,
  onClose,
}: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Tracks whether the current mouse interaction started on the backdrop. Mirrors
  // the InventoryDetailDialog pattern so a text-selection drag that starts inside
  // the card and releases on the backdrop doesn't accidentally close the dialog.
  const downedOnBackdropRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const showEmpty = !loading && recipes.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Recipes using ${ingredientName}`}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
      onMouseDown={(e) => {
        downedOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downedOnBackdropRef.current && e.target === e.currentTarget) {
          onClose();
        }
        downedOnBackdropRef.current = false;
      }}
    >
      <div
        className="bg-[var(--bg-primary)] rounded-lg p-[var(--space-6)] mx-[var(--space-4)] max-w-md w-full max-h-[80vh] overflow-y-auto animate-[fadeIn_0.15s_ease-out]"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex items-start justify-between mb-[var(--space-4)]">
          <div>
            <h2 className="text-value">Recipes using {ingredientName}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close recipes dialog"
            className="touch-target px-3 py-1 rounded-lg text-meta font-medium text-[var(--text-secondary)] active:bg-[var(--bg-secondary)]"
          >
            Close
          </button>
        </div>

        {loading && (
          <p className="text-body text-[var(--text-secondary)]">Loading...</p>
        )}

        {showEmpty && (
          <p className="text-body text-[var(--text-secondary)]">
            Not used in any recipe
          </p>
        )}

        {!loading && recipes.length > 0 && (
          <ul className="space-y-[var(--space-2)]">
            {recipes.map((r) => (
              // `id` is the recipe id and is shared across the recipe's base
              // row and any variation rows that reference the same ingredient.
              // Compose with `variationName` to keep keys unique within the list.
              <li
                key={`${r.id}:${r.variationName ?? ""}`}
                className="flex items-center justify-between text-body"
              >
                <span>
                  {r.name}
                  {r.variationName ? ` (${r.variationName})` : ""}
                </span>
                <span className="text-meta text-[var(--text-secondary)]">
                  {r.quantityPerServing} {ingredientUnit}/serving
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
