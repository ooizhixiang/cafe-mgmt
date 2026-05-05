---
title: 'FIFO Lot Data Model + Manager Override Toggle'
type: 'feature'
created: '2026-04-28'
status: 'done'
baseline_commit: '5712db4'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Today every ingredient has a single fixed `costPerUnitInCents` set manually. There's no concept of "stock left in this purchase lot" so we can't FIFO-cost anything. We also have no way for a manager to opt an ingredient into auto-pricing vs keep it on a manual override.

**Approach:** Lay the data-model groundwork for FIFO without yet wiring consumption. Add `IngredientPurchase.remainingQuantity` (set to `quantity` on creation; backfill existing rows). Add `Ingredient.manualCostOverride` (default `true` to preserve today's behavior). Create a new `LotConsumption` table that future deduction paths will write to. Ship a `🔒 / 🔓` toggle on the `/ingredients` cost cell so managers can flip per-ingredient override mode. Build pure-function helpers (`consumeFifo`, `restoreFifo`, `currentCostPerUnit`) with full unit-test coverage; their callers come in Spec B2.

## Boundaries & Constraints

**Always:** `IngredientPurchase.remainingQuantity` is set to `parsed.data.quantity` on every new purchase (via `createIngredientPurchase` and the bulk variant). `Ingredient.manualCostOverride` defaults `true` everywhere — existing rows backfilled `true`, spreadsheet add-row default `true`. `LotConsumption` table has nullable `ingredientPurchaseId` (allows future "synthetic over-deduction" rows). Helpers in `src/lib/fifo.ts` are pure functions tested in isolation: `consumeFifo` returns the FIFO walk plan but DOES NOT DECREMENT yet (callers will, in Spec B2); `restoreFifo` is stubbed with the same shape; `currentCostPerUnit(ingredient, oldestLot)` returns derived cost (override → oldest-lot → fallback). Toggle 🔒 ↔ 🔓 in the UI calls a new `setManualCostOverride` server action.

**Ask First:** None.

**Never:** Don't wire `consumeFifo` into wastage / comp / daily-report yet — that's Spec B2. Don't change recipe / inventory / `/inventory` cost display yet — same. Don't migrate any new money columns to Decimal. Don't introduce per-supplier override (per-ingredient only). Don't break existing data — the migration must be safely re-runnable.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|----------|--------------|-------------------|
| Migration backfill | Existing `IngredientPurchase` rows with `quantity=N` | `remainingQuantity = N` after migration |
| Migration backfill (Ingredient) | Existing rows | `manualCostOverride = true` |
| Create purchase 100 @ $5 | New row | `remainingQuantity = 100` |
| Bulk purchase create | Multiple lines | Each row gets its own `remainingQuantity = quantity` |
| Toggle 🔒 → 🔓 | Click unlock, no value | `manualCostOverride = false`; existing `costPerUnitInCents` retained as fallback |
| Toggle 🔓 → 🔒 with $4.50 | Click lock, enter price | `manualCostOverride = true`; `costPerUnitInCents = 450` |
| `currentCostPerUnit` with override | `manualCostOverride = true` | Returns `Ingredient.costPerUnitInCents` |
| `currentCostPerUnit` with FIFO | `manualCostOverride = false`, oldest non-empty lot priced 500 | Returns 500 |
| `currentCostPerUnit` no lots | Override off, no lots | Returns `costPerUnitInCents` (fallback) |
| `consumeFifo` walk | Lot A=100, B=100, request 150 | Returns plan: `[{A,100},{B,50}]`, no over-deduct |
| `consumeFifo` over-request | A=100, B=100, request 250 | Returns `{lotsConsumed:[{A,100},{B,100}], overDeducted:{qty:50, perUnitInCents: B's price}}` |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- add `IngredientPurchase.remainingQuantity Int @default(0)`, `Ingredient.manualCostOverride Boolean @default(true)`, new `LotConsumption` model with nullable `ingredientPurchaseId`
- `prisma/migrations/<ts>_fifo_lots/migration.sql` -- NEW; AddColumn + backfill UPDATE for both columns + CreateTable for `LotConsumption`
- `src/lib/fifo.ts` -- NEW; `consumeFifo(lots, requested)` returns plan; `restoreFifo` mirror (shape only); `currentCostPerUnit(ingredient, oldestLot)` derivation
- `src/lib/fifo.test.ts` -- NEW; cover happy path, split-across-lots, over-deduction, no-lots fallback, override path
- `src/actions/inventory.actions.ts` -- `createIngredientPurchase` and bulk variant set `remainingQuantity`; new `setManualCostOverride(ingredientId, override: boolean, value?: number)` action
- `src/actions/inventory.actions.test.ts` -- update for new field; add test for `setManualCostOverride`
- `src/app/(app)/ingredients/page.tsx` -- pass `manualCostOverride` flag in props
- `src/components/ingredients/ingredient-spreadsheet.tsx` -- new 🔒 / 🔓 icon-button column (or inline next to cost cell); editing the cost cell auto-locks; clicking 🔓 unlocks (auto-pricing flag set, cost cell becomes read-only-ish hint pending Spec B2)
- `src/components/ingredients/ingredient-spreadsheet.test.tsx` -- tests for toggle behavior

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` -- modify -- 2 columns + new model
- [x] `prisma/migrations/<ts>_fifo_lots/migration.sql` -- create -- AddColumn, backfill UPDATEs, CreateTable
- [x] `src/lib/fifo.ts` -- create -- pure helpers
- [x] `src/lib/fifo.test.ts` -- create -- per I/O matrix
- [x] `src/actions/inventory.actions.ts` -- modify -- purchase create sets `remainingQuantity`; add `setManualCostOverride`
- [x] `src/actions/inventory.actions.test.ts` -- modify -- new field assertions + override-action test
- [x] `src/app/(app)/ingredients/page.tsx` -- modify -- pass `manualCostOverride`
- [x] `src/components/ingredients/ingredient-spreadsheet.tsx` -- modify -- 🔒/🔓 toggle wired to action
- [x] `src/components/ingredients/ingredient-spreadsheet.test.tsx` -- modify -- toggle tests

**Acceptance Criteria:**
- Given the migration runs against a DB with existing `IngredientPurchase` rows, when it completes, then every row has `remainingQuantity = quantity` and every `Ingredient` row has `manualCostOverride = true`.
- Given a manager calls `createIngredientPurchase` with `quantity = 100`, when it succeeds, then the row has `remainingQuantity = 100`.
- Given two existing purchase lots A (older, $5) and B (newer, $7) both non-empty and `manualCostOverride = false`, when `currentCostPerUnit(ingredient, oldestLot)` is called, then it returns 500.
- Given `manualCostOverride = true` and `costPerUnitInCents = 450`, when `currentCostPerUnit` is called, then it returns 450 regardless of lot state.
- Given a manager clicks 🔓 on the cost cell, when the action returns, then `manualCostOverride` flips to `false` and the icon swaps to 🔒-able state.
- Given a manager edits the cost cell while 🔓, when the cell saves, then `manualCostOverride` auto-flips to `true` (editing implies override).
- Given `consumeFifo([{id:"A",remaining:100,perUnit:500},{id:"B",remaining:100,perUnit:700}], 150)`, when called, then it returns `{lotsConsumed:[{A,100,500},{B,50,700}], overDeducted:null}`.
- Given the same lots, when called with 250, then `overDeducted:{qty:50, perUnitInCents:700}`.
- Given `npx prisma migrate deploy`, `npx next build`, and `npx vitest run --exclude="e2e/**"`, when run, then all pass.

## Design Notes

`consumeFifo` is a pure function (no Prisma dependency). It receives an already-fetched lot list and returns a plan. Spec B2's deduction actions will fetch lots inside a `$transaction`, call `consumeFifo`, then write the decrements + `LotConsumption` rows.

`Ingredient.manualCostOverride = true` for all backfilled rows preserves today's behavior. Managers opt in to FIFO per-ingredient by clicking 🔓.

The cost-cell UI state during 🔓 (auto-pricing) in this spec: cell remains editable, but editing flips the lock back to 🔒 (auto-locks on edit). In Spec B2 the cell will become read-only when 🔓 and show the FIFO-derived value.

## Verification

**Commands:**
- `npx prisma migrate deploy` -- expected: applies cleanly; rows backfilled
- `npx next build` -- expected: clean compile
- `npx vitest run --exclude="e2e/**"` -- expected: all pass including new fifo helper tests

**Manual checks:**
- After migration: any existing `IngredientPurchase` shows `remainingQuantity = quantity`; any `Ingredient` shows `manualCostOverride = true`.
- Add a new ingredient; cost cell starts in 🔒 mode (manual).
- Click 🔓; toggle persists across refresh.

## Suggested Review Order

**Schema & migration**

- Two new columns + new `LotConsumption` model with nullable `ingredientPurchaseId` (covers synthetic over-deduction rows in B2).
  [`schema.prisma:159`](../../cafe-mgmt/prisma/schema.prisma#L159)

- Idempotent migration: column adds with safe defaults + backfill UPDATE + LotConsumption table with FKs and indexes.
  [`migration.sql:1`](../../cafe-mgmt/prisma/migrations/20260428030000_fifo_lots/migration.sql#L1)

**Pure FIFO helpers**

- `consumeFifo` walks oldest-first; finite-guards (`Number.isFinite`) on `requested` and over-deduction price.
  [`fifo.ts:1`](../../cafe-mgmt/src/lib/fifo.ts#L1)

- `currentCostPerUnit` derivation: override → oldest-lot → fallback. Tested 16 scenarios.
  [`fifo.test.ts:1`](../../cafe-mgmt/src/lib/fifo.test.ts#L1)

**Server-side override action**

- Zod-validated `setManualCostOverride`: upper bound, rejects value-while-unlocking, accepts null-cost-clear atomically.
  [`inventory.actions.ts:1`](../../cafe-mgmt/src/actions/inventory.actions.ts#L1)

- Purchase-create paths set `remainingQuantity = quantity` (inventory + supplier call-outcome).
  [`inventory.actions.ts:274`](../../cafe-mgmt/src/actions/inventory.actions.ts#L274)

**UI: lock toggle on cost cell**

- Page passes `manualCostOverride` flag.
  [`ingredients/page.tsx:1`](../../cafe-mgmt/src/app/(app)/ingredients/page.tsx#L1)

- Spreadsheet renders 🔒/🔓 icon next to cost cell; click toggles; button is `disabled` while pending; editing cost auto-locks via single atomic action.
  [`ingredient-spreadsheet.tsx:1`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L1)

- Cost cell display: 4 decimals when sub-cent, 2 otherwise — preserves "$0.005" entries on round-trip edit.
  [`ingredient-spreadsheet.tsx:80`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L80)

**Tests**

- 16 fifo helper tests + 4 setManualCostOverride tests + 3 lock-toggle UI tests + sub-cent display test + atomic-cost-clear test.
  [`fifo.test.ts:1`](../../cafe-mgmt/src/lib/fifo.test.ts#L1)
  [`ingredient-spreadsheet.test.tsx:1`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.test.tsx#L1)
