---
title: 'Per-ingredient "View inventory details" popup with per-supplier FIFO breakdown'
type: 'feature'
created: '2026-04-29'
status: 'done'
context: []
baseline_commit: '5712db434b7d94ac82e0e7af1e15c68f7109e6fe'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Managers can see today's total count for each ingredient, but cannot see which supplier's stock that count represents — nor which lot will be consumed next under FIFO. As lots get consumed, there's no surface that shows the per-supplier remaining breakdown or hides exhausted suppliers.

**Approach:** Add a "Details" link on each ingredient row in the Ingredients spreadsheet. Clicking it opens a popup showing every still-active lot grouped by supplier, lots oldest-first (FIFO order). Suppliers whose lots are all at `remainingQuantity = 0` are hidden from the popup — only suppliers with live stock appear. Read-only view; FIFO consumption itself is already wired (wastage / comp / recipes / daily-report all call `applyConsumeFifo`), so this popup just surfaces existing data.

## Boundaries & Constraints

**Always:**
- The popup is a per-lot breakdown (option 3b from clarifying questions): each lot is its own row showing remaining/original quantity, unit, purchase date, and unit cost. Lots are grouped by supplier, with the supplier name as a section header.
- Lot ordering: oldest first within each supplier (matches `consumeFifo` ordering: `createdAt asc, id asc`). Suppliers are ordered by their oldest still-active lot ascending — so the supplier whose stock will be consumed next appears at the top.
- A supplier is hidden when **all** of its lots for this ingredient have `remainingQuantity = 0`.

**Ask First:**
- Should the popup also show the running per-supplier total at the supplier-header level? (Default: yes — small subtitle under each supplier name.)

**Never:**
- Don't add any mutations from this popup. Read-only.
- Don't add a new column to the spreadsheet — place the "Details" link inside the existing "Suppliers" column cell, beside the existing "Suppliers (N)" toggle, to avoid colSpan churn across the table.
- Don't redesign FIFO consumption — it already works. Don't change `applyConsumeFifo`, `consumeFifo`, or any action that calls them.
- Don't introduce a new modal library — reuse the inline-overlay pattern from `confirmation-dialog.tsx`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Ingredient has lots from 2 suppliers, all with `remainingQuantity > 0` | Both suppliers appear; lots sorted oldest-first within each; supplier whose oldest lot is older appears first | N/A |
| Partial exhaustion | Supplier A has 2 lots (one at 0, one at 5); Supplier B has 1 lot at 10 | A shown with only the live lot; B shown with its lot; the depleted lot is hidden | N/A |
| Full supplier exhaustion | Supplier A's all-lots = 0; Supplier B has live stock | A is hidden entirely; B is shown | N/A |
| All exhausted | Every lot for the ingredient has `remainingQuantity = 0` | Empty state: "No remaining stock from any supplier." | N/A |
| No purchases ever | Ingredient has no `IngredientPurchase` rows | Empty state: "No purchases logged for this ingredient yet." | N/A |
| Deleted supplier link | Lot exists but its `IngredientSupplier` link was removed | Lot still appears under the historical supplier name (read-only view of past purchases) | N/A |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/src/app/(app)/ingredients/page.tsx` -- already loads `ingredientPurchases`; needs `remainingQuantity` added to the projection passed to `IngredientSpreadsheet`
- `cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx` -- the row-level UI; add "Details" link in the existing Suppliers cell + state to drive the new dialog
- `cafe-mgmt/src/components/ingredients/inventory-detail-dialog.tsx` -- **NEW** — the popup component (overlay + supplier-grouped lot list)
- `cafe-mgmt/src/components/ui/confirmation-dialog.tsx` -- pattern reference for the overlay shell
- `cafe-mgmt/src/lib/fifo.ts` -- reference for the `[createdAt asc, id asc]` ordering convention to mirror in the popup
- `cafe-mgmt/src/lib/format.ts` -- `priceCentsToRM` / date formatting helpers (use what's there; don't add new ones)

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/src/app/(app)/ingredients/page.tsx` -- add `remainingQuantity: p.remainingQuantity` to the `ingredientPurchases` projection (line ~135) -- the popup needs it to compute "still active" and per-lot remaining
- [x] `cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx` -- extend `IngredientPurchase` row type with `remainingQuantity: number` (line ~37 area, adjacent to `quantity`); inside the Suppliers cell (~line 886-896), add a "Details" text link beside "Suppliers (N)"; add `detailsTarget` state + render `<InventoryDetailDialog>` -- expose the new view per row
- [x] `cafe-mgmt/src/components/ingredients/inventory-detail-dialog.tsx` -- **NEW** — overlay+card mirroring `confirmation-dialog.tsx`. Props: `{open, ingredientName, ingredientUnit, purchases, onClose}`. Group purchases by `ingredientSupplierId`, drop supplier groups whose every lot has `remainingQuantity <= 0`, sort lots oldest-first by `[createdAt asc, id asc]`, sort suppliers by their oldest live lot's createdAt ascending. Each lot row: `<purchase date> — <remaining>/<original> <unit> · RM <unit cost>`. Render empty state when no live suppliers remain. -- the popup itself
- [x] `cafe-mgmt/src/components/ingredients/inventory-detail-dialog.test.tsx` -- **NEW** — vitest unit tests covering every row of the I/O Matrix (happy path, partial exhaustion, full supplier exhaustion, all exhausted, no purchases, deleted-link rendering with historical name) -- locks the filtering and ordering invariants
- [x] `cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.test.tsx` -- add a test that clicking the new "Details" link opens the dialog and Cancel/overlay-click closes it -- locks the wiring
- [x] **(unspec'd follow-on)** `cafe-mgmt/src/app/(app)/inventory/page.tsx` and `cafe-mgmt/src/components/ingredients/ingredient-suppliers-panel.tsx` -- both touch the same shared `IngredientPurchaseRow` type, which became required-field; mechanical `remainingQuantity: ...` adds to keep TS happy

**Acceptance Criteria:**
- Given an ingredient with lots from 3 suppliers (one fully depleted, two with live stock), when the manager clicks "Details" on that row, then the dialog renders with exactly the two live suppliers, each showing their non-empty lots oldest-first.
- Given an ingredient where every lot has `remainingQuantity = 0`, when the manager opens Details, then the dialog shows the "no remaining stock" empty state and no supplier rows.
- Given an ingredient with no purchases ever, when the manager opens Details, then the dialog shows the "no purchases yet" empty state.
- Given the popup is open, when the manager clicks the backdrop or a Close button, then the popup closes and the spreadsheet state is unchanged.
- Given a wastage / comp / recipe consumption is logged elsewhere reducing a lot's `remainingQuantity` to 0, when the manager next opens the Details popup for that ingredient, then that lot no longer appears (and its supplier disappears if it was the supplier's last live lot).

