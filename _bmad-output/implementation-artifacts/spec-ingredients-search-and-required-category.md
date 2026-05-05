---
title: 'Ingredients Search, Category Filter, and Required Category on Add'
type: 'feature'
created: '2026-04-28'
status: 'done'
baseline_commit: '5712db4'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The new `/ingredients` spreadsheet has no way to find an ingredient quickly when a cafe has dozens of rows. Some ingredients also slipped into production without a category, making the (planned) category-based filter incomplete and ad-hoc reporting noisy.

**Approach:** Add a name search input + a multi-select category filter button above the spreadsheet (sticky on scroll). Make `category` required on every new ingredient via a strict dropdown of existing categories (plus a permanent "Unassigned" fallback). Backfill any existing `Ingredient` rows where `category IS NULL` to "Unassigned" via a Prisma migration. Existing category cells remain free-text on edit.

## Boundaries & Constraints

**Always:** Search = name-only, case-insensitive substring, instant. Filter logic: search AND category-set (within the set: OR); 0 selected = no category filter. Category dropdown options = distinct categories on current ingredients ∪ permanent "Unassigned". Pinned-first sort applies inside the filtered result. Sticky add-row stays visible during search/filter. Server `addIngredient` rejects empty category. `Ingredient.category` Prisma column stays `String?` — non-null enforced at app layer (zod + migration backfill + template seed).

**Ask First:** None.

**Never:** Don't alter the column type or add NOT NULL/SQL default. Don't introduce a `Category` table. Don't persist search/filter across navigation. Don't add category UI to `setup/ingredient-review.tsx` or `inventory/inventory-list.tsx` — those pass the literal `"Unassigned"`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior | Error |
|----------|--------------|-------------------|-------|
| Type into search | "Es" | Rows where name ICONTAINS "es" remain; others hidden | N/A |
| Clear search | Click ✕ in input | All rows visible (subject to filter) | N/A |
| Open filter dropdown | Click "Filter" button | Popover with checkbox per category + "Unassigned" | N/A |
| Tick categories | Select 2 categories | Rows whose category ∈ set are visible | N/A |
| Search + filter combo | "milk" + ["Dairy"] | Rows matching both | N/A |
| Empty result | Filter yields 0 rows | Show "No ingredients match" + Clear button | N/A |
| Add row, no category | Name + Unit filled, category = "" | ✓ button disabled | N/A |
| Add row, category picked | All fields filled | Calls `addIngredient(name, unit, category)`; success toast | Toast on action error |
| Server: category empty | Direct call with `category: ""` | Action returns `{success: false, error: "Category required"}` | Caller handles |
| Existing row with NULL category (post-migration) | None should remain | Migration sets all to "Unassigned" | Migration aborts if backfill query fails |
| Edit category cell to "" | Clear field, blur | Existing edit-cell path unchanged — server allows null to remain (kept lenient on edit per Boundaries) | N/A |

</frozen-after-approval>

## Code Map

- `src/components/ingredients/ingredient-spreadsheet.tsx` -- add search input, filter popover, filter logic; replace add-row category text input with strict `<select>` from distinct categories + "Unassigned"; disable ✓ until category set
- `src/components/ingredients/ingredient-spreadsheet.test.tsx` -- new tests for search, filter, combined, empty result, add-row category disable, dropdown options
- `src/actions/setup.actions.ts` -- update `addIngredientSchema` (add `category` required) and `addIngredient` signature `(name, unit, category)`; update `selectTemplate` ingredient seed to include `category: "Unassigned"`
- `src/actions/setup.actions.test.ts` -- update tests for new action signature
- `src/components/setup/ingredient-review.tsx` -- pass `"Unassigned"` as 3rd arg to `addIngredient`
- `src/components/inventory/inventory-list.tsx` -- pass `"Unassigned"` as 3rd arg; set `category: "Unassigned"` in optimistic insert (currently `null`)
- `src/app/(app)/ingredients/page.tsx` -- pass distinct categories list down to the spreadsheet (computed from fetched ingredients) so the dropdown is consistent on first paint
- `prisma/migrations/<timestamp>_backfill_ingredient_category/migration.sql` -- NEW; `UPDATE "Ingredient" SET "category" = 'Unassigned' WHERE "category" IS NULL`

## Tasks & Acceptance

**Execution:**
- [x] `prisma/migrations/<timestamp>_backfill_ingredient_category/migration.sql` -- create -- raw SQL backfill; idempotent
- [x] `src/actions/setup.actions.ts` -- modify -- `addIngredientSchema` adds `category: z.string().trim().min(1, "Category required")`; `addIngredient(name, unit, category)`; `selectTemplate` createMany adds `category: "Unassigned"`
- [x] `src/actions/setup.actions.test.ts` -- modify -- update `addIngredient` tests for new signature; add empty-category rejection test
- [x] `src/components/setup/ingredient-review.tsx` -- modify -- pass `"Unassigned"` as 3rd arg
- [x] `src/components/inventory/inventory-list.tsx` -- modify -- pass `"Unassigned"`; optimistic insert `category: "Unassigned"`
- [x] `src/app/(app)/ingredients/page.tsx` -- modify -- compute `distinctCategories` and pass as a prop
- [x] `src/components/ingredients/ingredient-spreadsheet.tsx` -- modify -- add searchQuery + selectedCategories state; sticky toolbar (search + filter button); popover with checkboxes; render filter; add-row category strict `<select>` (options = distinct ∪ "Unassigned"); ✓ disabled until name+unit+category filled; pass category to `addIngredient`; empty-state row with Clear button
- [x] `src/components/ingredients/ingredient-spreadsheet.test.tsx` -- modify -- tests for search, multi-category filter, search∩filter, empty-state+clear, add-row ✓ disabled without category, action receives category, dropdown always includes "Unassigned"

