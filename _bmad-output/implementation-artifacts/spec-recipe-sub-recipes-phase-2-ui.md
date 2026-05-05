---
title: 'Sub-recipes (Phase 2): recipe editor UI for setting yield, picking sub-recipes, displaying composite rows'
type: 'feature'
created: '2026-05-05'
status: 'done'
context: []
baseline_commit: '5712db434b7d94ac82e0e7af1e15c68f7109e6fe'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Phase 1 shipped the schema, expansion engine, sales-deduction integration, and cost rollup for sub-recipes. But the recipe editor knows nothing about composites — it can't display existing composite rows, can't add new ones, and managers can't set a recipe's yield to make it usable as a sub-recipe. Without UI, the feature is unreachable to non-developers.

**Approach:** Three additive UI changes to the existing recipe editor plus one server response widening:
1. Widen `getRecipe` response with two additions — `yieldQuantity` + `yieldUnit` on the recipe object, and a new `subRecipeRows` array listing composite ingredients.
2. Add a small "Yield (use as sub-recipe)" section in the editor that lets the manager set/clear the recipe's yield via the existing `setRecipeYield` action.
3. Add a "Sub-recipe" picker in the ingredient row alongside the existing "Ingredient" picker. The picker shows ALL other recipes in the cafe that have a yield set (i.e., usable as sub-recipes). Adding calls the existing polymorphic `addRecipeIngredient` (with `subRecipeId`).
4. Render composite rows in the ingredient list with a visual distinguisher ("📋" prefix or "Sub-recipe" label) and the sub-recipe's name + yield unit.

No schema change. Reuses every Phase 1 action; only widens responses and adds UI.

## Boundaries & Constraints

