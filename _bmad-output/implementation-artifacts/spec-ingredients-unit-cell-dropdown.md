---
title: 'Ingredients spreadsheet: unit cell becomes a dropdown constrained to enabledUnits'
type: 'feature'
created: '2026-05-07'
status: 'done'
context: []
baseline_commit: '958c80b90455e8ddb9d289411c9b144b521c53c4'
---

<frozen-after-approval reason="human-owned intent — do not modify unit unless human renegotiates">

## Intent

**Problem:** On `/ingredients`, the per-row unit cell is a plain text `<input>` that accepts any string. There's no enforcement that the typed value matches the cafe's `enabledUnits`. A previous spec excluded `/ingredients` from the inline-picker work on the wrong premise that "the spreadsheet already has full unit editing" — it does, but it's free-text and lets the user type "gms" or "litres" or anything else. The bottom add-ingredient row uses a `<UnitPicker>` correctly; existing rows do not.

**Approach:** Replace the per-row unit text input with the existing `<UnitPicker>` component, constrained to `enabledUnits` (already plumbed into the spreadsheet via the `enabledUnits` prop). Keep the existing save / optimistic-update / revert-on-failure path unchanged — only the input element changes. Match the `(custom)` legacy-unit handling that the inventory inline picker already uses.

## Boundaries & Constraints

**Always:**
- The unit cell on every existing row is a `<UnitPicker>` constrained to the cafe's `enabledUnits`.
- The current value is preselected even if not in `enabledUnits` — surfaces drift via `UnitPicker`'s built-in `(custom)` prepend.
- Save flow stays identical: on change, call existing `updateIngredient(id, name, unit)` via the existing `handleSaveCell` plumbing; optimistic update; revert on failure with toast.
- `/ingredients` is manager-only at the page level (per existing `requireRole`), so no per-cell role gate is needed — leave the page-level gate as the source of truth.

**Ask First:**
- Whether to also remove the `unit` field from the inline-row "edit" dialog or the click-to-edit name+unit combined flow if any. Spec assumes **leave save plumbing as-is** for this round; cell rendering is the only change.

**Never:**
- Do not change the `updateIngredient` action body, schema, or signature. (Same `updateIngredient` data-corruption risk as `/inventory` — already documented in `deferred-work.md`; out of scope for this spec.)
- Do not auto-convert numeric values when unit changes (label shift only — same convention as everywhere else).
- Do not change the bottom add-ingredient row (already uses `<UnitPicker>` correctly).
- Do not change the `name` cell rendering.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Manager opens `/ingredients`, enabledUnits=["g","kg","mL","L","each"] | Existing rows render | Each row's unit cell is a `<select>` with those 5 options + the current value preselected | N/A |
| Manager picks new unit | Milk's unit changes mL → L | Optimistic update; `updateIngredient(milkId, "Milk", "L")` fires; on success state stays | On `{success:false}`: toast(error); revert to previous unit (existing `handleSaveCell` path) |
| Existing ingredient stored with unit not in enabledUnits | E.g. unit="lbs" | Picker shows "lbs (custom)" preselected | N/A — visible drift |
| Bottom add-ingredient row | Unchanged | Continues to use the `<UnitPicker>` already there | N/A |
| Unit unchanged after select interaction | Manager opens then picks the same value | No action call fires (existing `handleSaveCell` no-op detection) | N/A |

</frozen-after-approval>

## Code Map

- `src/components/ingredients/ingredient-spreadsheet.tsx` — in `CellInput` (around line 1262), branch on `field === "unit"`: render `<UnitPicker>` constrained to `enabledUnits`, value bound to local state, on change call the same `commit()` path the text input uses (no behavior change in save/revert).
- `src/components/ingredients/ingredient-spreadsheet.test.tsx` — add 2 tests: (a) existing row's unit cell renders a `<select>` (combobox role) with the row's unit preselected and options drawn from `enabledUnits`; (b) changing the unit triggers a save call via the existing optimistic-update path.

## Tasks & Acceptance

