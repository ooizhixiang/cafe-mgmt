---
title: 'Ingredients table fits without horizontal scroll'
type: 'feature'
created: '2026-05-07'
status: 'done'
context: []
baseline_commit: 'e5bf4290d69bb0447371703d9cd094f135895908'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The ingredients table at `/ingredients` has 13 columns with ~1216px of `min-width` before padding (≈1300px+ rendered). The page max width is 1280px, sidebar/chrome eats more, so the user has to scroll horizontally to see Suppliers / Units-per-container / Container / Snap. Sticky `Name` column helps a little but doesn't remove the scroll need.

**Approach:** Split columns into **default-visible** (high-traffic) and **advanced** (rarely-edited config). Add a header-row toggle "Show advanced columns" that reveals/hides the advanced set. Default = advanced hidden. Persist the preference per-user in `localStorage` so the choice survives page reloads. Tighten a few `min-w-*` values that are over-padded (Cost, Threshold, Snap) so even the default 9-column view fits comfortably on a 1024px content area.

## Boundaries & Constraints

**Always:**
- Default-visible columns (left-to-right): Pin · Name · Unit · Cost · Category · Threshold · Suppliers (+ existing icon/delete chrome).
- Advanced columns (hidden by default, revealed by toggle): Display, Snap, Container, Units/container.
- Toggle state persists in `localStorage` under key `ingredients.showAdvancedColumns` (boolean). Read on mount, write on change.
- No data is hidden — all fields stay editable; the toggle ONLY hides their column from the table grid.
- Sticky `Name` column behavior preserved.

**Ask First:**
- Whether to drop `Display` from the table entirely. Currently this is a per-ingredient picker for the inventory page's display unit. We have an `Inventory Details` popup that could host it instead. Spec assumes **keep in advanced columns** for this round; punt the deeper consolidation as a follow-up.

**Never:**
- Do not change the data model or any Server Action.
- Do not remove fields entirely — visibility only.
- Do not introduce a per-row expand UI in this spec (cleaner alternative but bigger scope; defer).
- Do not alter the row's edit behavior (clicking a cell still puts it in edit mode).
- Do not add a separate "column config" modal. One header toggle, that's it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First visit, no localStorage entry | Fresh user | Toggle reads `false`; only default columns render | N/A |
| User clicks "Show advanced columns" | Toggle off → on | All 13 columns visible; localStorage written `"true"` | N/A |
| User reloads page | Toggle was on | Toggle reads `"true"`; advanced columns visible from first paint | N/A |
| `localStorage` unavailable (SSR / private mode) | Read throws | Default to `false`; do not crash | Try/catch around read+write |
| Sticky `Name` column is in the visible set | Always | Sticks to left edge regardless of advanced visibility | N/A |
| Search/filter active with advanced hidden | Mixed state | Filter behavior unchanged; advanced cells just don't render | N/A |

</frozen-after-approval>

## Code Map

- `src/components/ingredients/ingredient-spreadsheet.tsx` -- (1) add `showAdvanced` state hydrated from `localStorage`; (2) wrap the toggle button in the existing header row beside the search/filter chrome; (3) conditionally render the 4 advanced `<Th>` headers and matching `<td>` cells; (4) tighten `min-w-*` on Cost/Threshold/Snap; (5) the new-ingredient row at the bottom keeps ALL fields visible regardless of toggle (so users can still set advanced fields when adding)
- `src/components/ingredients/ingredient-spreadsheet.test.tsx` -- add tests: (a) default render hides advanced columns; (b) toggle reveals them; (c) toggle preference persists across re-mount via mocked localStorage

## Tasks & Acceptance

**Execution:**
- [x] `src/components/ingredients/ingredient-spreadsheet.tsx` -- add `showAdvanced` `useState` + hydration `useEffect` from `localStorage`
- [x] Same file -- add the toggle button in the existing header row (next to filter chip), e.g. "+ Show advanced columns" / "− Hide advanced columns"
- [x] Same file -- conditionally render Display, Snap, Container, Units/container `<Th>` and matching `<td>` cells based on `showAdvanced`
- [x] Same file -- ensure the new-ingredient bottom row remains fully expanded (all 4 advanced inputs visible there always); the toggle only governs the data rows above
- [x] Same file -- tighten `min-w-*` for Cost (90→70), Threshold (100→80), Snap (80→60) to make the default 9-column view fit at ~960px content width
- [x] `src/components/ingredients/ingredient-spreadsheet.test.tsx` -- add 3 tests per Code Map
- [x] Run full verification

