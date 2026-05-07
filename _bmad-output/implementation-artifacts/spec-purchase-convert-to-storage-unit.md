---
title: 'Purchases: convert quantity to ingredient storage unit before save'
type: 'bugfix'
created: '2026-05-07'
status: 'done'
context: []
baseline_commit: '51441a76eef42710a16df4c014af8fad279061c1'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When a purchase is logged with a unit different from the ingredient's storage unit (e.g. 1 kg of chocolate devon stored in g), `createIngredientPurchase` and `bulkCreateIngredientPurchases` add the **raw purchase quantity** (1) to `InventoryCount.quantity` and store the purchase row with `unit="kg", quantity=1, remainingQuantity=1`. Two consequences: (1) inventory under-counts by the conversion factor (1 instead of 1000), (2) FIFO consumption math operates on raw `remainingQuantity` so deductions are off by the same factor, silently corrupting cost and stock numbers. Confirmed: 5 of 6 existing purchase rows in the DB have unit mismatches with their ingredient's storage unit (chocolate kg→g, oat milk L→ml, three Plastic Cup pcs→each).

**Approach:** In both purchase actions, look up the ingredient's storage `unit` and convert the purchase `quantity` via the existing `convert()` helper. Store the purchase row in the **storage unit** (so FIFO math works). Bump `InventoryCount.quantity` by the converted value. Reject the action with a clear error if `convert()` returns null (cross-dimension or unknown unit). Run a one-shot backfill script to normalize the 5 known historical mismatches AND adjust `InventoryCount` by the conversion delta.

## Boundaries & Constraints

**Always:**
- Forward path: lookup `ingredient.unit` for each purchase line before save; call `convert(qty, purchase.unit, ingredient.unit)`; reject the whole call with a clear error if any line's conversion is null.
- Stored on `IngredientPurchase`: `quantity` and `remainingQuantity` are the **converted** values; `unit` is the **storage unit** (matches `ingredient.unit`).
- `InventoryCount.quantity` bump uses the **converted** value.
- `totalPriceInCents` is unchanged — price is per-purchase, not per-unit.
- Reject is whole-transaction: if line 3 of a 5-line bulk purchase fails conversion, none of the 5 lines are saved.
- Backfill is a one-shot script (not a Prisma migration) — adjusts the 5 known rows AND today's `InventoryCount` for those ingredients by the per-purchase delta. Logs every change for audit.

