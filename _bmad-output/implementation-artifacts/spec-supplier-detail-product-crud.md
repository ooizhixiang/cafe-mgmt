---
title: 'Supplier detail page — manage products supplied'
type: 'feature'
created: '2026-04-27'
status: 'done'
baseline_commit: '51dc3a72ccdcc0157a8af6dcc21d6d939fe3ea17'
context:
  - '{project-root}/cafe-mgmt/prisma/schema.prisma'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-restrict-purchase-picker-to-linked.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Today, the only place to manage which ingredients a supplier carries is `/settings/ingredients`, working ingredient-first (open an ingredient → expand the suppliers panel → add the supplier). After the recent picker reversal on `/purchases`, this gap is sharp: a manager who realises a supplier is missing a product has to leave the Suppliers tab entirely to fix it. The supplier detail page already shows "Products supplied" — but read-only.

**Approach:** Make the "Products supplied" section on `/suppliers/[id]` a full CRUD surface for managers. Each product row gets inline edit (price/unit) and remove. A "+ Add product" affordance reveals a small form with an ingredient picker (excluding ingredients already linked to this supplier), a price-RM field, and a unit field. All three actions wire to existing manager-only `addIngredientSupplier` / `updateIngredientSupplier` / `removeIngredientSupplier` server actions — no new server work. Staff continue to see the read-only view.

## Boundaries & Constraints

**Always:**
- New UI lives in the existing "Products supplied" section of `/suppliers/[id]` only. No changes to `/suppliers` (list page) or to `ingredient-suppliers-panel.tsx`.
- Manager mode (`mode === "manager"`) renders the edit/remove controls and the "+ Add product" button. Staff mode (`mode === "readonly"`) renders the existing display unchanged.
- Reuse the existing actions: `addIngredientSupplier`, `updateIngredientSupplier`, `removeIngredientSupplier` (all in `setup.actions.ts`, all `requireRole("MANAGER")`). Do not modify those actions.
- Add-product picker excludes ingredients already linked to this supplier — they cannot be added twice. If the cafe has no unlinked ingredients left, the "+ Add product" button is disabled with a tooltip / hint: "All cafe ingredients are linked to this supplier."
- Money: integer cents end-to-end. Use `parseRMToCents` for input, `RM X.XX` for display. Mirror the input patterns in `ingredient-suppliers-panel.tsx`.
- Optimistic local state: on add, append to the in-memory product list with the id returned by the action. On edit, replace the row. On remove, filter it out. On any action failure, toast the error and leave the prior state intact (no rollback wrestling).
- Page-level data fetch: `/suppliers/[id]/page.tsx` must also load all cafe ingredients (`{ id, name, unit }`, sorted by name) and pass them down so the picker has its source of truth.

**Ask First:**
- If `removeIngredientSupplier` returns the existing `"Has purchase history; cannot remove"` error (or any blocking error), the UI surfaces it via toast and leaves the row intact. If you find any caller that depends on a different error string, HALT and report.

