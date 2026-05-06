---
title: 'Fix date-only TZ shift — sales/inventory/wastage misdated by one day on KL server'
type: 'bugfix'
created: '2026-05-05'
status: 'done'
context: []
baseline_commit: 'a92da37a29edf888a100a452bd4ee1ccf132236c'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The pattern `const today = getCafeNow(); today.setHours(0, 0, 0, 0);` produces a `Date` whose underlying instant is *server-local midnight*, not UTC midnight. On the production KL (UTC+8) server this instant is `2026-05-05T00:00 KL = 2026-05-04T16:00 UTC`. When written to a `@db.Date` column Prisma extracts the **UTC** date portion → today's row is stored with yesterday's date. Confirmed via DB inspection: a sales submission at 12:17 KL today (`createdAt = 2026-05-05T04:17Z`) was stored with `saleDate = 2026-05-04`. Same shift breaks every `gte`/`lte` cutoff against `@db.Date` columns — `getSalesAnalysis` "Today" range returns zero rows even when data exists.

**Approach:** Introduce one helper `getCafeToday(): Date` that returns *UTC midnight of today's KL calendar date* — the canonical `@db.Date` value for a given KL day. Replace every `getCafeNow(); ...setHours(0, 0, 0, 0)` site that targets a date-only context (`@db.Date` write or comparison). Consolidate the 3 duplicated `getWeekStart` helpers (in `comp.actions.ts`, `comp-warning-cards.ts`, `reporting.actions.ts`) into one helper that uses `getCafeToday()` as its base.

## Boundaries & Constraints

**Always:**
- One helper, one home: `export function getCafeToday(): Date` in `src/lib/format.ts`. Returns `new Date(Date.UTC(y, m, d))` where `y/m/d` are read off `getCafeNow()` (KL wall-clock fields).
- Replace every `setHours(0, 0, 0, 0)` call that flows into a `@db.Date` write or compares against a `@db.Date`-shaped value. Keep `setHours` ONLY where the caller genuinely needs a server-local-midnight instant (none expected after audit; if a real one exists, leave it AND document why with a one-line comment).
- One canonical `getWeekStart(today: Date, resetDay: number): Date` helper in `src/lib/format.ts`. Delete the 3 local copies.
- All functions affected stay synchronous. No new async surface.

