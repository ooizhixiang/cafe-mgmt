---
title: 'FIFO Consumption Wiring + Over-Deduction Confirm + Recipe/Inventory Display'
type: 'feature'
created: '2026-04-28'
status: 'done'
baseline_commit: '5712db4'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Spec B1 shipped FIFO data-model groundwork (lot `remainingQuantity`, `manualCostOverride`, `LotConsumption` table, pure helpers, lock-toggle UI) but the helpers are unused at runtime. Inventory deductions still don't decrement lots, recipe/inventory still show the static `costPerUnitInCents`, managers can't see FIFO behavior anywhere.

**Approach:** Wire `consumeFifo` into `logWastage`, `logComp`, and `submitDailyReport` inside their existing transactions; record per-deduction `LotConsumption` rows with a new `consumptionKind` discriminator (`LOT` vs `OVER_DEDUCTION`). Wire `restoreFifo` into `undoWastage`, `voidWastage`, `correctWastage`, `undoComp`, `voidComp`. Wastage and comp surface a blocking confirmation dialog when the requested quantity exceeds available stock; sales (daily-report) silently over-deduct at the most-recent-lot's price. Recipe and inventory pages compute derived cost via `currentCostPerUnit(ingredient, oldestLot)` instead of reading `costPerUnitInCents` directly.

## Boundaries & Constraints

**Always:** Add `LotConsumption.consumptionKind` (enum: `"LOT"` | `"OVER_DEDUCTION"`) so the existing nullable `ingredientPurchaseId` is no longer overloaded. New rows from `consumeFifo` set `consumptionKind="LOT"` for satisfied portions, `"OVER_DEDUCTION"` for the synthetic deficit row (with `ingredientPurchaseId=null`). All consume/restore flow runs inside Prisma `$transaction`. Server actions accept `confirmOverDeduction?: boolean`; when omitted (or false) and total `remainingQuantity` < requested, return `{success:false, error:"OVER_DEDUCTION", availableQty, requestedQty}` and write nothing. With `confirmOverDeduction:true`, proceed and write rows. Daily-report `submitDailyReport` always treats over-deduction as confirmed (silent — sales are aggregate). FIFO ordering uses `[{createdAt:"asc"},{id:"asc"}]` for stable tiebreak. Cost derivation in display: page fetches each ingredient's oldest non-empty lot, passes both ingredient and lot to `currentCostPerUnit`. Override-locked ingredients (🔒) ignore lots entirely.

**Ask First:** None.

**Never:** Don't change wastage/comp/daily-report user-facing copy except adding the over-deduction dialog. Don't introduce per-supplier override. Don't migrate cost columns of `WastageEntry`/`CompEntry`/`SalesEntry`/`InventoryCount.dollarValueInCents` (still `Int`; deferred). Don't change quantity types (still `Int`). Don't break voidWastage/voidComp's existing soft-delete semantics — additionally restore lots, but keep `voidedAt` / `voidReason` writes as today.

## I/O & Edge-Case Matrix