**Acceptance Criteria:**
- Given a user opens `/ingredients` for the first time, when the table renders, then the columns Display, Snap, Container, and Units/container are NOT in the DOM and the table fits within the page width without horizontal scroll on a 1024px content area.
- Given the user clicks "Show advanced columns", when the click handler runs, then the 4 advanced columns appear and the localStorage key `ingredients.showAdvancedColumns` is set to `"true"`.
- Given the user reloads the page after toggling advanced on, when the table mounts, then advanced columns appear from first paint (state hydrated from localStorage).
- Given the user is adding a new ingredient via the bottom row, when they look at the input fields, then ALL four advanced fields (Display, Snap, Container, Units/container) are visible regardless of the toggle state — adding doesn't lose access to those fields.
- Given `localStorage.getItem` throws (SSR / blocked storage), when the component mounts, then it defaults to `showAdvanced=false` and does not crash.

## Spec Change Log

## Design Notes

**Why a toggle, not a per-row expand.** Per-row expand is more elegant (every user sees the same scannable density by default) but requires expand-state-per-row, makes bulk inline editing harder, and is bigger scope. A single page-level toggle is dumber and more predictable.

**Why localStorage, not user prefs DB.** Pure UI preference. No need to round-trip through the server; localStorage is instant and works without a server action. If we later want to sync across devices we can promote it to user prefs.

**The bottom add-row stays full.** Hiding advanced columns on data rows only — when ADDING a new ingredient you genuinely want all the fields. This avoids "oh I need to toggle to set Snap" friction.

## Verification

**Commands:**
- `cd cafe-mgmt && npx tsc --noEmit` -- expected: no new errors
- `cd cafe-mgmt && npx vitest run src/components/ingredients/ingredient-spreadsheet.test.tsx` -- expected: all tests pass including 3 new ones
- `cd cafe-mgmt && npm run build` -- expected: clean

**Manual checks:**
- Open `/ingredients` on a 1280px viewport; confirm no horizontal scroll appears.
- Click "Show advanced columns"; confirm Display, Snap, Container, Units/container appear.
- Reload; confirm the toggle state persists.
- Click "+ Add ingredient" row at bottom; confirm Display/Snap/Container/Units inputs are all visible.

## Suggested Review Order

**The toggle and its persistence (start here)**

- `showAdvanced` state, `colCount` derived constant, hydration `useEffect`, `toggleAdvanced` writer.
  [`ingredient-spreadsheet.tsx:142`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L142)

**Toggle button placement**

- Sits beside the search/filter chrome in the sticky header row; `aria-pressed` reflects state.
  [`ingredient-spreadsheet.tsx:795`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L795)

**Header `<Th>` gating**

- Display, Snap, Container, Units/container `<Th>`s wrapped with `{showAdvanced && ...}`. Tightened `min-w-*` on Cost/Threshold/Snap.
  [`ingredient-spreadsheet.tsx:814`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L814)

**Data-row cell gating + dynamic colSpans (iter 1 patches)**

- Empty-state, no-results, expanded-suppliers — all 3 use `colSpan={colCount}` so they don't over-span when advanced is hidden.
  [`ingredient-spreadsheet.tsx:839`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L839)

- Add-row Display placeholder gated by `showAdvanced`; the two `colSpan={3}` blocks shrink to 1 and 2 respectively.
  [`ingredient-spreadsheet.tsx:1124`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L1124)

**Tests**

- 3 new tests cover default-hidden / toggle-reveals / hydrate-from-localStorage. Pre-existing snap test patched to click the toggle first. `beforeEach` clears `localStorage` to prevent cross-test leak (iter 1 patch).
  [`ingredient-spreadsheet.test.tsx`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.test.tsx)

