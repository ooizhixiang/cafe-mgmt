---
title: 'Recipe Variations with Independent Ingredients'
type: 'feature'
created: '2026-04-21'
status: 'done'
baseline_commit: '6a3b313'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Recipes only support a single version. In practice, a "Latte" may have variations like "Vanilla Latte" or "Iced Latte" that share base ingredients but add or change specific ones. Currently there's no way to model this.

**Approach:** Add a `RecipeVariation` model linked to a parent Recipe. Each variation has its own name and its own set of additional ingredients (via `VariationIngredient`). The base recipe keeps its ingredients as-is. In the sales report, the bartender picks the specific variation sold. Inventory deduction uses base ingredients + variation ingredients combined.

## Boundaries & Constraints

**Always:** Base recipe ingredients remain unchanged. Variations are optional — a recipe with zero variations works exactly as before. Sales report must let users pick either the base recipe or a specific variation.

**Ask First:** Nothing anticipated.

**Never:** Do not change the base RecipeIngredient model. Do not break existing sales entries or analysis.

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- add RecipeVariation + VariationIngredient models
- `src/actions/recipe.actions.ts` -- CRUD for variations + variation ingredients
- `src/components/operations/recipe-editor.tsx` -- UI to manage variations in recipe detail
- `src/actions/daily-report.actions.ts` -- update getRecipesForReport and submitDailyReport to handle variations
- `src/components/daily-report/daily-report-form.tsx` -- variation picker in sales form

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` -- add RecipeVariation (id, recipeId, name) and VariationIngredient (id, variationId, ingredientId, quantityPerServing) models with relations and cascade deletes
- [x] Run `prisma migrate dev --name add-recipe-variations`
- [x] `src/actions/recipe.actions.ts` -- add createVariation, deleteVariation, addVariationIngredient, removeVariationIngredient actions; update getRecipe to include variations with their ingredients
- [x] `src/components/operations/recipe-editor.tsx` -- add variations section in RecipeDetail: list variations, create/delete variation, add/remove variation-specific ingredients
- [x] `src/actions/daily-report.actions.ts` -- update getRecipesForReport to include variations; update submitDailyReport to accept optional variationId and combine base + variation ingredients for deduction
- [x] `src/components/daily-report/daily-report-form.tsx` -- when a recipe has variations, show a dropdown to pick base or variation; deduct accordingly

**Acceptance Criteria:**
- Given a recipe exists, when a manager adds a variation with a name, then it appears under the recipe's variations list
- Given a variation exists, when a manager adds ingredients to it, then those ingredients are listed under that variation
- Given a recipe with no variations, when viewing the sales form, then it works as before (simple counter)
- Given a recipe with variations, when viewing the sales form, then user can pick which variation was sold
- Given a variation sale is submitted, when inventory is deducted, then both base recipe ingredients AND variation ingredients are deducted
- Given the build, when running `npx next build`, then it compiles with no errors

## Spec Change Log

## Verification

**Commands:**
- `npx next build` -- expected: compiles with no errors
