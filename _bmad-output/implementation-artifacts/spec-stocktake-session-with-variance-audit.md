---
title: 'Stocktake: structured count session with variance → wastage / adjustment audit'
type: 'feature'
created: '2026-05-08'
status: 'done'
baseline_commit: 'e173cd351e90a6a0a892fc5217c3bbfa8bb975a7'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Today's daily count is per-day, per-ingredient, mid-shift; there's no structured periodic *stocktake* — a deliberate session where every ingredient is counted, variances against the system's expected quantity are reconciled, and the resulting losses/gains are persisted in an audit trail. The user wants a "Uncounted Items" / "Counted Items" workflow modeled after the screenshot they provided: list every ingredient with its expected qty, capture the actual counted qty per row with a Confirm button, then "Mark As Completed" or "Cancel" the whole session.

**Approach:** New `/stocktake` page (manager-only). New schema: `Stocktake` (session header), `StocktakeItem` (one per ingredient at session start, snapshotting `expectedQuantity`), and `InventoryAdjustment` (a new entity to record positive variances — losses already have `WastageEntry`). Add `sku` + `barcode` to `Ingredient`. Multiple sessions can be in progress in parallel per cafe (per user direction). On "Mark As Completed", the system writes a `WastageEntry` (reason `INCORRECT`) for each item where `counted < expected` and an `InventoryAdjustment` row for each `counted > expected`; the dashboard inventory log learns to merge in the new adjustments alongside existing wastage and purchases.

## Boundaries & Constraints

**Always:**
- Stocktake snapshots `expectedQuantity` per ingredient AT START — the value used for variance is whatever the system thought at session start, not at session end.
- Variance is computed and persisted ONLY at "Mark As Completed":
  - `counted < expected` → create `WastageEntry { reason: INCORRECT, quantity: expected − counted, dollarValueInCents: variance × derivedCost }`.
  - `counted > expected` → create `InventoryAdjustment { kind: GAIN, quantity: counted − expected, dollarValueInCents: variance × derivedCost, stocktakeId }`.
  - In both cases, also `upsert` today's `InventoryCount.quantity` to the **counted** value (so the post-stocktake count is the source of truth).
- Cancel discards the session: marks `Stocktake.status = CANCELLED`; no wastage / no adjustment / no `InventoryCount` writes.
- Confirm per row is purely a UI state — saves `StocktakeItem.countedQuantity` and `confirmedAt` on the row, moves it from "Uncounted" to "Counted" tabs. No inventory effect until session completes.
- Multiple sessions per cafe can be in progress simultaneously. Each owns its own per-ingredient `expectedQuantity` snapshot.
- Manager-only at the route + every server action. Staff cannot start, count, complete, or even view a stocktake.
- `InventoryAdjustment` rows surface in the dashboard inventory log as a new kind alongside loss / add — labeled as "adjustment" or similar (UI decision in the spec body).

**Ask First:**
- Whether to backfill `Ingredient.sku` / `Ingredient.barcode` from any external source. Spec assumes **no backfill** — fields default to NULL; manager fills as they go.
- Whether to enforce uniqueness on `barcode` per cafe. Spec assumes **no constraint** for this round (manager workflow, not POS).
- Whether the InventoryAdjustment write should also bump the FIFO purchase ledger (so a "found" gain has a corresponding lot to consume). Spec assumes **no** — `InventoryCount` is bumped directly, no synthetic purchase row, no FIFO entry. Document this gap; a follow-up spec can wire it up.

