---
title: 'Cafe-managed enabled-units picker for ingredient/purchase/supplier forms'
type: 'feature'
created: '2026-05-04'
status: 'done'
context: []
baseline_commit: '5712db434b7d94ac82e0e7af1e15c68f7109e6fe'
---

<frozen-after-approval reason="human-owned intent — do not modify unit unless human renegotiates">

## Intent

**Problem:** Every place a unit gets entered today is a freeform `<input placeholder="kg">`. There's no validation, no consistency between cafes, and typos like "kgs" / "Kg " silently break inventory matching across forms. Managers want a controlled vocabulary of units, picker UI everywhere units are entered, and the ability to enable/disable which units are available per cafe.

**Approach:** Add a per-cafe enabled-units list (`Cafe.enabledUnits String[]` Postgres array, default `["kg", "g", "L", "mL", "each"]`). New "Units" section on `/settings` lets managers toggle units from a built-in catalog (mass / volume / count) and add custom units. Replace every freeform unit `<input>` with a shared `<UnitPicker>` `<select>` whose options are the cafe's enabled units. For existing data carrying a unit not in the enabled list (legacy / pre-toggle ingredients), the picker auto-includes that one value as a one-off option labeled "(custom)" so the manager can keep it or change it without losing the form. **No math change** — units remain stored as freeform strings; the picker just constrains input.

## Boundaries & Constraints

**Always:**
- Single source of truth: `Cafe.enabledUnits` (string[]). The shared `<UnitPicker>` component reads this list and renders a `<select>`.
- Strict picker: no "Other..." escape hatch in input forms. To use a new unit, the manager adds it in settings first.
- Legacy-value tolerance: if a row's stored `unit` isn't in the enabled list, the picker prepends it as a "(custom)" option so the form stays usable. The manager can keep the value or pick a different one.
- Built-in catalog the settings page surfaces: mass (`kg`, `g`, `oz`, `lb`), volume (`L`, `mL`, `fl_oz`, `cup`, `tsp`, `tbsp`), count (`each`, `dozen`). Manager toggles each on/off.
- Custom units: settings page also lets the manager add an arbitrary string (validated: 1-20 chars, no whitespace at boundaries) and remove it later.
- New cafe default: `["kg", "g", "L", "mL", "each"]`.
- MANAGER-only writes to `enabledUnits`. STAFF can read.

**Ask First:** None — defaults established at clarification step.

