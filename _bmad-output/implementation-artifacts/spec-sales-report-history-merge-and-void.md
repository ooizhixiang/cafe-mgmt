---
title: 'Sales report history with per-day merge + manager void'
type: 'feature'
created: '2026-05-05'
status: 'done'
context: []
baseline_commit: 'a02603e7bb16e94f2e06d82b41130b6074f1b2f2'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `submitDailyReport` hard-rejects a second submission per day with `ALREADY_SUBMITTED`, so staff who realize they missed a recipe can't add it later — they have to undo and re-key everything. There's also no list view of past reports anywhere in the app, so historical sales aren't browsable outside the Analysis charts.

**Approach:** Remove the once-per-day guard. Stamp each `submitDailyReport` call with a new `submissionId` so the rows from one submission stay grouped. Add a `History` tab on `/daily-report` that lists past days, merging per-recipe totals across all non-voided submissions for a day. Manager-only "void this submission" mirrors the existing wastage void pattern (`voidedAt` + `applyRestoreFifo`) — reverses the FIFO consumption and the inventory deduction back into TODAY's stock (compensating entry, same convention as wastage).

## Boundaries & Constraints

**Always:**
- One generated `submissionId` per `submitDailyReport` call, stamped on every `SalesEntry` row that call creates.
- Merge in the History view sums `qtySold`, `revenueInCents`, `costInCents` per recipe across all submissions for that day where `voidedAt IS NULL`.
- Voiding a submission marks ALL of its rows voided in one transaction and restores FIFO lots via the existing `applyRestoreFifo({sourceType:"SALES", sourceId:<entryId>})` helper.
- Void restores to TODAY's `InventoryCount` (compensating entry), not the original `saleDate` — same convention `voidWastage` uses.
- Inventory thresholds re-checked after a void (mirror wastage flow).

**Ask First:**
- Whether to also expose a per-row delete (e.g. "remove just the Latte line from this submission"). Spec assumes **no** — void is whole-submission only.
- Whether to backfill `submissionId` for pre-existing rows. Spec assumes **no** — historical rows get `NULL`, History groups them as "Legacy submission" without a void button.

