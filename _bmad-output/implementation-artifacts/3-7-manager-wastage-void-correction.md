# Story 3.7: Manager Wastage Void & Correction

Status: backlog

## Story
As a **cafe manager**,
I want to void or correct wastage entries after the undo window,
so that mistakes can be fixed anytime without losing data integrity.

## Acceptance Criteria (BDD)

### AC1: Void/Correct Options
**Given** an authenticated manager viewing wastage records
**When** they select a finalized wastage entry
**Then** they see options to void or correct the entry

### AC2: Void Entry
**Given** a manager voids a wastage entry
**When** the void is confirmed
**Then** the entry is marked as voided (soft-delete with void reason)
**And** the inventory quantity is restored by the original deduction amount within a database transaction

### AC3: Correct Entry
**Given** a manager corrects a wastage entry
**When** they update the quantity
**Then** the inventory difference is recalculated and adjusted within a transaction
**And** the original entry is preserved with an audit trail

### AC4: Voided Entries Excluded from Totals
**Given** a voided entry existed
**When** the weekly totals are viewed
**Then** the voided entry's dollar value is excluded from aggregated totals

### AC5: Recoverability
**Given** an entry was undone or voided
**When** checked after 24 hours
**Then** the soft-deleted record is still recoverable in the database

### AC6: Server Action Authorization
**Given** any Server Action in this story
**When** called by any user
**Then** the action validates `requireRole('MANAGER')` — staff cannot void

## Tasks / Subtasks

- [ ] **Task 1: Void Server Action** (AC: #2, #5, #6)
  - [ ] Add to `src/actions/wastage.actions.ts`:
    - `voidWastage(formData)` — requireRole('MANAGER'), validates entry belongs to cafeId, wraps in $transaction: set voidedAt + voidedById + voidReason, restore inventory quantity, recheck thresholds. Returns ActionResult<void>

- [ ] **Task 2: Correct Server Action** (AC: #3, #6)
  - [ ] Add to `src/actions/wastage.actions.ts`:
    - `correctWastage(formData)` — requireRole('MANAGER'), accepts new quantity, wraps in $transaction: store originalQuantity + correctedQuantity on entry, adjust inventory by difference, recalculate dollarValueInCents. Returns ActionResult<void>

- [ ] **Task 3: Void/Correct UI** (AC: #1)
  - [ ] Create `src/components/wastage/void-correct-dialog.tsx`:
    - Triggered from wastage log entry tap (manager only)
    - Two options: "Void" (with reason text input) and "Correct" (with new quantity input)
    - Confirmation step before action
    - Toast on success

- [ ] **Task 4: Wastage Log Enhancement** (AC: #4)
  - [ ] Update wastage log to:
    - Show voided entries with visual strikethrough
    - Show corrected entries with original and new values
    - Manager sees void/correct actions; staff does not

- [ ] **Task 5: Tests** (AC: all)
  - [ ] Extend `src/actions/wastage.actions.test.ts`:
    - Void restores correct inventory quantity
    - Correct adjusts inventory by difference
    - Voided entries excluded from weekly totals query
    - Staff cannot void (unauthorized)

## Dev Notes

### Architecture Patterns
- Void: $transaction wrapping mark-voided + restore-inventory + recheck-thresholds
- Audit trail on WastageEntry: voidedAt, voidedBy, voidReason, originalQuantity, correctedQuantity
- NFR19: Undone/voided actions recoverable for at least 24 hours (soft-delete, never hard-delete)
- Staff cannot void — requireRole('MANAGER') enforced server-side

### What This Story Does NOT Include
- Comp void/correct (Story 3.8)
- Weekly aggregation display (Story 3.10)

### Project Structure Notes
```
src/actions/
└── wastage.actions.ts                ← MODIFY: Add voidWastage, correctWastage

src/components/wastage/
└── void-correct-dialog.tsx           ← NEW: Void/correct UI
└── wastage-log.tsx                   ← MODIFY: Show voided/corrected entries
```

### References
- [Source: epics.md — Story 3.7]
- [Source: prd.md — FR47, FR48]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
