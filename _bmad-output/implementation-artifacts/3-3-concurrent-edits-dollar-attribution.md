# Story 3.3: Concurrent Edits & Dollar Attribution

Status: backlog

## Story
As a **cafe user**,
I want the system to handle it gracefully when two people update inventory at the same time,
so that I trust the numbers are accurate.

## Acceptance Criteria (BDD)

### AC1: Normal Save
**Given** two users are viewing the same ingredient's inventory
**When** User A saves a new quantity
**Then** the save succeeds with optimistic UI confirmation

### AC2: Stale Value Detection
**Given** User A has already saved a new quantity
**When** User B attempts to save their (now stale) value
**Then** the system detects the stale state via `updatedAt` comparison
**And** User B sees a prompt: "This item was updated by someone else. Review the current value?"
**And** User B can accept the current value or re-enter their own

### AC3: Dollar Value Calculation
**Given** any inventory change is saved
**When** the change is recorded
**Then** the dollar value of the change is calculated (quantity delta × cost per unit in cents) and attributed to the event

### AC4: Dollar Impact Display
**Given** an inventory count is confirmed
**When** the value differs from the previous day
**Then** the dollar impact is visible on the confirmation (e.g., "Oat milk: 40% → 28%, -$12.60")

### AC5: Server Action Authorization
**Given** any Server Action in this story
**When** called by any user
**Then** the action validates `requireAuth()` and returns appropriate errors

## Tasks / Subtasks

- [ ] **Task 1: Optimistic Concurrency on Inventory** (AC: #1, #2)
  - [ ] Update `saveInventoryCount` in `src/actions/inventory.actions.ts`:
    - Accept `expectedUpdatedAt` parameter from client
    - Before save: check if InventoryCount.updatedAt matches expected
    - If stale: return `ActionResult<{ stale: true, currentValue: number, currentUpdatedAt: string }>`
    - If fresh: save and return success
  - [ ] Add `updatedAt` field to InventoryCount if not present

- [ ] **Task 2: Stale Value Resolution UI** (AC: #2)
  - [ ] Create `src/components/inventory/stale-value-dialog.tsx`:
    - Shows: "This item was updated by someone else"
    - Current value displayed
    - Two options: "Accept current value" or "Use my value"
    - "Use my value" resubmits with fresh updatedAt

- [ ] **Task 3: Dollar Attribution on Inventory Changes** (AC: #3, #4)
  - [ ] Update `saveInventoryCount` to:
    - Calculate dollar value using `calculateDollarValue()` from Story 3.1
    - Store `dollarValueInCents` on InventoryCount (add field if needed)
    - Return dollar impact in ActionResult data
  - [ ] Update inventory list UI to show dollar impact after confirmation

- [ ] **Task 4: Tests** (AC: all)
  - [ ] Create/extend `src/actions/inventory.actions.test.ts`:
    - Stale value detection returns stale response
    - Fresh value saves successfully
    - Dollar value calculated correctly for discrete and percentage ingredients
  - [ ] Test stale resolution flow

## Dev Notes

### Architecture Patterns (MUST FOLLOW)
- Optimistic concurrency via `updatedAt` comparison (not pessimistic locking for reads)
- Dollar attribution: `deltaQuantity * costInCents` calculated server-side
- FR62: Every operational event carries a dollar value

### Concurrency Strategy
```typescript
// Client sends expectedUpdatedAt with save request
// Server checks: if (current.updatedAt !== expectedUpdatedAt) → stale
// Last-write-wins with user confirmation, not automatic overwrite
```

### What This Story Does NOT Include
- Wastage auto-deduct concurrency (Story 3.6 — uses Serializable isolation)
- Low-stock threshold checking (Story 3.4)

### Project Structure Notes
```
src/actions/
└── inventory.actions.ts               ← MODIFY: Add concurrency check, dollar attribution

src/components/inventory/
└── stale-value-dialog.tsx            ← NEW: Stale value resolution dialog
└── inventory-list.tsx                ← MODIFY: Show dollar impact
```

### References
- [Source: epics.md — Story 3.3]
- [Source: prd.md — FR39, FR62]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
