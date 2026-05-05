---
title: 'Recipe list shows $0.00 cost for variant-only recipes; show min-max range instead'
type: 'bugfix'
created: '2026-05-04'
status: 'done'
context: []
baseline_commit: '5712db434b7d94ac82e0e7af1e15c68f7109e6fe'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On `/recipes`, the list cards show "Cost/serving: $0.00" for any recipe whose ingredients live on variations rather than the base. Reason: `getRecipes` in `src/actions/recipe.actions.ts:94` computes `costPerServingInCents` from `recipe.ingredients` (base `RecipeIngredient` rows) only — for variant-only recipes that array is empty, `hasAllCosts` is vacuously true, and the reduce returns 0. The sales paths already deduct base + variation ingredients together (verified in `daily-report.actions.ts:161-199`), so the cost model exists; the list query just doesn't use it.

**Approach:** Extend `getRecipes` to also load each recipe's variations and their `VariationIngredient` rows. Compute one cost-per-serving per variation (base ingredients + that variation's ingredients, each ingredient costed via `currentCostPerUnit` and `findOldestNonEmptyLot`, mirroring the existing per-ingredient logic). For recipes with no variations: keep the current single-value display. For recipes with variations: surface a range and display it as `$min–$max` on the list card (or single value if min === max). If any variation's cost can't be fully resolved (some ingredient has no cost AND no override), the card falls back to "—" the same way it does today for a single-cost recipe with missing data.

## Boundaries & Constraints

**Always:**
- Per-variation cost = sum over `(base RecipeIngredient ∪ this variation's VariationIngredient)`. Mirrors the deduction model in `daily-report.actions.ts:161-199` so the displayed cost matches the cost actually recorded on a sale.
- Per-ingredient costing reuses `currentCostPerUnit` + `findOldestNonEmptyLot` (already extracted in the previous story). No duplicate FIFO logic.
- A recipe with N variations renders one comparison: `min === max` ⇒ single value; else range `$min–$max`. A recipe with **only one** variation renders as single value (degenerate range collapses).
- A recipe with **zero** variations preserves today's display exactly (single `Cost/serving: $X.XX`). Backward-compatible.
- "Cannot fully resolve" rule (`null` cost): if ANY variation's cost can't be computed (any of its ingredients has no derived cost AND no `subtotalOverrideInCents`), the entire range is `null` → card shows "—". Same threshold as the current single-recipe behavior.

**Ask First:** None — the range model and fallback rule mirror the existing single-cost behavior consistently.

**Never:**
- Don't change anything about how variations are stored, deducted, or sold. Read-only display change.
- Don't change `currentCostPerUnit` or `findOldestNonEmptyLot`. Reuse as-is.
- Don't add a new column to the `Recipe` model (no schema change). The range is computed server-side per request.
- Don't show the range on any other surface in this story (recipe DETAIL editor, sales analysis, etc.). Scope: list cards on `/recipes` only.
- Don't break the current `costPerServingInCents` field — keep it for backward compatibility (still represents the no-variation case). Add a separate optional `costRange` field for the variation case.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Recipe with no variations | Base ingredients fully costed | Card: `Cost/serving: $X.XX` (unchanged) | N/A |
| Recipe with no variations, missing cost | Some base ingredient has no cost AND no override | Card: `Cost/serving: —` (unchanged) | N/A |
| Variant-only recipe, all variations costed | Base empty; 3 variations with distinct totals $1.00 / $2.50 / $5.00 | Card: `Cost/serving: $1.00–$5.00` | N/A |
| Variant-only recipe, one variation | Base empty; 1 variation with total $3.00 | Card: `Cost/serving: $3.00` (single, not range) | N/A |
| Variants with identical totals | Base empty; 2 variations both $4.00 | Card: `Cost/serving: $4.00` (collapsed range) | N/A |
| Mixed: base has ingredients AND variations have add-ons | Base = $2.00; Variation A adds $0.50, B adds $1.50 | Card: `Cost/serving: $2.50–$3.50` (each variation = base + its add-ons) | N/A |
| One variation can't be costed | Variation A fully costed at $3.00; Variation B has an ingredient with no cost AND no override | Card: `Cost/serving: —` (entire range null — same threshold as single recipes) | N/A |
| All variations costed at $0 | Base empty; 1 variation with one ingredient priced at 0 cents (free sample) | Card: `Cost/serving: $0.00` (real zero, not the "$0.00" bug — backed by data) | N/A |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/src/actions/recipe.actions.ts:94-183` -- `getRecipes`: extend the Prisma include to load variations + their ingredients; compute per-variation cost (base + variation), reduce to a single value or `{min,max}` range, return both fields
- `cafe-mgmt/src/actions/recipe.actions.test.ts` -- add tests for the new range computation
- `cafe-mgmt/src/components/operations/recipe-editor.tsx:35-43` -- extend `RecipeSummary` with the new optional `costPerServingRangeInCents: { minInCents: number; maxInCents: number } | null`
- `cafe-mgmt/src/components/operations/recipe-editor.tsx:128-132` -- in `renderRecipeItem`: prefer the range when present (display `$min–$max`), else fall back to existing single value
- `cafe-mgmt/src/lib/fifo.ts` -- pattern reference for `currentCostPerUnit` and `findOldestNonEmptyLot` (no change)
- `cafe-mgmt/src/actions/daily-report.actions.ts:161-199` -- pattern reference for "deduct base + variation ingredients" — the cost model to mirror

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/src/actions/recipe.actions.ts` -- extended `getRecipes` Prisma include with variations + their ingredients. Added `sumServingCost` helper. Computes per-variation cost (base + variation), returns `costPerServingRangeInCents` when min !== max, collapses to `costPerServingInCents` otherwise. Helper accepts both Decimal (RecipeIngredient) and Int (VariationIngredient) shapes for `subtotalOverrideInCents` since the schema uses different types for the two tables.
- [x] `cafe-mgmt/src/actions/recipe.actions.test.ts` -- 9 new tests covering all I/O Matrix scenarios (no variations, missing cost, distinct variations, single variation, identical variations, base + variation add-ons, unresolved variation, free zero-cost variation, override on variation ingredient)
- [x] `cafe-mgmt/src/components/operations/recipe-editor.tsx` -- added `costPerServingRangeInCents` field to `RecipeSummary`; `renderRecipeItem` now prefers the range when present, else falls back to the single value (or null → no row)
- [x] (skipped) recipe-editor wiring test -- no existing test file for the editor; action tests fully cover the cost computation and the UI change is a 5-line conditional render

