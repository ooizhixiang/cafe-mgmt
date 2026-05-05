---
title: 'Lock app timezone to Malaysia, remove user-facing picker'
type: 'refactor'
created: '2026-05-05'
status: 'done'
context: []
baseline_commit: '7df64f848940f3ca618a48a3f5088c90298f67e9'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Timezone is per-cafe today (`Cafe.timezone` column, default `America/New_York`, picker in settings). The product now targets Malaysia only, so the column, picker, and update action are all dead weight that can drift (e.g. someone re-selects NY and breaks period detection, daily reports, FIFO timestamps).

**Approach:** Introduce a single constant `CAFE_TIMEZONE = "Asia/Kuala_Lumpur"` as the only source of truth. Refactor `getCafeNow()` to take no argument and use the constant. Drop the `Cafe.timezone` column (Prisma migration). Remove the picker UI, the `updateCafeSettings` server action, and the duplicate `TIMEZONES` arrays.

## Boundaries & Constraints

**Always:**
- One source of truth: `CAFE_TIMEZONE` exported from `src/lib/format.ts`.
- All `getCafeNow(timezone)` call sites become `getCafeNow()` (no argument).
- Default value of `Cafe.timezone` set to `"Asia/Kuala_Lumpur"` in the migration BEFORE the column is dropped, so any in-flight code reading it pre-deploy doesn't observe NY values.

**Ask First:**
- Whether to drop the `Cafe.timezone` column or just orphan it. Spec assumes **drop** — if you'd rather keep the column for forensic value, say so before approval.

