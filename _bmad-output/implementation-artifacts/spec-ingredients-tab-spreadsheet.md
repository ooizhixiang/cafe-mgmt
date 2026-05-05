---
title: 'Promote Ingredients to Top-Level Tab with Spreadsheet UI'
type: 'feature'
created: '2026-04-27'
status: 'done'
baseline_commit: '5712db4'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ingredient configuration is buried under Settings → "Configure ingredients →" link. Users have to navigate two clicks deep, and the per-row accordion only shows one ingredient's fields at a time, making it slow to compare or bulk-edit costs/thresholds across many ingredients.

**Approach:** Promote ingredient config to a top-level nav tab `/ingredients` (10th nav item) and redesign the page as a spreadsheet — one row per ingredient, all configuration fields as inline-editable cells, save-on-blur per cell. Delete the old `/settings/ingredients` route and its Settings link. Manager-only access is preserved for now (the broader "open all features to staff" change is deferred).

## Boundaries & Constraints

**Always:** Reuse existing server actions (`updateIngredientConfig`, `togglePin`, `addIngredient`, `updateIngredient`, `deleteIngredient`) — do not create parallel actions. Reuse `IngredientSuppliersPanel` as-is. Preserve all current behaviors: cents-as-integers for cost, server timestamps, pinned-first ordering, soft-delete semantics, toast on success/error. Page-level `requireRole("MANAGER")` and middleware `MANAGER_ONLY_PATHS` gating both stay in place. Update the existing e2e test paths from `/settings/ingredients` to `/ingredients` rather than skipping them.

**Ask First:** Lucide icon for the new "Ingredients" nav item (suggestions: `Carrot`, `Leaf`, `Sprout`, `Salad`). Whether the supplier links/purchase history should be reachable from the spreadsheet via (a) a per-row "Suppliers" button opening a drawer, or (b) a click-row-to-expand inline panel.

**Never:** Do not lift manager-only restrictions in this spec — that lives in deferred work. Do not modify `IngredientSuppliersPanel`, the underlying actions, or the Prisma schema. Do not add new ingredient fields. Do not remove the `/setup/ingredients` flow (template-based review remains separate).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior | Error |
|----------|--------------|-------------------|-------|
| Edit cell (blur or Enter) | Change Cost "1.50"→"2.00", tab out | Optimistic update; calls `updateIngredientConfig`; success toast | Revert + error toast |
| Esc while editing | User presses Esc mid-edit | Revert to original value; no save | N/A |
| Invalid numeric | Types "abc" in Cost | Reject on blur, revert | No server call |
| Toggle pin | Click star | Row optimistically moves to/from top; calls `togglePin` | Revert + toast |
| Delete row | Click trash icon | Confirmation dialog → `deleteIngredient` | Row stays + toast |
| Add row | Sticky bottom row: Name + Unit + ✓ | Calls `addIngredient`, row appears | Disabled if empty; toast on failure |
| Stale row | Ingredient deleted elsewhere, user edits cell | Server returns not-found | Toast: "no longer exists — refresh" |
| Empty state | Zero ingredients | Empty message + sticky add-row | N/A |
| Mobile width | Viewport < 640px | Horizontal scroll; Name column sticky-left | N/A |

</frozen-after-approval>

## Code Map

- `src/components/ui/bottom-nav.tsx` -- mobile nav array; insert "Ingredients" between Inventory and Wastage
- `src/components/ui/side-nav.tsx` -- desktop nav array; same insertion (Settings stays last)
- `middleware.ts` -- `MANAGER_ONLY_PATHS`; add `/ingredients` until deferred-work strips role gates
- `src/app/(app)/ingredients/page.tsx` -- NEW; mirror data fetch from `/settings/ingredients/page.tsx`
- `src/components/ingredients/ingredient-spreadsheet.tsx` -- NEW; client component with the table
- `src/components/ingredients/ingredient-spreadsheet.test.tsx` -- NEW; cover I/O matrix scenarios
- `src/app/(app)/settings/page.tsx` -- delete the "Ingredient Configuration" section (lines ~123–139)
- `src/app/(app)/settings/ingredients/page.tsx` -- DELETE
- `src/components/settings/ingredient-config.tsx` -- DELETE (replaced by spreadsheet)
- `src/app/(app)/inventory/page.tsx` -- update empty-state link `/settings/ingredients` → `/ingredients`
- `e2e/sales-report.spec.ts` -- update path `/settings/ingredients` → `/ingredients`
- `e2e/smoke.spec.ts` -- update path `/settings/ingredients` → `/ingredients`
- `src/components/ingredients/ingredient-suppliers-panel.tsx` -- consume unchanged

