# Story 3.8: Comp Logging & Budget Tracking

Status: backlog

## Story
As a **cafe user**,
I want to log comps with dollar values and see the remaining weekly budget,
so that I can make comp decisions autonomously within budget.

## Acceptance Criteria (BDD)

### AC1: Comp Event Logging
**Given** a user on the Wastage/Comp screen (Comp tab)
**When** they log a comp event
**Then** they select the item, quantity, and provide a reason
**And** the dollar value is calculated and displayed (e.g., "$5.50 logged")

### AC2: Comp Confirmation with Budget
**Given** a comp entry is logged
**When** the confirmation appears
**Then** the remaining weekly budget is updated and displayed: "Budget: $6.50 remaining"
**And** a 5-second undo toast is shown (same pattern as wastage undo in Story 3.6)

### AC3: Flag for Review
**Given** a staff member logged a comp entry they want to correct
**When** the undo window has passed
**Then** they can tap "Flag for Review" on the entry to mark it for manager attention
**And** the manager sees flagged entries highlighted in the comp log

### AC4: Manager Void/Correct Flagged
**Given** a manager views the comp log with flagged entries
**When** they select a flagged entry
**Then** they can void the entry, correct the amount, or dismiss the flag
**And** void/correct uses transactional pattern: soft-delete + recalculate remaining budget

### AC5: Budget Configuration
**Given** a manager on the Settings screen
**When** they configure the comp budget under a new "Comp Budget" section
**Then** they can set the weekly budget amount (in dollars) and the reset day (e.g., Monday)

### AC6: Weekly Budget Reset
**Given** the configured reset day arrives
**When** the weekly period ends
**Then** comp tracking resets to the full budget amount for the new week

### AC7: No Budget Configured
**Given** no comp budget has been configured
**When** a user logs a comp
**Then** the comp is recorded successfully with a prompt suggesting the manager set a budget

### AC8: Budget Visibility
**Given** the remaining comp budget is displayed
**When** any user views the summary bar or comp tab
**Then** the remaining amount is visible to all users (manager and staff)

### AC9: Server Action Authorization
**Given** any Server Action in this story
**When** called by any user
**Then** the action validates appropriate auth — comp logging for all, budget config for manager only

## Tasks / Subtasks

