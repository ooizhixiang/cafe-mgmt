---
title: 'Inventory rows: inline unit dropdown constrained to enabledUnits'
type: 'feature'
created: '2026-05-07'
status: 'done'
context: []
baseline_commit: '59bd7a9b3a101391bea8434e671f3491dd9fe86e'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On `/inventory`, the ingredient unit displays as static parenthesized text (`Milk (mL)`). To change a unit, the manager has to click the Edit pencil, open a form, edit, save. Two extra clicks for what should be one. Worse, there's no enforcement at the display layer that the shown unit is actually one of the cafe's currently-enabled units — if `enabledUnits` is changed in settings, an ingredient stuck on a now-disabled unit is invisible drift.

**Approach:** Replace the parenthesized `({ing.unit})` text on each inventory row with an inline `UnitPicker` constrained to `enabledUnits`. Manager-only — staff still see the unit as read-only text. On change, call the existing `updateIngredient(id, name, newUnit)` action (already manager-only). No conversion of stored numeric values — same semantics as the existing Edit-form path: 500 g becomes 500 kg if the unit is changed (label shift, not numeric conversion). Existing Edit pencil stays for now.

## Boundaries & Constraints

**Always:**
- The inline picker is constrained to the cafe's `enabledUnits` array (already plumbed into `InventoryList` via the `enabledUnits` prop).
- Manager-only: render as `<UnitPicker mode="manager" />` for managers, `mode="readonly"` (or static text) for staff. Mirror the role pattern already used elsewhere in this component.
- On change, call existing `updateIngredient(id, name, newUnit)` server action; on success, update local state optimistically; on failure, toast and revert.
- The current ingredient unit is preselected in the dropdown even if it's no longer in `enabledUnits` (so we surface drift rather than silently dropping it). Use the `UnitPicker` component's existing handling for this if it supports it; otherwise include the current value as an extra option labeled accordingly.

**Ask First:**
- Whether to also remove the `unit` field from the existing Edit form (to avoid two redundant editing paths). Spec assumes **leave it in place** for this round; cleanup deferred.

**Never:**
- Do not auto-convert stored numeric values when unit changes. (Same as current Edit-form behavior; preserves current invariant.)
- Do not let staff change units inline. They must still go through a manager.
- Do not touch the `updateIngredient` action body, schema, or API surface.
- Do not expand this to the `/ingredients` spreadsheet — that page already has full unit editing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Manager opens `/inventory` | enabledUnits = ["g","kg","mL","L","each"] | Each row's unit shows as a `<select>` dropdown with those 5 options | N/A |
| Staff opens `/inventory` | Same enabledUnits | Each row's unit shows as static parenthesized text (read-only) | N/A |
| Manager picks a new unit | Milk's unit changes from "mL" → "L" | Optimistic UI update; `updateIngredient(milkId, "Milk", "L")` fires; on success state stays | On `{success:false}`: toast(error); revert select value |
| Ingredient currently uses a unit no longer in `enabledUnits` | E.g. unit="lbs", enabledUnits doesn't include "lbs" | Dropdown still shows "lbs" as the selected option (so the manager can see and fix it) | N/A |
| Unit unchanged | Manager opens then closes the picker without changing | No action call fires | N/A |

</frozen-after-approval>

## Code Map

- `src/components/inventory/inventory-list.tsx` — replace the line `<span ...>({ing.unit})</span>` (around line 544) with: `{isManager ? <inline UnitPicker> : <span>({ing.unit})</span>}`. Wire the picker's `onChange` to call `updateIngredient(ing.id, ing.name, newUnit)` inside `startTransition`, optimistically update `ingredients` state, and revert on failure with a toast. Reuse `enabledUnits` already in scope. Reuse `updateIngredient` already imported.
- `src/components/inventory/inventory-list.test.tsx` — add 2 tests: (a) manager view renders a unit `<select>` per row with options matching `enabledUnits`; (b) changing a unit triggers `updateIngredient(id, name, newUnit)` and updates the row's unit display.

## Tasks & Acceptance

**Execution:**
- [x] `src/components/inventory/inventory-list.tsx` — replace the inline unit text with a manager-only `UnitPicker`; wire `onChange` to `updateIngredient` with optimistic update + revert on failure
- [x] Same file — staff role keeps the existing read-only `({ing.unit})` text
- [x] Same file — preselect the current `ing.unit` even if not in `enabledUnits` (surface drift)
- [x] `src/components/inventory/inventory-list.test.tsx` — add the 2 tests
- [x] Run full verification (build, tests)

**Acceptance Criteria:**
- Given a manager opens `/inventory`, when the page renders, then each ingredient row's unit is a `<select>` populated with options drawn from the cafe's `enabledUnits`.
- Given a staff user opens `/inventory`, when the page renders, then each ingredient row's unit is a read-only label (no `<select>`).
- Given a manager changes Milk's unit from "mL" to "L", when the change handler fires, then `updateIngredient(milkId, "Milk", "L")` is called once, the row's display updates immediately, and on success the state persists.
- Given the action returns `{ success: false }`, when the handler resolves, then the row's unit display reverts to the prior value and a toast surfaces the error.
- Given an ingredient's stored unit is not in the current `enabledUnits` (e.g. legacy "lbs"), when the dropdown renders, then "lbs" is shown as the currently-selected option (not silently dropped).

## Spec Change Log

## Design Notes

**Why keep the Edit pencil for now.** Removing the unit field from the Edit form is the cleanup that goes with this — but it touches the edit-form flow which has its own rendering and validation. Spec keeps it in place for this round to keep the diff small; the redundancy is mild and removing it is its own follow-up.

**Why no auto-conversion on unit change.** Auto-converting stored quantities (e.g. 500g → 0.5 kg) sounds nice but creates rounding traps and breaks recipe references that already encode quantities in the old unit. Convention here is "label shift, not numeric conversion" — same as the existing Edit-form path.

## Verification

**Commands:**
- `cd cafe-mgmt && npx tsc --noEmit` — expected: no new errors
- `cd cafe-mgmt && npx vitest run src/components/inventory/inventory-list.test.tsx` — expected: existing tests pass + 2 new tests pass
- `cd cafe-mgmt && npm run build` — expected: clean

**Manual checks:**
- Open `/inventory` as a manager — confirm each row's unit is a dropdown with enabledUnits options.
- Change Milk's unit from "mL" to "L"; confirm the row immediately reflects "L" and the page persists across reload.
- Switch to a staff account — confirm units are read-only text.

## Suggested Review Order

**The change handler (start here)**

- Optimistic update + per-ingredient request-id guard + try/catch + stale-revert suppression (iter 1 patches).
  [`inventory-list.tsx:213`](../../cafe-mgmt/src/components/inventory/inventory-list.tsx#L213)

**The role-gated picker**

- `<UnitPicker>` for managers (constrained to `enabledUnits`), read-only span for staff.
  [`inventory-list.tsx:577`](../../cafe-mgmt/src/components/inventory/inventory-list.tsx#L577)

**Tests**

- 3 tests: render with options, optimistic success update, revert-on-failure (iter 1 added).
  [`inventory-list.test.tsx`](../../cafe-mgmt/src/components/inventory/inventory-list.test.tsx)

**⚠️ See `deferred-work.md`** — the underlying `updateIngredient` action lacks guardrails against unit-change-induced data corruption. Pre-existing risk amplified by this discoverability change. Worth a follow-up spec.

