"use client";

import { useState, useTransition, useEffect } from "react";
import {
  getRecipes,
  getRecipe,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  toggleDiscontinued,
  updateSellingPrice,
  updateRecipeCategory,
  updateRecipeNotes,
  addRecipeIngredient,
  removeRecipeIngredient,
  addRecipeStep,
  updateRecipeStep,
  deleteRecipeStep,
  reorderRecipeSteps,
  createVariation,
  deleteVariation,
  addVariationIngredient,
  removeVariationIngredient,
  updateSubtotalOverride,
  updateVariationSubtotalOverride,
  addVariationStep,
  deleteVariationStep,
  updateVariationStep,
  setRecipeYield,
  getSubRecipeOptions,
} from "@/actions/recipe.actions";
import { updateIngredientConfig } from "@/actions/inventory.actions";
import type { ActionResult } from "@/types";
import { formatCents } from "@/lib/format";
import { useToast } from "@/components/ui/toast";

interface RecipeSummary {
  id: string;
  name: string;
  description: string | null;
  ingredientCount: number;
  costPerServingInCents: number | null;
  // Present only when the recipe has variations whose costs differ. Single-cost
  // recipes (no variations, or all variations same cost) use the field above.
  costPerServingRangeInCents: { minInCents: number; maxInCents: number } | null;
  category: string | null;
  discontinued: boolean;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
}

