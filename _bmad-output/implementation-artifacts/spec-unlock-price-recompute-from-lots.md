---
title: 'Unlocking ingredient cost does not refresh the displayed price from FIFO lots'
type: 'bugfix'
created: '2026-05-04'
status: 'done'
context: []
baseline_commit: '5712db434b7d94ac82e0e7af1e15c68f7109e6fe'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When a manager unlocks an ingredient's cost on `/ingredients` (`manualCostOverride: true → false`), the displayed cost cell stays at the previously-locked manual value instead of switching to the FIFO-derived per-unit price (oldest non-empty lot's `totalPriceInCents / quantity`). The bug isn't in the server: `currentCostPerUnit` (`src/lib/fifo.ts:111`) returns the right value when re-evaluated. The bug is that the spreadsheet's optimistic toggle handler (`handleToggleOverride` in `ingredient-spreadsheet.tsx:467-490`) flips `manualCostOverride` in local state but never recomputes `derivedCostPerUnitInCents` — that field was set once at server-render time, so the cell keeps rendering the stale manual cost until the user navigates or refreshes.

**Approach:** Recompute `derivedCostPerUnitInCents` client-side at the moment of toggle, using lot data that's already loaded into the row (`ingredient.ingredientPurchases`). To avoid duplicating the "oldest non-empty lot" rule between `ingredients/page.tsx` (server) and the spreadsheet (client), extract a small pure helper into `src/lib/fifo.ts` and call it from both places. Then `handleToggleOverride` patches both fields atomically in the optimistic state — the cost cell updates instantly when the lock toggles.

## Boundaries & Constraints

**Always:**
- The "oldest non-empty lot" rule must remain `[createdAt asc, id asc]` with `remainingQuantity > 0` — must match `consumeFifo` ordering exactly so display and consumption agree on which lot is "next".
- `currentCostPerUnit` precedence stays unchanged: override → manual cost; otherwise oldest lot's per-unit; fall back to manual cost; null if neither.
- The new helper accepts the client-shaped `IngredientPurchaseRow[]` (where `createdAt` is an ISO string) AND the server-shaped lot rows (where `createdAt` is a `Date`) — pick a normalized input shape and converge both call sites on it.
- Optimistic UX preserved: the lock icon AND the cost cell flip together within the same React commit — no perceptible lag.

**Ask First:** None — bug is isolated and the fix shape is determined.

**Never:**
- Don't change `currentCostPerUnit`'s public signature or precedence rules. Other callers depend on it.
- Don't trigger a `router.refresh()` on toggle. Round-tripping defeats the optimistic UX and adds a flicker; this is purely a display-state sync issue solvable client-side.
- Don't change any server action (`setManualCostOverride` is correct as-is — it persists the lock flip; the bug is purely UI state).
- Don't restructure the spreadsheet's row state or split the `Ingredient` type — touch the toggle handler only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unlock with live lots | `manualCostOverride: true` (manual = $1.50), 2 lots: oldest with remaining=8/10 at totalPrice=$8.00 | After click: `manualCostOverride: false`, displayed cost = $0.80/unit ($8.00/10) | N/A |
| Unlock with no lots | `manualCostOverride: true`, no lots ever (or all depleted) | After click: `manualCostOverride: false`, displayed cost falls back to manual cost = $1.50 (unchanged display) | N/A |
| Lock again | `manualCostOverride: false` (auto = $0.80) | After click: `manualCostOverride: true`, displayed cost shows manual cost ($1.50) — currently editable | N/A |
| Toggle while action in flight | User clicks lock toggle twice rapidly | Optimistic state already handles flip-flop; the cost recompute mirrors that flip-flop | Existing rollback path covers action failure |
| Action persistence fails | Server returns error after optimistic flip | Existing rollback restores `manualCostOverride`; recomputed `derivedCostPerUnitInCents` rolls back too (recompute it again from the previous override value) | Toast shown |
| Identical-millisecond lots | Two purchases for same ingredient with same `createdAt` | Tie-break on id ascending — matches `consumeFifo` and the FIFO breakdown popup | N/A |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/src/lib/fifo.ts` -- add `findOldestNonEmptyLot` helper (and matching test in `fifo.test.ts`)
- `cafe-mgmt/src/lib/fifo.test.ts` -- add unit tests for the new helper
- `cafe-mgmt/src/app/(app)/ingredients/page.tsx` -- replace the inline oldest-lot computation (lines ~72-93) with a call to the new helper
- `cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx` -- in `handleToggleOverride` (lines 467-490): import the helper + `currentCostPerUnit`, recompute `derivedCostPerUnitInCents` from the row's `ingredientPurchases`, patch both fields in optimistic state, and ensure the rollback path also restores the previous derived value
- `cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.test.tsx` -- add a test that flipping lock → unlock immediately switches the cell from manual cost to lot-derived cost

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/src/lib/fifo.ts` -- added `findOldestNonEmptyLot` accepting `PurchaseLotInput[]` (Date or ISO-string createdAt), tie-break by id ascending matching `consumeFifo`
- [x] `cafe-mgmt/src/lib/fifo.test.ts` -- 6 tests: empty, all-depleted, single live lot, multiple-lots pick oldest, identical-ms id tie-break, accepts ISO-string createdAt
- [x] `cafe-mgmt/src/app/(app)/ingredients/page.tsx` -- replaced inline oldest-lot computation with a per-ingredient `findOldestNonEmptyLot` call. Built a single `purchasesByIngredient` index up-front so it's O(N) total, not O(N×M).
- [x] `cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx` -- imported `currentCostPerUnit` + `findOldestNonEmptyLot`; `handleToggleOverride` now captures `wasDerivedCost`, recomputes `newDerivedCost` from the row's lots, patches both fields atomically in optimistic state, and rolls back both on action failure
- [x] `cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.test.tsx` -- 3 new tests in a dedicated describe: unlock with live lots → "(Auto) $0.80" instantly; unlock with no lots → "(Auto) $1.50" fallback; action failure → both fields roll back

