---
title: 'Purchase auto-bump writes InventoryCount under wrong countDate on non-UTC servers'
type: 'bugfix'
created: '2026-04-29'
status: 'done'
context: []
baseline_commit: '5712db434b7d94ac82e0e7af1e15c68f7109e6fe'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Logging a purchase via the Purchases tab does not visibly bump today's inventory on a non-UTC server (e.g. local dev on macOS). The purchase action correctly upserts an `InventoryCount` row, but it computes the `countDate` key with `setUTCHours(0,0,0,0)` while every other reader/writer in the codebase uses `setHours(0,0,0,0)`. The two produce different epoch timestamps when the host TZ ≠ UTC, so the bumped row lands under a date the inventory page never queries.

**Approach:** Change the two `setUTCHours(0,0,0,0)` calls in `src/actions/inventory.actions.ts` (in `createIngredientPurchase` and `bulkCreateIngredientPurchases`) to `setHours(0,0,0,0)`, matching the project-wide convention used by the inventory page, wastage actions, daily reports, threshold-check, and others. Add a unit test asserting the exact `countDate` passed to `inventoryCount.upsert` so this regression cannot recur.

## Boundaries & Constraints

**Always:** Use `today.setHours(0,0,0,0)` after `getCafeNow(timezone)` for any date-only key. This is the project-wide convention because `getCafeNow` returns a Date built from a local-time string that the JS engine reads in host-local TZ — so `setHours` (not `setUTCHours`) is what truncates correctly.

**Ask First:** Whether to backfill historical `InventoryCount` rows previously written under UTC-midnight keys by the buggy code. (Likely irrelevant in dev, but matters if any production data exists.)

**Never:** Don't change `getCafeNow` or any other call site. Don't alter the upsert/seed-from-prior-count logic. Don't introduce a date-helper abstraction — three similar lines is fine.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First purchase of the day, host TZ ≠ UTC | No `InventoryCount` for today; prior count exists | `inventoryCount.upsert` called with `countDate` = local-midnight Date (matches what inventory page queries); today's count = prior + purchased qty | N/A |
| Repeat purchase same day | `InventoryCount` for today already exists at local-midnight key | Upsert hits the `update` branch and increments `quantity`; no duplicate row | N/A |
| First purchase ever for ingredient | No prior count, no today count | Upsert creates row with `quantity` = purchased qty, `countDate` = local-midnight | N/A |
| Server happens to run in UTC | Host TZ = UTC | Behavior unchanged (setHours == setUTCHours when offset is 0) | N/A |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/src/actions/inventory.actions.ts:452` -- `createIngredientPurchase`: `today.setUTCHours(0,0,0,0)` → `today.setHours(0,0,0,0)`
- `cafe-mgmt/src/actions/inventory.actions.ts:560` -- `bulkCreateIngredientPurchases`: same change
- `cafe-mgmt/src/actions/inventory.actions.test.ts` -- add assertion on the exact `countDate` arg passed to `countUpsert` in the existing auto-bump test
- `cafe-mgmt/src/lib/format.ts:80` -- `getCafeNow` reference (no change; documents why `setHours` is correct)
- `cafe-mgmt/src/app/(app)/inventory/page.tsx:22-23` -- reader using `setHours` (the convention we're aligning with)

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/src/actions/inventory.actions.ts` -- replace `today.setUTCHours(0, 0, 0, 0)` with `today.setHours(0, 0, 0, 0)` at both call sites (lines 452 and 560) -- align with project-wide date-truncation convention so upsert key matches reader queries
- [x] `cafe-mgmt/src/actions/inventory.actions.test.ts` -- in the existing "creates today's InventoryCount seeded from purchase quantity" test (and at least one `createIngredientPurchase` test), assert that `countUpsert` was called with `where.ingredientId_countDate.countDate` equal to a Date whose local-midnight equals the cafe's local today -- locks the convention so a future revert to `setUTCHours` fails the test on non-UTC CI runners

**Acceptance Criteria:**
- Given a purchase logged via the Purchases tab on a host where `process.env.TZ` is not UTC, when the inventory page is loaded, then `todayCount` for the purchased ingredient equals the prior day's count plus the purchased quantity (visible bump in the UI).
- Given a second purchase of the same ingredient the same day, when logged, then exactly one `InventoryCount` row exists for that ingredient at that `countDate` and its `quantity` reflects the cumulative bump.
- Given the test suite is run on macOS (non-UTC TZ), when `npm test src/actions/inventory.actions.test.ts` is executed, then the new `countDate` assertion passes; if the code is reverted to `setUTCHours`, the test fails.

## Verification

**Commands:**
- `cd cafe-mgmt && npm run build` -- expected: clean build, no TS errors
- `cd cafe-mgmt && npm test src/actions/inventory.actions.test.ts` -- expected: all tests pass including new countDate assertion
- `cd cafe-mgmt && npm test` -- expected: full suite (171+ tests) still passes

**Manual checks:**
- Start dev server (already running on :4000), log a purchase via the Purchases tab, navigate to `/inventory`, confirm the ingredient's "today" count increased by the purchased quantity.

## Suggested Review Order

**Date-truncation fix**

- The convention swap — host-local midnight matches what the inventory page reader queries with.
  [`inventory.actions.ts:452`](../../cafe-mgmt/src/actions/inventory.actions.ts#L452)

- Same swap in the bulk-purchase path, inside the per-line auto-bump loop.
  [`inventory.actions.ts:560`](../../cafe-mgmt/src/actions/inventory.actions.ts#L560)

**Regression lock**

- New assertion: countDate must be all-zero local time so a future revert to setUTCHours fails on non-UTC hosts.
  [`inventory.actions.test.ts:756`](../../cafe-mgmt/src/actions/inventory.actions.test.ts#L756)

- Same assertion for the single-line createIngredientPurchase path.
  [`inventory.actions.test.ts:909`](../../cafe-mgmt/src/actions/inventory.actions.test.ts#L909)
