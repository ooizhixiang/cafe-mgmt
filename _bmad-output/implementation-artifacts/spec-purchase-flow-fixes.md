---
title: 'Purchase Flow Fixes — Auto-Update Inventory + Inline Suppliers + Inline Link Add'
type: 'bugfix'
created: '2026-04-28'
status: 'done'
baseline_commit: '5712db4'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Three issues converge around the purchase flow:
1. **Bug:** Logging a purchase creates an `IngredientPurchase` lot but does NOT bump today's `InventoryCount`. Manager has to manually recount to see the new stock.
2. **Inline visibility:** On `/inventory`, supplier names per ingredient are hidden behind the "Show all suppliers" toggle — managers can't tell at a glance who they bought from.
3. **Friction:** When logging a purchase, if an ingredient isn't yet linked to that supplier, manager has to leave `/purchases`, go to `/suppliers/[id]`, add the link, come back. No inline path to link from the purchase form.

**Approach:** (1) Inside the existing purchase txn, upsert today's `InventoryCount` for each affected ingredient (increment if exists, create if not — seeding from yesterday's balance). (2) On `/inventory`, render up to 3 supplier name chips inline below each ingredient (with "+N more" if longer), reusing the existing `ingredientSuppliers` data already passed to the list. (3) On `/purchases`, add a "+ Link new ingredient" option in the per-line ingredient picker that opens an inline mini-form (cafe ingredient `<select>` + price + unit) → creates `IngredientSupplier` via `addIngredientSupplier`, then proceeds with the purchase line using the new link.

## Boundaries & Constraints

**Always:** Preserve FIFO — purchase still sets `remainingQuantity = quantity`; `LotConsumption` flow untouched. Inventory-count auto-update runs INSIDE the purchase txn (atomic with the lot write). Auto-create today's count seeded from prior-day's count (`countDate < today`, latest) + purchase qty; no prior → just purchase qty. `confirmedById = session.user.id` on create; preserve original on update. Inline supplier chips reuse existing data (no new fetch). Add-link flow reuses `addIngredientSupplier` action; stays on `/purchases`.

**Ask First:** None.