**Acceptance Criteria:**
- Given an ingredient locked at $1.50 with at least one live FIFO lot of differing per-unit cost, when the manager clicks the lock icon to unlock, then the cost cell updates within the same React commit (no navigation, no refresh) to display the lot-derived per-unit cost prefixed by "(Auto)".
- Given an ingredient locked at $1.50 with NO live lots (none ever, or all depleted), when the manager clicks unlock, then the cost cell shows "(Auto) $1.50" — the manual cost is the fallback per the existing precedence rule.
- Given an ingredient unlocked with auto cost displayed, when the manager clicks the lock icon to relock, then the cell flips to an editable input pre-populated with the previous manual cost (existing behavior).
- Given a unit test that simulates the toggle, when `setManualCostOverride` is mocked to fail, then the optimistic flip is reverted — both `manualCostOverride` and the displayed cost return to their pre-click values.
- Given the new helper is invoked with two lots sharing identical `createdAt`, when sorted, then the lot with the alphabetically-smaller `id` wins (matches `consumeFifo`'s tie-break — verifiable by an explicit test).

## Verification

**Commands:**
- `cd cafe-mgmt && npx vitest run src/lib/fifo.test.ts src/components/ingredients/` -- expected: all tests pass including new helper + toggle tests
- `cd cafe-mgmt && npm run build` -- expected: clean build, no TS errors
- `cd cafe-mgmt && npx vitest run` -- expected: full unit suite still passes

**Manual checks:**
- Dev server on :4000 → log a purchase that creates a live lot with a per-unit cost different from the ingredient's current manual cost → open `/ingredients` → click the lock icon on that row → confirm the cost cell immediately switches from the manual value to the lot-derived value, prefixed with "(Auto)". Click lock again → confirm it returns to an editable input with the prior manual value.

## Spec Change Log

### Iteration 1 — review patches (2026-05-04)

Two patch-class findings applied to `findOldestNonEmptyLot`:

1. **`quantity = 0` defense** — added `|| p.quantity <= 0` to the skip condition. "Non-empty" should mean both `remainingQuantity > 0` (live stock) AND `quantity > 0` (a divisor for per-unit math). `currentCostPerUnit` already guarded its own division, but other future callers using `OldestLot` directly would div-by-zero. Centralizing the guard at the source.
2. **NaN-time poisoning defense** — added `if (!Number.isFinite(createdAtMs)) continue;`. Without it, an invalid first ISO string would set `best` (because `best === null` short-circuits the comparison), then no later valid lot could dethrone it (all `NaN < x` are false). Added two regression tests (single invalid + valid recovery; all-invalid → null).

KEEP: the `[createdAt asc, id asc]` tie-break (matches `consumeFifo` for cuids — verified); the dual `Date | string` createdAt input shape (server passes `Date`, client passes ISO string from the serialized payload); the `OldestLot` return shape (preserved for `currentCostPerUnit` compatibility).

## Suggested Review Order

**Entry point**

- The new helper. Pure, fully unit-tested. Read this first to see the FIFO ordering rule it codifies.
  [`fifo.ts:124`](../../cafe-mgmt/src/lib/fifo.ts#L124)

**Bug fix — client-side recompute**

- The actual fix: optimistic flip now patches both `manualCostOverride` AND `derivedCostPerUnitInCents`, atomically.
  [`ingredient-spreadsheet.tsx:469`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L469)

**Server-side dedup**

- Same helper now used server-side, replacing 28 lines of inline duplicate logic.
  [`ingredients/page.tsx:66`](../../cafe-mgmt/src/app/(app)/ingredients/page.tsx#L66)

**Tests**

- Helper tests — every ordering invariant + the two new defensive cases (zero-quantity skip + NaN-time skip).
  [`fifo.test.ts`](../../cafe-mgmt/src/lib/fifo.test.ts)

- Toggle wiring tests — unlock with live lots immediately shows lot-derived cost; unlock with no lots falls back to manual; action failure rolls both fields back.
  [`ingredient-spreadsheet.test.tsx`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.test.tsx)