**Never:**
- Do not silently merge submissions inside a single submission row — keep them as separate rows, just present them merged in the UI.
- Do not allow staff to void; manager-only.
- Do not allow voiding an already-voided submission (idempotency: ignore + return success).
- Do not change FIFO/cost math, period detection, or the entry-form UX. Out of scope.
- Do not delete rows on void. Soft-void only (`voidedAt` set), so audit trail is preserved.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Second submission same day | Staff submits at 14:00 then 17:00 | Both succeed; History merges per-recipe totals across both rows | N/A |
| History tab open with no past sales | Empty `SalesEntry` table | Empty state: "No sales reports yet" | N/A |
| Manager voids submission with 5 rows | Submission has 5 SalesEntry rows | All 5 marked `voidedAt`; FIFO restored; thresholds rechecked | If `applyRestoreFifo` fails, txn rolls back |
| Staff tries to void | Non-manager hits `voidSalesSubmission` | Returns `{success:false, error:"Unauthorized"}` | N/A |
| Void already-voided submission | All rows already have `voidedAt` | Return `{success:true}` (idempotent no-op) | N/A |
| Pre-existing row, NULL submissionId | Backfill case | History groups them as one "Legacy" submission per day; no void button | N/A |
| Day has only voided submissions | All rows for date X have `voidedAt` | History row for X shows zero totals + "all voided" tag (still listed for audit) | N/A |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- add `submissionId String?`, `voidedAt DateTime?`, `voidedById String?`, `voidReason String?` to `SalesEntry`; index `(cafeId, saleDate, submissionId)`
- `prisma/migrations/<new>/migration.sql` -- add the 4 columns + index; no backfill (NULL is meaningful)
- `src/actions/daily-report.actions.ts` -- (1) DELETE the `ALREADY_SUBMITTED` guard + the `existingSubmission` findFirst; (2) generate one `submissionId = cuid()` per call and pass into every `tx.salesEntry.create`; (3) update `getSalesAnalysis`/`getRevenueAnalysis` to filter `voidedAt: null`
- `src/actions/daily-report.actions.ts` -- new `getSalesHistory()`: returns `Array<{ saleDate, submissions: Array<{ id, createdAt, createdByName, voidedAt, rows: Array<{recipeName, qtySold, revenueInCents, costInCents}> }>, mergedByRecipe: Array<{recipeName, qtySold, revenueInCents, costInCents}> }>`. Manager sees all; staff sees own only (mirror existing role pattern in this file).
- `src/actions/daily-report.actions.ts` -- new `voidSalesSubmission(submissionId)`: requireRole("MANAGER"); pattern from `voidWastage` — txn updates rows, calls `applyRestoreFifo` per row, restores today's `InventoryCount` per ingredient via the leaf rollup, recheck thresholds.
- `src/components/daily-report/sales-tabs.tsx` -- add `History` tab between `Report` and `Analysis`
- `src/app/(app)/daily-report/page.tsx` -- branch on `tab === "history"` and render `<SalesHistoryPanel />`
- `src/components/daily-report/sales-history.tsx` (NEW) -- the list. Each day = card. Card shows merged per-recipe rows + a "Submissions: 3 (1 voided)" footer. If manager, each non-voided submission row has a "Void" button (with confirm + optional reason).
- `src/lib/transactions.ts` -- no change (already has `restoreInventory` helper used inside `voidWastage`)
- `src/actions/daily-report.actions.test.ts` -- (a) drop the existing `ALREADY_SUBMITTED` test; (b) add tests for: two submissions same day both succeed, both share saleDate, distinct submissionIds; void marks all rows + restores FIFO; non-manager void rejected; void of already-voided is idempotent; getSalesHistory merges across submissions and excludes voided.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` -- add 4 columns + composite index on `SalesEntry`
- [x] Generate + apply Prisma migration
- [x] `src/actions/daily-report.actions.ts` -- delete `ALREADY_SUBMITTED` guard; thread `submissionId` into every create; add `voidedAt: null` filter to existing analysis queries
- [x] `src/actions/daily-report.actions.ts` -- add `getSalesHistory` action
- [x] `src/actions/daily-report.actions.ts` -- add `voidSalesSubmission` action (mirror `voidWastage`)
- [x] `src/components/daily-report/sales-tabs.tsx` -- add History tab
- [x] `src/app/(app)/daily-report/page.tsx` -- render new panel for `tab === "history"`
- [x] `src/components/daily-report/sales-history.tsx` -- new component (list + merge + void button)
- [x] `src/actions/daily-report.actions.test.ts` -- update + add tests per Code Map
- [x] Run full verification (build, tests, manual)

**Acceptance Criteria:**
- Given a staff user has already submitted a sales report today, when they submit again with new entries, then both submissions succeed and produce SalesEntry rows with the same `saleDate` but different `submissionId` values.
- Given two non-voided submissions exist for the same `saleDate` (e.g. one with Latte qty=5, one with Latte qty=3), when a manager opens the History tab, then the day's row shows Latte qty=8 (merged).
- Given a manager voids a submission with 4 rows, when the action returns success, then all 4 rows have `voidedAt` set, all FIFO lots referenced via `LotConsumption.sourceId` are restored, and the corresponding `InventoryCount.quantity` for today is increased.
- Given a staff (non-manager) calls `voidSalesSubmission`, when the action runs, then it returns `{ success: false, error: "Unauthorized" }` and no DB writes occur.
- Given a submission is already voided, when `voidSalesSubmission` is called again, then it returns `{ success: true }` and no double-restore happens.
- Given the History tab opens with zero past sales, when it renders, then it shows the "No sales reports yet" empty state.

## Spec Change Log

## Design Notes

**Why a column, not a parent table.** A `SalesSubmission` parent table would be cleaner conceptually, but adds a join everywhere `SalesEntry` is queried (analysis, history, void). A `submissionId String?` column is sufficient — we group by it in queries that need to. Future-proof: if we ever need per-submission metadata beyond what's already on the row (createdAt, createdById), promote then.

**Void restores to TODAY, not saleDate.** Already the convention in `voidWastage` — voiding a 3-day-old submission today means "those ingredients didn't actually leave inventory; put them back into current stock". This is sane for restaurant operations and matches what FIFO `applyRestoreFifo` does (it restores the exact lot quantities to their `IngredientPurchase.remainingQuantity`).

**Backfill is NULL-leaving.** Pre-existing rows have `submissionId = NULL`. The History view groups all NULL-id rows for a given date as one synthetic "Legacy" submission with no Void button (their `LotConsumption` rows still reference `sourceId=salesEntry.id` so void *could* work, but introducing that risks subtle data issues — easier to just disallow).

## Verification

**Commands:**
- `cd cafe-mgmt && npx prisma migrate dev --name sales_submission_id_void` -- expected: applies + regenerates client
- `cd cafe-mgmt && npx tsc --noEmit` -- expected: no new errors
- `cd cafe-mgmt && npx vitest run` -- expected: full suite passes (628+ tests)
- `cd cafe-mgmt && npm run build` -- expected: clean

**Manual checks:**
- Submit a sales report twice on the same day with overlapping recipes; open History tab; confirm merged totals match the sum.
- As manager, void one of the two submissions; confirm History updates; check the affected ingredient's inventory count went up by the correct quantity.
- As staff, confirm the Void button is hidden.

## Suggested Review Order

**Schema & migration (start here)**

- New columns + index on `SalesEntry`; `SalesVoider` FK relation on `User`.
  [`schema.prisma`](../../cafe-mgmt/prisma/schema.prisma)

- Adds the 4 columns + composite index. No backfill (NULL is meaningful).
  [`migration.sql`](../../cafe-mgmt/prisma/migrations/20260505043629_sales_submission_id_void/migration.sql)

**Submit path — drop the once-per-day guard, stamp submissionId**

- `ALREADY_SUBMITTED` removed; one `crypto.randomUUID()` stamped on every row.
  [`daily-report.actions.ts:332`](../../cafe-mgmt/src/actions/daily-report.actions.ts#L332)

**Void action — mirrors voidWastage; restores FIFO + InventoryCount + dollar value**

- Manager-only soft-void; idempotent on already-voided.
  [`daily-report.actions.ts:940`](../../cafe-mgmt/src/actions/daily-report.actions.ts#L940)

- Recompute `dollarValueInCents` after restore using submit's derived-cost path. (Iter 1 patch.)
  [`daily-report.actions.ts:1053`](../../cafe-mgmt/src/actions/daily-report.actions.ts#L1053)

**History query — group, merge, exclude voided**

- Grouping + per-row voided filter for the Legacy bucket. (Iter 1 patch.)
  [`daily-report.actions.ts:804`](../../cafe-mgmt/src/actions/daily-report.actions.ts#L804)

**Analysis filters now exclude voided rows**

- `getSalesAnalysis` and `getRevenueAnalysis` both gain `voidedAt: null`.
  [`daily-report.actions.ts:590`](../../cafe-mgmt/src/actions/daily-report.actions.ts#L590)

**UI — new History tab + panel**

- `History` tab between `Report` and `Analysis`.
  [`sales-tabs.tsx:34`](../../cafe-mgmt/src/components/daily-report/sales-tabs.tsx#L34)

- Page branches on `tab === "history"`.
  [`page.tsx`](../../cafe-mgmt/src/app/(app)/daily-report/page.tsx)

- New panel — per-day card with merged totals + per-submission footer + manager Void button.
  [`sales-history.tsx:12`](../../cafe-mgmt/src/components/daily-report/sales-history.tsx#L12)

**Tests**

- 5 tests cover same-day double-submit, void permission, void restore, idempotency, merge correctness.
  [`daily-report.actions.test.ts`](../../cafe-mgmt/src/actions/daily-report.actions.test.ts)