## Tasks & Acceptance

**Execution:**
- [x] `src/app/(app)/ingredients/page.tsx` -- create -- requireRole("MANAGER"); fetch ingredients + suppliers + purchases (port query from settings/ingredients/page.tsx); render `<IngredientSpreadsheet />`
- [x] `src/components/ingredients/ingredient-spreadsheet.tsx` -- create -- table with columns: Pin · Name · Unit · Cost($) · Snap · Container · Category · Threshold · Units/container · Suppliers · Delete; inline-editable cells; save-on-blur per cell; sticky add-row at bottom; sticky leftmost Name column on mobile; horizontal scroll
- [x] `src/components/ingredients/ingredient-spreadsheet.test.tsx` -- create -- cover edit-blur, edit-Enter, invalid numeric, toggle pin, delete, add, stale-row error
- [x] `src/components/ui/bottom-nav.tsx` -- modify -- add `{ href: "/ingredients", label: "Ingredients", icon: <chosen>, managerOnly: true }` between Inventory and Wastage
- [x] `src/components/ui/side-nav.tsx` -- modify -- same insertion (and `managerOnly: true`)
- [x] `middleware.ts` -- modify -- add `/ingredients` to `MANAGER_ONLY_PATHS`
- [x] `src/app/(app)/settings/page.tsx` -- modify -- delete the "Ingredient Configuration" section
- [x] `src/app/(app)/inventory/page.tsx` -- modify -- empty-state CTA link → `/ingredients`
- [x] `e2e/sales-report.spec.ts` -- modify -- replace `/settings/ingredients` with `/ingredients`
- [x] `e2e/smoke.spec.ts` -- modify -- replace `/settings/ingredients` with `/ingredients`
- [x] `src/app/(app)/settings/ingredients/page.tsx` -- delete
- [x] `src/components/settings/ingredient-config.tsx` -- delete

**Acceptance Criteria:**
- Given a manager logged in, when viewing the bottom-nav (mobile) or side-nav (desktop), then "Ingredients" appears directly after Inventory.
- Given a staff user logged in, when navigating to `/ingredients`, then they are redirected to `/` by middleware.
- Given a manager on `/ingredients` with several ingredients, when the page loads, then every ingredient appears as one row with all fields visible as inline cells (no accordion).
- Given a manager edits a cost cell and tabs out, when the save succeeds, then a toast confirms and the cell value persists on reload.
- Given a manager attempts to navigate to `/settings/ingredients`, when the page loads, then it 404s (route deleted).
- Given the Settings page, when a manager views it, then no "Ingredient Configuration" section is shown.
- Given the inventory empty-state, when a manager clicks "Add ingredients", then they land on `/ingredients`.
- Given `npx next build` runs, when it completes, then no TypeScript or build errors.
- Given `npm test` runs, when it completes, then all tests pass including the new spreadsheet tests.
- Given `npx playwright test e2e/sales-report.spec.ts e2e/smoke.spec.ts` runs, when it completes, then both pass against the updated paths.

## Design Notes

Each cell is an `<input>` styled flush with the cell — no edit/view modes. Save on blur or Enter; Esc reverts. Numeric cells reject non-parseable input. Only the changed field is sent to `updateIngredientConfig` (action accepts partials). Optimistic update; rollback on error.

Suppliers: per-row "Suppliers (N)" button opens a drawer hosting `<IngredientSuppliersPanel mode="manager" />` unchanged.