**Never:**
- Don't add unit conversion. Picker only constrains input — `kg` and `g` remain incompatible at the data layer (a separate, much larger story would be needed for math conversion).
- Don't change the `unit String` columns on Ingredient / IngredientSupplier / IngredientPurchase. Stays freeform-typed at the DB level for backward compatibility.
- Don't validate unit-vs-dimension on save (no MASS/VOLUME enforcement). The picker just lists what's enabled — the manager picks responsibly.
- Don't migrate existing data. Pre-toggle units stay as-stored; legacy-value tolerance handles them.
- Don't remove a unit from a cafe's enabled list with side effects: deactivating a unit only stops it appearing in NEW form options. Existing rows keep their stored unit (and see it as "(custom)" in pickers).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output | Error Handling |
|----------|--------------|-----------------|----------------|
| Fresh cafe, default units | New cafe, no overrides | `enabledUnits = ["kg", "g", "L", "mL", "each"]`; pickers show those 5 | N/A |
| Manager enables a built-in unit | Toggle "tsp" on | `enabledUnits` gains `"tsp"`; all pickers show it next render | Toast on action failure |
| Manager disables a unit currently in use | "kg" disabled; existing ingredients have `unit: "kg"` | `enabledUnits` no longer includes "kg"; pickers on those ingredients still show "kg (custom)" | N/A — non-destructive |
| Manager adds a custom unit | Type "scoop" → save | `enabledUnits` gains `"scoop"`; picker shows it | Reject empty / >20 char / leading/trailing whitespace |
| Manager removes a custom unit | Click trash on "scoop" | `enabledUnits` loses `"scoop"`; ingredients still using it see "scoop (custom)" | N/A |
| Picker on legacy data | Ingredient stored as `"kgs"` (typo); not in enabled list | Picker prepends `"kgs (custom)"` as the selected option | N/A |
| Picker on a brand-new row | No prior unit value | Defaults to first enabled unit (or empty if none enabled) | N/A |
| All units disabled | `enabledUnits` is empty array | Picker shows only "(custom)" of any current value, OR empty if also no value | Settings page warns "Enable at least one unit" |
| STAFF tries to update enabledUnits | Action called by STAFF | Returns "Unauthorized"; no DB write | Toast |
| Duplicate enable | Manager toggles "kg" on when already enabled | Action de-duplicates — no error, no double entry | N/A |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/prisma/schema.prisma` -- `Cafe`: add `enabledUnits String[] @default(["kg", "g", "L", "mL", "each"])` + migration
- `cafe-mgmt/src/lib/units.ts` -- **NEW** — exports the built-in catalog grouped by dimension, validation helper for custom units, the default list constant
- `cafe-mgmt/src/lib/units.test.ts` -- **NEW** — covers the validation helper + catalog shape
- `cafe-mgmt/src/actions/setup.actions.ts` -- add `setCafeEnabledUnits(units: string[])` (MANAGER-only, dedup, validate each value, return `ActionResult<{ enabledUnits: string[] }>`)
- `cafe-mgmt/src/actions/setup.actions.test.ts` -- tests for the new action: happy-path enable/disable, dedup, STAFF rejected, validation rejection
- `cafe-mgmt/src/components/ui/unit-picker.tsx` -- **NEW** — shared `<select>` component. Props: `value`, `onChange`, `enabledUnits`, `aria-label`, `disabled?`. Prepends the current value as a "(custom)" option when not in `enabledUnits`.
- `cafe-mgmt/src/components/ui/unit-picker.test.tsx` -- **NEW** — covers: renders enabled options; legacy value gets "(custom)" prepend; emits onChange; disabled state.
- `cafe-mgmt/src/components/settings/enabled-units.tsx` -- **NEW** — settings UI: groups checkboxes by dimension (mass/volume/count) + an "Add custom unit" inline input + per-custom-unit remove button. Optimistic state with rollback on action failure.
- `cafe-mgmt/src/components/settings/enabled-units.test.tsx` -- **NEW** — covers: toggle a built-in, add+remove a custom, disabled state for STAFF, error rollback, empty-state warning.
- `cafe-mgmt/src/app/(app)/settings/page.tsx` -- load `cafe.enabledUnits`, render `<EnabledUnitsEditor />` in a new section.
- `cafe-mgmt/src/components/purchases/purchases-form.tsx:586-596,640-647` -- replace 2 freeform unit inputs with `<UnitPicker>`. Component accepts `enabledUnits` prop from page-level wiring.
- `cafe-mgmt/src/app/(app)/purchases/page.tsx` -- load `cafe.enabledUnits`; pass to `<PurchasesForm>`.
- `cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx:995` -- replace "New ingredient unit" input with `<UnitPicker>`.
- `cafe-mgmt/src/app/(app)/ingredients/page.tsx` -- load `cafe.enabledUnits`; pass to `<IngredientSpreadsheet>`.
- `cafe-mgmt/src/components/ingredients/ingredient-suppliers-panel.tsx:425` -- swap unit input.
- `cafe-mgmt/src/components/operations/supplier-list.tsx:665,784` -- swap unit inputs (2 places).
- `cafe-mgmt/src/components/operations/supplier-detail.tsx:624` -- swap unit input. Each of these 4 sites: parent server component already loads cafe-scoped data; thread `enabledUnits` down via props.

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/prisma/schema.prisma` -- added `enabledUnits String[] @default(["kg", "g", "L", "mL", "each"])` + migration `20260504050911_add_cafe_enabled_units`. Prisma client regenerated.
- [x] `cafe-mgmt/src/lib/units.ts` + `cafe-mgmt/src/lib/units.test.ts` -- **NEW** — exports built-in catalog by dimension, `DEFAULT_ENABLED_UNITS`, `validateCustomUnit`, `validateEnabledUnitsList` (de-dup + bounded list), `buildPickerOptions` (legacy "(custom)" prepend). 24 tests.
- [x] `cafe-mgmt/src/actions/setup.actions.ts` + test -- added `setCafeEnabledUnits(units)`. MANAGER-gated; calls `validateEnabledUnitsList` for validation + de-dup; returns `ActionResult<{ enabledUnits }>`. 8 tests.
- [x] `cafe-mgmt/src/components/ui/unit-picker.tsx` + test -- **NEW** — shared `<select>` with `id`/`ariaLabel` for label-association compatibility. Prepends `(custom)` option for legacy values. 5 tests.
- [x] `cafe-mgmt/src/components/settings/enabled-units.tsx` + test -- **NEW** — checkboxes grouped by dimension + custom-unit add/remove + empty-state alert + STAFF read-only. Optimistic with rollback. 12 tests.
- [x] `cafe-mgmt/src/app/(app)/settings/page.tsx` -- loads `cafe.enabledUnits`; renders `<EnabledUnitsEditor>` in a new section.
- [x] Forms refactor -- threaded `enabledUnits` through 5 input sites + 1 wrapper page (inventory):
  - `src/app/(app)/purchases/page.tsx` → `purchases-form.tsx` (2 unit inputs swapped)
  - `src/app/(app)/ingredients/page.tsx` → `ingredient-spreadsheet.tsx` (1 unit input) + `ingredient-suppliers-panel.tsx` (1 unit input via the panel embedded in the spreadsheet)
  - `src/app/(app)/inventory/page.tsx` → `inventory-list.tsx` → `ingredient-suppliers-panel.tsx` (same panel, also embedded here)
  - `src/app/(app)/suppliers/page.tsx` → `supplier-list.tsx` (2 unit inputs: edit + add)
  - `src/app/(app)/suppliers/[id]/page.tsx` → `supplier-detail.tsx` (2 unit inputs: edit + add product)
