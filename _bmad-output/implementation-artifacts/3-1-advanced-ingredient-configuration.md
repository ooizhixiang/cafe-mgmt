# Story 3.1: Advanced Ingredient Configuration

Status: backlog

## Story
As a **cafe manager**,
I want to configure cost, container profiles, snap increments, categories, and pinning on my ingredients,
so that inventory tracking reflects how my cafe actually uses each item and every change carries a dollar value.

## Acceptance Criteria (BDD)

### AC1: Advanced Configuration Access
**Given** ingredients already exist from template setup (Story 1.4)
**When** the manager navigates to Inventory settings
**Then** they can enhance any ingredient with: container profile (e.g., "case (6-pack)"), cost per unit in dollars, snap increments, category, low-stock threshold, and pinning

### AC2: Integer Cents Storage
**Given** a manager adding an ingredient with a cost
**When** the cost is saved
**Then** it is stored as integer cents in the database (e.g., $4.80 → 480)
**And** displayed using `formatCents()` throughout the app

### AC3: Cost Applies to Future Events Only
**Given** a manager editing an ingredient
**When** they update the cost per unit
**Then** the new cost applies to future events only — historical wastage/comp dollar values are unchanged

### AC4: Snap Increment Configuration
**Given** a manager configuring an ingredient
**When** they set snap increments for the slider
**Then** the increment value is saved per ingredient (e.g., milk by 10%, beans by 250g bags)

### AC5: Pinning
**Given** a manager viewing the ingredient list
**When** they tap the pin icon on an ingredient
**Then** that ingredient is pinned to the top of the inventory list
**And** multiple ingredients can be pinned

### AC6: Category Assignment
**Given** a manager adding an ingredient
**When** they configure the ingredient
**Then** they can optionally assign a category (e.g., "Dairy", "Coffee", "Syrups", "Dry Goods")
**And** categories are used for filtering on the Inventory screen in Story 3.2

### AC7: Container-Based Dollar Attribution
**Given** a manager configuring a percentage-based ingredient (e.g., milk tracked as 0-100%)
**When** they set cost per unit
**Then** they also configure a `unitsPerContainer` value (e.g., "1 container = 4 litres") so the system can convert percentage changes to dollar amounts
**And** dollar attribution formula: `(percentageDelta / 100) * unitsPerContainer * costPerUnit`

### AC8: Server Action Authorization
**Given** any Server Action in this story
**When** called by any user
**Then** the action validates `requireRole('MANAGER')` and returns unauthorized error if not a manager

## Tasks / Subtasks

- [ ] **Task 1: Database Schema — Ingredient Extension** (AC: #1, #7)
  - [ ] Add `unitsPerContainer` field to Ingredient model (Int? — for percentage-based dollar attribution)
  - [ ] Verify existing optional fields from Story 1.4: costPerUnitInCents, snapIncrement, containerProfile, category, isPinned, lowStockThreshold
  - [ ] Run migration if schema changes needed

- [ ] **Task 2: Ingredient Configuration Server Actions** (AC: #1-#8)
  - [ ] Add to `src/actions/ingredient.actions.ts`:
    - `updateIngredientConfig(formData)` — requireRole('MANAGER'), Zod validates: costPerUnitInCents (Int >= 0), snapIncrement (Int > 0), containerProfile (string max 100), category (string max 50), lowStockThreshold (Int >= 0), unitsPerContainer (Int > 0), isPinned (boolean). All optional. Returns ActionResult<void>
    - `togglePin(formData)` — requireRole('MANAGER'), toggles isPinned, returns ActionResult<void>

- [ ] **Task 3: Ingredient Configuration UI** (AC: #1, #4, #5, #6, #7)
  - [ ] Create `src/app/(app)/settings/ingredients/page.tsx` — server component
  - [ ] Create `src/components/settings/ingredient-config.tsx` — client component:
    - List of ingredients with current config summary
    - Tap ingredient to expand configuration form
    - Fields: cost per unit (dollar input → converted to cents), snap increment, container profile, category (freeform text), low-stock threshold, units per container
    - Pin toggle icon on each ingredient row
    - Save button per ingredient
    - Toast on success

- [ ] **Task 4: Settings Integration** (AC: #1)
  - [ ] Add "Ingredient Management" section to Settings page
  - [ ] Link to `/settings/ingredients`

- [ ] **Task 5: Dollar Attribution Utility** (AC: #2, #7)
  - [ ] Create `src/lib/dollar-attribution.ts`:
    - `calculateDollarValue(ingredient, quantityDelta)` — handles both discrete and percentage-based ingredients
    - For percentage: `(percentageDelta / 100) * unitsPerContainer * costPerUnitInCents`
    - For discrete: `quantityDelta * costPerUnitInCents`
    - Returns value in cents

- [ ] **Task 6: Tests** (AC: all)
  - [ ] Create `src/actions/ingredient.actions.test.ts` (extend):
    - Zod validation for cost (integer, >= 0)
    - Snap increment validation (integer, > 0)
    - Category max length
  - [ ] Create `src/lib/dollar-attribution.test.ts`:
    - Discrete ingredient: correct dollar calculation
    - Percentage ingredient: correct dollar calculation with unitsPerContainer
    - Zero cost ingredient returns 0
    - Null cost returns null (no dollar attribution)

## Dev Notes

### Architecture Patterns (MUST FOLLOW)
- Money as integer cents: `costPerUnitInCents` (Int)
- `formatCents(480)` → `"$4.80"` from `src/lib/format.ts`
- ActionResult<T> for all Server Actions
- Never accept cafeId from client
- Zod validates integers at boundary (dollar input → cents conversion happens client-side before submission)
- Categories are freeform text, not a separate table — MVP simplicity
- Prisma imports from `@/generated/prisma/client` and `@/generated/prisma/enums`
- Tests co-located as `.test.ts`

### Dollar Attribution Formula
```typescript
// For percentage-based ingredients (e.g., milk at 40% → 28%):
const dollarValue = Math.round(
  (percentageDelta / 100) * ingredient.unitsPerContainer * ingredient.costPerUnitInCents
);

// For discrete ingredients (e.g., 3 bags of coffee):
const dollarValue = quantityDelta * ingredient.costPerUnitInCents;
```

### What This Story Does NOT Include
- Inventory counting UI with slider (Story 3.2)
- Inventory screen (Story 3.2)
- Low-stock alerts on feed (Story 3.4)
- Wastage/comp that use these costs (Stories 3.5, 3.8)

### Project Structure Notes
```
prisma/
└── schema.prisma                      ← MODIFY: Add unitsPerContainer to Ingredient (if not in 1.4)

src/actions/
└── ingredient.actions.ts              ← MODIFY: Add updateIngredientConfig, togglePin
└── ingredient.actions.test.ts         ← MODIFY: Add config validation tests

src/lib/
└── dollar-attribution.ts             ← NEW: Dollar value calculation utility
└── dollar-attribution.test.ts        ← NEW: Dollar attribution tests

src/components/settings/
└── ingredient-config.tsx             ← NEW: Ingredient configuration UI

src/app/(app)/settings/ingredients/
└── page.tsx                          ← NEW: Ingredient settings page
```

### Previous Story Intelligence
- Story 1.4 established the Ingredient model with basic fields and template-based creation
- Story 1.3 established the Settings page structure and navigation patterns
- `formatCents()` utility exists in `src/lib/format.ts`

### References
- [Source: epics.md — Story 3.1]
- [Source: architecture.md — Money as Integer Cents, formatCents]
- [Source: prd.md — FR30-FR32, FR74]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