**Never:**
- Do not auto-deduct or auto-add anything until "Mark As Completed" fires.
- Do not alter the daily-count UX on `/ingredients` Count view — stocktake is a separate surface.
- Do not allow staff at any layer (route, action, middleware).
- Do not create FIFO purchase rows or consumption rows from stocktake adjustments (above caveat).
- Do not allow editing the `expectedQuantity` after start. Snapshot is immutable.
- Do not surface stocktake adjustments in the Sales History view — the inventory log is the audit trail.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Manager starts stocktake | No active session yet | New `Stocktake` row created (status `IN_PROGRESS`); one `StocktakeItem` per ingredient with `expectedQuantity = today's InventoryCount.quantity ?? 0` | N/A |
| Manager opens `/stocktake` with an active session | Existing | Page lists items, default tab = "Uncounted"; pagination (10 per page); search by name/SKU/barcode | N/A |
| Manager enters counted qty + clicks Confirm on a row | One row | Item's `countedQuantity` saved + `confirmedAt` timestamp; item moves to "Counted" tab on next render | Toast on action error |
| Manager clicks Confirm without entering a value | Empty input | Action rejects with "Counted quantity required" | N/A |
| Manager clicks "Mark As Completed" | Some items still uncounted | Confirm dialog: "X items still uncounted — they will be treated as expected (no variance). Continue?" Yes → proceed; No → close dialog | N/A |
| Mark as completed → item where counted=5, expected=8 | Loss | `WastageEntry { reason: INCORRECT, quantity: 3, dollarValueInCents: 3 × derivedCost }`; today's `InventoryCount.quantity` = 5 | Atomic txn; rolls back on partial failure |
| Mark as completed → item where counted=12, expected=8 | Gain | `InventoryAdjustment { kind: GAIN, quantity: 4, dollarValueInCents: 4 × derivedCost, stocktakeId }`; today's `InventoryCount.quantity` = 12 | Same |
| Mark as completed → item where counted=expected | Match | No wastage, no adjustment; today's `InventoryCount.quantity` set to counted (idempotent) | N/A |
| Mark as completed → ingredient has no derivedCost (no lots, no manual) | Edge | `dollarValueInCents = 0` for the wastage / adjustment row | N/A |
| Manager cancels mid-session | Cancel | `Stocktake.status = CANCELLED`; all `StocktakeItem` rows preserved for audit; no inventory effect | N/A |
| Two managers each have an active stocktake | Parallel | Each session shows its own snapshot of expectedQuantity; completing one writes its own variance; the other's expected may now be stale (intended) | N/A |
| Search "milk" in active session | Filter | Items whose name/SKU/barcode matches (case-insensitive substring) appear; pagination resets to page 1 | N/A |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` — add `Ingredient.sku String?` + `Ingredient.barcode String?`; new `Stocktake` model (id, cafeId, status enum {IN_PROGRESS, COMPLETED, CANCELLED}, startedById, startedAt, completedAt, cancelledAt, completedById, cancelledById); new `StocktakeItem` model (id, stocktakeId, ingredientId, expectedQuantity Int, countedQuantity Int?, confirmedAt DateTime?, confirmedById String?); new `InventoryAdjustment` model (id, cafeId, ingredientId, kind enum {GAIN}, quantity Int, dollarValueInCents Int, stocktakeId String?, createdById, createdAt).
- Prisma migration — new tables + 2 new columns on Ingredient (NULLable, no default values needed).
- `src/actions/stocktake.actions.ts` (NEW) — actions: `startStocktake`, `getActiveStocktakes`, `getStocktake(id, page, search, tab)`, `saveStocktakeItemCount(itemId, quantity)`, `completeStocktake(id)`, `cancelStocktake(id)`. All `requireRole("MANAGER")`.
- `src/actions/inventory.actions.ts` — extend `getInventoryLog`: third source = `InventoryAdjustment`, kind labeled "Adjustment" (different badge color, e.g. var(--color-info)). Add description from `stocktake.id` short tag (e.g. "Stocktake adjustment").
- `src/app/(app)/stocktake/page.tsx` (NEW) — server component, `requireRole("MANAGER")`. Lists active stocktakes (start a new one button) OR (if id query param) renders a single session's table.
- `src/components/stocktake/stocktake-list.tsx`, `src/components/stocktake/stocktake-table.tsx` (NEW) — UI per the screenshot: top action bar (Mark Completed / Cancel), tabs (Uncounted | Counted), search, pagination, table with Product Name | SKU | Barcode | Expected Qty | Counted Qty input | Confirm.
- `src/components/ingredients/ingredient-spreadsheet.tsx` — add SKU + Barcode columns (always visible — small fields; or behind the "Show advanced columns" toggle if width is tight).
- Nav (`bottom-nav.tsx` + `side-nav.tsx`) — add `{ href: "/stocktake", label: "Stocktake", icon: ClipboardCheck, managerOnly: true }`.
- Tests: action tests (start, save count, complete with mixed variance, cancel, role gate); component tests (table render, Confirm flow, Mark Completed dialog).

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` — add Stocktake + StocktakeItem + InventoryAdjustment models + Ingredient sku/barcode + enums
- [x] Generate + apply Prisma migration
- [x] `src/actions/stocktake.actions.ts` — full set of actions (start, list, get, save count, complete, cancel) with manager gating
- [x] `src/actions/inventory.actions.ts` — extend `getInventoryLog` to merge `InventoryAdjustment` as a third "Adjustment" kind
- [x] `src/app/(app)/stocktake/page.tsx` — server page rendering list or single-session view based on query param
- [x] `src/components/stocktake/*` — list + table components per screenshot
- [x] `src/components/ingredients/ingredient-spreadsheet.tsx` — add SKU + Barcode columns (under the existing "Show advanced columns" toggle)
- [x] `src/components/ui/bottom-nav.tsx`, `src/components/ui/side-nav.tsx` — add manager-only "Stocktake" entry
- [x] Tests: stocktake.actions.test.ts (≥6 tests including the variance-on-complete branches); stocktake component test (≥2 tests)
- [x] Run full verification (build, tests)

