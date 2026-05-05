---
title: 'Inline Ingredient Picker on Suppliers List'
type: 'feature'
created: '2026-04-28'
status: 'done'
baseline_commit: '5712db4'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `/suppliers` list shows what each supplier supplies as read-only chips ("Supplies: Coffee · Milk"). To add a new ingredient link to a supplier, the manager has to click into the supplier detail page — extra navigation for a frequent action.

**Approach:** Add an inline ingredient picker to each supplier card on `/suppliers`. Manager can: (a) click `+ Add ingredient` per card → choose an ingredient, enter price + unit → action creates `IngredientSupplier` link; (b) click an existing chip → enter edit mode for that link's price/unit; (c) click ✕ on a chip → confirm and remove the link. Reuse existing server actions (`addIngredientSupplier`, `updateIngredientSupplier`, `removeIngredientSupplier`). Manager-only.

## Boundaries & Constraints

**Always:** Reuse `addIngredientSupplier`, `updateIngredientSupplier`, `removeIngredientSupplier` from `setup.actions.ts` — no new actions. The supplier-detail page's existing inline-picker stays untouched (this spec only adds to the list view). Manager-only — use the existing `isManager` prop already passed to `<SupplierList>`. Optimistic update pattern: insert/update/remove the link in local state before the action resolves; revert on failure with toast. Price entry uses the existing `parseRMToCentsPrecise`-style parser (preserve sub-cent precision as in the suppliers panel pattern). Existing chip rendering (read-only "Supplies: ..." display) becomes interactive when `isManager`.

**Ask First:** None.

**Never:** Don't change the actions or schema. Don't introduce a separate `Category` or matrix view. Don't change supplier-detail.tsx. Don't gate behind a feature flag. Don't paginate the picker — if a cafe has 200+ ingredients the dropdown gets long; defer that. Don't allow staff to edit (manager-only).

## I/O & Edge-Case Matrix

| Scenario | State | Expected |
|----------|-------|----------|
| `+ Add ingredient` | Manager clicks button on supplier card | Inline picker opens: ingredient `<select>` + price input + unit input + ✓ ✕ |
| Pick + save | All fields filled | `addIngredientSupplier` called; chip appears with price; toast "Added" |
| Pick already-linked | Manager picks an ingredient already linked | Picker rejects with toast "Already linked"; OR the action returns a duplicate-error (existing pattern) — surface that error |
| Click chip | Manager taps an existing chip | Chip swaps to edit mode: price input + unit input + ✓ ✕ |
| Save chip edit | New price entered | `updateIngredientSupplier` called; chip updates; toast "Updated" |
| Click ✕ on chip | Manager taps ✕ | `<ConfirmationDialog>` "Remove Coffee from Supplier A?"; on confirm, `removeIngredientSupplier`; chip disappears |
| Add: empty fields | Save clicked with missing input | ✓ button disabled |
| Action fails | Server returns error | Local state reverts; toast shows error |
| Staff user | `isManager === false` | Chips render read-only; `+ Add ingredient` button hidden |
| Optimistic: rapid double Add | Two adds before first resolves | Second add gated until pending first resolves (button disabled while pending) |

</frozen-after-approval>

## Code Map

- `src/components/operations/supplier-list.tsx` -- add inline picker + edit/remove flow per supplier card; gate by `isManager`; optimistic state; reuse existing toast/dialog/`isPending` patterns
- `src/components/operations/supplier-list.test.tsx` -- NEW (or extend existing if present); cover I/O matrix scenarios

## Tasks & Acceptance

**Execution:**
- [x] `src/components/operations/supplier-list.tsx` -- modify -- add per-card `+ Add ingredient` button (manager-only); ingredient `<select>` (existing `allIngredients` prop) + price input + unit input + save/cancel; chip click → inline edit; ✕ → confirmation → remove; optimistic local state w/ rollback on action failure; reuse `addIngredientSupplier` / `updateIngredientSupplier` / `removeIngredientSupplier`
- [x] `src/components/operations/supplier-list.test.tsx` -- modify/create -- tests for: add (success + duplicate), chip-edit (price), chip-remove (confirm dialog), staff sees read-only, ✓ disabled with empty fields

