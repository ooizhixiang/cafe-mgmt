---
title: 'Fractional Cost Storage (Decimal Sub-Cent Precision)'
type: 'refactor'
created: '2026-04-28'
status: 'done'
baseline_commit: '5712db4'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** All money columns (`costPerUnitInCents`, `priceInCents`, `totalPriceInCents`, `subtotalOverrideInCents`) are stored as `Int`. Sub-cent costs — common for cheap, high-quantity ingredients (a single sugar packet, salt by the gram) — round to whole cents and lose precision. A purchase of 1000 packets at $5 (= 0.5 cents per packet) currently persists as 0 or 1 cent per unit, producing wrong recipe costs.

**Approach:** Migrate the four money columns from `Int` to `Decimal(12, 4)` (cents with 4 decimal places of sub-cent precision). Keep column names as-is (no rename — too much churn). Convert `Decimal` to `number` at the Server-Component → Client-Component boundary using `.toNumber()`. Drop `.int()` from related zod schemas. Floor in display so sub-cent values render as `$0.00` (e.g., 0.5 cents → "$0.00"; 350 cents → "$3.50"). Foundation for FIFO costing (Spec B) and the inventory detail view (Spec C).

## Boundaries & Constraints

**Always:** Use Prisma `Decimal(12, 4)` for the four columns. At every Server-Component → Client boundary, convert `Decimal` → `number` via `.toNumber()` before passing as props. Server actions that return these values do the same. Display formatter `formatCents` floors to whole cents before rendering. zod schemas for these fields use `z.number().min(0)` (no `.int()`). Input parsing keeps full precision: `parseFloat(input) * 100` without `Math.round`. Existing math (recipe subtotals, weighted-average reporting) continues to use `number` arithmetic — sub-cent drift through float ops is acceptable for display; persisted values stay exact.

**Ask First:** None.