**Acceptance Criteria:**
- Given a manager clicks "Start Stocktake", when the action runs, then a new `Stocktake` row exists with `status=IN_PROGRESS` and one `StocktakeItem` per cafe ingredient with `expectedQuantity` snapshotted from today's `InventoryCount.quantity`.
- Given a manager opens an active stocktake, when the page renders, then the "Uncounted Items" tab lists all items where `countedQuantity IS NULL`, paginated 10 per page.
- Given a manager enters a counted qty and clicks Confirm, when the action returns, then the row's `countedQuantity` and `confirmedAt` are set and the row moves to the "Counted Items" tab on next render.
- Given the manager clicks "Mark As Completed" with an item `counted=5, expected=8`, when the action runs, then a `WastageEntry { reason: INCORRECT, quantity: 3 }` is created and today's `InventoryCount.quantity` for that ingredient is 5.
- Given the manager clicks "Mark As Completed" with an item `counted=12, expected=8`, when the action runs, then an `InventoryAdjustment { kind: GAIN, quantity: 4 }` is created and today's `InventoryCount.quantity` is 12.
- Given the manager cancels a session, when the action runs, then `Stocktake.status = CANCELLED` and zero wastage / adjustment / inventory writes occur.
- Given a staff user visits `/stocktake`, when the page loads, then they're redirected (page-level `requireRole("MANAGER")`).
- Given the dashboard inventory log loads after stocktake completion, when it renders, then any `InventoryAdjustment` rows appear interleaved with wastage and purchases, sorted by `createdAt desc`.

## Spec Change Log

## Design Notes

**Why a new `InventoryAdjustment` table.** Wastage covers losses; purchases cover stocking. A *positive* count variance (you found more than expected) doesn't fit either — it's not a purchase (no supplier, no cost), and it's not the inverse of wastage. A new entity is cleaner than synthetic purchase rows with NULL supplier and `totalPriceInCents=0`. Future workflows (e.g. "found 2 extra", "manual adjustment +5") can write to the same table.

**Why no FIFO entry on adjustment.** A "found" gain doesn't have a lot. The simplest model is to bump `InventoryCount.quantity` directly without creating a synthetic `IngredientPurchase` row. Trade-off: FIFO consumption of the surplus has no explicit cost basis (will draw from the most-recent existing lot). Documented as deferred — proper fix is to create a synthetic IngredientPurchase with `totalPriceInCents = adjustment.dollarValueInCents` (cost from `currentCostPerUnit`).

**Multi-session parallelism.** Per user direction. Each `Stocktake` snapshots its own `expectedQuantity` per ingredient at start. If two complete in different order, the second's variance is computed against IT'S start snapshot — meaning the absolute counts written may overlap each other's wastage/adjustment rows. Acceptable per intent; managers can coordinate.

**Tabs implementation.** "Uncounted" / "Counted" is just a `where: { countedQuantity: null }` vs `{ countedQuantity: { not: null } }` filter on `StocktakeItem`. Keep state in a query param so the URL is shareable.

