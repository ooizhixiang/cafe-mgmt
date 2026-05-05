---
title: 'Per-ingredient display unit on the inventory tab (within-dimension conversion)'
type: 'feature'
created: '2026-05-04'
status: 'done'
context: []
baseline_commit: '5712db434b7d94ac82e0e7af1e15c68f7109e6fe'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Managers buy in big units (1 L milk) but recipes consume small ones (10 mL per serving). Today's inventory tab renders quantities in the ingredient's stored `unit` — so a 1-L jug shows as "1 L" even though the manager would rather see "1000 mL" so it lines up with recipe usage. There's no per-ingredient way to override the display.

**Approach:** Add `Ingredient.displayUnit String?` (default null → no conversion, fully backward-compatible). When set, the inventory page and inventory-detail dialog convert stored quantities into the display unit at render time using a hardcoded within-dimension table (mass via `g`, volume via `mL`, count via `each`). **Display-only** — no FIFO, no purchase, no sales, no recipe code touched. Storage stays in the ingredient's `unit` exactly as today.

## Boundaries & Constraints

**Always:**
- Conversion happens **only on the inventory surface**: `/inventory` (the list view) and the `<InventoryDetailDialog>` opened from `/ingredients`. All other surfaces (purchases, recipes, supplier list, supplier detail) continue to render the stored `unit` verbatim — no display-unit transformation.
- Conversion table is within-dimension only:
  - **Mass** (base `g`): `kg=1000`, `lb=453.592`, `oz=28.3495`
  - **Volume** (base `mL`): `L=1000`, `fl_oz=29.5735`, `cup=236.588`, `tbsp=14.7868`, `tsp=4.92892`
  - **Count** (base `each`): `dozen=12`
- The display-unit picker only offers values in the SAME dimension as `ingredient.unit`. Cross-dimension is structurally impossible from the UI.
- `displayUnit` defaults to null. When null, render the stored `unit` exactly as today (zero behavioral change for existing data).
- The displayed quantity is **rounded to two fractional digits** for sub-unit conversions (e.g., 14.79 mL not 14.7868 mL); whole-number results render without a decimal.
- Manager-only edit. STAFF can view but not change.

**Ask First:** None — defaults established at clarification.