**Acceptance Criteria:**
- Given a manager on `/suppliers`, when viewing a card, then `+ Add ingredient` button is visible.
- Given the manager clicks `+ Add ingredient`, when the picker opens, then an ingredient `<select>` (populated from existing `allIngredients` prop) + price input + unit input are shown.
- Given the manager picks "Coffee" with price `12.50` and unit `kg`, when ✓ is clicked, then `addIngredientSupplier` is called with `{ supplierId, ingredientId, priceInCents: 1250, unit: "kg" }` and the new chip "Coffee · RM 12.50 / kg" appears.
- Given the manager clicks an existing chip, when it enters edit mode, then price + unit fields appear with current values; saving calls `updateIngredientSupplier`.
- Given the manager clicks ✕ on a chip, when confirmation is approved, then `removeIngredientSupplier` is called and the chip disappears.
- Given a staff user views the list, when the page loads, then chips render read-only and `+ Add ingredient` is not shown.
- Given the action returns an error, when the response arrives, then optimistic state reverts and a toast shows the error.
- Given `npx next build` and `npx vitest run --exclude="e2e/**"`, when run, then both pass.

## Design Notes

The supplier-detail page already has a working inline picker for ingredient links. Mirror its pattern (state shape, action call sites, optimistic update, toast on error) without extracting a shared component yet — extraction can come later if a third call site appears (cf. deferred-work).

Chip layout when `isManager`:
- Default: `[Coffee · RM 12.50/kg]   [✕]` (chip clickable for edit, ✕ separate)
- Edit mode: `[<select disabled to ingredient>] [price input] [unit input] [✓] [✕]`

Add picker layout (collapsed → expanded):
- Collapsed: `+ Add ingredient` button at end of chip row
- Expanded: same row layout as edit mode but with ingredient `<select>` enabled

Duplicate-link guard: server-side `addIngredientSupplier` already enforces `@@unique([ingredientId, supplierId, cafeId])` and returns an error. Surface it via toast.

## Verification

**Commands:**
- `npx next build` -- expected: clean compile
- `npx vitest run --exclude="e2e/**"` -- expected: all tests pass including new picker interaction tests

**Manual checks:**
- As manager: open `/suppliers`, click `+ Add ingredient` on a card, pick an ingredient + price + unit, save — chip appears; refresh — persists.
- Click an existing chip — edit price — save; refresh — new price persists.
- Click ✕ on a chip — confirm — chip removed; refresh — gone.
- Try to add an already-linked ingredient — error toast.
- Log in as staff — chips read-only, no `+ Add` button.

## Suggested Review Order

**Race-safe action gating**

- All three handlers early-return on `isPending` — prevents rapid double-click duplicate optimistic inserts.
  [`supplier-list.tsx:308`](../../cafe-mgmt/src/components/operations/supplier-list.tsx#L308)
  [`supplier-list.tsx:379`](../../cafe-mgmt/src/components/operations/supplier-list.tsx#L379)
  [`supplier-list.tsx:427`](../../cafe-mgmt/src/components/operations/supplier-list.tsx#L427)

**Float-noise-free money parsing**

- Shared `parseRMToCentsPrecise` in `lib/format.ts` uses string arithmetic — `"12.30" → 1230` exactly (was 1229.9999 with float `* 100`). Used by 3 components.
  [`format.ts:1`](../../cafe-mgmt/src/lib/format.ts#L1)

**Role-flip cleanup**

- `useEffect` resets all picker / edit / dialog state when `isManager` flips false.
  [`supplier-list.tsx:1`](../../cafe-mgmt/src/components/operations/supplier-list.tsx#L1)

**44pt touch targets**

- `.touch-target` utility applied to all interactive controls — `+ Add` button, chip ✕, edit ✓/✕.
  [`supplier-list.tsx:814`](../../cafe-mgmt/src/components/operations/supplier-list.tsx#L814)
  [`supplier-list.tsx:718`](../../cafe-mgmt/src/components/operations/supplier-list.tsx#L718)

**Optimistic state with rollback**

- Add: insert temp chip → on success replace with real id; on failure remove + toast.
- Edit: capture baseline → optimistic update → on failure restore baseline.
- Remove: confirmation dialog → optimistic remove → on failure restore.
  [`supplier-list.tsx:308`](../../cafe-mgmt/src/components/operations/supplier-list.tsx#L308)

**Tests**

- 8 supplier-list tests (add success, duplicate-link rollback, edit, remove confirm + cancel, staff read-only, ✓ disabled, picker filter) + 11 new format tests covering the string-based parser + 3 new race / role-flip / float-noise tests.
  [`supplier-list.test.tsx:1`](../../cafe-mgmt/src/components/operations/supplier-list.test.tsx#L1)
  [`format.test.ts:1`](../../cafe-mgmt/src/lib/format.test.ts#L1)