## Verification

**Commands:**
- `cd cafe-mgmt && npx prisma migrate dev --name add_stocktake_with_adjustments` — expected: migration applies; client regenerates
- `cd cafe-mgmt && npx tsc --noEmit` — expected: no new errors
- `cd cafe-mgmt && npx vitest run` — expected: full suite passes; new stocktake tests pass
- `cd cafe-mgmt && npm run build` — expected: clean

**Manual checks:**
- Open `/stocktake` as manager — confirm "Start Stocktake" button. Click → table appears with all ingredients.
- Type a count for one row, click Confirm — row moves to "Counted" tab.
- Click "Mark As Completed" with mixed variance — confirm wastage row + adjustment row + InventoryCount updates.
- Open the dashboard — confirm the new adjustment appears in the inventory log alongside the wastage.
- As a staff account, navigate to `/stocktake` — confirm redirect / 404.

## Suggested Review Order

**Schema + migration**

- Three new tables, two enum types, two ingredient columns.
  [`schema.prisma`](../../cafe-mgmt/prisma/schema.prisma)
  [`migration.sql`](../../cafe-mgmt/prisma/migrations/20260508000000_add_stocktake_with_adjustments/migration.sql)

**Stocktake actions (start here)**

- `startStocktake`: snapshots `expectedQuantity` from the most-recent prior `InventoryCount` per ingredient (iter 1 — was today-only, defaulting to 0 on a fresh-day stocktake).
  [`stocktake.actions.ts:80`](../../cafe-mgmt/src/actions/stocktake.actions.ts#L80)

- `completeStocktake`: race-guard claim via `updateMany { where: { id, status: "IN_PROGRESS" } }` (iter 1 — prevents double-write when two managers complete simultaneously); variance loop writes wastage / adjustment / inventoryCount; idempotent on re-call.
  [`stocktake.actions.ts:335`](../../cafe-mgmt/src/actions/stocktake.actions.ts#L335)

- Other actions: `getActiveStocktakes`, `getStocktake` (paginated, search), `saveStocktakeItemCount`, `cancelStocktake`. All `requireRole("MANAGER")`.
  [`stocktake.actions.ts:149`](../../cafe-mgmt/src/actions/stocktake.actions.ts#L149)

**Inventory log integration**

- `getInventoryLog` learns a third source — `InventoryAdjustment` rendered as "Adjust" badge in the dashboard log.
  [`inventory.actions.ts`](../../cafe-mgmt/src/actions/inventory.actions.ts)
  [`inventory-log.tsx`](../../cafe-mgmt/src/components/feed/inventory-log.tsx)

**Page + UI**

- Server page dispatches list vs single-session table by `?id`.
  [`stocktake/page.tsx`](../../cafe-mgmt/src/app/(app)/stocktake/page.tsx)

- List + table per the user's screenshot (Mark Completed / Cancel toolbar, Uncounted / Counted tabs, search, pagination, per-row Confirm).
  [`stocktake-list.tsx`](../../cafe-mgmt/src/components/stocktake/stocktake-list.tsx)
  [`stocktake-table.tsx`](../../cafe-mgmt/src/components/stocktake/stocktake-table.tsx)

**Spreadsheet + nav**

- SKU + Barcode columns added to the spreadsheet under the existing "Show advanced columns" toggle (colCount 13→15).
  [`ingredient-spreadsheet.tsx`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx)

- Nav: manager-only "Stocktake" entry; middleware adds `/stocktake` to `MANAGER_ONLY_PATHS`.
  [`bottom-nav.tsx`](../../cafe-mgmt/src/components/ui/bottom-nav.tsx)
  [`side-nav.tsx`](../../cafe-mgmt/src/components/ui/side-nav.tsx)
  [`middleware.ts`](../../cafe-mgmt/middleware.ts)

**Tests**

- 7 action tests + 2 component tests.
  [`stocktake.actions.test.ts`](../../cafe-mgmt/src/actions/stocktake.actions.test.ts)
  [`stocktake-table.test.tsx`](../../cafe-mgmt/src/components/stocktake/stocktake-table.test.tsx)