**Never:**
- Don't add cross-dimension conversion (no density lookup, no mass↔volume).
- Don't change `Ingredient.unit` — that stays the storage unit.
- Don't change FIFO consumption, lot accounting, or any cost computation. The conversion is a render-time function only.
- Don't change `IngredientPurchase.unit` or `IngredientPurchase.quantity` semantics. Purchase rows render in their stored unit on the purchase-history surface.
- Don't apply conversion on `/recipes`, `/purchases`, `/suppliers`, or `/suppliers/[id]`. Out of scope.
- Don't migrate existing rows. Pre-existing ingredients get null display unit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output | Error Handling |
|----------|--------------|-----------------|----------------|
| Default (no display unit) | Milk: `unit="L"`, `displayUnit=null`, today=2 | Inventory shows "2 L" (today's behavior) | N/A |
| Big → small | Milk: `unit="L"`, `displayUnit="mL"`, today=2 | Inventory shows "2000 mL" | N/A |
| Small → big | Sugar: `unit="g"`, `displayUnit="kg"`, today=500 | Inventory shows "0.5 kg" | N/A |
| Same unit selected | Milk: `unit="L"`, `displayUnit="L"` | Renders "2 L" — conversion factor 1, equivalent to null | N/A |
| Sub-unit fraction | Milk: `unit="L"`, `displayUnit="fl_oz"`, today=1 | Renders "33.81 fl_oz" (rounded to 2 decimals) | N/A |
| Picker on `unit="kg"` ingredient | Manager opens display-unit picker | Picker shows mass options only (g, kg, lb, oz) | N/A |
| Stored `unit` not in any dimension (custom) | `unit="scoop"` (custom-enabled unit) | Picker shows "(none — only convertible units)" placeholder; saving picker is disabled | N/A |
| `displayUnit` references a stale value | Manager set `displayUnit="mL"`, then changed `unit="kg"` | Conversion fails (incompatible dimensions); UI falls back to stored unit and silently surfaces a "(check display unit)" hint on that row | N/A |
| Inventory detail dialog | Opened for an ingredient with display unit | Per-lot quantities + supplier total subtitles render in the display unit | N/A |
| STAFF tries to save | STAFF role | Picker is disabled; if action somehow called, returns "Unauthorized" | N/A |
| Today=0 | Any setup | Renders "0 {displayUnit}" — zero is a real value | N/A |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/prisma/schema.prisma` -- `Ingredient`: add `displayUnit String?` + migration
- `cafe-mgmt/src/lib/unit-conversion.ts` -- **NEW** — exports `UNIT_DIMENSIONS: Record<string, "mass" | "volume" | "count">`, `convert(qty, from, to): number | null`, `dimensionOf(unit): "mass" | "volume" | "count" | null`, `formatConvertedQuantity(qty: number): string`
- `cafe-mgmt/src/lib/unit-conversion.test.ts` -- **NEW** — covers every conversion direction, cross-dimension rejection, unknown-unit rejection, formatting rule
- `cafe-mgmt/src/actions/inventory.actions.ts` -- add `updateIngredientDisplayUnit(ingredientId, displayUnit)` (MANAGER-only, validates that displayUnit is null or in the same dimension as the ingredient's unit; `revalidatePath("/inventory")` + `revalidatePath("/ingredients")`)
- `cafe-mgmt/src/actions/inventory.actions.test.ts` -- tests for the new action
- `cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx` -- add a "Display unit" column with a `<UnitPicker>`-style dropdown filtered to compatible units (manager-only); thread the new field
- `cafe-mgmt/src/components/inventory/inventory-list.tsx` -- accept `displayUnit` per ingredient; use `convert()` on `todayCount` / `previousCount` for rendering; show the display-unit label next to the value
- `cafe-mgmt/src/app/(app)/inventory/page.tsx` -- include `displayUnit` in the projection
- `cafe-mgmt/src/components/ingredients/inventory-detail-dialog.tsx` -- accept `displayUnit`; convert the lot `remainingQuantity` / `quantity` and supplier total subtitle in the same way

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/prisma/schema.prisma` -- added `displayUnit String?` + migration `20260504072216_add_ingredient_display_unit`. Prisma client regenerated.
- [x] `cafe-mgmt/src/lib/unit-conversion.ts` + test -- **NEW** — `convert`, `dimensionOf`, `formatConvertedQuantity`, `compatibleUnits`. 20 tests covering every direction, cross-dimension rejection, unknown-unit, formatting + float-drift tolerance.
- [x] `cafe-mgmt/src/actions/inventory.actions.ts` -- added `updateIngredientDisplayUnit(input)`. MANAGER-gated; cafe-scoped ingredient lookup; rejects cross-dimension OR unknown displayUnit; revalidates `/inventory` + `/ingredients`. 7 tests.
- [x] `cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx` -- added "Display" column, per-row `<select>` filtered by `compatibleUnits(ing.unit)` with "(same as unit)" placeholder; renders "—" when ingredient.unit has no known dimension; `handleSaveDisplayUnit` with optimistic + rollback. ColSpans bumped 12→13 in 3 places; sticky add-row got an empty placeholder cell.
- [x] `cafe-mgmt/src/components/inventory/inventory-list.tsx` -- accepts `displayUnit` on each `IngredientCount`; renders an "≈ {converted} {displayUnit}" hint above the stepper when set AND the conversion is compatible. Stepper itself stays in storage unit (integer-safe stepping; conversion is display only).
- [x] `cafe-mgmt/src/app/(app)/inventory/page.tsx` + `cafe-mgmt/src/app/(app)/ingredients/page.tsx` -- both projections include `displayUnit: true` and pass it through.
- [x] `cafe-mgmt/src/components/ingredients/inventory-detail-dialog.tsx` -- new `displayUnit` prop; new `renderQty` helper converts each lot's `remainingQuantity`/`quantity` and the supplier-total subtitle; falls back to lot's stored unit when conversion is incompatible.
- [x] `cafe-mgmt/src/components/ingredients/inventory-detail-dialog.test.tsx` -- 3 new tests: 1L lot with displayUnit=mL renders as "1000/1000 mL"; null displayUnit falls back; cross-dimension displayUnit falls back.

**Acceptance Criteria:**
- Given milk with `unit="L"` and `displayUnit="mL"` and today's count = 2, when the manager opens `/inventory`, then milk's row shows "2000 mL".
- Given the same setup, when the manager opens `/ingredients` → click "View inventory details" on milk, then the lot rows render quantities in mL (e.g., a 1-L lot shows "1000/1000 mL").
- Given milk with `displayUnit=null`, when `/inventory` loads, then the row shows "2 L" — exactly as today (no behavioral change).
- Given the manager opens the display-unit picker on a `kg` ingredient, when the dropdown renders, then it shows only mass-dimension units (g, kg, lb, oz) — never volume or count.
- Given an ingredient whose `unit` is a custom value with no known dimension (e.g., "scoop"), when the picker renders, then it shows a non-interactive "—" placeholder with a tooltip explaining display conversion is only available for standard mass / volume / count units.
- Given a STAFF user opens `/ingredients`, when they reach the Display Unit column, then the picker is disabled.
- Given the manager calls the action with `displayUnit` in a different dimension than `ingredient.unit`, when validation runs, then the action returns an error and no DB write occurs.
- Given the action call from a STAFF role, when invoked, then it returns "Unauthorized".
- Given purchase history, recipes, suppliers — when those pages load, then quantities continue to render in the stored unit (display-unit conversion does NOT leak into those surfaces).

## Verification

**Commands:**
- `cd cafe-mgmt && npx prisma migrate dev --name add_ingredient_display_unit` -- migration applied
- `cd cafe-mgmt && npm run build` -- clean build
- `cd cafe-mgmt && npx vitest run` -- all tests pass

**Manual checks:**
- Dev server on :4000 → `/ingredients` → set milk's display unit to mL → `/inventory` → milk row now shows the count in mL with the mL label. Open the inventory-detail dialog from the ingredient row → confirm lots render in mL too. Visit `/purchases` and confirm purchases still render in their stored unit (L) — no leak.

## Spec Change Log

### Iteration 1 — review patches (2026-05-04)

Three patch-class findings applied + one spec wording amendment:

1. **Stale `displayUnit` after `unit` change** (HIGH). Found by both reviewers. `updateIngredient` in `setup.actions.ts` now reads the existing `unit` + `displayUnit`, and clears `displayUnit` to null when the new unit lives in a different dimension OR when the existing `displayUnit` no longer hosts in the new unit's dimension. Without this guard, a manager flipping `unit` from L → kg would leave `displayUnit = "mL"` orphaned and the inventory page would render "≈ — (check display unit)" forever with no obvious fix path.
2. **`displayUnit === unit` storage drift** (MEDIUM). The action now normalizes the two-equivalent-options case: if a manager picks `displayUnit` equal to `ingredient.unit`, it's persisted as `null` (the same outcome as picking "(same as unit)"). Previously, the literal value would be stored — visually fine today but a future `unit` change could silently promote that duplicate into a stale conversion.
3. **Picker offered `ing.unit` as a duplicate option** (MEDIUM). `compatibleUnits` returns the full dimension set including the storage unit. The picker now filters it out so the dropdown only shows "(same as unit)" + the actual conversion targets — no more two-equivalent-choices confusion.

Spec wording amend: AC for the custom-unit case originally said "shows a placeholder explaining no conversions are available". Implementation uses a non-interactive "—" with a tooltip — accurate, just slightly different wording. Amended the AC to match.

KEEP: the `≈` prefix on the inventory-list hint (read-only, informational); the stepper staying in storage unit (integer-safe stepping); the within-dimension-only conversion table (no density / cross-dimension); `formatConvertedQuantity`'s 1e-9 tolerance for float-drift on round-trips; the `IngredientSpreadsheet` page being MANAGER-only (no per-row STAFF gate needed).

Added 1 regression test: `displayUnit === unit → normalized to null` in `inventory.actions.test.ts`.

## Suggested Review Order

**Foundation — pure helpers**

- Conversion table + `convert` + `dimensionOf` + `formatConvertedQuantity` + `compatibleUnits`. Fully unit-tested.
  [`unit-conversion.ts`](../../cafe-mgmt/src/lib/unit-conversion.ts)

**Schema + actions**

- New nullable column.
  [`schema.prisma:165`](../../cafe-mgmt/prisma/schema.prisma#L165)

  [`migration.sql`](../../cafe-mgmt/prisma/migrations/20260504072216_add_ingredient_display_unit/migration.sql)

- The new action — manager-gated, normalizes `displayUnit === unit` → null, validates dimension match.
  [`inventory.actions.ts:1080`](../../cafe-mgmt/src/actions/inventory.actions.ts#L1080)

- The stale-cleanup hook in `updateIngredient` — clears `displayUnit` when the new unit's dimension can no longer host it.
  [`setup.actions.ts:215`](../../cafe-mgmt/src/actions/setup.actions.ts#L215)

**Settings UI — Ingredients spreadsheet "Display" column**

- Picker filters by dimension and drops the storage unit itself; "(same as unit)" replaces it.
  [`ingredient-spreadsheet.tsx:880`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L880)

- `handleSaveDisplayUnit` — optimistic + rollback.
  [`ingredient-spreadsheet.tsx:528`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L528)

**Inventory display — the surfaces the user actually sees**

- Inventory list row shows "≈ {converted} {displayUnit}" hint above the (storage-unit) stepper.
  [`inventory-list.tsx:609`](../../cafe-mgmt/src/components/inventory/inventory-list.tsx#L609)

- Inventory detail dialog converts each lot row + supplier-total subtitle.
  [`inventory-detail-dialog.tsx:31`](../../cafe-mgmt/src/components/ingredients/inventory-detail-dialog.tsx#L31)

**Tests (30 new)**

- Conversion lib — every direction + boundary cases.
  [`unit-conversion.test.ts`](../../cafe-mgmt/src/lib/unit-conversion.test.ts)

- Action — happy path, null clear, cross-dimension rejection, custom-unit rejection, cross-cafe rejection, STAFF unauthorized, validation, normalization (`displayUnit === unit → null`).
  [`inventory.actions.test.ts`](../../cafe-mgmt/src/actions/inventory.actions.test.ts)

- Inventory detail dialog — L→mL conversion, null fallback, cross-dimension fallback.
  [`inventory-detail-dialog.test.tsx`](../../cafe-mgmt/src/components/ingredients/inventory-detail-dialog.test.tsx)