| Scenario | State | Expected |
|----------|-------|----------|
| `logWastage` 30 (A=100) | First call | A→70; row `{LOT,A,30}`; success |
| `logWastage` 250 (A=100, B=100) | No confirm | `{success:false, error:"OVER_DEDUCTION", available:200, requested:250}`; no writes |
| Same with `confirmOverDeduction:true` | Confirmed | A→0, B→0; rows `{LOT,A,100}`, `{LOT,B,100}`, `{OVER_DEDUCTION,null,50,perUnit:B}` |
| `voidWastage` mixed | Restore | LOT rows refill lots; OVER_DEDUCTION row deleted (no refill); voidedAt set |
| `correctWastage` 50→30 | Reduce | Restore old rows; new consume of 30 |
| `correctWastage` 50→80 | Increase | Restore old; new consume of 80 (may OVER_DEDUCTION) |
| `submitDailyReport` 10 × 18g | Silent FIFO | `costInCents = round(weighted-avg × qty)`; rows `sourceType:SALES` |
| Recipe view, override OFF | Lot A=$5 | Derived $5.00 |
| Recipe view, override ON | Override $4.50 | Shows $4.50 |
| No lots, override OFF | Empty FIFO | Falls back to `costPerUnitInCents` |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- add `enum ConsumptionKind { LOT OVER_DEDUCTION }`; `LotConsumption.consumptionKind ConsumptionKind @default(LOT)`
- `prisma/migrations/<ts>_lot_consumption_kind/migration.sql` -- NEW; CREATE TYPE + ADD COLUMN
- `src/lib/fifo.ts` + `fifo.test.ts` -- ConsumePlan rows include `kind`; tests updated
- `src/lib/lot-consume.ts` + `lot-consume.test.ts` -- NEW; `applyConsumeFifo(tx, ingredientId, cafeId, requested, sourceType, sourceId)` and `applyRestoreFifo(tx, sourceType, sourceId)`
- `src/actions/wastage.actions.ts` + tests -- `logWastage` accepts `confirmOverDeduction`; consume/restore wiring; `correctWastage` = restore-then-consume
- `src/actions/comp.actions.ts` + tests -- mirror wastage
- `src/actions/daily-report.actions.ts` + tests -- consume per ingredient in submit txn (always-confirmed); weighted-avg cost
- `src/actions/recipe.actions.ts` + tests -- derived cost via `currentCostPerUnit` + oldest-lot fetch
- `src/app/(app)/{ingredients,inventory}/page.tsx` -- batch oldest-lot fetch; pass derived cost
- `src/components/ingredients/ingredient-spreadsheet.tsx` -- when 🔓, cost cell renders read-only derived value with "Auto" hint
- `src/components/inventory/inventory-list.tsx`, `src/components/operations/recipe-editor.tsx` -- derived cost in display
- `src/components/wastage/*`, `src/components/comp/*` -- on `OVER_DEDUCTION`, show `<ConfirmationDialog>` → re-call with confirm

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` -- modify -- enum + column
- [x] `prisma/migrations/<ts>_lot_consumption_kind/migration.sql` -- create -- enum + ADD COLUMN with `DEFAULT 'LOT'`
- [x] `src/lib/fifo.ts` + `fifo.test.ts` -- modify -- ConsumePlan rows include `kind`; tests updated
- [x] `src/lib/lot-consume.ts` + `lot-consume.test.ts` -- create -- DB-bound `applyConsumeFifo` and `applyRestoreFifo`
- [x] `src/actions/wastage.actions.ts` + tests -- modify -- consume/restore wiring + over-deduction confirm flow + correct's delta logic
- [x] `src/actions/comp.actions.ts` + tests -- mirror wastage
- [x] `src/actions/daily-report.actions.ts` + tests -- consume per ingredient inside submit txn; weighted-avg cost
- [x] `src/actions/recipe.actions.ts` + tests -- derived cost; oldest-lot subquery
- [x] `src/app/(app)/{ingredients,inventory}/page.tsx` -- modify -- oldest-lot fetch, pass derived cost
- [x] `src/components/{ingredients/ingredient-spreadsheet,inventory/inventory-list,operations/recipe-editor}.tsx` + tests -- modify -- show derived cost; spreadsheet cost cell becomes read-only when 🔓
- [x] `src/components/wastage/*`, `src/components/comp/*` + tests -- modify -- OVER_DEDUCTION confirm dialog flow

**Acceptance Criteria:**
- Given A=100 ($5) + B=100 ($7), `logWastage(30)` no-confirm → A=70 + 1 `LotConsumption{LOT,A,30}`.
- `logWastage(250)` no-confirm → `{success:false, error:"OVER_DEDUCTION", availableQty:200, requestedQty:250}`; no writes.
- Same with `confirmOverDeduction:true` → A=0, B=0, 3 rows: LOT/A/100, LOT/B/100, OVER_DEDUCTION/null/50@B'sPrice.
- `voidWastage` of mixed wastage → LOT-row lots refilled exactly; OVER_DEDUCTION row deleted; voidedAt set.
- `correctWastage` 50→30 → restore-then-consume; net diff 20 returned to lots.
- `submitDailyReport` 10 × 18g → `SalesEntry.costInCents = round(weighted-avg × 10)`; rows tagged `sourceType="SALES"`.
- Override ON ($4.50) → recipe / inventory / ingredients show $4.50 regardless of lots.
- Override OFF + oldest-lot $5 → all 3 displays show $5.00.
- Override OFF + no lots → derived cost falls back to `costPerUnitInCents`.
- `npx prisma migrate deploy && npx next build && npx vitest run --exclude="e2e/**"` all pass.

## Design Notes

**`applyConsumeFifo`:** fetches lots in `[asc,asc]`, calls pure `consumeFifo`, writes `LotConsumption` rows (kind=LOT for satisfied, OVER_DEDUCTION for deficit), decrements `remainingQuantity`. Returns `{ totalCostInCents, lotsConsumed, overDeducted }`.

**Correct-flow:** `correctWastage` = restore old rows + delete + `applyConsumeFifo` for new qty. Excess triggers `OVER_DEDUCTION`.

**Display derivation:** pages use a single batched query for "oldest non-empty lot per ingredient" (`findMany take:1 orderBy:[{createdAt:asc},{id:asc}] where:{remainingQuantity:{gt:0}}` joined per ingredientSupplier).

**Spreadsheet 🔓:** cost cell renders as plain text (not `<input>`) with "Auto" hint; clicking flips the lock back and converts to editable.

## Verification

**Commands:**
- `npx prisma migrate deploy` -- expected: applies cleanly
- `npx next build` -- expected: clean compile
- `npx vitest run --exclude="e2e/**"` -- expected: all pass including new lot-consume integration tests and over-deduction confirm tests

**Manual checks:**
- Buy 100 @ $5 from A; recipe cost reflects $5.00.
- Log wastage of 50; A.remaining = 50; cost still $5.00.
- Buy 100 @ $7 from B; cost still $5.00 (A still oldest non-empty).
- Log wastage of 100; A → 0; cost flips to $7.00.
- Try wastage of 200 — confirmation dialog appears with "200 requested, 100 available".
- Void the over-deducted wastage; lots restore.

## Suggested Review Order

**Schema & migration**

- ConsumptionKind discriminator + DEFAULT 'LOT' for LotConsumption.
  [`migration.sql:1`](../../cafe-mgmt/prisma/migrations/20260428040000_lot_consumption_kind/migration.sql#L1)

- Defense-in-depth CHECK constraint preventing negative `remainingQuantity`.
  [`migration.sql:1`](../../cafe-mgmt/prisma/migrations/20260429010000_remaining_quantity_check/migration.sql#L1)

**Race-safe lot consumption**

- Conditional `updateMany` with `gte` guard throws `LOT_RACE` when a concurrent txn drained the lot — caller's `$transaction` rolls back; UI surfaces a "retry" message.
  [`lot-consume.ts:37`](../../cafe-mgmt/src/lib/lot-consume.ts#L37)

- `applyRestoreFifo` only refills `consumptionKind === "LOT"` rows; OVER_DEDUCTION rows just delete.
  [`lot-consume.ts:126`](../../cafe-mgmt/src/lib/lot-consume.ts#L126)

- Pre-flight helpers `getAvailableQty` and `hasAnyLot` (both run inside the txn).
  [`lot-consume.ts:163`](../../cafe-mgmt/src/lib/lot-consume.ts#L163)

**Wastage / comp actions**

- `logWastage` runs availability check + lot-existence check + consume inside one txn; over-deduction returns encoded error; no-lots returns `NO_LOTS_RECORDED`; race triggers retry message.
  [`wastage.actions.ts:112`](../../cafe-mgmt/src/actions/wastage.actions.ts#L112)

- `correctWastage`: restore-then-consume inside single txn (post-restore snapshot is correct).
  [`wastage.actions.ts:1`](../../cafe-mgmt/src/actions/wastage.actions.ts#L1)

- `voidWastage` / `undoWastage` call `applyRestoreFifo`; `undoWastage` filters `voidedAt: null`.
  [`wastage.actions.ts:254`](../../cafe-mgmt/src/actions/wastage.actions.ts#L254)

- Comp actions mirror wastage exactly.
  [`comp.actions.ts:1`](../../cafe-mgmt/src/actions/comp.actions.ts#L1)

**Daily-report wiring**

- Idempotency: pre-checks for existing `SalesEntry` for `(cafeId, today)` returning `ALREADY_SUBMITTED`.
  [`daily-report.actions.ts:1`](../../cafe-mgmt/src/actions/daily-report.actions.ts#L1)

- Per-SalesEntry FIFO consume; weighted-avg cost rounded at write to `Int` `costInCents`.
  [`daily-report.actions.ts:1`](../../cafe-mgmt/src/actions/daily-report.actions.ts#L1)

- `InventoryCount.dollarValueInCents` uses derived `currentCostPerUnit` (consistent with recipe/inventory display).
  [`daily-report.actions.ts:1`](../../cafe-mgmt/src/actions/daily-report.actions.ts#L1)

**Recipe / page display**

- `getRecipe` / `getRecipes` batched oldest-lot fetch; per-ingredient cost via `currentCostPerUnit`.
  [`recipe.actions.ts:1`](../../cafe-mgmt/src/actions/recipe.actions.ts#L1)

- Pages tie-break aligned to `[createdAt asc, id asc]` matching FIFO consume.
  [`ingredients/page.tsx:1`](../../cafe-mgmt/src/app/(app)/ingredients/page.tsx#L1)
  [`inventory/page.tsx:1`](../../cafe-mgmt/src/app/(app)/inventory/page.tsx#L1)

**UI: 🔓 read-only + over-deduction dialog**

- Spreadsheet `AutoCostCell` renders read-only derived cost when 🔓; clicking flips lock.
  [`ingredient-spreadsheet.tsx:1`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L1)

- Wastage / Comp loggers show context-aware confirmation ("0 stock — record at $0" vs "X requested, Y available — at most-recent lot's price").
  [`wastage-logger.tsx:1`](../../cafe-mgmt/src/components/wastage/wastage-logger.tsx#L1)
  [`comp-logger.tsx:1`](../../cafe-mgmt/src/components/comp/comp-logger.tsx#L1)

**Tests**

- `lot-consume.test.ts` (12 tests) + `fifo.test.ts` (kind discrimination) + new wastage/comp/daily-report flow tests covering NO_LOTS_RECORDED, ALREADY_SUBMITTED, undo-already-voided, race retry, and projection correctness.
  [`lot-consume.test.ts:1`](../../cafe-mgmt/src/lib/lot-consume.test.ts#L1)