- [ ] **Task 1: Database Schema — Comp Models** (AC: #1, #5, #6)
  - [ ] Create `CompEntry` model: id, cafeId, ingredientId, quantity (Int), reason (String), dollarValueInCents (Int), createdById (String), flaggedForReview (Boolean @default(false)), deletedAt (DateTime?), voidedAt (DateTime?), voidedById (String?), createdAt, updatedAt. @@index([cafeId, createdAt])
  - [ ] Create `CompBudget` model: id, cafeId (String @unique), amountInCents (Int), resetDay (Int — 0=Sunday through 6=Saturday), createdAt, updatedAt. Relation to Cafe.
  - [ ] Run migration

- [ ] **Task 2: Comp Server Actions** (AC: #1, #2, #7, #9)
  - [ ] Create `src/actions/comp.actions.ts`:
    - `logComp(formData)` — requireAuth(), Zod validates ingredientId, quantity, reason (non-empty). Calculates dollarValueInCents. Returns ActionResult<{ id, dollarValueInCents, budgetRemainingInCents: number | null }>
    - `undoComp(formData)` — requireAuth(), soft-delete within 5s window, returns ActionResult<void>
    - `getCompLog(formData?)` — requireAuth(), returns comp entries reverse chronological, excludes deleted
    - `getCompBudgetRemaining()` — requireAuth(), calculates: budgetInCents - SUM(compEntry.dollarValueInCents WHERE createdAt >= mostRecentResetDay), returns ActionResult<{ remainingInCents: number | null, budgetInCents: number | null }>

- [ ] **Task 3: Budget Configuration Actions** (AC: #5, #6, #9)
  - [ ] Add to `src/actions/comp.actions.ts`:
    - `updateCompBudget(formData)` — requireRole('MANAGER'), Zod validates amountInCents (Int > 0), resetDay (0-6). Upserts CompBudget. Returns ActionResult<void>
    - `getCompBudget()` — requireAuth(), returns budget config

- [ ] **Task 4: Flag & Void/Correct Actions** (AC: #3, #4, #9)
  - [ ] Add to `src/actions/comp.actions.ts`:
    - `flagCompForReview(formData)` — requireAuth(), sets flaggedForReview = true
    - `voidComp(formData)` — requireRole('MANAGER'), soft-delete + recalculate
    - `correctComp(formData)` — requireRole('MANAGER'), update quantity + recalculate dollar value
    - `dismissFlag(formData)` — requireRole('MANAGER'), sets flaggedForReview = false

- [ ] **Task 5: Comp Logger UI** (AC: #1, #2)
  - [ ] Create `src/components/comp/comp-logger.tsx`:
    - Select ingredient, enter quantity, provide reason
    - Dollar value displayed on confirmation
    - Remaining budget shown after logging
    - Uses undo toast infrastructure from Story 3.6

- [ ] **Task 6: Comp Log Component** (AC: #3, #4)
  - [ ] Create `src/components/comp/comp-log.tsx`:
    - Transaction log (bank statement style)
    - Flagged entries highlighted
    - Staff: "Flag for Review" action
    - Manager: void/correct/dismiss flag actions

- [ ] **Task 7: Budget Settings UI** (AC: #5)
  - [ ] Create `src/components/settings/comp-budget.tsx`:
    - Dollar amount input → converted to cents
    - Reset day dropdown (Monday-Sunday)
    - Add to Settings page under "Comp Budget" section

- [ ] **Task 8: Summary Bar Integration** (AC: #8)
  - [ ] Update `src/components/ui/summary-bar.tsx`:
    - Show comp budget remaining from FeedResponse
    - Format: "Comp: $45.50 left"

- [ ] **Task 9: Tests** (AC: all)
  - [ ] Create `src/actions/comp.actions.test.ts`:
    - Budget remaining calculated correctly (budget - sum of entries since reset day)
    - Reset day boundary calculation
    - Voided entries excluded from budget calculation
    - Flag toggle works

## Dev Notes

### Architecture Patterns
- **Comp budget remaining is ALWAYS calculated, never stored.** Formula: `budgetInCents - SUM(compEntry.dollarValueInCents WHERE createdAt >= mostRecentResetDay)`. No cron, no stored balance.
- **Comp entries do NOT auto-deduct from inventory.** Comps track dollar spend only. Inventory changes from comped items captured in next daily count (Story 3.2).
- Undo toast reused from Story 3.6's infrastructure
- Money as integer cents throughout

### Budget Calculation
```typescript
function getWeekStart(resetDay: number, timezone: string): Date {
  const now = getCafeNow(timezone);
  // Walk back to most recent resetDay
  // Return start of that day in cafe timezone
}

const remaining = budget.amountInCents - await prisma.compEntry.aggregate({
  where: {
    cafeId,
    createdAt: { gte: weekStart },
    deletedAt: null,
    voidedAt: null,
  },
  _sum: { dollarValueInCents: true },
});
```

### What This Story Does NOT Include
- Comp budget warnings on feed (Story 3.9)
- Weekly aggregation display (Story 3.10)

### Project Structure Notes
```
prisma/
└── schema.prisma                      ← MODIFY: Add CompEntry, CompBudget

src/actions/
└── comp.actions.ts                   ← NEW: All comp actions
└── comp.actions.test.ts              ← NEW: Tests

src/components/comp/
├── comp-logger.tsx                   ← NEW: Comp logging flow
└── comp-log.tsx                      ← NEW: Transaction log

src/components/settings/
└── comp-budget.tsx                   ← NEW: Budget configuration

src/components/ui/
└── summary-bar.tsx                   ← MODIFY: Add comp budget display

src/app/(app)/settings/
└── page.tsx                          ← MODIFY: Add Comp Budget section
```

### References
- [Source: epics.md — Story 3.8]
- [Source: prd.md — FR49-FR55]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
