# Story 4.2: Call Outcome Logging & Supplier Reminders

Status: backlog

## Story
As a **cafe manager**,
I want to log call outcomes in one tap and see supplier reminders on the feed,
so that I never forget to follow up on orders.

## Acceptance Criteria (BDD)

### AC1: Call Outcome Prompt
**Given** a user has just called a supplier
**When** they return to the app and tap "Log Call Outcome" on the supplier card
**Then** a call outcome prompt appears with one-tap options: Ordered, No Answer, Call Back

### AC2: Outcome Recording
**Given** the user taps an outcome
**When** the outcome is recorded
**Then** the call log entry is saved with: supplier, outcome, timestamp
**And** if "Ordered", the supplier's last order date is updated

### AC3: Supplier Reminder on Feed
**Given** a supplier's last order was more than a configurable number of days ago
**When** the feed renders
**Then** a supplier reminder card appears on the Action Feed: "Call [Supplier] today (last order: X days ago)"
**And** the card uses blue `--color-info` border

### AC4: Reminder Card Action
**Given** a supplier reminder is on the feed
**When** the manager taps the card
**Then** they are navigated to the supplier's contact with tap-to-call ready

### AC5: Reminder Resolution
**Given** the manager calls the supplier and logs "Ordered"
**When** the feed refreshes
**Then** the reminder card is resolved

## Tasks / Subtasks

- [ ] **Task 1: Database Schema — SupplierCallLog** (AC: #1, #2)
  - [ ] Create `SupplierCallLog` model: id, supplierId, outcome (enum CallOutcome: ORDERED, NO_ANSWER, CALL_BACK), calledById (String), createdAt. @@index([supplierId, createdAt])
  - [ ] Create `CallOutcome` enum: ORDERED, NO_ANSWER, CALL_BACK
  - [ ] Add `reminderDays` field to Supplier model (Int @default(7) — configurable threshold)
  - [ ] Run migration

- [ ] **Task 2: Call Outcome Server Actions** (AC: #1, #2)
  - [ ] Add to `src/actions/supplier.actions.ts`:
    - `logCallOutcome(formData)` — requireAuth(), Zod validates supplierId + outcome. If ORDERED: updates Supplier.lastOrderDate. Returns ActionResult<void>
    - `getCallLog(formData)` — requireAuth(), returns call log for supplier

- [ ] **Task 3: Supplier Reminder Card Provider** (AC: #3, #5)
  - [ ] Create `src/domains/feed/supplier-reminder-cards.ts`:
    - `getSupplierReminderCards(cafeId)` — checks all suppliers where lastOrderDate + reminderDays < now
    - Returns reminder cards with supplier name and days since last order
    - Resolved when lastOrderDate is updated (ORDERED outcome)

- [ ] **Task 4: Feed Composer Integration** (AC: #3)
  - [ ] Update `src/domains/feed/composer.ts`:
    - Include `getSupplierReminderCards()` in Promise.allSettled

- [ ] **Task 5: Call Outcome UI** (AC: #1)
  - [ ] Create `src/components/operations/call-outcome-prompt.tsx`:
    - Three large buttons: Ordered, No Answer, Call Back
    - One-tap selection, immediate save
    - Toast on success

- [ ] **Task 6: Tests** (AC: all)
  - [ ] Create `src/domains/feed/supplier-reminder-cards.test.ts`:
    - Reminder generated when lastOrderDate > reminderDays ago
    - No reminder when recently ordered
    - No reminder when lastOrderDate is null (never ordered — include these)

## Dev Notes

### Architecture Patterns
- Feed composer's supplier domain: `getSupplierReminderCards()`
- Reminder threshold configurable per supplier (default: 7 days)
- Supplier card variant with blue border

### What This Story Does NOT Include
- Recipe management (Story 4.3)

### Project Structure Notes
```
prisma/
└── schema.prisma                      ← MODIFY: Add SupplierCallLog, CallOutcome enum, reminderDays

src/actions/
└── supplier.actions.ts               ← MODIFY: Add logCallOutcome, getCallLog

src/domains/feed/
└── supplier-reminder-cards.ts        ← NEW: Supplier reminder card provider
└── supplier-reminder-cards.test.ts   ← NEW: Tests

src/components/operations/
└── call-outcome-prompt.tsx           ← NEW: One-tap outcome logging
```

### References
- [Source: epics.md — Story 4.2]
- [Source: prd.md — FR58, FR59]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