- [x] Test compatibility -- every consumer of `<UnitPicker>` defaults `enabledUnits` to `DEFAULT_ENABLED_UNITS` so existing form tests keep passing without props churn. Updated one test (`ingredient-spreadsheet`) to assert the unit is **carried forward** after add (not reset) — necessary UX change because a controlled `<select>` with `value=""` and no empty option silently snaps to the first option while keeping state empty.

**Acceptance Criteria:**
- Given a fresh cafe, when the manager opens `/settings` and scrolls to the Units section, then they see the 5 default units checked + the rest of the catalog unchecked + an empty custom-units list.
- Given the manager toggles `tsp` on in settings, when they then open the purchases form (or any other unit input site), then `tsp` appears as an option in every unit picker.
- Given an ingredient with `unit = "kgs"` (typo from before this feature), when the manager opens any form that pickers that ingredient's unit, then the picker shows `kgs (custom)` selected — the manager can keep it or change it.
- Given the manager disables `kg` in settings, when they save and reopen the purchases form, then `kg` no longer appears in NEW unit pickers (but legacy ingredients with `unit: "kg"` still see `kg (custom)` in their row's picker — non-destructive).
- Given the manager types `"scoop"` into the custom-unit add input and saves, when they open any form, then `scoop` appears in every unit picker.
- Given a STAFF user views `/settings`, when they reach the Units section, then the controls are visible but disabled (read-only). If they somehow call `setCafeEnabledUnits`, the action returns "Unauthorized".
- Given the manager has disabled every unit, when they save and reopen `/settings`, then a warning banner appears: "Enable at least one unit so staff can log purchases."

## Verification

**Commands:**
- `cd cafe-mgmt && npx prisma migrate dev --name add_cafe_enabled_units` -- expected: migration created and applied
- `cd cafe-mgmt && npm run build` -- expected: clean build
- `cd cafe-mgmt && npx vitest run` -- expected: all tests pass (existing + new units lib + picker + settings + action tests)

**Manual checks:**
- Dev server on :4000 → `/settings` → confirm the Units section renders with 5 defaults checked. Toggle `tsp` on → save → open `/purchases` and the line-item unit picker → confirm `tsp` is in the dropdown. Disable `kg` → save → confirm `kg` is gone from NEW pickers but still appears in any ingredient already storing `kg` (as "kg (custom)"). Add a custom unit `"scoop"` → confirm it shows everywhere.

## Spec Change Log

### Iteration 1 — review patches (2026-05-04)

Three patch-class findings applied:

1. **Missed surface — `inventory-list.tsx` add-row.** The 5-form scope from the spec missed the inline "add ingredient" form inside `<InventoryList>` (a 6th unit input on `/inventory`). Refactored to use `<UnitPicker>` and threaded `enabledUnits` through; also normalized the previous "Pieces" reset string to `""` so it no longer carries a value that may not be in any cafe's enabled list.
2. **Silent value=""/DOM mismatch in UnitPicker.** A controlled `<select value="">` with no empty `<option>` visually snaps to the first option while React state stays `""`. User would think they picked the displayed unit but the form submits empty. Added a disabled `"Select unit…"` placeholder when `value === "" && options.length > 0`. State and DOM now agree, and existing form validation (`if (!unit) toast(...)`) catches the empty submission cleanly.
3. **`revalidatePath` after settings save.** The action persisted the new list but didn't invalidate any route's server cache, so a manager who toggled a unit and switched tabs would see the stale picker until full navigation. Added `revalidatePath` for `/settings`, `/purchases`, `/ingredients`, `/inventory`, `/suppliers`, and `/suppliers/[id]` (with `"page"` qualifier for the dynamic route).

KEEP: `DEFAULT_ENABLED_UNITS` as the per-component default (test/migration safety net — every parent IS now confirmed to thread the prop, so the default never fires in production paths); the case-sensitive dedup in `validateEnabledUnitsList` (manager-controlled vocabulary; deferred); the `(custom)` legacy-value prepend (non-destructive on disable).

Added 2 regression tests: `unit-picker.test.tsx` for the new placeholder behavior; `setup.actions.test.ts` for the `revalidatePath` calls.

## Suggested Review Order

**Foundation**

- The catalog + validators + picker-options builder. Pure. Fully unit-tested.
  [`units.ts`](../../cafe-mgmt/src/lib/units.ts)

- The new schema field + migration.
  [`schema.prisma:41`](../../cafe-mgmt/prisma/schema.prisma#L41)

  [`migration.sql`](../../cafe-mgmt/prisma/migrations/20260504050911_add_cafe_enabled_units/migration.sql)

**Server + UI plumbing**

- The action — manager-gated, validated, persists, then revalidates every page that pickers units.
  [`setup.actions.ts:574`](../../cafe-mgmt/src/actions/setup.actions.ts#L574)

- Settings UI — checkboxes by dimension + custom-unit add/remove + empty-state alert + STAFF read-only.
  [`enabled-units.tsx`](../../cafe-mgmt/src/components/settings/enabled-units.tsx)

- Settings page wiring.
  [`settings/page.tsx`](../../cafe-mgmt/src/app/(app)/settings/page.tsx)

**Shared picker**

- The `<select>` that replaces every freeform unit `<input>`. Disabled "Select unit…" placeholder closes the silent state-vs-DOM mismatch.
  [`unit-picker.tsx`](../../cafe-mgmt/src/components/ui/unit-picker.tsx)

**Form refactors (6 sites)**

- Purchases form — 2 pickers (line-item unit + new-ingredient unit).
  [`purchases-form.tsx`](../../cafe-mgmt/src/components/purchases/purchases-form.tsx)

- Ingredient spreadsheet add-row — 1 picker; `newUnit` now carried forward across adds (UX win + React-quirk avoidance).
  [`ingredient-spreadsheet.tsx`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx)

- Ingredient suppliers panel new-link — 1 picker.
  [`ingredient-suppliers-panel.tsx`](../../cafe-mgmt/src/components/ingredients/ingredient-suppliers-panel.tsx)

- Inventory list add-row — 1 picker (the missed surface, patched).
  [`inventory-list.tsx`](../../cafe-mgmt/src/components/inventory/inventory-list.tsx)

- Supplier list — 2 pickers (edit + add).
  [`supplier-list.tsx`](../../cafe-mgmt/src/components/operations/supplier-list.tsx)

- Supplier detail — 2 pickers (edit + add product).
  [`supplier-detail.tsx`](../../cafe-mgmt/src/components/operations/supplier-detail.tsx)

**Tests**

- Library + validator (24 tests).
  [`units.test.ts`](../../cafe-mgmt/src/lib/units.test.ts)

- Action (9 tests, including the new `revalidatePath` assertion).
  [`setup.actions.test.ts`](../../cafe-mgmt/src/actions/setup.actions.test.ts)

- Picker (6 tests, including the new placeholder).
  [`unit-picker.test.tsx`](../../cafe-mgmt/src/components/ui/unit-picker.test.tsx)

- Settings UI (12 tests).
  [`enabled-units.test.tsx`](../../cafe-mgmt/src/components/settings/enabled-units.test.tsx)
