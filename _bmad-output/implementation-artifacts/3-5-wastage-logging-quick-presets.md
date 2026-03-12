# Story 3.5: Wastage Logging with Quick Presets

Status: backlog

## Story
As a **cafe user**,
I want to log wastage in 2 taps using quick presets,
so that I capture every loss without slowing down my shift.

## Acceptance Criteria (BDD)

### AC1: Wastage/Comp Screen Tabs
**Given** a user navigating to the Wastage/Comp screen
**When** the screen loads
**Then** two tabs are displayed at the top: "Wastage" (default) and "Comp"
**And** each tab shows its own transaction log, input controls, and weekly summary section
**And** the active tab is persisted in URL query param (`?tab=wastage` or `?tab=comp`) so links from checklists/feed can deep-link to the correct tab

### AC2: Quick-Log Presets
**Given** a user on the Wastage/Comp screen (Wastage tab)
**When** they tap to log wastage
**Then** they see quick-log presets: Spilled, Expired, Incorrect

### AC3: Quantity Input
**Given** a user selects a preset and an ingredient
**When** they are prompted for quantity
**Then** they can enter the quantity using the same slider/stepper input as inventory (respecting ingredient snap increments) or select from common quick amounts (1 unit, 1 serving)

### AC4: Wastage Entry Confirmation
**Given** a user confirms the wastage entry
**When** the entry is saved
**Then** the entry is recorded with: ingredient, quantity, preset reason, timestamp, and dollar value
**And** the dollar value is displayed prominently (e.g., "$4.80 wastage logged")

### AC5: Wastage Log View
**Given** wastage entries exist
**When** the user views the wastage log
**Then** entries are displayed in reverse chronological order with: item name, reason, dollar value, timestamp
**And** the user can filter and sort records

### AC6: Weekly Running Total
**Given** a wastage entry is logged
**When** the weekly view is checked
**Then** the entry's dollar value contributes to the running weekly wastage total

### AC7: Server Action Authorization
**Given** any Server Action in this story
**When** called by any user
**Then** the action validates `requireAuth()` and returns appropriate errors

## Tasks / Subtasks

- [ ] **Task 1: Database Schema — WastageEntry** (AC: #4)
  - [ ] Create `WastageEntry` model: id, cafeId, ingredientId, quantity (Int), reason (enum WastageReason: SPILLED, EXPIRED, INCORRECT), dollarValueInCents (Int), createdById (String), deletedAt (DateTime? — soft-delete), voidedAt (DateTime?), voidedById (String?), voidReason (String?), originalQuantity (Int?), correctedQuantity (Int?), createdAt, updatedAt. Relations. @@index([cafeId, createdAt])
  - [ ] Create `WastageReason` enum: SPILLED, EXPIRED, INCORRECT
  - [ ] Run migration

- [ ] **Task 2: Wastage Server Actions** (AC: #2, #3, #4, #5, #7)
  - [ ] Create `src/actions/wastage.actions.ts`:
    - `logWastage(formData)` — requireAuth(), Zod validates ingredientId, quantity (Int > 0), reason (WastageReason). Calculates dollarValueInCents server-side using `calculateDollarValue()`. Returns ActionResult<{ id: string, dollarValueInCents: number }>
    - `getWastageLog(formData?)` — requireAuth(), returns wastage entries for cafeId, reverse chronological, with optional filters (date range, ingredient, reason). Excludes soft-deleted entries.
    - `getWeeklyWastageTotals()` — requireAuth(), returns current week's total in cents

- [ ] **Task 3: Wastage/Comp Screen** (AC: #1)
  - [ ] Create `src/app/(app)/wastage-comp/page.tsx` — server component
  - [ ] Two-tab layout: Wastage (default) and Comp
  - [ ] Tab state persisted in URL query param `?tab=`

- [ ] **Task 4: Wastage Logging UI** (AC: #2, #3, #4)
  - [ ] Create `src/components/wastage/wastage-logger.tsx` — client component:
    - Step 1: Select preset (Spilled/Expired/Incorrect) — 3 large tap targets
    - Step 2: Select ingredient from list (searchable)
    - Step 3: Enter quantity via slider/stepper (reuse from Story 3.2) or quick amounts
    - Step 4: Confirm → show dollar value prominently
    - Toast: "$4.80 wastage logged"

- [ ] **Task 5: Wastage Log Component** (AC: #5, #6)
  - [ ] Create `src/components/wastage/wastage-log.tsx`:
    - Transaction log styled like bank statement
    - Amounts right-aligned, descriptions left-aligned
    - Filter by reason, ingredient, date range
    - Sort by date, amount
    - Weekly total displayed at top

- [ ] **Task 6: Tests** (AC: all)
  - [ ] Create `src/actions/wastage.actions.test.ts`:
    - Zod validation for quantity (> 0)
    - Reason enum validation
    - Dollar value calculation
    - Soft-deleted entries excluded from log

## Dev Notes

### Architecture Patterns
- ActionResult<T> for all Server Actions
- Dollar value calculated server-side: `calculateDollarValue(ingredient, quantity)` from Story 3.1
- Soft-delete pattern: `deletedAt` field, never hard-delete
- Transaction log: bank statement style per UX spec

### Wastage/Comp Screen Layout
```
[Wastage] [Comp]          ← Tab bar
─────────────────
Weekly Total: $47.20       ← Summary
─────────────────
[+ Log Wastage]            ← Primary action
─────────────────
Today                      ← Transaction log
  Oat milk - Spilled  $4.80  10:42am
  Beans - Expired    $12.50   9:15am
Yesterday
  ...
```

### What This Story Does NOT Include
- Auto-deduct from inventory (Story 3.6)
- Undo mechanism (Story 3.6)
- Manager void/correct (Story 3.7)

### Project Structure Notes
```
prisma/
└── schema.prisma                      ← MODIFY: Add WastageEntry, WastageReason enum

src/actions/
└── wastage.actions.ts                ← NEW: Wastage CRUD actions
└── wastage.actions.test.ts           ← NEW: Tests

src/components/wastage/
├── wastage-logger.tsx                ← NEW: Wastage logging flow
└── wastage-log.tsx                   ← NEW: Transaction log view

src/app/(app)/wastage-comp/
└── page.tsx                          ← NEW: Wastage/Comp screen
```

### References
- [Source: epics.md — Story 3.5]
- [Source: prd.md — FR40, FR45, FR46]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