**Never:**
- No new server actions. No relaxation of the manager-only role gate.
- No add/edit/remove on the supplier list page (`/suppliers`).
- No bulk operations (add many products in one form). One product at a time.
- No price-snapshot / variance display, no purchase-aware warnings ("price changed since last buy"). Out of scope.
- No removal-with-confirm dialog beyond a simple `window.confirm`. Match the existing destructive-action pattern in `ingredient-suppliers-panel.tsx`.
- No effect on the read-only view used by staff.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|----------|---------------|----------|----------------|
| Manager adds a product | picker + price + unit, submit | Action called, new row appears at the end of the list (or sorted by ingredient name), picker resets, picker excludes the just-added ingredient | Toast action error; form stays open with values intact |
| Manager edits product price/unit | inline edit + save | Action called, row updated in place | Toast error; original values restored |
| Manager removes product (no purchase history) | click remove → confirm → submit | Action called, row removed from list | Toast error; row stays |
| Manager tries to remove a product with purchases | confirm → submit | Action returns `"Has purchase history; cannot remove"` (existing string); toast surfaces it; row stays | Standard toast |
| Picker exhausted (every cafe ingredient is linked) | no unlinked ingredients | "+ Add product" button disabled with tooltip; click does nothing | N/A |
| Concurrent add (manager A and B both add same ingredient) | unique-constraint race | Action's existing P2002 path returns `"Supplier already added"`; toast surfaces it | The local list still in sync after refresh |
| Staff visits the page | `mode === "readonly"` | Existing read-only render — no edit/remove buttons, no "+ Add product" | N/A |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/src/app/(app)/suppliers/[id]/page.tsx` -- extend the parallel queries to also load `prisma.ingredient.findMany({ where: { cafeId }, select: { id: true, name: true, unit: true }, orderBy: { name: "asc" } })`. Pass `allIngredients` to `<SupplierDetail>`.
- `cafe-mgmt/src/components/operations/supplier-detail.tsx` -- accept new prop `allIngredients`. In the "Products supplied" section, when `mode === "manager"`: render each row with inline-edit toggle (price RM + unit fields, save/cancel) and a remove button (with `window.confirm`); above or below the rows, a "+ Add product" button that toggles a small inline form (ingredient `<select>` of cafe ingredients minus already-linked ones, price RM input, unit input, save/cancel). Wire to `addIngredientSupplier` / `updateIngredientSupplier` / `removeIngredientSupplier`. Use `parseRMToCents` and `formatRM`. Reuse the toast hook.
- `cafe-mgmt/src/components/operations/supplier-detail.test.tsx` -- new test file (or extend if one exists). Cover: add (calls action, list updates, picker resets, just-added ingredient excluded), edit (calls action, row updated), remove (confirm gate + action + filtered out), remove-with-history error toast, exhausted-picker disabled state, staff readonly mode unchanged.

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/src/app/(app)/suppliers/[id]/page.tsx` -- add the `prisma.ingredient.findMany` to the parallel `Promise.all`; pass `allIngredients` to `<SupplierDetail>`.
- [x] `cafe-mgmt/src/components/operations/supplier-detail.tsx` -- accept `allIngredients` prop; render product CRUD UI in manager mode within the existing "Products supplied" section; wire the three actions; handle picker exclusion + exhausted state.
- [x] `cafe-mgmt/src/components/operations/supplier-detail.test.tsx` -- new tests per Code Map row.

**Acceptance Criteria:**
- Given a manager opens `/suppliers/[id]` for a supplier with 2 linked products, when they click "+ Add product", pick a third ingredient, enter `RM 5.50` and `kg`, and save, then `addIngredientSupplier` is called once with the right payload, the products list now shows 3 rows, the just-added ingredient no longer appears in the picker, and the form resets.
- Given a manager edits an existing product's price from `RM 3.00` to `RM 3.20`, when they save, then `updateIngredientSupplier` is called with the new `priceInCents` and the row displays `RM 3.20/<unit>` immediately.
- Given a manager clicks remove on a product with no purchase history, when they confirm, then `removeIngredientSupplier` is called and the row disappears.
- Given a manager clicks remove on a product whose link has purchase history, when the action returns `"Has purchase history; cannot remove"`, then a toast surfaces that exact message and the row remains.
- Given a supplier is already linked to every cafe ingredient, when a manager opens the page, then the "+ Add product" button is disabled with a hint indicating no ingredients remain to add.
- Given a staff member opens `/suppliers/[id]`, then they see the existing read-only "Products supplied" rendering with no add / edit / remove controls.

## Spec Change Log

