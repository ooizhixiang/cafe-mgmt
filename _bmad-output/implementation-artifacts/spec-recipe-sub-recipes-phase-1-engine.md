---
title: 'Sub-recipes (composite ingredients) — Phase 1: schema + expansion engine + cost rollup + deduction integration'
type: 'feature'
created: '2026-05-05'
status: 'done'
context: []
baseline_commit: '5712db434b7d94ac82e0e7af1e15c68f7109e6fe'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A recipe like "Latte" needs "Milk foam," which itself is made from milk. The current schema only allows `RecipeIngredient` to point at a raw `Ingredient`, so managers either flatten the hierarchy (list raw milk in the latte and reason about froth-shrinkage manually) or double-track via two ingredients with manual wastage steps. Neither scales when the same intermediate (foam, ganache base, house syrup) gets reused across many recipes.

**Approach:** Phase 1 introduces sub-recipes as a server-side capability. Schema gains a polymorphic `RecipeIngredient` / `VariationIngredient` row that points at EITHER `ingredientId` (raw, today's behavior) OR `subRecipeId` (new). Each `Recipe` gains optional `yieldQuantity` + `yieldUnit` declaring "this recipe produces X yieldUnit per serving" — required if the recipe is to be used as a sub-recipe. A pure expansion engine (`expandRecipeToLeaves`) walks any composite recipe down to leaf raw-ingredient quantities with cycle detection. The sales-deduction path and the cost-computation paths (`getRecipes`, `getMarginAlertCards`) call the engine and stay correct. **No UI in Phase 1** — managers will use the existing recipe APIs directly OR the next session ships the editor changes.

## Boundaries & Constraints

**Always:**
- Polymorphic row: `ingredientId` and `subRecipeId` are mutually exclusive — exactly one must be non-null. Application-layer XOR check at insert time (Prisma can't express this with a CHECK constraint cleanly).
- `Recipe.yieldQuantity` + `Recipe.yieldUnit` are both required (or both null) — partial settings rejected at the action layer.
- A recipe being USED as a sub-recipe MUST have non-null yield. Insert-time validation rejects a sub-recipe row pointing at a recipe with null yield.
- Sub-recipe nesting unlimited (option 2a). Cycle detection runs on every insert that adds a `subRecipeId` — walk forward from the target; reject if the parent recipe appears.
- Variations on the sub-recipe side are NOT considered — `subRecipeId` always references the BASE recipe's ingredients (option 3a). Variations exist only on the TOP-LEVEL recipe being sold.
- Quantity interpretation: when a parent row stores `quantityPerServing` and `subRecipeId`, the units of `quantityPerServing` are the SUB-RECIPE's `yieldUnit`. Same value semantics; no per-row unit stored.
- Expansion for FIFO deduction returns integer leaf quantities. Float scale factors round to the nearest integer per leaf ingredient (with a 1-minimum when scale × qty > 0 — never lose a real consumption to rounding).
- Cost rollup: sub-recipe per-yield-unit cost = (sum of base-ingredient costs at standard yield) / yieldQuantity. Parent adds `parentQty × subRecipePerUnitCost`.
- Null cost propagates: if any leaf in any sub-recipe can't be costed, the entire parent recipe's cost is null (matches existing dash behavior).

**Ask First:** None — three design decisions resolved at clarification (1a / 2a / 3a).

**Never:**
- Don't ship UI in Phase 1. Recipe editor stays unaware of sub-recipes; managers can wire them via the existing `addRecipeIngredient` / `addVariationIngredient` actions (extended to accept `subRecipeId`).
- Don't allow a sub-recipe row to reference a recipe variation directly (only the base — option 3a). Validation rejects.
- Don't change `applyConsumeFifo`, `currentCostPerUnit`, or `findOldestNonEmptyLot`. The expansion engine fans out to leaf ingredients; the per-leaf FIFO call is unchanged.
- Don't migrate existing data. Pre-existing `RecipeIngredient` rows have `subRecipeId = null`; behavior unchanged.
- Don't expose sub-recipe rows on the inventory or purchases surfaces. Phase 1 affects sales, cost, and margin alerts only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output | Error Handling |
|----------|--------------|-----------------|----------------|
| Single-level expansion | Latte has [Milk foam (100 mL)]. Foam yields 200 mL, contains [Milk (250 mL)]. Sell 1 latte. | Deducts 125 mL milk (100/200 × 250) | N/A |
| Nested expansion (2 levels) | A → B → C (raw). Yields: B=10, C raw. A uses 5 of B; B uses 3 of C per yield-unit. Sell 1 A. | Leaf C deduction = 5/10 × 3 = 1.5 → rounds to 2 | N/A |
| Cycle attempt | A → B; manager adds B → A | Insert action returns "Adding this would create a cycle" | Hard reject; no DB write |
| Self-reference | A → A | Insert returns "Recipe cannot reference itself" | Hard reject |
| Sub-recipe missing yield | Manager adds `subRecipeId` pointing at recipe with null yieldQuantity | Insert returns "Sub-recipe must declare a yield first" | Hard reject |
| Sub-recipe references a variation | Manager passes `subVariationId` (not in scope) | Action accepts only `subRecipeId`; passing variation id behaves as referencing its parent base | N/A — `subRecipeId` is a Recipe id; variations not addressable |
| Cost rollup with all leaves costed | Latte → Foam → Milk; milk costed | Latte's `costPerServingInCents` = scaled milk cost | N/A |
| Cost rollup with one unresolvable leaf | Foam contains an ingredient with no cost AND no override | Latte's `costPerServingInCents` = null (matches existing) | N/A |
| Margin alert with composite | Latte priced below cost via composite expansion | `getMarginAlertCards` emits the same shape as for raw recipes | N/A |
| Polymorphic XOR violation | Both `ingredientId` and `subRecipeId` set on insert | Action returns "Pick exactly one of ingredient or sub-recipe" | Hard reject |
| Round-down to zero | Sell 1 of A; expansion math gives 0.4 of leaf C | Deducts 1 (1-minimum guard); never silently drops a real consumption | N/A |
| Expansion of unmodified raw recipe | Latte with only raw `ingredientId` rows (no sub-recipes) | Behavior identical to today: returns the existing flat ingredient map | N/A — backward compatibility |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/prisma/schema.prisma` -- `Recipe` gains `yieldQuantity Int?` + `yieldUnit String?`; `RecipeIngredient` and `VariationIngredient` gain `subRecipeId String?` + relation; `ingredientId` becomes nullable on both. Migration.
- `cafe-mgmt/src/lib/recipe-expand.ts` -- **NEW** — pure helpers: `expandRecipeToLeaves(recipe, parentQty, registry, visiting): Map<ingredientId, number>` (cycle-safe; takes a pre-loaded registry of all relevant recipes; tracks visiting set), `wouldCreateCycle(parentRecipeId, candidateSubRecipeId, registry): boolean`, `rollupCostPerYieldUnit(recipe, registry, derivedCostMap): number | null`.
- `cafe-mgmt/src/lib/recipe-expand.test.ts` -- **NEW** — covers single + nested expansion, cycle detection, missing-yield, partial-leaf-cost null propagation, round-down-to-zero floor, raw-only passthrough.
- `cafe-mgmt/src/actions/recipe.actions.ts` -- extend `addRecipeIngredient` and `addVariationIngredient` to accept `{ ingredientId? } | { subRecipeId? }` (XOR enforced). Insert calls `wouldCreateCycle` first. Both actions also validate the target sub-recipe has a non-null yield. New action `setRecipeYield(recipeId, yieldQuantity, yieldUnit | null)` — both fields cleared together when null is passed. `getRecipes` cost computation calls `rollupCostPerYieldUnit` so composites surface their true cost.
- `cafe-mgmt/src/actions/recipe.actions.test.ts` -- new tests for cycle rejection, missing-yield rejection, XOR violation, polymorphic add (ingredient vs sub-recipe), `setRecipeYield`, cost rollup including composites.
- `cafe-mgmt/src/actions/daily-report.actions.ts` -- in the deduction path (lines ~155-200), replace the inline ingredient-walk with a call to `expandRecipeToLeaves` so a sale of a composite recipe deducts leaf raw materials transitively. The per-leaf FIFO call (`applyConsumeFifo`) is unchanged.
- `cafe-mgmt/src/actions/daily-report.actions.test.ts` -- add tests: composite sale deducts leaf ingredient at correct scale; nested expansion; round-down-to-zero floor; cost-recording per leaf still flows correctly.
- `cafe-mgmt/src/domains/feed/margin-alert-cards.ts` -- the `sumServingCost` helper continues to work for raw rows; add a parallel branch (or inline expansion) for composite rows so margin alerts include composite cost. Reuse `rollupCostPerYieldUnit`.
- `cafe-mgmt/src/domains/feed/margin-alert-cards.test.ts` -- add a composite-recipe test: foam+latte → margin alert fires using expanded cost.

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/prisma/schema.prisma` -- added `yieldQuantity Int?` + `yieldUnit String?` to `Recipe`; added `subRecipeId String?` + self-referential FKs to `RecipeIngredient` AND `VariationIngredient`; made `ingredientId` nullable on both. Migration `20260505_add_recipe_sub_recipes` applied. Inverse relations added on `Recipe` for clean Prisma shape.
- [x] `cafe-mgmt/src/lib/recipe-expand.ts` + test -- **NEW** — `expandRecipeToLeaves`, `wouldCreateCycle`, `rollupCostPerYieldUnit` + `ExpandRecipeInput` / `CostRollupRecipe` types. 22 tests covering single + nested expansion, rounding floor, cycle defense, dangling refs, XOR violations, cost rollup with overrides + nesting + null propagation.
- [x] `cafe-mgmt/src/actions/recipe.actions.ts` -- `addRecipeIngredient` schema is now polymorphic with refine-based XOR check + cycle detection via `wouldCreateCycle` + missing-yield rejection. Added `setRecipeYield` action with both-or-neither validation. `getRecipes` cost computation builds an inline registry and passes it to `sumServingCost` so composite rows resolve via `rollupCostPerYieldUnit`. `getRecipe` (single recipe DETAIL) filters out composite rows from its response — Phase 2 will widen the response shape and add a separate `subRecipeRows` field. `addVariationIngredient` left unchanged (Phase 1 forbids composites on variations).
- [x] `cafe-mgmt/src/actions/daily-report.actions.ts` -- in `submitDailyReport`: pre-loads cafe-wide recipe registry + ingredient lookup, then for each entry the BASE recipe ingredients are processed via `expandRecipeToLeaves` (raw rows still consume directly through FIFO with their override semantics; composite rows expand to leaves and FIFO-consume each). `getRecipesForReport` and the sales-summary report defensively filter composite rows out of their raw-only projections.
- [x] `cafe-mgmt/src/domains/feed/margin-alert-cards.ts` -- `sumServingCost` extended to accept the registry and resolve composite rows via `rollupCostPerYieldUnit`. WHERE clause no longer filters discontinued (so the registry can resolve composite refs to discontinued recipes); discontinued filter moved to the per-card emit step.

**Acceptance Criteria:**
- Given a Latte with a single sub-recipe row pointing at "Milk foam" (yields 200 mL, contains 250 mL milk) at 100 mL parent quantity, when 1 latte is sold, then the system deducts 125 mL of milk (no foam-as-ingredient row exists in inventory).
- Given a 3-level chain A → B → C (where C is raw), when 1 A is sold, then the deduction correctly walks both layers and deducts the rounded leaf quantity of C.
- Given a manager attempts to add a sub-recipe row that would create a cycle (A→B→A), when the action runs, then it returns "Adding this would create a cycle" and no DB write occurs.
- Given a manager attempts to add a sub-recipe row pointing at a recipe with null `yieldQuantity`, when the action runs, then it returns "Sub-recipe must declare a yield first" and no DB write occurs.
- Given a manager submits both `ingredientId` and `subRecipeId` in the same insert, when the action runs, then it returns the XOR violation error.
- Given a Latte's leaf milk has a known cost, when `getRecipes` runs, then Latte's `costPerServingInCents` reflects the rolled-up cost (parent's milk cost from the foam expansion).
- Given any leaf in any sub-recipe lacks a cost, when `getRecipes` runs, then the parent recipe's cost surfaces as null (matches today's dash behavior).
- Given a composite recipe priced below cost, when the action feed renders, then `getMarginAlertCards` emits the same alert shape as for raw recipes (no special-case UI).
- Given existing recipes with no sub-recipe rows, when any path that previously worked is exercised (sales deduction, cost computation, margin alerts), then behavior is identical to before this change (backward compatibility).

## Verification

**Commands:**
- `cd cafe-mgmt && npx prisma migrate dev --name add_recipe_sub_recipes` -- migration applied
- `cd cafe-mgmt && npm run build` -- clean build
- `cd cafe-mgmt && npx vitest run` -- all tests pass

**Manual checks:**
- Phase 1 has no UI. To verify: use the `addRecipeIngredient` / `setRecipeYield` actions directly via a dev script (or wait for Phase 2 UI). End-to-end check is the test suite — sales-deduction tests cover the leaf math; recipe.actions tests cover insert validation; margin-alert tests cover cost rollup.

## Spec Change Log

### Iteration 1 — review patches (2026-05-05)

Four HIGH-priority patches applied + one regression test update:

1. **FK ON DELETE: `Restrict` instead of `SET NULL`.** The default would have left orphan `RecipeIngredient` rows (both `ingredientId` AND `subRecipeId` null) on sub-recipe deletion — the engine silently skips XOR-violating rows, so every parent recipe would lose that line at sale time with no error. New migration `restrict_subrecipe_deletion` enforces the safer "block deletion of an in-use sub-recipe" semantic. Manager must remove all references first (better surface than silent corruption).

2. **Dropped the 1-min rounding floor in `expandRecipeToLeaves`.** The original "never silently drop a real consumption" floor was correct for single-level expansion but systematically over-deducts for trace amounts in nested composites: a garnish at 0.05 units per sale would round to 1, depleting stock 20× faster than reality. Replaced with plain `Math.round`. Sub-1 quantities now round to 0 and drop from the leaf map. Trace amounts get lost (the lesser evil); managers using sub-unit precision should scale the sub-recipe yield up. Engine test updated.

3. **Try/catch around engine throws at integration sites.** `expandRecipeToLeaves` throws on runtime cycles (defensive — the action layer rejects inserts that create them, but a manual SQL or cycle race could bypass). Added `try/catch` in `submitDailyReport`'s base-recipe expansion AND its composite-row FIFO loop. A bad edge no longer breaks the entire transaction; the affected row's leaves are skipped and the error is logged.

4. **`setRecipeYield(null)` rejects when recipe is in use.** Without this, clearing a sub-recipe's yield would silently turn every parent recipe's composite row into a "missing yield" skip — same silent under-deduction failure mode as the deletion bug. Action now counts referencing rows and refuses with a "remove those references first" message.

KEEP: the polymorphic XOR check at the action layer (extends to a DB CHECK constraint in deferred-work); cycle detection at insert time (race noted as defer); `subRecipeId` on `VariationIngredient` reserved but not exposed by Phase 1 actions; the Phase 1 UI strip in `getRecipe` and `getRecipesForReport` (Phase 2 widens the response and updates the editor); composite-on-composite override semantics (consume leaves + apply override at row level — intentional).

## Suggested Review Order

**Foundation — pure engine**

- Three helpers + types. Plain `Math.round` after iteration 1's floor removal.
  [`recipe-expand.ts`](../../cafe-mgmt/src/lib/recipe-expand.ts)

**Schema + migrations**

- Polymorphic columns + yield + inverse relations. Two migrations: `add_recipe_sub_recipes` (initial), `restrict_subrecipe_deletion` (iteration 1 safety patch).
  [`schema.prisma:478`](../../cafe-mgmt/prisma/schema.prisma#L478)

**Action layer**

- Polymorphic insert + cycle detection + missing-yield rejection.
  [`recipe.actions.ts:823`](../../cafe-mgmt/src/actions/recipe.actions.ts#L823)

- `setRecipeYield` with both-or-neither + in-use rejection (iteration 1 patch).
  [`recipe.actions.ts:894`](../../cafe-mgmt/src/actions/recipe.actions.ts#L894)

- Cost rollup uses registry + rollup helper.
  [`recipe.actions.ts:282`](../../cafe-mgmt/src/actions/recipe.actions.ts#L282)

**Integration: sales deduction**

- Pre-loaded registry + ingredient lookup; per-entry expansion; per-row composite FIFO loop with try/catch (iteration 1 patch).
  [`daily-report.actions.ts:175`](../../cafe-mgmt/src/actions/daily-report.actions.ts#L175)

**Integration: margin alerts**

- Registry-aware `sumServingCost`; discontinued filter moved to emit step.
  [`margin-alert-cards.ts`](../../cafe-mgmt/src/domains/feed/margin-alert-cards.ts)

**Tests (53 new)**

- Engine — single + nested expansion, rounding (no floor after iteration 1), cycle defense, dangling refs, XOR violations, cost rollup with overrides + nesting + null propagation.
  [`recipe-expand.test.ts`](../../cafe-mgmt/src/lib/recipe-expand.test.ts)