**Never:** Don't rename the columns. Don't change currency formatting locale. Don't introduce a Decimal arithmetic library to the client. Don't add new business logic in this spec — FIFO consumption belongs to Spec B. Don't migrate any other money-shaped column outside the four named.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior | Error |
|----------|--------------|-------------------|-------|
| Input "0.005" in cost cell | parseFloat(0.005)*100 = 0.5 | Persists 0.5 cents (Decimal); display floors to "$0.00" | N/A |
| Input "1.99" | 199 cents | Persists 199.0000; display "$1.99" | N/A |
| Input "0.001" | 0.1 cents | Persists 0.1; display "$0.00" | N/A |
| Input large "9999999.99" | 999999999 cents | OK; below Decimal(12,4) max | N/A |
| Input negative "-1" | -100 cents | Reject — zod min(0) | Toast existing error |
| Input non-numeric "abc" | NaN | Reject before action call | Existing toast |
| Migration: existing Int rows | 350 → 350.0000 | Identity preserved | Migration aborts on type-cast failure |
| Recipe subtotal: cost 0.5 × qty 200 = 100 cents | Computed in JS as number | Renders "$1.00" | N/A |
| Server action return value | Decimal | Action serializer converts to number before response | N/A |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- change `costPerUnitInCents`, `priceInCents`, `totalPriceInCents`, `subtotalOverrideInCents` from `Int(?)` to `Decimal(?) @db.Decimal(12, 4)` preserving nullability
- `prisma/migrations/<timestamp>_fractional_cost/migration.sql` -- NEW; `ALTER TABLE ... ALTER COLUMN ... TYPE decimal(12, 4) USING ("col"::decimal)` for each of the 4 columns
- `src/lib/format.ts` -- `formatCents` floors before dividing
- `src/actions/inventory.actions.ts` -- drop `.int()` from cost/price zod fields; `.toNumber()` on Decimal returned values
- `src/actions/setup.actions.ts` -- same on `priceInCents`
- `src/actions/supplier.actions.ts` -- same on `totalPriceInCents`
- `src/actions/grab-and-go.actions.ts` -- same on `priceInCents`
- `src/app/(app)/ingredients/page.tsx` -- `.toNumber()` on cost + supplier prices + purchase totals before passing to spreadsheet
- `src/app/(app)/inventory/page.tsx` -- `.toNumber()` on cost + supplier prices + purchase totals
- `src/app/(app)/recipes/page.tsx` and recipe editor server-side data shapers -- `.toNumber()` on cost + subtotal override
- `src/app/(app)/suppliers/[id]/page.tsx` -- `.toNumber()` on supplier-link prices and purchase totals
- `src/app/(app)/grab-and-go/page.tsx` -- `.toNumber()` on grab-and-go priceInCents
- `src/components/ingredients/ingredient-spreadsheet.tsx` -- input parser drops `Math.round(... * 100)`; relax `Number.isSafeInteger` guard to `Number.isFinite`
- `src/components/inventory/inventory-list.tsx` -- same input parser change
- `src/components/operations/recipe-editor.tsx` -- same in CostRow
- `src/components/ingredients/ingredient-suppliers-panel.tsx` -- same in supplier-price edit input
- `src/components/operations/supplier-detail.tsx` -- same in price edit input
- 8 test files (`*.test.ts`/`*.test.tsx`) -- update zod expectations (no `.int()`); existing integer fixtures stay valid

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` -- modify -- four columns to `Decimal @db.Decimal(12, 4)` (preserve nullability where applicable)
- [x] `prisma/migrations/<timestamp>_fractional_cost/migration.sql` -- create -- `ALTER COLUMN` for each column with explicit `USING` cast
- [x] `src/lib/format.ts` -- modify -- `formatCents = (cents) => '$' + (Math.floor(Number(cents)) / 100).toFixed(2)`
- [x] `src/actions/{inventory,setup,supplier,grab-and-go}.actions.ts` -- modify -- drop `.int()` on the four-column zod fields; convert returned Decimals to numbers
- [x] `src/app/(app)/{ingredients,inventory,recipes,suppliers/[id],grab-and-go}/page.tsx` -- modify -- `.toNumber()` at the server→client boundary for the four columns
- [x] `src/components/{ingredients/ingredient-spreadsheet,inventory/inventory-list,operations/recipe-editor,ingredients/ingredient-suppliers-panel,operations/supplier-detail}.tsx` -- modify -- input parsers preserve precision; guards use `Number.isFinite`
- [x] All 8 test files using these columns -- modify -- drop `.int()` from local zod test schemas; add at least one new test asserting fractional input "0.005" persists as 0.5

**Acceptance Criteria:**
- Given a manager types "0.005" into the cost cell on `/ingredients`, when blur fires, then `updateIngredientConfig` is called with the value 0.5 (cents) and the action returns success.
- Given a row stores `costPerUnitInCents = 0.5`, when displayed in the spreadsheet, then the cell shows `$0.00`.
- Given a row stores `costPerUnitInCents = 350`, when displayed, then the cell shows `$3.50`.
- Given the migration runs against a DB with existing Int rows, when it completes, then every value's numeric identity is preserved (e.g., 350 → 350.0000).
- Given `npx next build`, when it runs, then no TypeScript or Prisma errors.
- Given `npx vitest run --exclude="e2e/**"`, when it runs, then all tests pass.

## Design Notes

`formatCents` change is small but load-bearing — `Math.floor(Number(cents)) / 100` ensures sub-cent values display as `$0.00` not `$0.01` (default JS `toFixed` rounds half-up on many engines). The `Number(cents)` wrapper handles the case where Prisma `Decimal` slipped through to the formatter (it will via existing call sites that don't `.toNumber()` first; safer than crashing).

Server-action callers receive plain `number` values (because actions serialize Decimals before returning) — no client-side Decimal handling needed.

`Decimal(12, 4)` covers $99,999,999,999,999.9999 (in-cents = up to 12 digits, 4 decimal places past the cent). More than enough headroom for cafe pricing.

## Verification

**Commands:**
- `npx prisma migrate deploy` -- expected: applies new migration; existing Int values preserved as Decimal
- `npx next build` -- expected: compiles cleanly
- `npx vitest run --exclude="e2e/**"` -- expected: all tests pass including new fractional-input test

**Manual checks:**
- On `/ingredients`, type `0.005` in a cost cell — blur, refresh, value persists; cell shows `$0.00`.
- On `/ingredients`, type `1.99` — cell shows `$1.99`; `costPerUnitInCents` row in DB is `199.0000`.

## Suggested Review Order

**Schema & migration**

- Four columns now Decimal(12,4); preserves nullability.
  [`schema.prisma:159`](../../cafe-mgmt/prisma/schema.prisma#L159)

- Forward migration: idempotent ALTER COLUMN with explicit `USING ::decimal` cast.
  [`migration.sql:1`](../../cafe-mgmt/prisma/migrations/20260428020000_fractional_cost_decimal/migration.sql#L1)

**Persistence-boundary rounding (post-review patch)**

- `daily-report` writes Math.round before persisting computed sub-cent values into Int columns (`SalesEntry.costInCents`, `InventoryCount.dollarValueInCents`).
  [`daily-report.actions.ts:244`](../../cafe-mgmt/src/actions/daily-report.actions.ts#L244)

- `dollar-attribution` discrete branch now rounds (matches the % branch) — prevents Prisma write failures into `WastageEntry.dollarValueInCents`/`CompEntry.dollarValueInCents`.
  [`dollar-attribution.ts:40`](../../cafe-mgmt/src/lib/dollar-attribution.ts#L40)

- `grab-and-go` action keeps `.int()` (column not migrated; restored after over-relaxed sweep).
  [`grab-and-go.actions.ts:10`](../../cafe-mgmt/src/actions/grab-and-go.actions.ts#L10)

**Display formatter**

- `formatCents` uses `Math.trunc` (truncate-toward-zero) so sub-cent values render `$0.00` and negatives don't drift away from zero.
  [`format.ts:1`](../../cafe-mgmt/src/lib/format.ts#L1)

**Server→Client boundary conversion**

- Pages convert `Decimal → number` for ingredient cost, supplier prices, purchase totals.
  [`ingredients/page.tsx:1`](../../cafe-mgmt/src/app/(app)/ingredients/page.tsx#L1)
  [`inventory/page.tsx:1`](../../cafe-mgmt/src/app/(app)/inventory/page.tsx#L1)
  [`suppliers/[id]/page.tsx:1`](../../cafe-mgmt/src/app/(app)/suppliers/%5Bid%5D/page.tsx#L1)

- Recipe action converts cost + override at the server boundary; sums in `number` then `Math.round` at write.
  [`recipe.actions.ts:1`](../../cafe-mgmt/src/actions/recipe.actions.ts#L1)

**Zod schema relaxation**

- `.int()` dropped from the four migrated fields across action files; `.min(0)` retained.
  [`inventory.actions.ts:16`](../../cafe-mgmt/src/actions/inventory.actions.ts#L16)
  [`setup.actions.ts:329`](../../cafe-mgmt/src/actions/setup.actions.ts#L329)
  [`supplier.actions.ts:29`](../../cafe-mgmt/src/actions/supplier.actions.ts#L29)

**Client input parsers**

- Cost-cell parser drops `Math.round`; uses `Number.isFinite` guard; preserves sub-cent precision.
  [`ingredient-spreadsheet.tsx:1`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L1)

- Inventory and recipe-editor parsers use the same pattern; NaN guards added post-review.
  [`inventory-list.tsx:1`](../../cafe-mgmt/src/components/inventory/inventory-list.tsx#L1)
  [`recipe-editor.tsx:1`](../../cafe-mgmt/src/components/operations/recipe-editor.tsx#L1)

- Local `parseRMToCentsPrecise` in supplier panels (will be consolidated into `lib/format.ts` in deferred-work follow-up).
  [`ingredient-suppliers-panel.tsx:1`](../../cafe-mgmt/src/components/ingredients/ingredient-suppliers-panel.tsx#L1)

**Tests**

- New fractional-input test ("0.005" → 0.5 cents → $0.00) plus 4 new formatter tests covering null/undefined/string/negative.
  [`ingredient-spreadsheet.test.tsx:116`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.test.tsx#L116)
  [`format.test.ts:1`](../../cafe-mgmt/src/lib/format.test.ts#L1)
