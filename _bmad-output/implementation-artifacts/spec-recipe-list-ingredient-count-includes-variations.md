---
title: 'Recipe list shows "0 ingredients" for variant-only recipes; count unique ingredients across base + variations'
type: 'bugfix'
created: '2026-05-04'
status: 'done'
context: []
baseline_commit: '5712db434b7d94ac82e0e7af1e15c68f7109e6fe'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On `/recipes`, the list cards show "0 ingredients" for any recipe whose ingredients live on variations rather than the base. Same root cause as the just-fixed cost-range bug: `getRecipes` in `src/actions/recipe.actions.ts` sets `ingredientCount: r.ingredients.length`, counting base `RecipeIngredient` rows only. Variant-only recipes have an empty base array, so the count is 0 even when each variation has its own ingredients.

**Approach:** Change `ingredientCount` to count **distinct `ingredientId`s** across the base AND every variation — a single number telling the manager "this recipe uses N unique ingredients". UI unchanged; only the server-computed value changes. Re-uses the variations include shape already added by the previous story.

## Boundaries & Constraints

**Always:**
- `ingredientCount` is the count of distinct `ingredientId`s in `recipe.ingredients ∪ recipe.variations[*].ingredients`.
- Same ingredient appearing in multiple variations counts once. Same ingredient appearing in base AND in a variation counts once.
- A recipe with zero ingredients anywhere returns 0 (legitimate — also surfaces as "no cost" in the cost-range fix).

**Ask First:** None — single-number semantic was chosen at the clarification step (option A from "(A) Total unique vs (B) Range").

**Never:**
- Don't change the UI render — `{r.ingredientCount} ingredients` stays identical. Server returns the right number; client doesn't need to know about variations.
- Don't touch the cost computation, the schema, or any other surface. Single-line change in the action's response shape, plus a guard against the existing `r.ingredients.length` accidentally being used elsewhere (verify there are no other consumers).
- Don't add a "per-variation count" anywhere. Single global unique-count number only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output | Error Handling |
|----------|--------------|-----------------|----------------|
| No variations, base has ingredients | base = [milk, espresso] | `ingredientCount: 2` (unchanged) | N/A |
| Variant-only, distinct ingredients per variation | base = []; Small = [milk, espresso]; Large = [milk, espresso, syrup] | `ingredientCount: 3` (the user's bug — was 0) | N/A |
| Variant-only, all variations share the same ingredient set | base = []; Small = [milk]; Medium = [milk]; Large = [milk] | `ingredientCount: 1` | N/A |
| Mixed: base + variation overlap | base = [milk]; Variation A adds [milk, syrup] | `ingredientCount: 2` (milk de-duplicated) | N/A |
| Empty everywhere | base = []; variations all = [] | `ingredientCount: 0` (legitimate) | N/A |
| No variations at all | base = [milk, espresso]; variations.length = 0 | `ingredientCount: 2` (unchanged) | N/A |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/src/actions/recipe.actions.ts` -- in `getRecipes`, replace `ingredientCount: r.ingredients.length` with a Set-based unique count over base + all variations
- `cafe-mgmt/src/actions/recipe.actions.test.ts` -- add tests for the new ingredient-count semantic
- `cafe-mgmt/src/components/operations/recipe-editor.tsx` -- no change (UI reads `r.ingredientCount` as-is)

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/src/actions/recipe.actions.ts` -- computed `uniqueIngredientCount` once per recipe via `new Set([...base ids, ...variation ids]).size`; replaced all 5 occurrences of `ingredientCount: r.ingredients.length` (one per return-shape branch).
- [x] `cafe-mgmt/src/actions/recipe.actions.test.ts` -- 5 tests appended in the existing `getRecipes` describe: no-variations baseline, variant-only distinct ingredients (the user's bug), all-variations-share-one-ingredient, base+variation overlap (de-dup), empty everywhere.
- [x] No UI change required — `renderRecipeItem` still reads `r.ingredientCount` unchanged.

**Acceptance Criteria:**
- Given a recipe with no variations and 2 base ingredients, when `/recipes` loads, then the card shows "2 ingredients" (unchanged).
- Given a variant-only recipe (the user's reported case) with 3 distinct ingredients spread across its variations, when `/recipes` loads, then the card shows "3 ingredients" — never "0".
- Given a recipe with variations that all share the same single ingredient, when `/recipes` loads, then the card shows "1 ingredients".
- Given a recipe whose base and a variation both list the same ingredient, when `/recipes` loads, then that ingredient is counted once.
- Given a recipe with no ingredients anywhere (base empty + all variations empty), when `/recipes` loads, then the card shows "0 ingredients" (legitimate empty — paired with the empty-cost dash).

## Verification

**Commands:**
- `cd cafe-mgmt && npx vitest run src/actions/recipe.actions.test.ts` -- expected: existing 25 tests pass + 5 new ingredient-count tests pass
- `cd cafe-mgmt && npm run build` -- expected: clean build
- `cd cafe-mgmt && npx vitest run` -- expected: full suite still passes

**Manual checks:**
- Dev server on :4000 → `/recipes` → confirm the variant-only recipe (the one previously showing "0 ingredients") now shows the actual unique count. Confirm a no-variation recipe is unchanged.

## Spec Change Log

### Iteration 1 — review (2026-05-04)

No patches needed. All three review subagents (blind hunter, edge case hunter, acceptance auditor) reported the change as sound. Specifically verified:

- **No caller drift** — exhaustive grep found `RecipeSummary.ingredientCount` is consumed only by `recipe-editor.tsx:128` as a plain text label. Other `ingredientCount` matches in the codebase belong to an unrelated `CafeOnboardingData` type. No arithmetic, comparisons, or thresholds rely on the old "base rows only" semantic.
- **No null risk in the Set** — `prisma/schema.prisma:493` and `:547` make `RecipeIngredient.ingredientId` and `VariationIngredient.ingredientId` non-nullable required FKs; the Prisma TS types reflect this. The Set cannot collapse multiple null entries into one.
- **Performance is bounded** — O(baseN + sum(variationN)) with one Set per recipe. Fine at cafe-scale; not worth optimizing.

KEEP: the simple `Set<string>` over `ingredientId` (cuids are unique and stable); the per-recipe scoping inside `recipes.map`; the "no UI change" approach (server returns the right number, client unchanged).

## Suggested Review Order

**The fix**

- Single computation per recipe — distinct `ingredientId` set across base + every variation.
  [`recipe.actions.ts:234`](../../cafe-mgmt/src/actions/recipe.actions.ts#L234)

**Tests**

- 5 tests covering every I/O Matrix row: no-variations baseline, variant-only distinct (the user's bug), all-variations-share-one, base+variation overlap (de-dup), empty everywhere.
  [`recipe.actions.test.ts`](../../cafe-mgmt/src/actions/recipe.actions.test.ts)