**Never:**
- Do not introduce per-user or per-cafe TZ overrides anywhere.
- Do not silently keep the picker rendered-but-disabled — fully remove the UI.
- Do not export multiple constants. One name, one home.
- Out of scope: changing any business logic that USES the timezone (period boundaries, week start, FIFO timestamps). Behavior stays identical for Malaysia users; only the source changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `getCafeNow()` called | No argument | Returns Date in `Asia/Kuala_Lumpur` (UTC+8) | N/A |
| Existing cafe row with `timezone="America/New_York"` | Pre-migration data | Migration overwrites to `Asia/Kuala_Lumpur`, then drops column | N/A |
| User opens `/settings` | Any role | Page renders WITHOUT a timezone field; other settings (if any) still work | N/A |
| Old client POSTs to removed update action | Stale browser tab | Action no longer exists → request 404s; no DB write | Acceptable — refresh fixes it |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- remove `timezone` field from `Cafe` model
- `prisma/migrations/<new>/migration.sql` -- backfill all rows to KL, then `DROP COLUMN`
- `src/lib/format.ts` -- export `CAFE_TIMEZONE` constant; make `getCafeNow()` arg-less
- `src/lib/format.test.ts` -- update `getCafeNow` tests (no arg, KL-only)
- `src/lib/period-detection.ts` -- drop `timezone` param plumbing
- `src/lib/period-detection.test.ts` -- mock no longer needs zone arg
- `src/lib/checklist.ts` -- drop `timezone` param plumbing
- `src/lib/threshold-check.ts` -- drop `timezone` param
- `src/domains/feed/composer.ts` -- stop passing `cafe.timezone`
- `src/domains/feed/checklist-cards.ts`, `comp-warning-cards.ts`, `supplier-reminder-cards.ts` -- drop `timezone` param
- `src/actions/reporting.actions.ts`, `comp.actions.ts`, `inventory.actions.ts`, `daily-report.actions.ts` -- replace `getCafeNow(cafe.timezone)` → `getCafeNow()`; stop selecting `timezone` from cafe
- `src/actions/settings.actions.ts` -- delete `updateCafeSettings`, `updateCafeSettingsSchema`, `TIMEZONES` array
- `src/components/settings/cafe-settings.tsx` -- delete file (only purpose is the picker). If it has any other content, narrow it down instead.
- `src/app/(app)/settings/page.tsx` -- remove the `<CafeSettings />` render and the cafe.timezone select
- `src/app/(app)/inventory/page.tsx`, `wastage/page.tsx` (if it exists) -- replace `getCafeNow(cafe.timezone)` → `getCafeNow()`
- `src/actions/inventory.actions.test.ts` -- drop `timezone: "UTC"` from cafe mocks
- `src/actions/daily-report.actions.test.ts` -- already mocks `getCafeNow` directly; verify still compiles
- Any other test file that mocks `prisma.cafe.findUnique` returning a `timezone` field -- drop the field

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/format.ts` -- export `export const CAFE_TIMEZONE = "Asia/Kuala_Lumpur"`; rewrite `getCafeNow()` to take no args and use the constant
- [x] `src/lib/format.test.ts` -- test `getCafeNow()` returns a Date in KL offset; remove multi-zone variants
- [x] Prisma migration -- `UPDATE "Cafe" SET timezone = 'Asia/Kuala_Lumpur'; ALTER TABLE "Cafe" DROP COLUMN "timezone";`
- [x] `prisma/schema.prisma` -- delete the `timezone` field
- [x] `npx prisma generate` after schema change (note in Verification)
- [x] All `getCafeNow(...)` callers -- remove argument; remove `select: { timezone: true }` from any `prisma.cafe.find*` calls that only fetched it for that purpose
- [x] All function signatures that thread `timezone: string` through (period-detection, checklist, threshold-check, composer, feed/*-cards) -- drop the parameter
- [x] `src/actions/settings.actions.ts` -- delete the timezone update action + schema + `TIMEZONES` array
- [x] `src/components/settings/cafe-settings.tsx` + `src/app/(app)/settings/page.tsx` -- remove picker UI; delete file if it contained only the picker
- [x] Update affected tests; verify full suite still passes

**Acceptance Criteria:**
- Given a developer greps `getCafeNow(`, when they inspect results, then no call site passes any argument.
- Given a developer greps `cafe.timezone` or `Cafe.timezone`, when they inspect results, then there are zero hits in `src/`.
- Given the user navigates to `/settings`, when the page renders, then there is no timezone selector.
- Given `npm run build` and `npm test` are run, when they finish, then both pass with zero TZ-related errors.
- Given the Prisma migration is applied to a fresh DB, when introspected, then `Cafe` has no `timezone` column.

## Spec Change Log

## Design Notes

The constant lives in `src/lib/format.ts` (next to `getCafeNow`) so the helper and its single source of truth co-locate. We do NOT add a `getCafeTimezone()` accessor — that would just be ceremony around a const. The migration runs the `UPDATE` first so any code reading the column during the rolling deploy sees the right value, even though all readers are removed in the same PR.

## Verification

**Commands:**
- `cd cafe-mgmt && npx prisma migrate dev --name lock_timezone_to_malaysia` -- expected: migration applies cleanly, regenerates Prisma client
- `cd cafe-mgmt && npx tsc --noEmit` -- expected: zero new TS errors in src/ (pre-existing test fixture errors unrelated)
- `cd cafe-mgmt && npx vitest run` -- expected: full suite passes
- `cd cafe-mgmt && npm run build` -- expected: builds clean
- `cd cafe-mgmt && grep -rn "cafe.timezone\|Cafe.timezone\|getCafeNow(.\+)" src/` -- expected: zero matches

**Manual checks:**
- Open `/settings` in the running dev app — confirm no timezone field is visible.

## Suggested Review Order

**Single source of truth (start here)**

- The whole change pivots on this constant + arg-less helper.
  [`format.ts:85`](../../cafe-mgmt/src/lib/format.ts#L85)

**Schema & migration**

- Cafe model loses the `timezone` column; rest of the model unchanged.
  [`schema.prisma`](../../cafe-mgmt/prisma/schema.prisma)

- Backfill-then-drop in one atomic migration; comment explains why.
  [`migration.sql`](../../cafe-mgmt/prisma/migrations/20260505034752_lock_timezone_to_malaysia/migration.sql)

**Helper signatures (timezone parameter dropped)**

- Period detection no longer threads `timezone` through; cleanest example.
  [`period-detection.ts:67`](../../cafe-mgmt/src/lib/period-detection.ts#L67)

- Daily checklist creation now reads the constant directly.
  [`checklist.ts:10`](../../cafe-mgmt/src/lib/checklist.ts#L10)

- Inventory deduct/restore — recon-missed file, applied same pattern.
  [`transactions.ts:8`](../../cafe-mgmt/src/lib/transactions.ts#L8)

**Feed composition (pass-through callers)**

- Feed composer no longer fetches/forwards `cafe.timezone`.
  [`composer.ts:13`](../../cafe-mgmt/src/domains/feed/composer.ts#L13)

- Cards used to receive `timezone` to forward; now they don't.
  [`checklist-cards.ts:6`](../../cafe-mgmt/src/domains/feed/checklist-cards.ts#L6)

**Settings UI removal**

- Cafe settings page no longer renders the picker; other sections unchanged.
  [`page.tsx`](../../cafe-mgmt/src/app/(app)/settings/page.tsx)

- Picker component file deleted entirely (zero remaining purpose).
  `cafe-mgmt/src/components/settings/cafe-settings.tsx` (deleted)

- `updateCafeSettings` action + `TIMEZONES` array gone; `getCafeSettings` shape narrowed.
  [`settings.actions.ts`](../../cafe-mgmt/src/actions/settings.actions.ts)

**Tests**

- KL-only assertion + constant equality check replaces multi-zone variants.
  [`format.test.ts`](../../cafe-mgmt/src/lib/format.test.ts)

- Cafe mocks no longer include `timezone: "UTC"`.
  [`inventory.actions.test.ts`](../../cafe-mgmt/src/actions/inventory.actions.test.ts)

**Review-loop patches (iteration 1)**

- Stale "cafe's timezone" comment rewritten to "KL wall clock".
  [`inventory.actions.ts:530`](../../cafe-mgmt/src/actions/inventory.actions.ts#L530)

- Dead `getCafeToday` helper deleted (zero callers in src/).
  [`checklist.ts:107`](../../cafe-mgmt/src/lib/checklist.ts#L107)

- Migration comment honest about atomic-vs-rolling-deploy semantics.
  [`migration.sql:1`](../../cafe-mgmt/prisma/migrations/20260505034752_lock_timezone_to_malaysia/migration.sql#L1)