**Ask First:**
- Whether to backfill existing misdated rows. Spec assumes **no backfill** — `saleDate` shift is not auto-detectable per-row (would need `createdAt - saleDate` heuristic with a 16h fudge factor that's wrong inside the window). Existing wrong dates stay wrong; new writes are correct. Flag this risk explicitly to the user before approval.

**Never:**
- Do not change `getCafeNow()` semantics — many callers want wall-clock fields (period detection, formatted display).
- Do not change `@db.Date` column types or migrate the schema.
- Do not "fix" by setting `process.env.TZ = "UTC"` at process start — that would silently shift other behaviors.
- Do not alter business logic (FIFO, comp budget rules, period detection rules). Only the date-construction primitives change.
- Do not introduce a TZ library (e.g. date-fns-tz). Stay on built-in `Intl` + `Date.UTC`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `getCafeToday()` called on KL server during 2026-05-05 12:17 KL | Server-local time | Returns `Date` representing `2026-05-05T00:00:00.000Z` | N/A |
| `getCafeToday()` called on UTC server during 2026-05-05 04:17 UTC (same instant as above) | Server in UTC | Returns same `2026-05-05T00:00:00.000Z` | N/A |
| `submitDailyReport` after fix, called at 12:17 KL today | Sale submitted | `saleDate = 2026-05-05T00:00:00.000Z` (today's KL date) | N/A |
| `getSalesAnalysis("day")` after fix | Today has 1 row | Returns that row (no longer excluded by 16h shift) | N/A |
| `getSalesAnalysis("week")` after fix | 7-day window | Returns rows whose `saleDate` falls in `[today-7, today]` KL calendar dates | N/A |
| Existing pre-fix row stored as `saleDate=2026-05-04` (was actually KL 2026-05-05) | Backward data | Will appear in History/Analysis on its stored date — misclassified by 1 day | N/A — accepted; explained to user |
| Period detection (`getCurrentPeriod`) | Time-of-day check | Unchanged — uses `getCafeNow().getHours()`, NOT date-only math | N/A |

</frozen-after-approval>

## Code Map

**Helper changes:**
- `src/lib/format.ts` -- add `getCafeToday()`; add canonical `getWeekStart(today: Date, resetDay: number): Date`
- `src/lib/format.test.ts` -- tests for `getCafeToday()` (returns UTC midnight, day matches KL wall-clock) and `getWeekStart()`

**Date-only call sites to replace** (each: `getCafeNow(); ...setHours(0,0,0,0)` → `getCafeToday()`):
- `src/lib/transactions.ts:14, 50` -- inventory restore/deduct date stamps
- `src/lib/threshold-check.ts:12`
- `src/actions/inventory.actions.ts:161, 242, 319, 433, 534`
- `src/actions/daily-report.actions.ts:269, 580, 708, 967`
- `src/actions/wastage.actions.ts:71, 215, 351, 419`
- `src/actions/recipe.actions.ts:503`
- `src/actions/reporting.actions.ts:17` (also drop local `getWeekStart`)
- `src/actions/comp.actions.ts:37` (also drop local `getWeekStart`)
- `src/domains/feed/comp-warning-cards.ts:7` (also drop local `getWeekStart`)
- `src/app/(app)/inventory/page.tsx:14`
- `src/app/(app)/wastage/page.tsx:23`

**Helper-consolidation cleanup:**
- `src/actions/reporting.actions.ts`, `src/actions/comp.actions.ts`, `src/domains/feed/comp-warning-cards.ts` -- delete local `getWeekStart`, import from `@/lib/format`

**Tests to update:**
- `src/actions/comp.actions.test.ts:107` -- if it constructed test dates via `setHours`, swap to `Date.UTC(...)` directly so assertions match the new world
- Any test that mocked `getCafeNow` with a Date built via `new Date(y,m,d,...)` — verify still meaningful

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/format.ts` -- add `getCafeToday()`; add `getWeekStart(today, resetDay)`
- [x] `src/lib/format.test.ts` -- assert `getCafeToday()` returns UTC midnight matching KL wall-clock day; assert `getWeekStart` boundary cases (resetDay = today, before, after)
- [x] Refactor every site listed in Code Map to use `getCafeToday()`. Where the variable was only used for that one purpose, drop the redundant `setHours` and `const today = getCafeNow()` ceremony.
- [x] Delete the 3 duplicate `getWeekStart` helpers; replace with `import { getWeekStart } from "@/lib/format"`.
- [x] Update affected tests; verify full suite still passes.
- [ ] Manual smoke: open `/daily-report?tab=analysis` with the existing 34 rows; confirm "Day" range no longer empty (it'll show whatever's actually dated today after the fix; pre-fix data may show on the wrong day).
- [x] Run full verification.

**Acceptance Criteria:**
- Given a developer greps `setHours(0\s*,\s*0\s*,\s*0\s*,\s*0)` across `src/`, when they inspect results, then ZERO matches remain in production code (test files are scoped — only the `comp.actions.test.ts:107` site if it remains).
- Given `getCafeNow()` is called somewhere followed immediately by `setHours(0,0,0,0)`, when grepped, then no such pattern remains in `src/`.
- Given a sales submission is made at 12:00 KL on day D, when the row is read back, then `saleDate` (UTC date portion) equals D — not D-1.
- Given the cafe has at least one sale dated today (KL), when the user opens Sales → Analysis with range "Today", then the recipes/ingredients tables are non-empty.
- Given `getCafeToday()` is called twice on the same KL calendar date (across hours), when both results are compared, then they are equal.
- Given a developer searches for `function getWeekStart` in `src/`, when they inspect results, then exactly ONE definition exists (in `src/lib/format.ts`).

## Spec Change Log

## Design Notes

**Why a separate helper, not a `getCafeNow` change.** Two consumer shapes coexist: (1) "give me KL wall-clock now, including hour/minute" — used by period detection, formatters; (2) "give me today's KL calendar date as a `@db.Date`-compatible UTC midnight Date" — used by every date-only write/compare. Conflating them is what created the bug. Two helpers, two purposes.

**Why no backfill.** A row stored as `saleDate=2026-05-04` could be EITHER a sale actually made on KL 2026-05-04 (correct, common) OR a sale made on KL 2026-05-05 between 00:00 KL and 08:00 KL (misdated, rare). The `createdAt` distinguishes them but only outside the 16h ambiguous window — and even then, fixing one row but not another inside the window creates worse data. Pragmatic call: stop the bleeding (new writes correct), accept historical wrongness, document for the user.

**Tests:** existing test files mock `getCafeNow` with synthetic Dates — those mocks still work because `getCafeToday()` will be tested separately and the calling code is what changes its source.

## Verification

**Commands:**
- `cd cafe-mgmt && grep -rnE "setHours\(0\s*,\s*0\s*,\s*0\s*,\s*0\)" src/` -- expected: zero hits in production code
- `cd cafe-mgmt && grep -rnE "function getWeekStart" src/` -- expected: exactly one definition
- `cd cafe-mgmt && npx tsc --noEmit` -- expected: zero new errors
- `cd cafe-mgmt && npx vitest run` -- expected: full suite passes
- `cd cafe-mgmt && npm run build` -- expected: clean

**Manual checks:**
- Open `/daily-report?tab=analysis` with at least one row dated today; confirm "Today" range now populates.
- Submit a new sales report; query DB for the new row; confirm `saleDate.toISOString()` matches today's KL calendar date in UTC midnight form.

## Suggested Review Order

**The helper itself (start here)**

- One helper, one purpose: today's KL calendar date as a UTC-midnight `Date`.
  [`format.ts:117`](../../cafe-mgmt/src/lib/format.ts#L117)

- Canonical `getWeekStart` consolidating 3 duplicates; preserves UTC-midnight contract via `setUTCDate`.
  [`format.ts:132`](../../cafe-mgmt/src/lib/format.ts#L132)

- Tests assert UTC-midnight invariant + same-day stability + `getWeekStart` boundary cases.
  [`format.test.ts`](../../cafe-mgmt/src/lib/format.test.ts)

**Sales path (the user-visible bug that triggered this spec)**

- `submitDailyReport` writes correct `saleDate` after the fix.
  [`daily-report.actions.ts:268`](../../cafe-mgmt/src/actions/daily-report.actions.ts#L268)

- `getSalesAnalysis` "Today" range now bounded correctly; `setUTCDate` keeps the contract for week/month windows.
  [`daily-report.actions.ts:578`](../../cafe-mgmt/src/actions/daily-report.actions.ts#L578)

- `getRevenueAnalysis` mirrors the same pattern.
  [`daily-report.actions.ts:705`](../../cafe-mgmt/src/actions/daily-report.actions.ts#L705)

**Inventory + wastage callers (highest blast-radius cluster)**

- 5 sites in inventory actions all use `getCafeToday()`; derived `yesterday` uses `setUTCDate` to stay UTC-aligned.
  [`inventory.actions.ts:160`](../../cafe-mgmt/src/actions/inventory.actions.ts#L160)

- 4 sites in wastage actions.
  [`wastage.actions.ts:70`](../../cafe-mgmt/src/actions/wastage.actions.ts#L70)

- FIFO restore/deduct date stamps and threshold check.
  [`transactions.ts`](../../cafe-mgmt/src/lib/transactions.ts)
  [`threshold-check.ts`](../../cafe-mgmt/src/lib/threshold-check.ts)

**Daily checklist (recon-missed site, fixed in scope)**

- Was using `new Date(y,m,d)` (server-local-midnight) — same defect class. Now uses `getCafeToday()`.
  [`checklist.ts`](../../cafe-mgmt/src/lib/checklist.ts)

**Helper-consolidation cleanup**

- 3 local `getWeekStart` copies deleted; all import from `@/lib/format`.
  [`comp.actions.ts`](../../cafe-mgmt/src/actions/comp.actions.ts)
  [`reporting.actions.ts`](../../cafe-mgmt/src/actions/reporting.actions.ts)
  [`comp-warning-cards.ts`](../../cafe-mgmt/src/domains/feed/comp-warning-cards.ts)

**Server pages**

- Inventory page; wastage page.
  [`inventory/page.tsx`](../../cafe-mgmt/src/app/(app)/inventory/page.tsx)
  [`wastage/page.tsx`](../../cafe-mgmt/src/app/(app)/wastage/page.tsx)

**Review-loop iter 1 patches**

- `getChecklistHistory` missed site — `since` now `getCafeToday()`-based.
  [`checklist.actions.ts:347`](../../cafe-mgmt/src/actions/checklist.actions.ts#L347)

- Recipe test mock now returns deterministic Date instead of `vi.fn()` returning `undefined`.
  [`recipe.actions.test.ts:18`](../../cafe-mgmt/src/actions/recipe.actions.test.ts#L18)

