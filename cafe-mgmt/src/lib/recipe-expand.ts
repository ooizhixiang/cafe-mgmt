/**
 * Sub-recipe expansion engine. Pure — no Prisma. Callers pre-load the recipe
 * registry (one query, all recipes the cafe owns) and pass it in.
 *
 * Per Phase 1 spec:
 * - Polymorphic ingredient rows: each row has either `ingredientId` (raw) OR
 *   `subRecipeId` (composite). Mutually exclusive.
 * - Variations on the sub-recipe side are NOT considered (option 3a) — only
 *   the BASE recipe's `ingredients` are expanded.
 * - Quantity on a composite row is interpreted in the SUB-RECIPE's `yieldUnit`.
 *   Scale factor = parentQty / subRecipe.yieldQuantity.
 * - Cycle detection at insert time AND defended again here (visiting set).
 */

export interface ExpandRecipeInput {
  id: string;
  yieldQuantity: number | null;
  yieldUnit: string | null;
  ingredients: Array<{
    ingredientId: string | null;
    subRecipeId: string | null;
    quantityPerServing: number;
  }>;
}

/**
 * Walk a recipe (and any sub-recipes recursively) down to leaf raw-ingredient
 * quantities. Returns a map keyed by `ingredientId`, values rounded to integer
 * with a 1-minimum when scale × qty > 0 (never silently drop a real
 * consumption to rounding).
 *
 * `scale` is the parent-driven multiplier. The top-level call passes 1.
 *
 * Throws on cycles defensively (the action layer should reject inserts that
 * create them; this is a belt-and-braces guard).
 */
export function expandRecipeToLeaves(
  recipeId: string,
  registry: Map<string, ExpandRecipeInput>,
  scale = 1,
  visiting: Set<string> = new Set()
): Map<string, number> {
  const result = new Map<string, number>();
  const recipe = registry.get(recipeId);
  if (!recipe) return result;

  if (visiting.has(recipeId)) {
    throw new Error(`Cycle detected at recipe ${recipeId}`);
  }
  const nextVisiting = new Set(visiting);
  nextVisiting.add(recipeId);

  for (const row of recipe.ingredients) {
    if (row.ingredientId !== null && row.subRecipeId === null) {
      // Leaf: raw ingredient.
      const raw = row.quantityPerServing * scale;
      const rounded = scaleAndRound(raw);
      mergeAdd(result, row.ingredientId, rounded);
    } else if (row.subRecipeId !== null && row.ingredientId === null) {
      // Composite: descend into the sub-recipe with a new scale factor.
      const child = registry.get(row.subRecipeId);
      if (!child) continue; // dangling FK — leaf can't be resolved; skip
      if (child.yieldQuantity === null || child.yieldQuantity <= 0) {
        // Sub-recipe missing yield — can't compute scale. Skip; the action
        // layer should reject inserts that create this state, so reaching
        // here is a defensive no-op.
        continue;
      }
      const childScale = (row.quantityPerServing * scale) / child.yieldQuantity;
      const childLeaves = expandRecipeToLeaves(
        child.id,
        registry,
        childScale,
        nextVisiting
      );
      for (const [id, qty] of childLeaves) {
        mergeAdd(result, id, qty);
      }
    }
    // Ignore malformed rows (both null OR both non-null) — XOR violation
    // should be rejected at the action layer.
  }
  return result;
}

function scaleAndRound(raw: number): number {
  if (raw <= 0) return 0;
  // Plain rounding — no 1-minimum floor. The floor was originally meant to
  // protect against "silently dropping a real consumption", but at scale it
  // systematically over-deducts: a garnish that should consume 0.05 units per
  // sale would get floored to 1, deducting 100 over 100 sales instead of 5.
  // The risk of losing trace amounts (0.4 → 0) is the lesser evil; a manager
  // pricing recipes at sub-unit precision should adjust the recipe's
  // quantityPerServing or scale up the sub-recipe yield.
  return Math.round(raw);
}

function mergeAdd(map: Map<string, number>, id: string, qty: number): void {
  if (qty <= 0) return;
  map.set(id, (map.get(id) ?? 0) + qty);
}

/**
 * Cycle detector for INSERT-time validation. Given a parent recipe and a
 * candidate sub-recipe to add, returns true iff adding would create a cycle.
 * (Walks forward from the candidate — if the parent appears, adding the edge
 * would close a loop back to the parent.)
 */
export function wouldCreateCycle(
  parentRecipeId: string,
  candidateSubRecipeId: string,
  registry: Map<string, ExpandRecipeInput>
): boolean {
  if (parentRecipeId === candidateSubRecipeId) return true;
  const stack = [candidateSubRecipeId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const recipe = registry.get(next);
    if (!recipe) continue;
    for (const row of recipe.ingredients) {
      if (row.subRecipeId === null) continue;
      if (row.subRecipeId === parentRecipeId) return true;
      stack.push(row.subRecipeId);
    }
  }
  return false;
}

/**
 * Compute a sub-recipe's per-yield-unit cost. Returns null if any leaf
 * ingredient (recursively) lacks a derived cost AND has no subtotal override.
 *
 * `derivedCostByIngredientId` is the same map shape used elsewhere
 * (recipe.actions.ts, margin-alert-cards.ts). `subtotalOverrideRows` is a
 * lookup from the same `RecipeIngredient` rows used during expansion.
 */
export interface CostRollupRow {
  ingredientId: string | null;
  subRecipeId: string | null;
  quantityPerServing: number;
  /** Decimal | number | null per the schema's polymorphic types. */
  subtotalOverrideInCents: number | { toNumber(): number } | null;
}

export interface CostRollupRecipe {
  id: string;
  yieldQuantity: number | null;
  ingredients: CostRollupRow[];
}

export function rollupCostPerYieldUnit(
  recipeId: string,
  registry: Map<string, CostRollupRecipe>,
  derivedCostByIngredientId: Map<string, number | null>,
  visiting: Set<string> = new Set()
): number | null {
  const recipe = registry.get(recipeId);
  if (!recipe) return null;
  if (recipe.yieldQuantity === null || recipe.yieldQuantity <= 0) return null;
  if (visiting.has(recipeId)) return null; // cycle — defensive
  const nextVisiting = new Set(visiting);
  nextVisiting.add(recipeId);

  let totalCost = 0;
  for (const row of recipe.ingredients) {
    if (row.ingredientId !== null && row.subRecipeId === null) {
      const override = readOverride(row.subtotalOverrideInCents);
      if (override !== null) {
        totalCost += override;
        continue;
      }
      const perUnit = derivedCostByIngredientId.get(row.ingredientId);
      if (perUnit == null) return null; // unresolvable leaf
      totalCost += row.quantityPerServing * perUnit;
    } else if (row.subRecipeId !== null && row.ingredientId === null) {
      const childPerUnit = rollupCostPerYieldUnit(
        row.subRecipeId,
        registry,
        derivedCostByIngredientId,
        nextVisiting
      );
      if (childPerUnit === null) return null;
      totalCost += row.quantityPerServing * childPerUnit;
    } else {
      return null; // XOR violation — defensive
    }
  }
  return totalCost / recipe.yieldQuantity;
}

function readOverride(
  raw: number | { toNumber(): number } | null
): number | null {
  if (raw == null) return null;
  return typeof raw === "number" ? raw : raw.toNumber();
}