### Iteration 1 review patches — 2026-04-27
- **Trigger:** Three reviewers (blind, edge-case, acceptance) ran against the diff. Net new actionable findings produced six patches; pre-existing concerns and product-philosophy items deferred.
- **Patches applied (in `supplier-detail.tsx` + `supplier-detail.test.tsx`):**
  1. **try/catch around all three actions.** Network errors / thrown promises now toast "Couldn't add/save/remove — please try again" instead of silently leaving `isPending` flapping with no feedback.
  2. **Disable Edit and Remove buttons while `isPending`.** Prevents a fast double-click or cross-row race (e.g. Save row A then Remove row A while save is in flight) from firing two actions and racing two `setProducts` updates.
  3. **`router.refresh()` after each successful add / edit / remove.** Reconciles cross-tab state: a manager who adds an ingredient in another tab will see it in this page's picker after the next mutation, and "Supplier already added" races no longer leave the picker showing a phantom unlinked option.
  4. **Distinguish "no ingredients exist yet" from "all linked".** The disabled-add-button hint now reads `"No ingredients exist yet. Add one in Settings → Ingredients."` when `allIngredients.length === 0` (e.g. brand-new cafe), and only says `"All cafe ingredients are linked to this supplier."` when the products exhaust the cafe's catalogue.
  5. **Clear `editingProductId` when the row being edited is removed.** Prevents an orphan editing-state pointer after concurrent removal of the same row.
  6. **Fixed test fixture** to mock the action's *actual* error string `"Has purchase history; archive supplier instead"` (was mocking a fictional `"cannot remove"`). The component's behavior was always correct — toast whatever the action returns — but the test was asserting a string that production never emits. Test now guards real production output.
- **Test additions:** added `next/navigation` mock to the test file (not previously needed; `router.refresh()` is a new dependency).
- **Spec mismatch flagged for human attention:** the I/O Matrix and AC4 inside the frozen-after-approval block reference `"Has purchase history; cannot remove"` — the literal the action does not return. The literal was a factual error introduced during planning. Implementation behavior matches intent (toast the action's blocking error, leave row intact). The frozen block can only be amended by the human; flagging here so the next reader knows the matrix wording is stale even though behavior is correct. Same root issue is already in `deferred-work.md` ("archive supplier instead message points to a feature that doesn't exist") — resolving it product-side will reconcile the spec literal too.

## Verification

**Commands:**
- `cd cafe-mgmt && npm run build` -- expected: clean.
- `cd cafe-mgmt && npx vitest run` -- expected: full suite passes; new tests included.
- `cd cafe-mgmt && npm run lint` -- expected: no new errors.

## Suggested Review Order

**Page-level data fetch**

- Parallel `prisma.ingredient.findMany` joins the existing supplier query so the picker's source of truth is server-rendered.
  [`page.tsx:30`](../../cafe-mgmt/src/app/(app)/suppliers/[id]/page.tsx#L30)

**Component — derived state**

- `availableToAdd` excludes ingredients already linked to this supplier; sorted alphabetically.
  [`supplier-detail.tsx:100`](../../cafe-mgmt/src/components/operations/supplier-detail.tsx#L100)

- Empty-state hint distinguishes "no cafe ingredients yet" from "all already linked" (review-loop fix).
  [`supplier-detail.tsx:657`](../../cafe-mgmt/src/components/operations/supplier-detail.tsx#L657)

**Component — actions**

- `handleSaveProduct`: try/catch wrapping, optimistic local update, `router.refresh()` to reconcile cross-tab state (review-loop fixes).
  [`supplier-detail.tsx:178`](../../cafe-mgmt/src/components/operations/supplier-detail.tsx#L178)

- `handleRemoveProduct`: confirm gate, try/catch, clears `editingProductId` when the edited row is the one being removed, `router.refresh()`.
  [`supplier-detail.tsx:213`](../../cafe-mgmt/src/components/operations/supplier-detail.tsx#L213)

- `handleAddProduct`: try/catch, optimistic append with the action's returned id, `router.refresh()`.
  [`supplier-detail.tsx:265`](../../cafe-mgmt/src/components/operations/supplier-detail.tsx#L265)

**Component — UI gating**

- Edit and Remove buttons disabled while `isPending` (review-loop fix — prevents cross-row race).
  [`supplier-detail.tsx:543`](../../cafe-mgmt/src/components/operations/supplier-detail.tsx#L543)

**Tests**

- Twelve component tests covering every I/O Matrix row, including the picker-exhausted disabled-state, staff readonly mode, and the corrected production error string for purchase-history removal.
  [`supplier-detail.test.tsx:1`](../../cafe-mgmt/src/components/operations/supplier-detail.test.tsx#L1)