export function RecipeEditor({
  isManager,
  ingredients,
}: {
  isManager: boolean;
  ingredients: Ingredient[];
}) {
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    loadRecipes();
  }, []);

  async function loadRecipes() {
    setLoading(true);
    const result = await getRecipes();
    if (result.success) {
      setRecipes(result.data);
    }
    setLoading(false);
  }

  if (loading) {
    return <div className="text-meta text-[var(--text-secondary)]">Loading recipes...</div>;
  }

  if (selectedRecipeId) {
    return (
      <RecipeDetail
        recipeId={selectedRecipeId}
        isManager={isManager}
        ingredients={ingredients}
        onBack={() => {
          setSelectedRecipeId(null);
          loadRecipes();
        }}
      />
    );
  }

  const recipeCategories = [
    "all",
    ...new Set(recipes.map((r) => r.category).filter(Boolean)),
  ] as string[];

  const filtered = recipes.filter((r) => {
    const matchesSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || r.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  const activeRecipes = filtered.filter((r) => !r.discontinued);
  const discontinuedRecipes = filtered.filter((r) => r.discontinued);

  function renderRecipeItem(r: RecipeSummary) {
    return (
      <button
        key={r.id}
        onClick={() => setSelectedRecipeId(r.id)}
        className={`w-full text-left rounded-lg border p-[var(--space-3)] ${
          r.discontinued
            ? "border-[var(--border-default)] opacity-60"
            : "border-[var(--border-default)]"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-body font-medium">{r.name}</span>
          <span className="text-meta text-[var(--text-secondary)]">
            {r.ingredientCount} ingredients
          </span>
        </div>
        {r.costPerServingRangeInCents !== null ? (
          <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)] whitespace-nowrap">
            Cost/serving: {formatCents(r.costPerServingRangeInCents.minInCents)}
            –{formatCents(r.costPerServingRangeInCents.maxInCents)}
          </p>
        ) : r.costPerServingInCents !== null ? (
          <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
            Cost/serving: {formatCents(r.costPerServingInCents)}
          </p>
        ) : null}
      </button>
    );
  }

  return (
    <div className="space-y-[var(--space-2)]">
      {recipes.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes..."
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-body focus-ring"
        />
      )}

      {recipeCategories.length > 1 && (
        <div className="flex gap-[var(--space-2)] overflow-x-auto pb-1">
          {recipeCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-meta font-medium transition-all ${
                categoryFilter === cat
                  ? "bg-[var(--color-info)] text-white shadow-sm"
                  : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] active:bg-[var(--bg-pressed)]"
              }`}
            >
              {cat === "all" ? "All" : cat}
            </button>
          ))}
        </div>
      )}

      {activeRecipes.map(renderRecipeItem)}

      {recipes.length === 0 && (
        <p className="text-body text-[var(--text-secondary)] text-center py-[var(--space-4)]">
          No recipes yet
        </p>
      )}

      {recipes.length > 0 && filtered.length === 0 && (
        <p className="text-body text-[var(--text-secondary)] text-center py-[var(--space-4)]">
          No recipes matching &ldquo;{search}&rdquo;
        </p>
      )}

      {discontinuedRecipes.length > 0 && (
        <div className="pt-[var(--space-4)]">
          <h3 className="text-meta font-semibold text-[var(--text-secondary)] mb-[var(--space-2)]">Discontinued</h3>
          <div className="space-y-[var(--space-2)]">
            {discontinuedRecipes.map(renderRecipeItem)}
          </div>
        </div>
      )}

      {isManager && !showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full rounded-lg border border-dashed border-[var(--border-default)] p-[var(--space-3)] text-body text-[var(--color-info)] font-medium"
        >
          + Create Recipe
        </button>
      )}

      {isManager && showCreate && (
        <CreateRecipeForm
          onCreated={(id) => {
            setShowCreate(false);
            setSelectedRecipeId(id);
            loadRecipes();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function compressImage(file: File, maxSize = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PhotoPickerButton({
  imageUrl,
  onPick,
  onRemove,
}: {
  imageUrl: string | null;
  onPick: (dataUrl: string) => void;
  onRemove: () => void;
}) {
  function handleClick() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const dataUrl = await compressImage(file);
      onPick(dataUrl);
    };
    input.click();
  }

  if (imageUrl) {
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={handleClick}
          className="w-10 h-10 rounded-md overflow-hidden border border-[var(--border-default)]"
        >
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--color-urgent,#dc2626)] text-white text-[10px] leading-none flex items-center justify-center"
        >
          x
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="shrink-0 w-10 h-10 rounded-md border border-dashed border-[var(--border-default)] flex items-center justify-center text-[var(--text-secondary)] hover:border-[var(--color-info)] hover:text-[var(--color-info)]"
      title="Add photo"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    </button>
  );
}

function CreateRecipeForm({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [servingSize, setServingSize] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleCreate() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await createRecipe({
        name: name.trim(),
        description: description.trim() || undefined,
        servingSize: servingSize.trim() || undefined,
        imageUrl: imageUrl || undefined,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      toast("Recipe created");
      onCreated(result.data.id);
    });
  }

  return (
    <div className="rounded-lg border border-[var(--border-default)] p-[var(--space-3)] space-y-[var(--space-2)]">
      <div className="flex gap-[var(--space-2)] items-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Recipe name"
          className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
          autoFocus
        />
        <PhotoPickerButton
          imageUrl={imageUrl}
          onPick={setImageUrl}
          onRemove={() => setImageUrl(null)}
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
      />
      <input
        value={servingSize}
        onChange={(e) => setServingSize(e.target.value)}
        placeholder="Serving size (optional)"
        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
      />
      <div className="flex gap-[var(--space-2)]">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-meta">
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={isPending || !name.trim()}
          className="flex-1 rounded-lg bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50"
        >
          Create
        </button>
      </div>
    </div>
  );
}

function RecipeDetail({
  recipeId,
  isManager,
  ingredients: allIngredients,
  onBack,
}: {
  recipeId: string;
  isManager: boolean;
  ingredients: Ingredient[];
  onBack: () => void;
}) {
  type RecipeData = Extract<Awaited<ReturnType<typeof getRecipe>>, { success: true }>["data"];
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const [addIngId, setAddIngId] = useState("");
  const [addIngQty, setAddIngQty] = useState(1);
  const [newStep, setNewStep] = useState("");
  const { toast } = useToast();

  // Sub-recipe options loaded lazily when the unified ingredient picker
  // opens. Declared here (before any early return) to satisfy Rules of Hooks.
  type SubRecipeOption = {
    id: string;
    name: string;
    yieldQuantity: number;
    yieldUnit: string;
  };
  const [subRecipeOptions, setSubRecipeOptions] = useState<SubRecipeOption[]>(
    []
  );

  useEffect(() => {
    loadRecipe();
  }, [recipeId]);

  useEffect(() => {
    if (!showAddIngredient) return;
    let cancelled = false;
    getSubRecipeOptions(recipeId).then((r) => {
      if (cancelled) return;
      if (r.success) setSubRecipeOptions(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [showAddIngredient, recipeId]);

  async function loadRecipe() {
    setLoading(true);
    const result = await getRecipe(recipeId);
    if (result.success) {
      setRecipe(result.data);
    }
    setLoading(false);
  }

  if (loading || !recipe) {
    return <div className="text-meta text-[var(--text-secondary)]">Loading...</div>;
  }

  function handleDeleteRecipe() {
    if (!confirm("Delete this recipe?")) return;
    startTransition(async () => {
      const result = await deleteRecipe(recipeId);
      if (!result.success) {
        toast(result.error);
        return;
      }
      toast("Recipe deleted");
      onBack();
    });
  }

  function handleAddIngredient() {
    if (!addIngId) return;
    const isSub = addIngId.startsWith("sub:");
    const id = isSub ? addIngId.slice(4) : addIngId;
    startTransition(async () => {
      const result = await addRecipeIngredient(
        isSub
          ? { recipeId, subRecipeId: id, quantityPerServing: addIngQty }
          : { recipeId, ingredientId: id, quantityPerServing: addIngQty }
      );
      if (!result.success) {
        toast(result.error);
        return;
      }
      setShowAddIngredient(false);
      setAddIngId("");
      setAddIngQty(1);
      loadRecipe();
    });
  }

  function handleRemoveIngredient(id: string) {
    startTransition(async () => {
      await removeRecipeIngredient(id);
      loadRecipe();
    });
  }

  // Phase 2: yield setter.
  function handleSetYield(yieldQuantity: number | null, yieldUnit: string | null) {
    startTransition(async () => {
      const result = await setRecipeYield({
        recipeId,
        yieldQuantity,
        yieldUnit,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      loadRecipe();
    });
  }

  function handleAddStep() {
    if (!newStep.trim()) return;
    startTransition(async () => {
      const result = await addRecipeStep({ recipeId, instruction: newStep.trim() });
      if (!result.success) {
        toast(result.error);
        return;
      }
      setNewStep("");
      loadRecipe();
    });
  }

  function handleDeleteStep(id: string) {
    startTransition(async () => {
      await deleteRecipeStep(id);
      loadRecipe();
    });
  }

  function handleMoveStep(index: number, direction: -1 | 1) {
    const steps = [...recipe!.steps];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= steps.length) return;
    [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];

    startTransition(async () => {
      await reorderRecipeSteps({
        recipeId,
        stepIds: steps.map((s) => s.id),
      });
      loadRecipe();
    });
  }

  // Existing ingredient IDs for filtering
  const usedIngredientIds = new Set(recipe.ingredients.map((ri) => ri.ingredientId));

  return (
    <div className="space-y-[var(--space-4)]">
      <button onClick={onBack} className="text-meta text-[var(--color-info)]">
        ← Back to recipes
      </button>

      {/* Recipe Header */}
      <div className="flex gap-[var(--space-3)]">
        {recipe.imageUrl && (
          <div className="shrink-0">
            <img
              src={recipe.imageUrl}
              alt={recipe.name}
              className="w-20 h-20 rounded-lg object-cover border border-[var(--border-default)]"
            />
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-start gap-[var(--space-2)]">
            <EditableName
              value={recipe.name}
              isManager={isManager}
              onSave={(newName) => {
                startTransition(async () => {
                  const result = await updateRecipe({
                    id: recipeId,
                    name: newName,
                    description: recipe.description ?? undefined,
                    servingSize: recipe.servingSize ?? undefined,
                  });
                  if (!result.success) { toast(result.error); return; }
                  loadRecipe();
                });
              }}
            />
            {isManager && (
              <PhotoPickerButton
                imageUrl={recipe.imageUrl}
                onPick={(dataUrl) => {
                  startTransition(async () => {
                    const result = await updateRecipe({
                      id: recipeId,
                      name: recipe.name,
                      description: recipe.description ?? undefined,
                      servingSize: recipe.servingSize ?? undefined,
                      imageUrl: dataUrl,
                    });
                    if (!result.success) { toast(result.error); return; }
                    loadRecipe();
                  });
                }}
                onRemove={() => {
                  startTransition(async () => {
                    const result = await updateRecipe({
                      id: recipeId,
                      name: recipe.name,
                      description: recipe.description ?? undefined,
                      servingSize: recipe.servingSize ?? undefined,
                      imageUrl: null,
                    });
                    if (!result.success) { toast(result.error); return; }
                    loadRecipe();
                  });
                }}
              />
            )}
          </div>
          {recipe.description && (
            <p className="text-body text-[var(--text-secondary)]">{recipe.description}</p>
          )}
          {recipe.servingSize && (
            <p className="text-meta text-[var(--text-secondary)]">Serves: {recipe.servingSize}</p>
          )}
        </div>
      </div>

      {/* Category */}
      <CategoryPicker
        category={recipe.category}
        isManager={isManager}
        onSave={(cat) => {
          startTransition(async () => {
            await updateRecipeCategory(recipeId, cat);
            loadRecipe();
          });
        }}
      />

      {/* Notes */}
      <EditableNotes
        notes={recipe.notes}
        isManager={isManager}
        onSave={(notes) => {
          startTransition(async () => {
            const result = await updateRecipeNotes(recipeId, notes || null);
            if (!result.success) { toast(result.error); return; }
            loadRecipe();
          });
        }}
      />

      {/* Yield (use as sub-recipe). Sub-recipe ROWS are now merged into the
          ingredients list inside VariationsSection. This card is just the
          yield setter for THIS recipe. */}
      <div className="rounded-lg border border-[var(--border-default)] p-[var(--space-4)]">
        <YieldEditor
          yieldQuantity={recipe.yieldQuantity ?? null}
          yieldUnit={recipe.yieldUnit ?? null}
          isManager={isManager}
          isPending={isPending}
          onSave={handleSetYield}
        />
      </div>

      {/* All variations as containers (base "Original" + named variations) */}
      <VariationsSection
        recipeId={recipeId}
        baseIngredients={recipe.ingredients}
        baseSubRecipeRows={recipe.subRecipeRows ?? []}
        baseSteps={recipe.steps}
        baseCostPerServing={recipe.costPerServingInCents}
        baseSellingPrice={recipe.sellingPriceInCents}
        variations={recipe.variations}
        allIngredients={allIngredients}
        subRecipeOptions={subRecipeOptions}
        isManager={isManager}
        isPending={isPending}
        startTransition={startTransition}
        onAddBaseIngredient={handleAddIngredient}
        onRemoveBaseIngredient={handleRemoveIngredient}
        showAddIngredient={showAddIngredient}
        setShowAddIngredient={setShowAddIngredient}
        addIngId={addIngId}
        setAddIngId={setAddIngId}
        addIngQty={addIngQty}
        setAddIngQty={setAddIngQty}
        usedIngredientIds={usedIngredientIds}
        newStep={newStep}
        setNewStep={setNewStep}
        onAddBaseStep={handleAddStep}
        onDeleteBaseStep={handleDeleteStep}
        onMoveBaseStep={handleMoveStep}
        onReload={loadRecipe}
      />

      {isManager && (
        <div className="flex gap-[var(--space-4)] pt-[var(--space-4)]">
          <button
            onClick={() => {
              startTransition(async () => {
                const result = await toggleDiscontinued(recipeId);
                if (!result.success) { toast(result.error); return; }
                toast(result.data.discontinued ? "Recipe discontinued" : "Recipe reactivated");
                loadRecipe();
              });
            }}
            className={`text-meta font-medium ${
              recipe.discontinued
                ? "text-[var(--color-success)]"
                : "text-[var(--color-warning)]"
            }`}
          >
            {recipe.discontinued ? "Reactivate recipe" : "Discontinue recipe"}
          </button>
          <button
            onClick={handleDeleteRecipe}
            className="text-meta text-[var(--color-urgent,#dc2626)] font-medium"
          >
            Delete recipe
          </button>
        </div>
      )}
    </div>
  );
}

function VariationsSection(props: {
  recipeId: string;
  baseIngredients: Array<{ id: string; ingredientId: string; ingredientName: string; unit: string; quantityPerServing: number; costPerUnitInCents: number | null; subtotalOverrideInCents: number | null; currentStock: number | null; lowStockThreshold: number | null }>;
  baseSubRecipeRows: SubRecipeRow[];
  baseSteps: Array<{ id: string; stepNumber: number; instruction: string }>;
  baseCostPerServing: number | null;
  baseSellingPrice: number | null;
  variations: Array<{ id: string; name: string; sellingPriceInCents: number | null; ingredients: Array<{ id: string; ingredientId: string; ingredientName: string; unit: string; quantityPerServing: number }>; steps: Array<{ id: string; stepNumber: number; instruction: string }> }>;
  allIngredients: Ingredient[];
  subRecipeOptions: Array<{ id: string; name: string; yieldQuantity: number; yieldUnit: string }>;
  isManager: boolean;
  isPending: boolean;
  startTransition: (fn: () => Promise<void>) => void;
  onAddBaseIngredient: () => void;
  onRemoveBaseIngredient: (id: string) => void;
  showAddIngredient: boolean;
  setShowAddIngredient: (v: boolean) => void;
  addIngId: string;
  setAddIngId: (v: string) => void;
  addIngQty: number;
  setAddIngQty: (v: number) => void;
  usedIngredientIds: Set<string>;
  newStep: string;
  setNewStep: (v: string) => void;
  onAddBaseStep: () => void;
  onDeleteBaseStep: (id: string) => void;
  onMoveBaseStep: (index: number, direction: -1 | 1) => void;
  onReload: () => void;
}) {
  const {
    recipeId, baseIngredients, baseSubRecipeRows, baseSteps, baseCostPerServing, baseSellingPrice, variations, allIngredients,
    subRecipeOptions, isManager, isPending, startTransition, onReload,
    onAddBaseIngredient, onRemoveBaseIngredient, showAddIngredient, setShowAddIngredient,
    addIngId, setAddIngId, addIngQty, setAddIngQty, usedIngredientIds,
    newStep, setNewStep, onAddBaseStep, onDeleteBaseStep, onMoveBaseStep,
  } = props;

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [duplicateFrom, setDuplicateFrom] = useState("");
  const [addingVarIngTo, setAddingVarIngTo] = useState<string | null>(null);
  const [varIngId, setVarIngId] = useState("");
  const [varIngQty, setVarIngQty] = useState(1);
  const [varStepText, setVarStepText] = useState<Record<string, string>>({});
  const { toast } = useToast();

  function handleCreateVariation() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const result = await createVariation({
        recipeId,
        name: newName.trim(),
        duplicateFromId: duplicateFrom || undefined,
      });
      if (!result.success) { toast(result.error); return; }
      setNewName(""); setDuplicateFrom(""); setShowCreate(false); onReload();
    });
  }

  function handleDeleteVariation(id: string) {
    if (!confirm("Delete this variation?")) return;
    startTransition(async () => { await deleteVariation(id); onReload(); });
  }

  function handleAddVarIngredient(variationId: string) {
    if (!varIngId) return;
    startTransition(async () => {
      const result = await addVariationIngredient({ variationId, ingredientId: varIngId, quantityPerServing: varIngQty });
      if (!result.success) { toast(result.error); return; }
      setAddingVarIngTo(null); setVarIngId(""); setVarIngQty(1); onReload();
    });
  }

  function handleAddVarStep(variationId: string) {
    const text = (varStepText[variationId] ?? "").trim();
    if (!text) return;
    startTransition(async () => {
      const result = await addVariationStep({ variationId, instruction: text });
      if (!result.success) { toast(result.error); return; }
      setVarStepText((prev) => ({ ...prev, [variationId]: "" })); onReload();
    });
  }

  // Render a single container card
  function renderContainer(
    title: string,
    ingredients: typeof baseIngredients | Array<{ id: string; ingredientId: string; ingredientName: string; unit: string; quantityPerServing: number }>,
    steps: Array<{ id: string; stepNumber: number; instruction: string }>,
    type: "base" | { variationId: string },
    onDeleteContainer?: () => void,
    sellingPriceInCents?: number | null,
    onSaveSellingPrice?: (cents: number | null) => void,
  ) {
    const isBase = type === "base";

    return (
      <div className="rounded-lg border border-[var(--border-default)] overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
        {/* Header */}
        <div className="flex items-center justify-between bg-[var(--bg-secondary,#f3f4f6)] px-[var(--space-3)] py-[var(--space-2)]">
          <span className="text-body font-semibold">{title}</span>
          {isManager && onDeleteContainer && (
            <button onClick={onDeleteContainer} className="text-meta text-[var(--color-urgent,#dc2626)] font-medium">Delete</button>
          )}
        </div>

        <div className="p-[var(--space-3)] space-y-[var(--space-3)]">
          {/* Ingredients */}
          <div>
            <h5 className="text-meta font-semibold text-[var(--text-secondary)] mb-[var(--space-1)]">Ingredients</h5>
            <div className="space-y-[var(--space-1)]">
              {ingredients.map((ri) => (
                <div key={ri.id} className="flex items-center justify-between rounded border border-[var(--border-default)] px-[var(--space-2)] py-[var(--space-1)]">
                  <span className="text-meta">
                    {ri.ingredientName} <span className="text-[var(--text-secondary)]">{ri.quantityPerServing} {ri.unit}/serving</span>
                  </span>
                  {isManager && (
                    <button
                      onClick={() => isBase ? onRemoveBaseIngredient(ri.id) : startTransition(async () => { await removeVariationIngredient(ri.id); onReload(); })}
                      className="text-meta text-[var(--color-urgent,#dc2626)]"
                    >✕</button>
                  )}
                </div>
              ))}
              {isBase && baseSubRecipeRows.map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded border border-[var(--border-default)] px-[var(--space-2)] py-[var(--space-1)]">
                  <span className="text-meta">
                    📋 {row.subRecipeName} <span className="text-[var(--text-secondary)]">{row.quantityPerServing} {row.subRecipeYieldUnit}/serving</span>
                  </span>
                  {isManager && (
                    <button
                      onClick={() => onRemoveBaseIngredient(row.id)}
                      aria-label={`Remove sub-recipe ${row.subRecipeName}`}
                      className="text-meta text-[var(--color-urgent,#dc2626)]"
                    >✕</button>
                  )}
                </div>
              ))}
              {ingredients.length === 0 && (!isBase || baseSubRecipeRows.length === 0) && <p className="text-meta text-[var(--text-secondary)]">No ingredients</p>}
            </div>
            {isManager && isBase && !showAddIngredient && (
              <button onClick={() => setShowAddIngredient(true)} className="mt-[var(--space-1)] text-meta text-[var(--color-info)] font-medium">+ Add ingredient</button>
            )}
            {isManager && isBase && showAddIngredient && (() => {
              const usedSubIds = new Set(baseSubRecipeRows.map((r) => r.subRecipeId));
              const isSub = addIngId.startsWith("sub:");
              const selectedSub = isSub ? subRecipeOptions.find((o) => o.id === addIngId.slice(4)) : undefined;
              const qtyUnitHint = selectedSub ? selectedSub.yieldUnit : null;
              return (
                <div className="mt-[var(--space-1)] flex gap-[var(--space-2)] items-center">
                  <select value={addIngId} onChange={(e) => setAddIngId(e.target.value)} className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta">
                    <option value="">Select ingredient or sub-recipe</option>
                    <optgroup label="Ingredients">
                      {allIngredients.filter((i) => !usedIngredientIds.has(i.id)).map((i) => (
                        <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                      ))}
                    </optgroup>
                    {subRecipeOptions.length > 0 && (
                      <optgroup label="Sub-recipes">
                        {subRecipeOptions.filter((o) => !usedSubIds.has(o.id)).map((o) => (
                          <option key={o.id} value={`sub:${o.id}`}>📋 {o.name} (yields {o.yieldQuantity} {o.yieldUnit})</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <input type="number" min={1} value={addIngQty} onChange={(e) => setAddIngQty(Math.max(1, Number(e.target.value)))} className="w-16 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta" />
                  {qtyUnitHint && <span className="text-meta text-[var(--text-secondary)]">{qtyUnitHint}</span>}
                  <button onClick={onAddBaseIngredient} disabled={isPending || !addIngId} className="rounded bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50">Add</button>
                  <button onClick={() => { setShowAddIngredient(false); setAddIngId(""); }} className="text-meta text-[var(--text-secondary)]">Cancel</button>
                </div>
              );
            })()}
            {isManager && !isBase && (() => {
              const vid = (type as { variationId: string }).variationId;
              const usedIds = new Set(ingredients.map((i) => i.ingredientId));
              return addingVarIngTo !== vid ? (
                <button onClick={() => { setAddingVarIngTo(vid); setVarIngId(""); setVarIngQty(1); }} className="mt-[var(--space-1)] text-meta text-[var(--color-info)] font-medium">+ Add ingredient</button>
              ) : (
                <div className="mt-[var(--space-1)] flex gap-[var(--space-2)]">
                  <select value={varIngId} onChange={(e) => setVarIngId(e.target.value)} className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta">
                    <option value="">Select ingredient</option>
                    {allIngredients.filter((i) => !usedIds.has(i.id)).map((i) => (
                      <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                    ))}
                  </select>
                  <input type="number" min={1} value={varIngQty} onChange={(e) => setVarIngQty(Math.max(1, Number(e.target.value)))} className="w-16 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta" />
                  <button onClick={() => handleAddVarIngredient(vid)} disabled={isPending || !varIngId} className="rounded bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50">Add</button>
                  <button onClick={() => setAddingVarIngTo(null)} className="text-meta text-[var(--text-secondary)]">Cancel</button>
                </div>
              );
            })()}
          </div>

          {/* Instructions */}
          <div>
            <h5 className="text-meta font-semibold text-[var(--text-secondary)] mb-[var(--space-1)]">Instructions</h5>
            <div className="space-y-[var(--space-1)]">
              {steps.map((step, i) => (
                <EditableStep
                  key={step.id}
                  step={step}
                  index={i}
                  totalSteps={steps.length}
                  isBase={isBase}
                  isManager={isManager}
                  onMoveBaseStep={onMoveBaseStep}
                  onDeleteStep={(id) => isBase ? onDeleteBaseStep(id) : startTransition(async () => { await deleteVariationStep(id); onReload(); })}
                  onUpdateStep={(id, instruction) => {
                    if (isBase) {
                      startTransition(async () => { await updateRecipeStep({ id, instruction }); onReload(); });
                    } else {
                      startTransition(async () => { await updateVariationStep({ id, instruction }); onReload(); });
                    }
                  }}
                />
              ))}
              {steps.length === 0 && <p className="text-meta text-[var(--text-secondary)]">No instructions</p>}
            </div>
            {isManager && isBase && (
              <div className="mt-[var(--space-1)] flex gap-[var(--space-2)]">
                <input value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Add a step..." className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta" onKeyDown={(e) => e.key === "Enter" && onAddBaseStep()} />
                <button onClick={onAddBaseStep} disabled={isPending || !newStep.trim()} className="rounded bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50">Add</button>
              </div>
            )}
            {isManager && !isBase && (() => {
              const vid = (type as { variationId: string }).variationId;
              return (
                <div className="mt-[var(--space-1)] flex gap-[var(--space-2)]">
                  <input value={varStepText[vid] ?? ""} onChange={(e) => setVarStepText((prev) => ({ ...prev, [vid]: e.target.value }))} placeholder="Add a step..." className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta" onKeyDown={(e) => e.key === "Enter" && handleAddVarStep(vid)} />
                  <button onClick={() => handleAddVarStep(vid)} disabled={isPending || !(varStepText[vid] ?? "").trim()} className="rounded bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50">Add</button>
                </div>
              );
            })()}
          </div>

          {/* Cost Breakdown */}
          {ingredients.length > 0 && isBase && (
            <div>
              <h5 className="text-meta font-semibold text-[var(--text-secondary)] mb-[var(--space-1)]">Cost Breakdown</h5>
              <div className="rounded-lg border border-[var(--border-default)] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--bg-secondary,#f3f4f6)]">
                      <th className="text-left text-meta font-medium text-[var(--text-secondary)] px-[var(--space-2)] py-[var(--space-1)]">Ingredient</th>
                      <th className="text-right text-meta font-medium text-[var(--text-secondary)] px-[var(--space-2)] py-[var(--space-1)]">Qty</th>
                      <th className="text-right text-meta font-medium text-[var(--text-secondary)] px-[var(--space-2)] py-[var(--space-1)]">Unit Cost</th>
                      <th className="text-right text-meta font-medium text-[var(--text-secondary)] px-[var(--space-2)] py-[var(--space-1)]">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baseIngredients.map((ri) => (
                      <CostRow key={ri.id} recipeIngredientId={ri.id} ingredientId={ri.ingredientId} ingredientName={ri.ingredientName} quantityPerServing={ri.quantityPerServing} unit={ri.unit} costPerUnitInCents={ri.costPerUnitInCents} subtotalOverrideInCents={ri.subtotalOverrideInCents} isManager={isManager} onUpdated={onReload} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--text-primary)]">
                      <td colSpan={3} className="text-meta font-semibold px-[var(--space-2)] py-[var(--space-2)]">Total</td>
                      <td className="text-meta font-bold text-right px-[var(--space-2)] py-[var(--space-2)]">{baseCostPerServing !== null ? formatCents(baseCostPerServing) : "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          {!isBase && (
            <div>
              <h5 className="text-meta font-semibold text-[var(--text-secondary)] mb-[var(--space-1)]">Cost Breakdown</h5>
              {ingredients.length > 0 ? (
                <div className="rounded-lg border border-[var(--border-default)] overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[var(--bg-secondary,#f3f4f6)]">
                        <th className="text-left text-meta font-medium text-[var(--text-secondary)] px-[var(--space-2)] py-[var(--space-1)]">Ingredient</th>
                        <th className="text-right text-meta font-medium text-[var(--text-secondary)] px-[var(--space-2)] py-[var(--space-1)]">Qty</th>
                        <th className="text-right text-meta font-medium text-[var(--text-secondary)] px-[var(--space-2)] py-[var(--space-1)]">Unit Cost</th>
                        <th className="text-right text-meta font-medium text-[var(--text-secondary)] px-[var(--space-2)] py-[var(--space-1)]">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingredients.map((ri) => (
                        <CostRow
                          key={ri.id}
                          recipeIngredientId={ri.id}
                          ingredientId={ri.ingredientId}
                          ingredientName={ri.ingredientName}
                          quantityPerServing={ri.quantityPerServing}
                          unit={ri.unit}
                          costPerUnitInCents={(ri as { costPerUnitInCents?: number | null }).costPerUnitInCents ?? null}
                          subtotalOverrideInCents={(ri as { subtotalOverrideInCents?: number | null }).subtotalOverrideInCents ?? null}
                          isManager={isManager}
                          onUpdated={onReload}
                          subtotalOverrideAction={updateVariationSubtotalOverride}
                        />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[var(--text-primary)]">
                        <td colSpan={3} className="text-meta font-semibold px-[var(--space-2)] py-[var(--space-2)]">Total</td>
                        <td className="text-meta font-bold text-right px-[var(--space-2)] py-[var(--space-2)]">
                          {(() => {
                            const total = ingredients.reduce((sum, ri) => {
                              const cost = (ri as { costPerUnitInCents?: number | null }).costPerUnitInCents ?? null;
                              const override = (ri as { subtotalOverrideInCents?: number | null }).subtotalOverrideInCents ?? null;
                              const sub = override ?? (cost !== null ? cost * ri.quantityPerServing : null);
                              return sub !== null ? sum + sub : sum;
                            }, 0);
                            const hasAll = ingredients.every((ri) => {
                              const cost = (ri as { costPerUnitInCents?: number | null }).costPerUnitInCents ?? null;
                              const override = (ri as { subtotalOverrideInCents?: number | null }).subtotalOverrideInCents ?? null;
                              return override !== null || cost !== null;
                            });
                            return hasAll ? formatCents(total) : "—";
                          })()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="text-meta text-[var(--text-secondary)]">No extra cost — uses base ingredients only</p>
              )}
            </div>
          )}

          {/* Selling Price */}
          {isManager && onSaveSellingPrice && (
            <SellingPriceEditor
              priceInCents={sellingPriceInCents ?? null}
              onSave={onSaveSellingPrice}
            />
          )}
          {!isManager && sellingPriceInCents && (
            <p className="text-meta text-[var(--text-secondary)]">Selling Price: RM {(sellingPriceInCents / 100).toFixed(2)}</p>
          )}

          {/* Delete button at bottom */}
          {isManager && onDeleteContainer && (
            <button
              onClick={onDeleteContainer}
              className="text-meta text-[var(--color-urgent,#dc2626)] font-medium pt-[var(--space-2)]"
            >
              Delete variation
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-[var(--space-4)]">
      {/* Original as a container — only show if it has content or there are no variations */}
      {(baseIngredients.length > 0 || baseSteps.length > 0 || variations.length === 0) &&
        renderContainer("Original", baseIngredients, baseSteps, "base", baseIngredients.length > 0 || baseSteps.length > 0 ? () => {
          if (!confirm("Delete this variation? Its ingredients and instructions will be removed.")) return;
          startTransition(async () => {
            for (const ri of baseIngredients) { await removeRecipeIngredient(ri.id); }
            for (const s of baseSteps) { await deleteRecipeStep(s.id); }
            onReload();
          });
        } : undefined,
        baseSellingPrice,
        (cents) => { startTransition(async () => { await updateSellingPrice(recipeId, cents, "recipe"); onReload(); }); }
        )
      }

      {/* Named variations */}
      {variations.map((v) =>
        <div key={v.id}>{renderContainer(v.name, v.ingredients, v.steps, { variationId: v.id }, () => handleDeleteVariation(v.id),
          v.sellingPriceInCents,
          (cents) => { startTransition(async () => { await updateSellingPrice(v.id, cents, "variation"); onReload(); }); }
        )}</div>
      )}

      {/* Create variation */}
      {isManager && !showCreate && (
        <button onClick={() => setShowCreate(true)} className="text-meta text-[var(--color-info)] font-medium">+ Add variation</button>
      )}
      {isManager && showCreate && (
        <div className="rounded-lg border border-dashed border-[var(--border-default)] p-[var(--space-3)] space-y-[var(--space-2)]">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Variation name (e.g. Vanilla, Large)" className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body" autoFocus onKeyDown={(e) => e.key === "Enter" && handleCreateVariation()} />
          <select
            value={duplicateFrom}
            onChange={(e) => setDuplicateFrom(e.target.value)}
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
          >
            <option value="">Start empty</option>
            <option value="__base__">Duplicate from: Original</option>
            {variations.map((v) => (
              <option key={v.id} value={v.id}>Duplicate from: {v.name}</option>
            ))}
          </select>
          <div className="flex gap-[var(--space-2)]">
            <button onClick={() => { setShowCreate(false); setNewName(""); setDuplicateFrom(""); }} className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-meta">Cancel</button>
            <button onClick={handleCreateVariation} disabled={isPending || !newName.trim()} className="flex-1 rounded-lg bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50">Add</button>
          </div>
        </div>
      )}
    </section>
  );
}

function CostRow({
  recipeIngredientId,
  ingredientId,
  ingredientName,
  quantityPerServing,
  unit,
  costPerUnitInCents,
  subtotalOverrideInCents,
  isManager,
  onUpdated,
  subtotalOverrideAction,
}: {
  recipeIngredientId: string;
  ingredientId: string;
  ingredientName: string;
  quantityPerServing: number;
  unit: string;
  costPerUnitInCents: number | null;
  subtotalOverrideInCents: number | null;
  isManager: boolean;
  onUpdated: () => void;
  subtotalOverrideAction?: (id: string, cents: number | null) => Promise<ActionResult<void>>;
}) {
  const [editingCost, setEditingCost] = useState(false);
  const [editingSubtotal, setEditingSubtotal] = useState(false);
  const [costInput, setCostInput] = useState("");
  const [subtotalInput, setSubtotalInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  // Subtotal: use override if set, otherwise calculate from unit cost
  const calculatedSubtotal = costPerUnitInCents !== null ? costPerUnitInCents * quantityPerServing : null;
  const displaySubtotal = subtotalOverrideInCents ?? calculatedSubtotal;

  const overrideAction = subtotalOverrideAction ?? updateSubtotalOverride;

  function handleSaveCost() {
    const cents = costInput ? parseFloat(costInput) * 100 : null;
    if (cents !== null && !Number.isFinite(cents)) {
      toast("Invalid cost");
      return;
    }
    startTransition(async () => {
      const result = await updateIngredientConfig({
        id: ingredientId,
        costPerUnitInCents: cents,
      });
      if (!result.success) { toast(result.error); return; }
      // Clear subtotal override when unit cost changes
      await overrideAction(recipeIngredientId, null);
      setEditingCost(false);
      onUpdated();
    });
  }

  function handleSaveSubtotal() {
    const cents = subtotalInput ? parseFloat(subtotalInput) * 100 : null;
    if (cents !== null && !Number.isFinite(cents)) {
      toast("Invalid cost");
      return;
    }
    startTransition(async () => {
      const result = await overrideAction(recipeIngredientId, cents);
      if (!result.success) { toast(result.error); return; }
      setEditingSubtotal(false);
      onUpdated();
    });
  }

  return (
    <tr className="border-t border-[var(--border-default)]">
      <td className="text-meta px-[var(--space-2)] py-[var(--space-1)]">{ingredientName}</td>
      <td className="text-meta text-right px-[var(--space-2)] py-[var(--space-1)]">
        {quantityPerServing} {unit}
      </td>

      {/* Unit Cost — editable */}
      <td className="text-meta text-right px-[var(--space-2)] py-[var(--space-1)]">
        {editingCost ? (
          <div className="flex items-center justify-end gap-1">
            <span className="text-[var(--text-secondary)]">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveCost()}
              autoFocus
              className="w-16 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-1 py-0.5 text-meta text-right"
            />
            <button onClick={handleSaveCost} disabled={isPending} className="text-[var(--color-success)] text-meta font-medium">Save</button>
            <button onClick={() => setEditingCost(false)} className="text-[var(--text-secondary)] text-meta">✕</button>
          </div>
        ) : (
          <button
            onClick={() => {
              if (!isManager) return;
              setCostInput(costPerUnitInCents !== null ? (Math.floor(costPerUnitInCents) / 100).toFixed(2) : "");
              setEditingCost(true);
            }}
            className={isManager ? "hover:underline cursor-pointer" : ""}
            disabled={!isManager}
          >
            {costPerUnitInCents !== null ? formatCents(costPerUnitInCents) : "—"}
          </button>
        )}
      </td>

      {/* Subtotal — editable, stays fixed once set */}
      <td className="text-meta font-medium text-right px-[var(--space-2)] py-[var(--space-1)]">
        {editingSubtotal ? (
          <div className="flex items-center justify-end gap-1">
            <span className="text-[var(--text-secondary)]">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={subtotalInput}
              onChange={(e) => setSubtotalInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveSubtotal()}
              autoFocus
              className="w-16 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-1 py-0.5 text-meta text-right"
            />
            <button onClick={handleSaveSubtotal} disabled={isPending} className="text-[var(--color-success)] text-meta font-medium">Save</button>
            <button onClick={() => setEditingSubtotal(false)} className="text-[var(--text-secondary)] text-meta">✕</button>
          </div>
        ) : (
          <button
            onClick={() => {
              if (!isManager) return;
              setSubtotalInput(displaySubtotal !== null ? (Math.floor(displaySubtotal) / 100).toFixed(2) : "");
              setEditingSubtotal(true);
            }}
            className={isManager ? "hover:underline cursor-pointer" : ""}
            disabled={!isManager}
          >
            {displaySubtotal !== null ? formatCents(displaySubtotal) : "—"}
          </button>
        )}
      </td>
    </tr>
  );
}

function EditableStep({
  step,
  index,
  totalSteps,
  isBase,
  isManager,
  onMoveBaseStep,
  onDeleteStep,
  onUpdateStep,
}: {
  step: { id: string; stepNumber: number; instruction: string };
  index: number;
  totalSteps: number;
  isBase: boolean;
  isManager: boolean;
  onMoveBaseStep: (index: number, direction: -1 | 1) => void;
  onDeleteStep: (id: string) => void;
  onUpdateStep: (id: string, instruction: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(step.instruction);

  function handleSave() {
    const trimmed = text.trim();
    if (!trimmed || trimmed === step.instruction) {
      setText(step.instruction);
      setEditing(false);
      return;
    }
    onUpdateStep(step.id, trimmed);
    setEditing(false);
  }

  return (
    <div className="flex items-start gap-[var(--space-2)] rounded border border-[var(--border-default)] px-[var(--space-2)] py-[var(--space-1)]">
      <span className="text-meta font-bold text-[var(--text-secondary)] mt-0.5 shrink-0">{step.stepNumber}.</span>
      {editing ? (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setText(step.instruction); setEditing(false); } }}
          autoFocus
          className="text-meta flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-1 py-0.5"
        />
      ) : (
        <p
          className={`text-meta flex-1 ${isManager ? "cursor-pointer hover:text-[var(--color-info)]" : ""}`}
          onClick={() => isManager && setEditing(true)}
        >
          {step.instruction}
        </p>
      )}
      {isManager && !editing && (
        <div className="flex gap-1 shrink-0">
          {isBase && (
            <>
              <button onClick={() => onMoveBaseStep(index, -1)} disabled={index === 0} className="text-meta text-[var(--text-secondary)] disabled:opacity-30">↑</button>
              <button onClick={() => onMoveBaseStep(index, 1)} disabled={index === totalSteps - 1} className="text-meta text-[var(--text-secondary)] disabled:opacity-30">↓</button>
            </>
          )}
          <button onClick={() => onDeleteStep(step.id)} className="text-meta text-[var(--color-urgent,#dc2626)]">✕</button>
        </div>
      )}
    </div>
  );
}

function EditableName({
  value,
  isManager,
  onSave,
}: {
  value: string;
  isManager: boolean;
  onSave: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  function handleSave() {
    const trimmed = text.trim();
    if (!trimmed || trimmed === value) {
      setText(value);
      setEditing(false);
      return;
    }
    onSave(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setText(value); setEditing(false); } }}
        autoFocus
        className="text-value font-semibold flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-1 py-0.5"
      />
    );
  }

  return (
    <h3
      className={`text-value font-semibold flex-1 ${isManager ? "cursor-pointer hover:text-[var(--color-info)]" : ""}`}
      onClick={() => { if (isManager) { setText(value); setEditing(true); } }}
    >
      {value}
    </h3>
  );
}

function EditableNotes({
  notes,
  isManager,
  onSave,
}: {
  notes: string | null;
  isManager: boolean;
  onSave: (notes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(notes ?? "");

  function handleSave() {
    onSave(text.trim());
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-[var(--border-default)] p-[var(--space-3)]" style={{ boxShadow: "var(--shadow-card)" }}>
        <h4 className="text-meta font-semibold text-[var(--text-secondary)] mb-[var(--space-2)]">Notes</h4>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          autoFocus
          className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body resize-y"
          placeholder="Add notes about this recipe..."
        />
        <div className="flex gap-[var(--space-2)] mt-[var(--space-2)]">
          <button onClick={handleSave} className="rounded-lg bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white">Save</button>
          <button onClick={() => { setEditing(false); setText(notes ?? ""); }} className="text-meta text-[var(--text-secondary)]">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-[var(--border-default)] p-[var(--space-3)] ${isManager ? "cursor-pointer hover:border-[var(--color-info)]" : ""}`}
      style={{ boxShadow: "var(--shadow-card)" }}
      onClick={() => { if (isManager) { setText(notes ?? ""); setEditing(true); } }}
    >
      <h4 className="text-meta font-semibold text-[var(--text-secondary)] mb-[var(--space-1)]">Notes</h4>
      {notes ? (
        <p className="text-body whitespace-pre-wrap">{notes}</p>
      ) : (
        <p className="text-meta text-[var(--text-secondary)]">{isManager ? "Click to add notes..." : "No notes"}</p>
      )}
    </div>
  );
}

function CategoryPicker({
  category,
  isManager,
  onSave,
}: {
  category: string | null;
  isManager: boolean;
  onSave: (cat: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(category ?? "");

  function handleSave() {
    const val = text.trim() || null;
    if (val !== category) onSave(val);
    setEditing(false);
  }

  if (!isManager) {
    return category ? (
      <p className="text-meta text-[var(--text-secondary)]">Category: {category}</p>
    ) : null;
  }

  if (editing) {
    return (
      <div className="flex items-center gap-[var(--space-2)]">
        <span className="text-meta text-[var(--text-secondary)] shrink-0">Category:</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setText(category ?? ""); setEditing(false); } }}
          placeholder="e.g. Drinks, Pastries, Snacks"
          autoFocus
          className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-meta"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => { setText(category ?? ""); setEditing(true); }}
      className="text-meta text-[var(--text-secondary)] hover:text-[var(--color-info)] text-left"
    >
      Category: {category || "None (click to set)"}
    </button>
  );
}

function SellingPriceEditor({
  priceInCents,
  onSave,
}: {
  priceInCents: number | null;
  onSave: (cents: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(priceInCents ? (priceInCents / 100).toFixed(2) : "");

  function handleSave() {
    const val = text.trim();
    const cents = val ? Math.round(parseFloat(val) * 100) : null;
    if (cents !== priceInCents) onSave(cents);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-[var(--space-2)]">
        <span className="text-meta text-[var(--text-secondary)] shrink-0">Selling Price: RM</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setText(priceInCents ? (priceInCents / 100).toFixed(2) : ""); setEditing(false); } }}
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          autoFocus
          className="w-24 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-meta"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => { setText(priceInCents ? (priceInCents / 100).toFixed(2) : ""); setEditing(true); }}
      className="text-meta text-[var(--text-secondary)] hover:text-[var(--color-info)] text-left"
    >
      Selling Price: {priceInCents ? `RM ${(priceInCents / 100).toFixed(2)}` : "Not set (click to set)"}
    </button>
  );
}

// ─── Sub-recipe row shape (rendered inline in the ingredients list) ───

interface SubRecipeRow {
  id: string;
  subRecipeId: string;
  subRecipeName: string;
  subRecipeYieldQuantity: number;
  subRecipeYieldUnit: string;
  quantityPerServing: number;
  subtotalOverrideInCents: number | null;
}

function YieldEditor({
  yieldQuantity,
  yieldUnit,
  isManager,
  isPending,
  onSave,
}: {
  yieldQuantity: number | null;
  yieldUnit: string | null;
  isManager: boolean;
  isPending: boolean;
  onSave: (qty: number | null, unit: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState<string>(yieldQuantity ? String(yieldQuantity) : "");
  const [unit, setUnit] = useState<string>(yieldUnit ?? "");

  // Re-sync local form state whenever the parent's prop changes (after a
  // successful save the parent re-fetches and the new values flow in here).
  useEffect(() => {
    setQty(yieldQuantity ? String(yieldQuantity) : "");
    setUnit(yieldUnit ?? "");
  }, [yieldQuantity, yieldUnit]);

  const isSet = yieldQuantity !== null && yieldUnit !== null;

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-[var(--space-2)]">
        <div>
          <p className="text-meta font-semibold text-[var(--text-secondary)]">
            Yield (use as sub-recipe)
          </p>
          <p className="text-body">
            {isSet ? `${yieldQuantity} ${yieldUnit}` : "Not set"}
          </p>
        </div>
        {isManager && (
          <div className="flex gap-[var(--space-2)]">
            {isSet && (
              <button
                type="button"
                onClick={() => onSave(null, null)}
                disabled={isPending}
                className="text-meta text-[var(--color-urgent)] disabled:opacity-50"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-meta text-[var(--color-info)] font-medium"
            >
              {isSet ? "Edit" : "Set"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-[var(--space-2)]">
      <p className="text-meta font-semibold text-[var(--text-secondary)]">
        Yield (use as sub-recipe)
      </p>
      <div className="flex items-end gap-[var(--space-2)]">
        <div>
          <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
            Quantity
          </label>
          <input
            type="number"
            min="1"
            step="1"
            aria-label="Yield quantity"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-24 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
          />
        </div>
        <div>
          <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
            Unit
          </label>
          <input
            type="text"
            maxLength={20}
            aria-label="Yield unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g. mL"
            className="w-24 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            // Reset to the props.
            setQty(yieldQuantity ? String(yieldQuantity) : "");
            setUnit(yieldUnit ?? "");
          }}
          className="text-meta text-[var(--text-secondary)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            const parsed = Number(qty);
            const trimmed = unit.trim();
            if (!Number.isInteger(parsed) || parsed < 1 || trimmed.length === 0) {
              return;
            }
            onSave(parsed, trimmed);
            setEditing(false);
          }}
          disabled={isPending}
          className="rounded-lg bg-[var(--color-info)] px-3 py-1 text-meta font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
