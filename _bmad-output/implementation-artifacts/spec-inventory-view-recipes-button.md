---
title: 'Inventory: explicit "View Recipes" button per ingredient row'
type: 'feature'
created: '2026-05-07'
status: 'done'
context: []
baseline_commit: 'e41c89e9036d4e7658f85447e265a2b7439c009f'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On `/inventory`, clicking an ingredient's name expands the row and reveals a hidden "Used in recipes" list — but the trigger is undiscoverable (looks like a label, not a control). Users don't realize the name is clickable, so they never see the recipe list. This is reproducible: the user just asked "how can I see the recipes using the ingredient" despite the data path already existing.

**Approach:** Add an explicit, always-visible "View Recipes" button on every ingredient row in the inventory list. Clicking it opens a focused dialog showing recipes (and variations) that use the ingredient as a direct raw row. Remove the redundant inline "Used in recipes" section that lives inside the row expansion — it's now duplicated by the dialog. Keep the row-expansion mechanism for the unrelated "Show all suppliers" sub-feature.

## Boundaries & Constraints

**Always:**
- New button is **always visible** on each ingredient row, not gated behind another click. Use a compact, labeled affordance (icon + "Recipes" or similar) so it's discoverable without adding row clutter.
- Clicking the button opens a dialog (modal). It does NOT toggle the row expansion (that's still owned by the suppliers flow).
- The dialog reuses the existing `getRecipesForIngredient` server action — no new action, no schema change.
- The dialog shows: ingredient name in the title; a list of `{recipe.name + (variation?)}` rows with `quantityPerServing + unit/serving`; an empty state when no recipes use it.
- Esc + clicking the backdrop close the dialog (match existing dialog patterns in the project).

**Ask First:**
- Whether to extend `getRecipesForIngredient` to walk sub-recipes (e.g. show "Macchiato (via Fresh Milk Foam)" for Milk). Spec assumes **direct uses only** for this iteration; sub-recipe walking is a deliberate follow-up flagged in deferred-work.

**Never:**
- Do not change the existing `getRecipesForIngredient` action body or its return shape.
- Do not remove the row-expansion mechanism (`expandedIngId`) — the suppliers section still uses it.
- Do not auto-open the dialog or auto-fetch recipes on row expand. Fetch only when the button is clicked, on demand.
- Do not add the button to the `/ingredients` (spreadsheet) page — that page is configuration-focused and has the inventory-detail popup. This spec is scoped to `/inventory` only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| User clicks "View Recipes" on Milk | Milk has 3 recipes referencing it directly | Dialog opens; lists "Cafe Latte", "Cappuccino (Hot) (Fresh Milk)", etc. with qty/serving | N/A |
| Ingredient is in zero recipes | E.g. a newly-added ingredient | Dialog opens with empty state: "Not used in any recipe" | N/A |
| Server action fails | Network error / Unauthorized | Dialog shows toast "Failed to load recipes" and closes (or stays open with error state) | Surface via existing toast() helper |
| User opens dialog twice in a row | Second click before first finishes | Re-fetch is fine (idempotent); show loading state during fetch | N/A |
| Sub-recipe usage (e.g. Milk inside Fresh Milk Foam used by Macchiato) | Out of scope this iteration | Dialog does NOT list Macchiato — only direct uses | Documented in Design Notes |

</frozen-after-approval>

## Code Map

- `src/components/inventory/inventory-list.tsx` — (1) add a "View Recipes" button on each ingredient row, in the row-action area (next to the existing "Edit" pencil button); (2) add `useState` for the dialog target ingredient + recipes; (3) on button click, call `getRecipesForIngredient` then open dialog; (4) **remove** the inline "Used in recipes" rendering inside the expanded section (lines ~644–668); (5) **remove** the recipe-fetch from the name-click handler (since it's no longer rendered inline); the name-click can keep its current row-expand behavior (still useful for suppliers)
- `src/components/inventory/recipes-using-dialog.tsx` (NEW) — a small client component: dialog with backdrop, title, recipe list, empty state, Esc/click-backdrop close. Mirror the existing `StaleValueDialog` or `ConfirmationDialog` patterns
- `src/components/inventory/inventory-list.test.tsx` — add 2 tests: (a) clicking "View Recipes" opens the dialog and triggers `getRecipesForIngredient` once; (b) the dialog shows the recipe list with variation suffix when present, and the empty state when the action returns `[]`

## Tasks & Acceptance

**Execution:**
- [x] `src/components/inventory/recipes-using-dialog.tsx` — create new dialog component
- [x] `src/components/inventory/inventory-list.tsx` — add "View Recipes" button per row in the action area; new state `recipesDialogTarget` + `recipesDialogList` + `recipesDialogLoading`
- [x] Same file — wire button → fetch via `getRecipesForIngredient` → set state + open dialog
- [x] Same file — remove the inline "Used in recipes" section (existing lines ~644–668) and remove the `getRecipesForIngredient` call from the name-click handler. Keep `expandedIngId` toggle for the suppliers section.
- [x] `src/components/inventory/inventory-list.test.tsx` — add the 2 tests per Code Map
- [x] Run full verification (build, tests)

**Acceptance Criteria:**
- Given a user opens `/inventory`, when the page renders, then every ingredient row shows a "View Recipes" control as part of the row's action area.
- Given the user clicks "View Recipes" on Milk, when the click handler runs, then `getRecipesForIngredient(milkId)` is called once and a dialog opens listing the recipes that use Milk directly.
- Given the user clicks "View Recipes" on an unused ingredient, when the dialog opens, then it shows an empty state ("Not used in any recipe").
- Given the dialog is open, when the user presses Esc OR clicks the backdrop, then the dialog closes and the row remains in whatever expand state it had.
- Given the user clicks the ingredient NAME (not the new button), when the row expands, then it does NOT pre-fetch or render recipes inline; it only governs the suppliers section.

## Spec Change Log

## Design Notes

**Sub-recipe usage is deferred.** When Macchiato uses Fresh Milk Foam (a sub-recipe) which uses Milk, the current `getRecipesForIngredient` only returns direct references — Macchiato won't appear when querying Milk. Walking the composite graph requires either a recursive SQL/CTE or a JS-side expansion using the existing `expandRecipeToLeaves` helper. Out of scope for this spec; flagged in deferred-work after merge.

**Button placement.** Row already has Pin star (left), name+unit (left), "Counted" badge + Edit pencil (right). Add the new button between "Counted" badge and the pencil to keep similar-affordance buttons grouped. Use icon + tiny label (e.g. `<List size={14} /> Recipes`) so it's a real button, not a tooltip-only icon.

**Why a dialog, not inline.** Inline expansion is the existing failure mode (undiscoverable). A dialog gives the click an obvious result, which is what the user asked for. It also keeps the row scannable at high information density.

## Verification

**Commands:**
- `cd cafe-mgmt && npx tsc --noEmit` — expected: no new errors
- `cd cafe-mgmt && npx vitest run src/components/inventory/inventory-list.test.tsx` — expected: pre-existing tests still pass + 2 new tests pass
- `cd cafe-mgmt && npm run build` — expected: clean

**Manual checks:**
- Open `/inventory` — confirm "View Recipes" button visible on every row.
- Click "View Recipes" on a recipe-bearing ingredient (e.g. Milk) — confirm dialog opens with the list.
- Click the button on an unused ingredient — confirm empty state.
- Press Esc / click backdrop — confirm dialog closes.
- Click ingredient name — confirm row expand still works (suppliers area still functions); confirm no inline recipe list renders.

## Suggested Review Order

**The dialog component (start here)**

- New focused dialog: title, list, empty state, Esc + click-backdrop close.
  [`recipes-using-dialog.tsx`](../../cafe-mgmt/src/components/inventory/recipes-using-dialog.tsx)

**Button + state on inventory rows**

- "View Recipes" button rendered always-visible per row, between "Counted" badge and Edit pencil.
  [`inventory-list.tsx:548`](../../cafe-mgmt/src/components/inventory/inventory-list.tsx#L548)

- Dialog state + race-discard request-id ref (iter 1 patch).
  [`inventory-list.tsx:184`](../../cafe-mgmt/src/components/inventory/inventory-list.tsx#L184)

- Click handler: bumps `reqId`, resets list, opens dialog, fetches, discards stale response.
  [`inventory-list.tsx:555`](../../cafe-mgmt/src/components/inventory/inventory-list.tsx#L555)

**What was removed (parity check)**

- Inline "Used in recipes" rendering inside the row-expansion is gone; only the suppliers panel remains there.
  [`inventory-list.tsx`](../../cafe-mgmt/src/components/inventory/inventory-list.tsx) (around the old line 644 region)

**Tests**

- 2 new tests cover button-click → fetch + dialog open, and recipes-with-variation rendering vs empty state.
  [`inventory-list.test.tsx`](../../cafe-mgmt/src/components/inventory/inventory-list.test.tsx)

