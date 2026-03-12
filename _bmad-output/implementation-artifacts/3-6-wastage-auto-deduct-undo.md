# Story 3.6: Wastage Auto-Deduct & Undo

Status: backlog

## Story
As a **cafe user**,
I want wastage to automatically deduct from inventory with visible confirmation and undo,
so that inventory stays accurate without manual double-entry.

## Acceptance Criteria (BDD)

### AC1: Atomic Auto-Deduct
**Given** a user logs a wastage entry
**When** the entry is confirmed
**Then** the system automatically deducts the wastage quantity from the ingredient's inventory within a single database transaction
**And** the deduction is atomic — either both wastage log and inventory update succeed, or neither does

### AC2: Visible Confirmation
**Given** the auto-deduct succeeds
**When** the confirmation appears
**Then** the user sees: "Oat milk: 28% → 25%. Undo?" with the affected ingredient and new quantity clearly shown

### AC3: Undo Within 5 Seconds
**Given** a user sees the auto-deduct confirmation
**When** they tap "Undo" within the 5-second window
**Then** the wastage entry is soft-deleted and the inventory quantity is restored
**And** the undo toast shows a visible countdown timer

### AC4: Undo Window Expiry
**Given** the 5-second undo window passes
**When** no undo was tapped
**Then** the wastage entry is finalized and the undo option disappears

### AC5: Cap at Available Quantity
**Given** the ingredient's current quantity is less than the wastage amount
**When** the auto-deduct is calculated
**Then** the deduction is capped at the available quantity (inventory never goes negative)
**And** the user sees a message: "Deducted available amount (was X, now 0)"

### AC6: Stacking Undo Toasts
**Given** multiple wastage entries are logged quickly
**When** multiple undo toasts exist
**Then** toasts stack vertically with independent 5-second timers and visible progress indicators

### AC7: Transaction Failure
**Given** the auto-deduct transaction fails
**When** the error is returned
**Then** the user sees a clear error message with retry option
**And** no partial state exists (inventory unchanged, wastage not logged)

### AC8: Offline Block
**Given** the user is offline or the backend is unreachable
**When** they attempt to log wastage
**Then** the offline banner is displayed and the action is blocked with a message: "Can't log wastage while offline. Check your connection."

## Tasks / Subtasks

- [ ] **Task 1: Auto-Deduct Transaction Logic** (AC: #1, #5, #7)
  - [ ] Create `src/lib/transactions.ts`:
    - `deductInventory(ingredientId, quantity, cafeId)` — deducts from latest InventoryCount, caps at 0
    - Uses Serializable isolation level or `SELECT ... FOR UPDATE` to prevent concurrent race conditions
  - [ ] Update `logWastage` in `src/actions/wastage.actions.ts`:
    - Wrap in `prisma.$transaction`: create WastageEntry + deductInventory() + checkThresholds()
    - Return previous and new quantity in ActionResult for confirmation display

- [ ] **Task 2: Undo Server Action** (AC: #3)
  - [ ] Add to `src/actions/wastage.actions.ts`:
    - `undoWastage(formData)` — requireAuth(), validates wastage entry belongs to user's cafe and is within undo window (5 seconds), soft-deletes entry and restores inventory in $transaction, returns ActionResult<void>

- [ ] **Task 3: Undo Toast Infrastructure** (AC: #3, #4, #6)
  - [ ] Create `src/components/providers/undo-toast-provider.tsx`:
    - Global context with useReducer for managing multiple undo toasts
    - `addUndoToast(entry)` — adds toast with 5-second countdown
    - `removeUndoToast(id)` — removes on undo or expiry
    - Auto-removes after 5 seconds
  - [ ] Create `src/components/ui/undo-toast.tsx`:
    - Shows confirmation message with countdown progress bar
    - "Undo" button (44x44px touch target)
    - Stacks vertically, positioned above bottom nav
    - Independent timers per toast

- [ ] **Task 4: Wastage Logger Integration** (AC: #2, #8)
  - [ ] Update `wastage-logger.tsx`:
    - After successful logWastage, show undo toast with previous/new quantity
    - Block submission when offline
    - Show dollar value prominently

- [ ] **Task 5: Tests** (AC: all)
  - [ ] Create `src/lib/transactions.test.ts`:
    - Deduct caps at 0 (never negative)
    - Correct quantity deducted
  - [ ] Extend `src/actions/wastage.actions.test.ts`:
    - Undo within window succeeds
    - Undo after window fails
    - Auto-deduct creates correct inventory change

## Dev Notes

### Architecture Patterns
- Prisma `$transaction` with Serializable isolation for concurrent safety
- `deductInventory()` and `checkThresholds()` from `src/lib/transactions.ts`
- Undo toast infrastructure reused by Story 3.8 (comp undo)
- NFR17: All inventory mutations use database transactions
- NFR7: Compound mutation <1s server-side

### Transaction Pattern
```typescript
await prisma.$transaction(async (tx) => {
  const entry = await tx.wastageEntry.create({ ... });
  const { previousQty, newQty } = await deductInventory(tx, ingredientId, quantity);
  await checkThresholds(tx, cafeId, ingredientId);
  return { entry, previousQty, newQty };
}, { isolationLevel: 'Serializable' });
```

### What This Story Does NOT Include
- Manager void/correct after undo window (Story 3.7)
- Comp undo (Story 3.8 — reuses undo toast infrastructure)

### Project Structure Notes
```
src/lib/
└── transactions.ts                    ← NEW: deductInventory, checkThresholds wrappers
└── transactions.test.ts              ← NEW: Transaction logic tests

src/actions/
└── wastage.actions.ts                ← MODIFY: Add $transaction, undoWastage

src/components/providers/
└── undo-toast-provider.tsx           ← NEW: Global undo toast context

src/components/ui/
└── undo-toast.tsx                    ← NEW: Undo toast with countdown
```

### References
- [Source: epics.md — Story 3.6]
- [Source: prd.md — FR41-FR44, FR63]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