Mobile: `overflow-x: auto` on wrapper; Name column uses `position: sticky; left: 0`. Bottom-nav with 10 items will be tight on small phones — accept; overflow-menu redesign is out of scope.

## Verification

**Commands:**
- `npx next build` -- expected: compiles without errors
- `npm test -- ingredient-spreadsheet` -- expected: new tests pass
- `npx playwright test e2e/sales-report.spec.ts e2e/smoke.spec.ts` -- expected: both pass

**Manual checks:**
- Mobile viewport ≤ 375px: table scrolls horizontally, Name column stays visible.
- Edit cost on one row, refresh: change persists.
- Toggle pin: row jumps to top of list.
- Click "Suppliers (N)" on a row: drawer opens with link list and purchase history.

## Suggested Review Order

**Page entry & data fetch**

- Manager-gated route; ports the supplier+purchase query unchanged from the deleted settings page.
  [`page.tsx:5`](../../cafe-mgmt/src/app/(app)/ingredients/page.tsx#L5)

**Spreadsheet architecture**

- Component owns the ingredient array; child Cells call back via async `onSave`.
  [`ingredient-spreadsheet.tsx:84`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L84)

- Per-row, per-field optimistic update with functional rollback — no whole-array snapshot.
  [`ingredient-spreadsheet.tsx:106`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L106)

- `useEffect` clears stale `expandedId` when its row is removed.
  [`ingredient-spreadsheet.tsx:99`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L99)

- Pin toggle: stable sort by `(isPinned desc, original index asc)` to avoid drift.
  [`ingredient-spreadsheet.tsx:333`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L333)

**Inline cell behavior**

- `Cell` keyed by stable `${field}:${id}`; `useEffect` re-syncs from props after server-confirmed updates.
  [`ingredient-spreadsheet.tsx:716`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L716)

- Promise-based `commit`: `lastSavedRef` advances only on resolved success.
  [`ingredient-spreadsheet.tsx:721`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L721)

- Cost: `Number.isSafeInteger` + ≤ $10M guard; integer fields reject decimals/exponent.
  [`ingredient-spreadsheet.tsx:106`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L106)

- 44pt min-height on cell inputs for iOS touch-target compliance.
  [`ingredient-spreadsheet.tsx:770`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L770)

**Add row & expand**

- Add-row Enter gated on `!isPending`; toasts "Name and unit required" on empty.
  [`ingredient-spreadsheet.tsx:373`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L373)

- Sticky add-row at `z-[2]` distinct from cell sticky-left at `z-[1]`.
  [`ingredient-spreadsheet.tsx:609`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L609)

**Navigation & gating**

- Carrot icon, `managerOnly: true`, inserted directly after Inventory.
  [`bottom-nav.tsx:29`](../../cafe-mgmt/src/components/ui/bottom-nav.tsx#L29)

- Same insertion in desktop nav.
  [`side-nav.tsx:32`](../../cafe-mgmt/src/components/ui/side-nav.tsx#L32)

- `/ingredients` added to `MANAGER_ONLY_PATHS` until the deferred role-strip lands.
  [`middleware.ts:5`](../../cafe-mgmt/middleware.ts#L5)

**Removed surfaces**

- Empty-state CTA repointed to `/ingredients`.
  [`inventory/page.tsx:58`](../../cafe-mgmt/src/app/(app)/inventory/page.tsx#L58)

- "Ingredient Configuration" section removed from Settings.
  [`settings/page.tsx:1`](../../cafe-mgmt/src/app/(app)/settings/page.tsx#L1)

**Tests**

- 15 unit tests covering all I/O matrix rows + new patch coverage (non-integer, out-of-range, empty-add).
  [`ingredient-spreadsheet.test.tsx:89`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.test.tsx#L89)

- E2E selectors updated for new spreadsheet UI; await between consecutive adds.
  [`smoke.spec.ts:1`](../../cafe-mgmt/e2e/smoke.spec.ts#L1)