**Execution:**
- [x] `src/components/ingredients/ingredient-spreadsheet.tsx` — branch on `field === "unit"` in `CellInput` to render `<UnitPicker>` with `enabledUnits`; preserve commit/revert plumbing.
- [x] Verify the unit cell still triggers the same `onSave` as the text input did (no save-flow regression).
- [x] `src/components/ingredients/ingredient-spreadsheet.test.tsx` — add the 2 tests per Code Map.
- [x] Run full verification (build, tests).

**Acceptance Criteria:**
- Given a manager opens `/ingredients` with `enabledUnits=["g","kg","mL","L","each"]`, when the table renders, then each existing row's unit cell is a `<select>` populated with those 5 options and the row's current unit preselected.
- Given the manager picks a new unit on a row, when the picker fires onChange, then `updateIngredient(id, name, newUnit)` is called once with the row's current name and the new unit.
- Given the action returns `{success: false}`, when the handler resolves, then the cell reverts to the previous unit and a toast surfaces the error (same `handleSaveCell` path as today).
- Given an ingredient is stored with a unit not in `enabledUnits` (e.g. "lbs"), when the row renders, then "lbs" is preselected with a "(custom)" indicator (so the manager sees drift).
- Given the bottom add-ingredient row, when it renders, then it continues to render the existing `<UnitPicker>` — unchanged.

## Spec Change Log

## Design Notes

**Reuse `handleSaveCell`.** The current `CellInput` orchestrates `commit()`-on-blur/Enter for text inputs. Switching to `<UnitPicker>` means commit fires on `onChange` (instant, no blur needed), bypassing the keyboard-handling code path that doesn't apply. Wire `onChange` directly to a small wrapper that calls the same `onSave` prop, keeping the success/revert semantics identical to the text path.

**No new data-corruption guard here.** This spec doesn't add any safety to `updateIngredient` itself — that's still in `deferred-work.md` from the `/inventory` spec. The risk profile of changing units on an in-use ingredient is the same here as it is on `/inventory`.

## Verification

**Commands:**
- `cd cafe-mgmt && npx tsc --noEmit` — expected: no new errors
- `cd cafe-mgmt && npx vitest run src/components/ingredients/ingredient-spreadsheet.test.tsx` — expected: existing 46 tests still pass + 2 new tests pass
- `cd cafe-mgmt && npm run build` — expected: clean

**Manual checks:**
- Open `/ingredients` as a manager — confirm each row's unit cell is a dropdown.
- Change Milk's unit from "mL" to "L"; confirm the row immediately reflects "L" and persists across reload.
- Confirm the bottom add-row dropdown is unchanged.

## Suggested Review Order

**The cell branch (start here)**

- `CellInput` branches on `field === "unit"` and renders `<UnitPicker>`; `commit()` widened to accept an explicit `nextValue` so the picker doesn't race React state batching.
  [`ingredient-spreadsheet.tsx:1319`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L1319)

**Prop ripple**

- `Cell` and `CellInput` gain optional `enabledUnits?: string[]`; only the unit-cell call site passes it.
  [`ingredient-spreadsheet.tsx:1244`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L1244)

**Unchanged save plumbing (parity check)**

- `handleSaveCell` for `name`/`unit` is the same code path as before — optimistic `setIngredients`, `updateIngredient(id, name, unit)`, revert + toast on failure.
  [`ingredient-spreadsheet.tsx:272`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L272)

**(custom) suffix removed (iter 1, per user direction)**

- `buildPickerOptions` no longer suffixes legacy units with " (custom)". Affects every `<UnitPicker>` consumer — including the `/inventory` inline picker and the bottom add-ingredient row.
  [`units.ts:110`](../../cafe-mgmt/src/lib/units.ts#L110)

**Tests**

- 3 tests: dropdown render, optimistic-success update, revert-on-failure (iter 1 added). Plus updated `units.test.ts` and `unit-picker.test.tsx` for the dropped suffix.
  [`ingredient-spreadsheet.test.tsx`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.test.tsx)