**Ask First:**
- Whether to also normalize legacy `Ingredient.unit` values (`ml` → `mL`, `pcs` → `each`) as part of the backfill so they match `convert()`'s known unit names. Spec assumes **yes** — the Oat Milk and Plastic Cup backfills require it. Bail out and surface to the user before applying if any unexpected legacy unit is found.
- Whether to adjust historical `InventoryCount` rows (other than today's) for the under-counted purchases. Spec assumes **adjust today only** — older counts may have been manually corrected and we'd risk double-fix.

**Never:**
- Do not change the `convert()` helper or its dimensional rules.
- Do not change the FIFO consume code (`applyConsumeFifo`) — once purchase rows are in storage units, existing FIFO math is correct.
- Do not silently store a purchase under a unit that can't be converted to the storage unit. Reject loudly.
- Do not auto-rename random ingredient units beyond the known legacy mappings (`ml` → `mL`, `pcs` → `each`). New legacy variants must be flagged for human review.
- Do not back-fill InventoryCount rows older than today.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Buy 1 kg chocolate, ingredient stored in g | After fix | Purchase row: `quantity=1000, remainingQuantity=1000, unit="g"`; InventoryCount += 1000 | N/A |
| Buy 0.5 L oat milk, ingredient stored in mL | After fix | Purchase: `quantity=500, remainingQuantity=500, unit="mL"`; InventoryCount += 500 | N/A |
| Buy 2 each of cups, ingredient stored in each | Same unit | Purchase: `quantity=2, remainingQuantity=2, unit="each"`; InventoryCount += 2 | N/A — convert returns 2 |
| Buy 1 kg of milk (stored in mL) | Cross-dimension | Action returns `{success:false, error:"Cannot convert kg to mL — different dimensions"}`; no DB writes | Reject whole txn |
| Buy 1 lbs of nuts (lbs unknown to convert) | Unknown unit | Action returns `{success:false, error:"Cannot convert lbs to g"}`; no DB writes | Reject whole txn |
| Bulk: 5 lines, line 3 fails conversion | Multi-line | Whole bulk rejected; lines 1, 2, 4, 5 also not saved | Single error message naming the failing line |
| Backfill chocolate devon 1 kg → 1000 g | Historical | Purchase row updated to (1000, "g"); today's `InventoryCount.quantity` increased by 999 | Logged |
| Backfill Oat Milk 1 L (stored unit `ml`) | Legacy lowercase | Step 1: rename ingredient unit `ml` → `mL`; Step 2: convert purchase to (1000, "mL"); Step 3: today's count += 999 | Logged |
| Backfill Plastic Cup 123 pcs (stored `each`) | Legacy `pcs` | Rename purchase unit `pcs` → `each`; quantity stays 123 (count is 1:1); no count delta | Logged |
| Unexpected legacy unit found in backfill | Out of {ml, pcs} | Backfill aborts with the row id + names so user can decide | Manual fix |

</frozen-after-approval>

## Code Map

- `src/actions/inventory.actions.ts` — `createIngredientPurchase` (~line 410): fetch `ingredient.unit` via the supplier link; call `convert(quantity, parsed.data.unit, ingredient.unit)`; reject if null; store purchase + bump InventoryCount with converted value.
- Same file — `bulkCreateIngredientPurchases` (~line 530): same pattern but per-line; pre-fetch all ingredient units in one query for efficiency; reject if ANY line's conversion is null with a message naming the failing line.
- `src/actions/inventory.actions.test.ts` — add tests: (a) single purchase converts kg→g; (b) bulk purchase rejects whole txn on cross-dimension; (c) same-unit purchase saves quantity unchanged; (d) inventory bump uses converted value not raw.
- `cafe-mgmt/scripts/backfill-purchase-units.ts` (NEW) — one-shot script: normalize legacy ingredient units (ml→mL, pcs→each) for the affected ingredients only; convert each historical mismatched purchase to storage units; bump today's `InventoryCount` by the per-purchase delta. Idempotent: re-running finds zero mismatches and is a no-op. Logs every change.

## Tasks & Acceptance

**Execution:**
- [x] `src/actions/inventory.actions.ts` — wire `convert()` into `createIngredientPurchase`; reject on null
- [x] Same file — wire `convert()` into `bulkCreateIngredientPurchases` (per-line, all-or-nothing reject)
- [x] `src/actions/inventory.actions.test.ts` — add the 4 tests per Code Map
- [x] `cafe-mgmt/scripts/backfill-purchase-units.ts` — write the one-shot script (`npx tsx scripts/backfill-purchase-units.ts`)
- [x] Run the backfill once against the live DB; verify the 5 mismatches are resolved
- [x] Run full verification (build, tests)

**Acceptance Criteria:**
- Given a manager logs `1 kg of Chocolate Devon` (stored unit `g`), when the action returns success, then the new `IngredientPurchase` row has `quantity=1000, remainingQuantity=1000, unit="g"` and today's `InventoryCount.quantity` is 1000 higher than before.
- Given a manager logs `1 L of Milk` while the milk's stored unit is `mL`, when the action returns, then the purchase saves with quantity 1000 and unit `mL`.
- Given a manager logs `1 kg of Milk` while the milk's stored unit is `mL`, when the action runs, then it returns `{success:false}` with an error mentioning the cross-dimension issue and no DB rows are written.
- Given a manager logs `2 each of Cups` (same unit as stored), when the action returns, then the purchase saves with quantity 2 unchanged.
- Given the backfill script is run, when it finishes, then `prisma.ingredientPurchase` returns zero rows where `unit !== ingredientSupplier.ingredient.unit`, and the script's stdout itemizes every change made.
- Given the backfill is run a second time, when it finishes, then it reports zero changes (idempotent).

## Spec Change Log

## Design Notes

**Why store the purchase row in storage units, not original units.** FIFO consumption (`applyConsumeFifo`) operates on raw `quantity`/`remainingQuantity` — it has no concept of unit conversion at consume time. If a purchase row says "1" and the recipe deducts "50", FIFO subtracts blindly. Storing in storage units keeps the math consistent end-to-end. We lose the original "what the user typed" intent on the purchase row, but the original purchase amount remains derivable from the invoice attached to the receipt batch.

**Why backfill is a script, not a Prisma migration.** Migrations should be schema-only. This is a one-off data normalization; a script under `cafe-mgmt/scripts/` keeps it discoverable and re-runnable.

**InventoryCount delta caveats.** Adjusting today's count for historical purchase under-counts is a best-effort fix. If a manager has manually re-counted any of these ingredients today between the original (wrong) purchase and now, the delta will over-correct. The spec accepts this — manual recount overrides automatic adjustment, and the user can re-count after the backfill if needed.

## Verification

**Commands:**
- `cd cafe-mgmt && npx tsc --noEmit` — expected: no new errors
- `cd cafe-mgmt && npx vitest run src/actions/inventory.actions.test.ts` — expected: existing tests pass + 4 new pass
- `cd cafe-mgmt && npm run build` — expected: clean
- `cd cafe-mgmt && npx tsx scripts/backfill-purchase-units.ts` — expected: prints the 5 conversions, then re-runs as no-op
- `cd cafe-mgmt && grep -rn "ingredientPurchase.create\|inventoryCount.upsert" src/actions/inventory.actions.ts | grep -v ".test."` — sanity check that all purchase create paths use the converted value

**Manual checks:**
- Open `/inventory` for the user's main cafe; the 5 backfilled ingredients (Chocolate Devon, Oat Milk, three Plastic Cup purchases) should now show coherent quantities matching what was actually purchased.
- Log a fresh test purchase: 1 kg of any g-stored ingredient; confirm inventory bumps by 1000.
- Log an attempted cross-dimension purchase (e.g. kg into a mL-stored ingredient via DOM tampering or a brand-new ingredient setup); confirm clear rejection toast.

## Suggested Review Order

**Forward path — single purchase**

- Pre-fetches `ingredient.unit`, calls `convert()`, throws magic-prefix error on null, rounds the result.
  [`inventory.actions.ts:436`](../../cafe-mgmt/src/actions/inventory.actions.ts#L436)

**Forward path — bulk purchase**

- Pre-fetches all storage units in one query; per-line `convert()` + `Math.round`; fail-fast (no fallback to raw values) if any line is missing from the cafe (iter 1 patch).
  [`inventory.actions.ts:565`](../../cafe-mgmt/src/actions/inventory.actions.ts#L565)

**Third write path — supplier ORDERED (iter 1 patch — recon-missed)**

- `logCallOutcome` ORDERED writes `IngredientPurchase`; pre-validates + converts before opening the txn.
  [`supplier.actions.ts:222`](../../cafe-mgmt/src/actions/supplier.actions.ts#L222)

**Backfill script**

- Normalizes legacy `ml`→`mL` ingredient units, `pcs`→`each` purchase units; converts the 5 historical mismatched purchases to storage units; bumps today's `InventoryCount` by per-purchase delta. Idempotent.
  [`scripts/backfill-purchase-units.ts`](../../cafe-mgmt/scripts/backfill-purchase-units.ts)

**Tests**

- 4 new tests + iter-1 fixes to the bulk test infrastructure (`bindTransaction` mirrors txn-side ingredient mock to the prisma-level pre-validation).
  [`inventory.actions.test.ts`](../../cafe-mgmt/src/actions/inventory.actions.test.ts)