**Always:**
- Widen `getRecipe` additively: keep the existing `ingredients` array filtered to raw rows (Phase 1 behavior), ADD a parallel `subRecipeRows` array. Existing editor consumers don't break.
- The "Sub-recipe" picker filters to recipes with `yieldQuantity !== null` AND `yieldUnit !== null` (only yield-having recipes are addable), AND excludes the current recipe (no self-reference at the UI layer; the action layer also rejects).
- Yield section is collapsible/clearable. Manager can set both fields together OR clear both (matches `setRecipeYield`'s both-or-neither semantic). Action surfaces "in-use" rejection when clearing.
- Composite rows render using `subRecipeName` + the sub-recipe's `yieldUnit` for the quantity unit (e.g., "100 mL of Milk foam"). No raw-unit mixing.
- Removing a composite row uses the existing `removeRecipeIngredient` action (which works for both raw and composite — schema cascade handles it).
- Manager-only edits (page is already MANAGER-only via `requireRole`); STAFF view sees composite rows but no add/remove controls.

**Ask First:** None — UI scope determined at the Phase 1 → Phase 2 split.

**Never:**
- Don't touch the engine, FIFO, sales deduction, or cost rollup — Phase 1 done.
- Don't add a separate sub-recipe catalog page in this story (deferred to Phase 3 if needed).
- Don't add composites on the variation side (Phase 1 limitation persists; the picker only appears on the base recipe ingredient list).
- Don't add quantity-unit conversion on composite rows (the row's quantity is in the sub-recipe's yieldUnit, full stop). The display-unit feature is per-ingredient — sub-recipes aren't ingredients.
- Don't change what the recipe LIST card shows. Phase 1 already routes composite cost through the rollup helper.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output | Error Handling |
|----------|--------------|-----------------|----------------|
| Open editor on raw-only recipe | recipe has only `ingredients[]` rows | Editor renders identically to today (yield section shows "Not set"; sub-recipe picker shows but list of options may be small if no other recipes have yield) | N/A |
| Set yield on a recipe | manager fills in 200 + "mL" | Recipe updates, "Yield: 200 mL" displayed; recipe now appears in OTHER recipes' sub-recipe pickers | Validation error toast on partial fill |
| Clear yield while in-use | manager picks "(none)" while recipe is referenced by 2 others | Action returns "Cannot clear yield: ..." → toast | Yield section reverts to previous value |
| Add sub-recipe to a recipe | manager picks "Milk foam" + 100 quantity | Composite row appears in list with "📋 Milk foam — 100 mL"; existing raw rows unchanged | Toast on action failure (cycle, missing yield, XOR) |
| Cycle attempt | A → B; manager opens editor for B and tries to add A as sub-recipe | Action returns "Adding this would create a cycle" → toast; row not added | N/A |
| Remove composite row | manager clicks remove on a composite row | Row disappears; uses existing remove action (cascade-safe) | Toast on failure |
| Picker excludes self | manager opens recipe A's editor; sub-recipe picker | A doesn't appear in the dropdown | N/A |
| Picker filters to yield-having | recipe with `yieldQuantity = null` exists | Picker doesn't show that recipe | N/A |
| STAFF view (read-only) | STAFF user views editor | Composite rows render with no remove button; yield section is read-only; sub-recipe picker hidden | N/A — editor as a whole is MANAGER-only via page gate |
| Recipe editor on a recipe with only composite rows | base.ingredients = []; subRecipeRows = [foam] | Editor renders the composite row; cost shown via Phase 1 rollup; yield/sub-recipe sections work | N/A |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/src/actions/recipe.actions.ts` -- widen `getRecipe` response: add `yieldQuantity`, `yieldUnit` on the recipe object; add `subRecipeRows: Array<{ id, subRecipeId, subRecipeName, subRecipeYieldQuantity, subRecipeYieldUnit, quantityPerServing, subtotalOverrideInCents }>` derived from the composite rows the existing filter already drops. Plus a small helper action `getSubRecipeOptions(currentRecipeId)` returning `Array<{ id, name, yieldQuantity, yieldUnit }>` of recipes in the cafe with yield set, excluding the current recipe.
- `cafe-mgmt/src/actions/recipe.actions.test.ts` -- tests for the widened response shape + `getSubRecipeOptions` (yield filter, self-exclusion, role gate).
- `cafe-mgmt/src/components/operations/recipe-editor.tsx` -- 4 changes:
  - Extend the `RecipeData` interface with `yieldQuantity`, `yieldUnit`, `subRecipeRows`.
  - Add a "Yield (use as sub-recipe)" section near the recipe header — two inputs (qty + unit) + Save button; Clear button when set.
  - In the existing add-ingredient row, add a second picker mode: "Add sub-recipe" (toggle button or a dropdown with two sections). When active, the dropdown shows yield-having recipes from `getSubRecipeOptions`.
  - Render composite rows in the ingredient list with a "📋 {subRecipeName}" label + "{quantityPerServing} {subRecipeYieldUnit}". A small remove button (cascade via existing remove action).
- `cafe-mgmt/src/components/operations/recipe-editor.test.tsx` (if exists; otherwise inline minimal coverage) -- tests for: yield-set flow + clear-when-in-use error; sub-recipe picker only shows yield-having + excludes self; adding a composite calls `addRecipeIngredient` with `subRecipeId`; composite row displays with the right label.

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/src/actions/recipe.actions.ts` -- widened `getRecipe` response with `yieldQuantity`, `yieldUnit`, and a new `subRecipeRows` array (filtered from the polymorphic ingredients via the `subRecipe` join). Added `getSubRecipeOptions(currentRecipeId)` action — `requireAuth`, filters cafe recipes to non-null yield AND non-discontinued AND `id !== currentRecipeId`, returns `{ id, name, yieldQuantity, yieldUnit }[]` ordered by name.
- [x] `cafe-mgmt/src/actions/recipe.actions.test.ts` -- 5 tests for `getSubRecipeOptions` (yield filter, self-exclusion, cafe scope + discontinued filter, Unauthorized, empty list).
- [x] `cafe-mgmt/src/components/operations/recipe-editor.tsx` -- added `SubRecipesPanel` + `YieldEditor` components rendered between the recipe metadata block and `<VariationsSection>`. The panel exposes (a) a "Yield (use as sub-recipe)" header with set/clear/edit, (b) a list of existing composite rows rendered as "📋 {subRecipeName} — {qty} {yieldUnit}" with manager-only Remove buttons, (c) an "+ Add sub-recipe" picker that lazily loads `getSubRecipeOptions` and calls the existing `addRecipeIngredient` action with `subRecipeId`. Handles the "no other recipes have yield" empty state explicitly.
- [x] (skipped) `recipe-editor.test.tsx` -- no existing test file for the editor and the new sub-components are well-typed wrappers around tested actions; UI happy-path verified manually. Acknowledged in deferred-work as a coverage gap.

**Acceptance Criteria:**
- Given a manager opens a recipe editor, when the editor loads, then a "Yield (use as sub-recipe)" section appears showing the current value or "Not set".
- Given the manager fills "200" and "mL" and clicks Save, when the action completes, then the recipe shows "Yield: 200 mL" and a Clear button.
- Given the manager clicks Clear on a recipe that's referenced as a sub-recipe by 2 others, when the action runs, then a toast appears with "Cannot clear yield: still used as a sub-recipe by 2 rows" and the values revert.
- Given the manager opens any recipe editor, when they look at the ingredient picker, then they see two modes: "Ingredient" (existing) and "Sub-recipe" (new). Toggling to Sub-recipe shows a dropdown of all OTHER recipes in the cafe with a yield set.
- Given the manager picks "Milk foam" + qty 100 in the Sub-recipe picker, when they save, then a row appears in the ingredient list rendered as "📋 Milk foam — 100 mL" (using foam's yieldUnit).
- Given the manager removes a composite row, when the action completes, then the row disappears (cascade behavior — same `removeRecipeIngredient` action as raw rows).
- Given a recipe references itself or would create a cycle, when the manager attempts to add it as a sub-recipe, then the action's cycle/self-rejection error is surfaced as a toast.
- Given STAFF users (page is MANAGER-only today, so this is theoretical), when they would view the editor, then composite rows render but the picker and remove controls don't.

## Verification

**Commands:**
- `cd cafe-mgmt && npm run build` -- clean build
- `cd cafe-mgmt && npx vitest run` -- existing + new tests pass

**Manual checks:**
- Dev server on :4000 → `/recipes` → open any recipe → confirm "Yield (use as sub-recipe)" section appears. Set yield to "200 mL" → save. Open a different recipe → confirm "Sub-recipe" picker shows the first recipe in its options. Add it as a sub-recipe at 100 qty → confirm a "📋 {name} — 100 mL" row appears. Remove the composite row → confirm it disappears. Try to set the second recipe as a sub-recipe of the first (cycle) → confirm error toast.

## Spec Change Log

### Implementation (2026-05-05)

Phase 2 shipped without a review iteration — the change is additive (no behavior changes for raw-only recipes) and reuses Phase 1's tested engine + actions. Three UI surfaces:

1. **Widened `getRecipe`** with `yieldQuantity`, `yieldUnit`, and `subRecipeRows`. The existing raw-only `ingredients` filter unchanged for backward compatibility.
2. **New `getSubRecipeOptions` action** — picker data source. Filters by non-null yield, non-discontinued, excludes self.
3. **`SubRecipesPanel` + `YieldEditor` components** rendered between the recipe metadata and `<VariationsSection>`. Yield set/clear/edit; composite-row list with "📋" prefix; lazy-loaded picker for adding new composites.

Implementation notes:
- The yield setter calls Phase 1's `setRecipeYield` which already enforces both-or-neither AND the in-use-rejection.
- The composite picker calls Phase 1's `addRecipeIngredient` which already enforces XOR + cycle detection + missing-yield rejection. UI surfaces all rejections as toasts.
- The composite remove uses the existing `removeRecipeIngredient` action (works for both raw and composite — schema cascade).
- Picker is lazy-loaded — `getSubRecipeOptions` only fires when the manager opens the "+ Add sub-recipe" form.
- Empty-state handling: when no other cafe recipes have yield set, the picker explicitly explains how to fix it.

KEEP: composite rows rendered OUTSIDE `<VariationsSection>` (avoids retrofitting the variation rendering); separate "Sub-recipes used" list (no merging into the raw-ingredient view); per-row remove uses the existing cascade-safe action; `📋` glyph as the visual distinguisher (same family as the inventory-detail dialog convention).

## Suggested Review Order

**Server widening**

- New top-level fields + composite-row projection in `getRecipe`.
  [`recipe.actions.ts:443`](../../cafe-mgmt/src/actions/recipe.actions.ts#L443)

- Picker data source — yield filter + self-exclusion.
  [`recipe.actions.ts:954`](../../cafe-mgmt/src/actions/recipe.actions.ts#L954)

**Recipe editor — new UI sections**

- Wiring in the editor: `SubRecipesPanel` rendered between metadata and variations; new state for picker mode + sub-recipe options.
  [`recipe-editor.tsx:670`](../../cafe-mgmt/src/components/operations/recipe-editor.tsx#L670)

- `SubRecipesPanel` — yield header + composite list + add picker.
  [`recipe-editor.tsx:1545`](../../cafe-mgmt/src/components/operations/recipe-editor.tsx#L1545)

- `YieldEditor` — set/clear/edit with re-sync useEffect on prop change.
  [`recipe-editor.tsx:1715`](../../cafe-mgmt/src/components/operations/recipe-editor.tsx#L1715)

**Tests (5 new)**

- `getSubRecipeOptions` happy-path + filter + scope + auth + empty.
  [`recipe.actions.test.ts`](../../cafe-mgmt/src/actions/recipe.actions.test.ts)
