# Story 4.3: Recipe Management with Step-by-Step Guide & Cost

Status: backlog

## Story
As a **cafe manager**,
I want to create recipes with step-by-step preparation instructions and see the cost per serving,
so that staff follow consistent preparation and I understand my true cost per menu item.

## Acceptance Criteria (BDD)

### AC1: Create Recipe
**Given** an authenticated manager on the Operations screen (Recipes tab)
**When** they create a new recipe
**Then** they can enter: recipe name, serving size, and a description

### AC2: Add Ingredients to Recipe
**Given** a manager building a recipe
**When** they add ingredients
**Then** they select from the cafe's ingredient list with quantity per serving for each
**And** each ingredient shows its current inventory status (in stock / low / out)

### AC3: Add Preparation Steps
**Given** a manager building a recipe
**When** they add preparation steps
**Then** they can add numbered step-by-step instructions in order
**And** steps can be reordered, edited, and deleted

### AC4: Cost Per Serving
**Given** a recipe has ingredients with cost-per-unit configured
**When** the recipe is viewed
**Then** the system calculates and displays cost per serving: sum of (ingredient quantity x cost per unit) for all ingredients
**And** the cost is displayed in dollars using `formatCents()`

### AC5: Live Cost Updates
**Given** an ingredient's cost per unit is updated (FR74)
**When** a recipe containing that ingredient is viewed afterward
**Then** the cost per serving reflects the updated ingredient cost (calculated live, not cached)

### AC6: Low-Stock Indicator
**Given** a recipe's ingredient is currently below its low-stock threshold
**When** the recipe is viewed
**Then** the ingredient shows a visual indicator (amber) that stock is low

### AC7: Edit Recipe
**Given** a manager editing an existing recipe
**When** they modify ingredients, steps, or details
**Then** changes are saved with confirmation

### AC8: Delete Recipe
**Given** a manager deleting a recipe
**When** they confirm deletion
**Then** the recipe is removed

### AC9: Server Action Authorization
**Given** any Server Action in this story
**When** called by any user
**Then** the action validates `requireRole('MANAGER')`

## Tasks / Subtasks

- [ ] **Task 1: Database Schema — Recipe Models** (AC: #1, #2, #3)
  - [ ] Create `Recipe` model: id, name (String), description (String?), servingSize (String?), cafeId, createdAt, updatedAt. @@index([cafeId])
  - [ ] Create `RecipeIngredient` model: id, recipeId, ingredientId, quantityPerServing (Int), createdAt. Relations to Recipe, Ingredient. @@index([recipeId])
  - [ ] Create `RecipeStep` model: id, recipeId, stepNumber (Int), instruction (String), createdAt, updatedAt. @@index([recipeId])
  - [ ] Run migration

- [ ] **Task 2: Recipe Server Actions** (AC: #1, #2, #3, #7, #8, #9)
  - [ ] Create `src/actions/recipe.actions.ts`:
    - `getRecipes()` — requireAuth(), returns all recipes for cafeId with ingredient count and cost
    - `getRecipe(formData)` — requireAuth(), returns recipe with all ingredients (with inventory status) and steps
    - `createRecipe(formData)` — requireRole('MANAGER'), Zod validates name, description, servingSize
    - `updateRecipe(formData)` — requireRole('MANAGER')
    - `deleteRecipe(formData)` — requireRole('MANAGER')
    - `addRecipeIngredient(formData)` — requireRole('MANAGER'), validates ingredient belongs to cafeId
    - `removeRecipeIngredient(formData)` — requireRole('MANAGER')
    - `addRecipeStep(formData)` — requireRole('MANAGER'), auto-assigns stepNumber
    - `updateRecipeStep(formData)` — requireRole('MANAGER')
    - `deleteRecipeStep(formData)` — requireRole('MANAGER')
    - `reorderRecipeSteps(formData)` — requireRole('MANAGER'), updates stepNumbers in $transaction

- [ ] **Task 3: Cost Calculation** (AC: #4, #5)
  - [ ] In `getRecipe()`: calculate cost per serving live: `SUM(recipeIngredient.quantityPerServing * ingredient.costPerUnitInCents)`
  - [ ] Handle null costs gracefully (show "Cost unavailable for some ingredients")

- [ ] **Task 4: Recipes Tab on Operations** (AC: #1)
  - [ ] Add Recipes tab to Operations screen (`/operations?tab=recipes`)
  - [ ] Recipe list view with name, ingredient count, and cost per serving

- [ ] **Task 5: Recipe Editor Component** (AC: #1, #2, #3, #6)
  - [ ] Create `src/components/operations/recipe-editor.tsx`:
    - Recipe details form (name, description, serving size)
    - Ingredient selector from cafe's list with quantity input
    - Inventory status indicator per ingredient (green/amber/red)
    - Step-by-step instruction editor with numbered list
    - Reorder steps with up/down buttons
    - Cost per serving displayed at bottom

- [ ] **Task 6: Tests** (AC: all)
  - [ ] Create `src/actions/recipe.actions.test.ts`:
    - Cost calculation with mixed null/non-null costs
    - Step reordering updates numbers correctly
    - Recipe deletion cascades to ingredients and steps

## Dev Notes

### Architecture Patterns
- Cost per serving calculated LIVE (not cached) — always reflects current ingredient costs
- Inventory status joined from latest InventoryCount per ingredient
- Steps stored with stepNumber for ordering
- Manager-only for all CRUD operations

### Cost Calculation
```typescript
const costPerServing = recipe.ingredients.reduce((sum, ri) => {
  if (!ri.ingredient.costPerUnitInCents) return sum; // skip unknown cost
  return sum + (ri.quantityPerServing * ri.ingredient.costPerUnitInCents);
}, 0);
```

### What This Story Does NOT Include
- Recipe sharing or printing
- Menu pricing (future enhancement)

### Project Structure Notes
```
prisma/
└── schema.prisma                      ← MODIFY: Add Recipe, RecipeIngredient, RecipeStep

src/actions/
└── recipe.actions.ts                 ← NEW: Recipe CRUD actions
└── recipe.actions.test.ts            ← NEW: Tests

src/components/operations/
└── recipe-editor.tsx                 ← NEW: Recipe editor component

src/app/(app)/operations/
└── page.tsx                          ← MODIFY: Add Recipes tab
```

### References
- [Source: epics.md — Story 4.3]
- [Source: prd.md — FR60, FR61]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