**Never:** Don't change the `IngredientPurchase` schema. Don't modify wastage/comp/daily-report/recipe paths. Don't touch the FIFO consume helpers. Don't auto-deduct on void/correct of a purchase row (out of scope; existing purchase rows can't be deleted or corrected today). Don't introduce a new server action — reuse existing. Don't paginate the inline supplier chips — if a supplier list is long, show "+N more" and let the existing toggle handle the full list.

## I/O & Edge-Case Matrix

| Scenario | State | Expected |
|----------|-------|----------|
| Log purchase 100kg coffee, no count today | First count of day | New `InventoryCount(today)` row with `quantity = (yesterday's quantity ?? 0) + 100` |
| Log purchase 50, count today exists at 200 | Pre-existing count | `InventoryCount(today).quantity` becomes 250 |
| Bulk purchase 3 lines | All in one txn | Each ingredient's today count bumps by its line qty; one txn rollback if any fails |
| Inline supplier chips: 1 supplier | "Acme Foods" | Show "Acme Foods" chip under name |
| Inline supplier chips: 5 suppliers | Multi-source | Show first 3 + "+2 more"; full list via existing toggle |
| Purchase form: ingredient already linked | Default flow | Existing `<select>` lists the linked ingredient |
| Purchase form: ingredient NOT linked | New | "+ Link new ingredient" option; opens picker; on save, link is added and line uses the new `ingredientSupplierId` |
| Add-link with empty fields | Validation | Save disabled |
| Add-link duplicate | Already linked elsewhere | Server returns error toast; line stays empty |

</frozen-after-approval>

## Code Map

- `src/actions/inventory.actions.ts` -- modify `createIngredientPurchase` + `bulkCreateIngredientPurchases`: in-txn upsert today's `InventoryCount` per ingredient; seed from prior-day count on create
- `src/actions/inventory.actions.test.ts` -- add 3 tests (no prior count, prior count yesterday, today count exists)
- `src/components/inventory/inventory-list.tsx` -- inline supplier chips per row (max 3 + "+N more"); existing toggle preserved
- `src/components/inventory/inventory-list.test.tsx` -- assert chips visible and overflow handled
- `src/components/purchases/purchases-form.tsx` -- per-line "+ Link new ingredient" option opens mini-form; reuses `addIngredientSupplier`; threads new link into the line
- `src/components/purchases/purchases-form.test.tsx` -- inline-link tests (success, duplicate, validation)
- `src/app/(app)/purchases/page.tsx` -- pass `allIngredients` prop to the form

## Tasks & Acceptance

**Execution:**
- [x] `src/actions/inventory.actions.ts` -- modify -- upsert today's `InventoryCount` per ingredient inside the purchase txn; seed from prior day on create; preserve `confirmedById` on update
- [x] `src/actions/inventory.actions.test.ts` -- add 3 tests: no prior count → creates today seeded with qty; prior count exists yesterday → today seeded as yesterday+qty; today count exists → quantity += qty
- [x] `src/components/inventory/inventory-list.tsx` -- modify -- inline supplier chips (max 3 + "+N more"); reuse existing data
- [x] `src/components/inventory/inventory-list.test.tsx` -- modify/add -- chips visible by default; >3 collapses with "+N more"
- [x] `src/components/purchases/purchases-form.tsx` -- modify -- per-line "+ Link new ingredient" option opens inline mini-form; reuses `addIngredientSupplier`; threads new link into the line
- [x] `src/app/(app)/purchases/page.tsx` -- modify -- fetch and pass `allIngredients` prop
- [x] `src/components/purchases/purchases-form.test.tsx` -- add inline-link tests

**Acceptance Criteria:**
- Purchase 100 coffee, no count today → `InventoryCount(today).quantity = (prior?.quantity ?? 0) + 100`.
- Purchase 50 coffee, today count exists at 200 → today.quantity becomes 250.
- Bulk purchase of 3 ingredients → all 3 today counts bump; any line failure rolls back the whole txn.
- Ingredient with 2 suppliers on `/inventory` → both chips inline under name.
- Ingredient with 5 suppliers → 3 chips + "+2 more"; existing toggle still opens full panel.
- On purchase form, manager picks supplier A, then "+ Link new ingredient" → chooses X → enters price/unit → saves → `addIngredientSupplier` called, new link selected; submitting purchase succeeds.
- `npx next build` + `npx vitest run --exclude="e2e/**"` pass.

## Design Notes

**Auto-update upsert:** for each line, `findFirst` prior-day count (`countDate < today`, latest) → `upsert(today)` with `create.quantity = (prior?.quantity ?? 0) + line.quantity` and `update.quantity = { increment: line.quantity }`. Keep `confirmedById` unchanged on update.

**Inline chips:** text-meta pills below name; cap at 3 alphabetical + "+N more" (non-clickable; existing "Show all suppliers" toggle handles the full list).

**Add-link mini-form:** mirrors `supplier-list.tsx`'s inline picker pattern. On save: optimistic insert into `currentSupplier.links` so the new link is immediately selectable in the line's ingredient `<select>`.

## Verification

**Commands:**
- `npx next build` -- expected: clean compile
- `npx vitest run --exclude="e2e/**"` -- expected: all tests pass including new tests

**Manual checks:**
- Log a purchase of 100 of coffee; refresh `/inventory` — coffee count is up by 100 with no manual recount.
- Visit `/inventory` — supplier names show under each ingredient; ingredients with many suppliers show "+N more."
- On `/purchases`, pick supplier A → click "+ Link new ingredient" → pick a brand-new ingredient + price + unit → save line → submit. The link persists; the purchase logs.

## Suggested Review Order

**Server-side: auto-update inventory count**

- Single purchase wraps create + count upsert in one transaction; `setUTCHours(0,0,0,0)` for cafe-correct date.
  [`inventory.actions.ts:451`](../../cafe-mgmt/src/actions/inventory.actions.ts#L451)

- Bulk variant: same pattern per line in shared txn.
  [`inventory.actions.ts:559`](../../cafe-mgmt/src/actions/inventory.actions.ts#L559)

- Prior-day seed + `confirmedById` set on create; preserved on update.
  [`inventory.actions.ts:467`](../../cafe-mgmt/src/actions/inventory.actions.ts#L467)

**`/inventory` inline supplier chips**

- Up to 3 chips sorted price-asc (matches `IngredientSuppliersPanel` ordering); "+N more" overflow with `aria-label` for screen readers; per-chip `max-w-[8rem] truncate` + tooltip for long supplier names.
  [`inventory-list.tsx:562`](../../cafe-mgmt/src/components/inventory/inventory-list.tsx#L562)

**`/purchases` — `+ Link new ingredient`**

- Sentinel option in per-line ingredient `<select>` opens an inline mini-form: cafe ingredient picker (filtered to unlinked) + price + unit.
  [`purchases-form.tsx:46`](../../cafe-mgmt/src/components/purchases/purchases-form.tsx#L46)

- Save calls `addIngredientSupplier`; optimistic insert into local supplier state; threads new link into the line.
  [`purchases-form.tsx:251`](../../cafe-mgmt/src/components/purchases/purchases-form.tsx#L251)

- Page passes `allIngredients` prop.
  [`purchases/page.tsx:1`](../../cafe-mgmt/src/app/(app)/purchases/page.tsx#L1)

**Tests**

- Single-purchase + bulk-purchase auto-bump tests; chip overflow + sort tests; mini-form happy / failure / cancel paths.
  [`inventory.actions.test.ts:1`](../../cafe-mgmt/src/actions/inventory.actions.test.ts#L1)
  [`inventory-list.test.tsx:1`](../../cafe-mgmt/src/components/inventory/inventory-list.test.tsx#L1)
  [`purchases-form.test.tsx:1`](../../cafe-mgmt/src/components/purchases/purchases-form.test.tsx#L1)