**Acceptance Criteria:**
- Given a recipe with no variations and fully-costed base ingredients, when `/recipes` loads, then the card shows `Cost/serving: $X.XX` exactly as before this change.
- Given a recipe with 3 variations whose costs (base + each variation's add-ons) compute to $2.50, $3.00, and $5.00, when `/recipes` loads, then the card shows `Cost/serving: $2.50–$5.00`.
- Given a recipe with 2 variations both costed at $4.00, when `/recipes` loads, then the card shows `Cost/serving: $4.00` (single — degenerate range collapses).
- Given a recipe with 1 variation costed at $3.00, when `/recipes` loads, then the card shows `Cost/serving: $3.00` (single — no spurious range with one element).
- Given a recipe with 2 variations where one cannot be fully costed (an ingredient has neither derived cost nor override), when `/recipes` loads, then the card shows `Cost/serving: —` (matches the existing single-recipe missing-data behavior).
- Given the user's reported scenario (a recipe whose base has no ingredients, all ingredients on variations), when `/recipes` loads, then the card shows the actual computed range — never `$0.00` from the vacuous-base bug.

## Verification

**Commands:**
- `cd cafe-mgmt && npx vitest run src/actions/recipe.actions.test.ts` -- expected: existing tests pass, new range tests pass
- `cd cafe-mgmt && npm run build` -- expected: clean build, no TS errors
- `cd cafe-mgmt && npx vitest run` -- expected: full unit suite still passes

**Manual checks:**
- Dev server on :4000 → open `/recipes` → find a recipe with variants whose ingredients live on the variations (the user's reported case) → confirm the card now shows a range like `$X.XX–$Y.YY` instead of `$0.00`. Find a recipe with no variants → confirm its card shows the single cost as before.

## Spec Change Log

### Iteration 1 — review patches (2026-05-04)

Three patch-class findings applied:

1. **Empty-everywhere collapse-to-$0.00 trap fixed at the variation level.** A recipe whose base AND every variation are empty would have produced `variationCosts = [0, 0, ...]`, collapsed to single value 0, and rendered "$0.00" with confidence — exactly the bug we're fixing, just one structural level up. Added a `totalIngredientRows === 0` guard that returns null in both the `variations.length === 0` branch (when base is also empty) and the variant branch. Also closes the same trap for traditional empty-no-variation recipes (which previously also showed "$0.00" — pre-existing issue, fixed as a side effect of the new guard).
2. **`undefined` defense in `sumServingCost`.** Changed `!== null` to `!= null` (loose) in two places. Defends against future callers slimming the Prisma `select` such that `subtotalOverrideInCents` arrives as `undefined` instead of `null`. Today unreachable (current include shape always projects the column), but cheap and cross-recipe utility; worth the defensive coercion.
3. **`whitespace-nowrap` on the range render.** Cents formatting like `$1234.00–$5678.00` could wrap mid-range to a second line on narrow viewports. The class keeps the range visually intact.

KEEP: the per-ingredient `derivedCostByIngredientId` map sharing across all recipes (cost is ingredient-scoped, not recipe-scoped — verified by the acceptance auditor); the collapse-when-min===max rule (no spurious 1-element ranges, no `$X–$X` displays); the additive shape (existing `costPerServingInCents` field retained).

Added 2 regression tests (empty-everywhere recipe with variations + traditional empty no-variation recipe). Total tests for `getRecipes`: 11.

## Suggested Review Order

**Entry point — the cost helper**

- Pure function. Sums recipe-or-variation ingredient rows; returns null on any unresolved cost. Accepts both Decimal and Int shapes for the schema-mismatched override column.
  [`recipe.actions.ts:11`](../../cafe-mgmt/src/actions/recipe.actions.ts#L11)

**The bug fix — getRecipes rewrite**

- Loads variations, computes per-variation cost (base + variation), reduces to range or single value. The empty-everywhere guard handles the symmetric trap one structural level above.
  [`recipe.actions.ts:215`](../../cafe-mgmt/src/actions/recipe.actions.ts#L215)

**Per-ingredient derived cost map (shared across recipes)**

- Built once, sized by ingredient-id union from base + all variations. Sound to share because cost is ingredient-scoped, not recipe-scoped.
  [`recipe.actions.ts:198`](../../cafe-mgmt/src/actions/recipe.actions.ts#L198)

**UI render**

- Card now shows range when present, falls through to single value, or hides the row when both are null (matches pre-fix dash behavior for unresolved single-recipe cost).
  [`recipe-editor.tsx:128`](../../cafe-mgmt/src/components/operations/recipe-editor.tsx#L128)

**Tests**

- 11 tests covering all 8 I/O Matrix scenarios + 2 patch-driven additions (empty-everywhere variant recipe, empty no-variation recipe) + 1 schema-drift test (Decimal vs Int subtotalOverrideInCents).
  [`recipe.actions.test.ts`](../../cafe-mgmt/src/actions/recipe.actions.test.ts)
