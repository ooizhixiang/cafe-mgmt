# Story 3.2: Inventory Counting with Slider Input

Status: backlog

## Story
As a **cafe user**,
I want to update inventory quantities quickly using a slider with pre-filled values,
so that daily counts take under 60 seconds.

## Acceptance Criteria (BDD)

### AC1: Pre-Filled Inventory Display
**Given** a user on the Inventory screen
**When** the screen loads
**Then** all ingredients are displayed with previous day's values pre-filled
**And** pinned ingredients appear at the top

### AC2: Single-Tap Confirm
**Given** a user viewing an ingredient with a pre-filled value
**When** they tap to confirm without changing
**Then** the value is confirmed with a single tap and a visual checkmark appears

### AC3: Slider Input
**Given** a user adjusting an ingredient quantity
**When** they drag the slider
**Then** the slider snaps to the configured increments for that ingredient
**And** the slider feels heavy with snap resistance to prevent accidental changes
**And** the interaction renders at 60fps on 320px screens

### AC4: Large Change Confirmation
**Given** a user changes a value by more than 50% from the previous day
**When** they release the slider
**Then** a confirmation prompt appears asking them to verify the large change

### AC5: Bulk Confirm Unchanged
**Given** multiple ingredients have unchanged values
**When** the user wants to confirm them quickly
**Then** a "Confirm All Unchanged" bulk button confirms all items that match their previous day's values in a single tap

### AC6: Filter & Sort
**Given** a user on the Inventory screen
**When** they use filter or sort controls
**Then** they can filter by category (from ingredient categories in Story 3.1) and sort by name, quantity, or last updated

### AC7: Stepper Fallback
**Given** the slider does not achieve 60fps on target devices during development
**When** the fallback is needed
**Then** a stepper component (+ / - buttons with increment steps) replaces the slider

### AC8: Server Action Authorization
**Given** any Server Action in this story
**When** called by any user
**Then** the action validates `requireAuth()` and returns appropriate errors

## Tasks / Subtasks

- [ ] **Task 1: Database Schema — InventoryCount** (AC: #1, #2)
  - [ ] Create `InventoryCount` model: id, ingredientId, countDate (DateTime @db.Date), quantity (Int), confirmedById (String), confirmedAt (DateTime), createdAt. Relations to Ingredient, User. @@unique([ingredientId, countDate]) @@index([ingredientId, countDate])
  - [ ] Run migration

- [ ] **Task 2: Inventory Server Actions** (AC: #1, #2, #5, #8)
  - [ ] Create `src/actions/inventory.actions.ts`:
    - `getInventoryCounts()` — requireAuth(), returns all ingredients for cafeId with today's count (if exists) and previous day's count for pre-fill, ordered by isPinned desc then displayOrder
    - `saveInventoryCount(formData)` — requireAuth(), Zod validates ingredientId + quantity (Int >= 0), upserts count for today, returns ActionResult<void>
    - `bulkConfirmUnchanged(formData)` — requireAuth(), accepts array of ingredientIds, creates counts matching previous day's values, returns ActionResult<{ confirmed: number }>

- [ ] **Task 3: Inventory Slider Component** (AC: #3, #7)
  - [ ] Create `src/components/inventory/quantity-slider.tsx`:
    - Built on Radix primitive with raw `requestAnimationFrame` — no framer-motion/react-spring
    - Props: mode ("percentage" | "discrete"), snapIncrement, min, max, value, onChange
    - Snap resistance: slider "sticks" to snap points, requires deliberate drag past threshold
    - 60fps target on 320px screens
    - Stepper fallback: + / - buttons with configured increment
    - Display current value prominently during drag

- [ ] **Task 4: Inventory Screen** (AC: #1, #2, #4, #5, #6)
  - [ ] Create `src/app/(app)/inventory/page.tsx` — server component
  - [ ] Create `src/components/inventory/inventory-list.tsx` — client component:
    - List of ingredients with pre-filled values
    - Pinned items at top
    - Each item: name, unit, current value, slider/stepper, confirm button
    - Checkmark animation on confirm
    - "Confirm All Unchanged" bulk button at top
    - Large change (>50%) confirmation dialog
    - Filter by category dropdown, sort by name/quantity/last updated

- [ ] **Task 5: Tests** (AC: all)
  - [ ] Create `src/actions/inventory.actions.test.ts`:
    - Quantity validation (integer, >= 0)
    - Bulk confirm creates correct number of records
  - [ ] Create `src/components/inventory/quantity-slider.test.ts`:
    - Snap increment applied correctly
    - Percentage and discrete modes

## Dev Notes

### Architecture Patterns (MUST FOLLOW)
- ActionResult<T> for all Server Actions
- Never accept cafeId from client
- Slider/stepper handles two input modes: percentage (0-100%) and discrete (integer counts)
- Reused by Story 3.5 for wastage quantity input

### Slider Implementation
```typescript
// Built on Radix Slider primitive
// requestAnimationFrame for 60fps
// NO framer-motion, react-spring, or other animation libraries (NFR6: <200KB bundle)
// Stepper fallback if 60fps not achieved on mid-range Android
```

### What This Story Does NOT Include
- Concurrent edit handling (Story 3.3)
- Dollar attribution on changes (Story 3.3)
- Low-stock alerts (Story 3.4)

### Project Structure Notes
```
prisma/
└── schema.prisma                      ← MODIFY: Add InventoryCount model

src/actions/
└── inventory.actions.ts               ← NEW: Inventory CRUD actions
└── inventory.actions.test.ts          ← NEW: Tests

src/components/inventory/
├── quantity-slider.tsx                ← NEW: Slider/stepper component
├── quantity-slider.test.ts           ← NEW: Slider tests
└── inventory-list.tsx                ← NEW: Inventory list with filtering

src/app/(app)/inventory/
└── page.tsx                          ← NEW: Inventory screen
```

### References
- [Source: epics.md — Story 3.2]
- [Source: prd.md — FR33-FR38]
- [Source: ux-design-specification.md — Custom Slider, Inventory Screen]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