## Verification

**Commands:**
- `cd cafe-mgmt && npx vitest run src/components/ingredients/` -- expected: all ingredient component tests pass including the new dialog tests
- `cd cafe-mgmt && npm run build` -- expected: clean build, no TS errors
- `cd cafe-mgmt && npx vitest run` -- expected: full unit suite still passes

**Manual checks:**
- Dev server on :4000 → log a purchase for an ingredient → open `/ingredients` → click "Details" on that row → confirm the popup shows the new lot with full remainingQuantity. Log a wastage that consumes part of the lot → reopen Details → confirm the remaining quantity decreased. Consume the lot fully → reopen → confirm the lot (and supplier, if it was their only live lot) is hidden.

## Spec Change Log

### Iteration 1 — review patches (2026-04-29)

Three patch-class findings applied directly to the dialog (no spec amendment needed):

1. **Drag-close protection** — backdrop close now requires the same mouse interaction to start AND end on the backdrop (mousedown tracking via ref). Previously a text-selection drag from inside the card to the backdrop closed the dialog mid-selection. Same latent bug exists in `confirmation-dialog.tsx` and was not fixed there — leave that as-is until/unless it surfaces.
2. **Keyboard support** — added Escape-to-close and autofocus on the Close button when the dialog opens. Required for the `aria-modal="true"` contract. (Did NOT add a full focus trap — that's heavier and not strictly required for this read-only popup; skipped intentionally.)
3. **Sort comparator returns 0 on equal case** — outer supplier sort previously returned `1` on identical `[createdAt, id]` (an essentially-impossible case since suppliers have distinct ids). Cosmetic correctness fix only.

KEEP: per-supplier subtitle wording ("X unit remaining across N live lot(s)" with singular/plural), oldest-first within supplier and by oldest-live-lot across suppliers, hide-on-zero per-lot AND per-supplier, distinct empty-state copy for "no purchases ever" vs "all exhausted", and the in-cell button placement (no new column).

## Suggested Review Order

**Entry point**

- Start here — the popup component the rest of the change builds toward.
  [`inventory-detail-dialog.tsx`](../../cafe-mgmt/src/components/ingredients/inventory-detail-dialog.tsx)

**Filtering & ordering logic**

- The pure function: groups by supplier, drops depleted, mirrors `consumeFifo`'s `[createdAt asc, id asc]`.
  [`inventory-detail-dialog.tsx:38`](../../cafe-mgmt/src/components/ingredients/inventory-detail-dialog.tsx#L38)

- Cross-supplier sort (oldest live lot wins) — the "next-to-be-consumed supplier on top" rule.
  [`inventory-detail-dialog.tsx:60`](../../cafe-mgmt/src/components/ingredients/inventory-detail-dialog.tsx#L60)

**Dialog wiring & a11y**

- Mousedown-tracked backdrop close (drag-protection) + Escape handler + Close-button autofocus.
  [`inventory-detail-dialog.tsx:84`](../../cafe-mgmt/src/components/ingredients/inventory-detail-dialog.tsx#L84)

- Per-row "Details" button beside the existing Suppliers toggle (in-cell, no new column).
  [`ingredient-spreadsheet.tsx:888`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L888)

**Data plumbing**

- Type widened: `remainingQuantity` is now required on the shared `IngredientPurchaseRow`.
  [`ingredient-suppliers-panel.tsx:24`](../../cafe-mgmt/src/components/ingredients/ingredient-suppliers-panel.tsx#L24)

- Server projections add the new field — both pages that pass purchases to the spreadsheet/inventory list.
  [`ingredients/page.tsx:135`](../../cafe-mgmt/src/app/(app)/ingredients/page.tsx#L135)

  [`inventory/page.tsx:160`](../../cafe-mgmt/src/app/(app)/inventory/page.tsx#L160)

**Tests**

- Locks every I/O Matrix row (filtering, ordering, empty states, deleted-link rendering) plus the a11y patches.
  [`inventory-detail-dialog.test.tsx`](../../cafe-mgmt/src/components/ingredients/inventory-detail-dialog.test.tsx)

- Wiring smoke test: click Details → dialog opens → click Close → dialog closes.
  [`ingredient-spreadsheet.test.tsx:973`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.test.tsx#L973)