**Acceptance Criteria:**
- Given an ingredient list of 10+ rows, when a manager types into the search box, then only rows whose name contains the substring (case-insensitive) remain visible.
- Given the manager clicks the Filter button, when the popover opens, then it lists every distinct category currently in use, plus an "Unassigned" entry.
- Given the manager checks 2 categories and types in search, when both are active, then visible rows match BOTH conditions.
- Given the search/filter yields zero rows, when the table renders, then "No ingredients match" is shown with a button that resets both search and filter.
- Given the manager opens the add-row, when name + unit are filled but no category is selected, then the ✓ button is disabled.
- Given the manager submits the add-row with category "Coffee", when the action runs, then `addIngredient` is called with `(name, unit, "Coffee")` and the new row appears in the table with that category.
- Given a manager calls `addIngredient` directly with `category: ""`, when the action runs, then it returns `{success: false, error: "Category required"}`.
- Given the migration runs against a database with rows where `category IS NULL`, when it completes, then no `Ingredient` row in any cafe has `category IS NULL`.
- Given a fresh cafe completes template selection, when `selectTemplate` finishes, then every seeded ingredient has `category = "Unassigned"`.
- Given `npx next build` and `npx vitest run --exclude="e2e/**"`, when both run, then both pass with all new and updated tests.

## Design Notes

Sticky toolbar `top: 0`, `z-[3]` (above add-row `z-[2]`), page bg. Search input shows an inline ✕ when non-empty.

Filter popover: controlled `useState`, anchored to the button, closed on outside-mousedown. Rows are `<label>` + checkbox; multi-select; no Apply button (checks update state directly). Button shows count: "Filter" or "Filter (2)".

Add-row dropdown: `<select>` with placeholder `<option value="">Choose category…</option>`, sorted distinct categories, plus always-present "Unassigned" (deduped). Backfill SQL is idempotent (`WHERE category IS NULL` matches nothing on rerun).

## Verification

**Commands:**
- `npx prisma migrate dev` -- expected: applies new migration cleanly; no rows left with null category
- `npx next build` -- expected: compiles without errors
- `npx vitest run --exclude="e2e/**"` -- expected: all tests pass including new search/filter/category tests

**Manual checks:**
- 30-row cafe: type "milk" — only milk-y rows visible.
- Filter to two categories — see only those rows.
- Add new row, leave category empty — ✓ disabled. Pick "Unassigned" — ✓ enabled, save succeeds.
- Refresh; ingredients with previously-null category now show "Unassigned" in the cell.

## Suggested Review Order

**Server contract & migration**

- `addIngredient` signature now requires `category`; zod rejects empty/whitespace.
  [`setup.actions.ts:272`](../../cafe-mgmt/src/actions/setup.actions.ts#L272)

- `selectTemplate` seeds `category: "Unassigned"` — temporary until template-data carries semantic categories (see deferred-work).
  [`setup.actions.ts:75`](../../cafe-mgmt/src/actions/setup.actions.ts#L75)

- Idempotent backfill: NULL → "Unassigned"; column stays nullable (app-layer enforcement).
  [`migration.sql:1`](../../cafe-mgmt/prisma/migrations/20260428010000_backfill_ingredient_category/migration.sql#L1)

**Page entry & data shape**

- Compute `distinctCategories` once at fetch and pass as a prop; client unions with local edits.
  [`page.tsx:56`](../../cafe-mgmt/src/app/(app)/ingredients/page.tsx#L56)

**Reactive category options & filter logic**

- `categoryOptions` unions server snapshot + current ingredients + permanent "Unassigned" — locally-edited categories surface immediately.
  [`ingredient-spreadsheet.tsx:112`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L112)

- Prune stale `selectedCategories` when categories disappear (no orphaned filter chips).
  [`ingredient-spreadsheet.tsx:168`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L168)

- `visibleIngredients` is memoized; intersection of search ∧ category-set; pinned-first sort preserved.
  [`ingredient-spreadsheet.tsx:509`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L509)

**Popover a11y / interaction**

- Click-outside via `pointerdown` (catches mouse and touch reliably).
  [`ingredient-spreadsheet.tsx:121`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L121)

- Escape-to-close + focus-first-checkbox + restore focus to trigger.
  [`ingredient-spreadsheet.tsx:138`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L138)

**Add-row gating**

- Strict `<select>` populated from `categoryOptions`; ✓ disabled until name+unit+category filled; passes category to `addIngredient`.
  [`ingredient-spreadsheet.tsx:99`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.tsx#L99)

**Other addIngredient callers (no UI change)**

- Setup-flow review path passes `"Unassigned"`.
  [`ingredient-review.tsx:88`](../../cafe-mgmt/src/components/setup/ingredient-review.tsx#L88)

- Inventory inline-add passes `"Unassigned"` and updates optimistic insert accordingly.
  [`inventory-list.tsx:667`](../../cafe-mgmt/src/components/inventory/inventory-list.tsx#L667)

**Tests**

- 27 spreadsheet tests covering search, filter, intersection, empty-state, popover behavior, edit-cell lenience, NULL-category bucket.
  [`ingredient-spreadsheet.test.tsx:1`](../../cafe-mgmt/src/components/ingredients/ingredient-spreadsheet.test.tsx#L1)

- Server-action schema tests for required-category rejection.
  [`setup.actions.test.ts:1`](../../cafe-mgmt/src/actions/setup.actions.test.ts#L1)
