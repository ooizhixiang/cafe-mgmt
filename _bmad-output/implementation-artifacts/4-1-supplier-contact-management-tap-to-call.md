# Story 4.1: Supplier Contact Management & Tap-to-Call

Status: backlog

## Story
As a **cafe manager**,
I want to manage supplier contacts and call them directly from the app,
so that I never have to dig through my phone for a supplier's number.

## Acceptance Criteria (BDD)

### AC1: Supplier List
**Given** an authenticated manager
**When** they navigate to the Operations screen (Suppliers tab)
**Then** they see a list of all supplier contacts for their cafe

### AC2: Add Supplier
**Given** a manager adding a new supplier
**When** they fill in name, phone number, and optional notes
**Then** the supplier is saved and appears in the list

### AC3: Edit Supplier
**Given** a manager editing an existing supplier
**When** they update name, phone, or notes
**Then** changes are saved immediately with confirmation

### AC4: Delete Supplier
**Given** a manager deleting a supplier
**When** they confirm deletion
**Then** the supplier is removed from the list

### AC5: Tap-to-Call
**Given** any authenticated user viewing a supplier
**When** they tap the phone number or call button
**Then** the device phone dialer opens with the supplier's number pre-loaded via `tel:` link

### AC6: Manager-Only Access
**Given** the Operations screen is accessed by a staff member
**When** the route is checked
**Then** access is denied — Operations is manager-only, enforced server-side

## Tasks / Subtasks

- [ ] **Task 1: Database Schema — Supplier Extension** (AC: #1)
  - [ ] Verify Supplier model from Story 1.4 has: name, phone, notes, cafeId, displayOrder, lastOrderDate (DateTime?)
  - [ ] Add `lastOrderDate` if not present
  - [ ] Run migration if needed

- [ ] **Task 2: Supplier Server Actions** (AC: #2, #3, #4, #6)
  - [ ] Create `src/actions/supplier.actions.ts`:
    - `getSuppliers()` — requireAuth(), returns all suppliers for cafeId ordered by displayOrder
    - `addSupplier(formData)` — requireRole('MANAGER'), Zod validates name (non-empty, max 100), phone (max 20), notes (max 500)
    - `updateSupplier(formData)` — requireRole('MANAGER'), validates supplier belongs to cafeId
    - `deleteSupplier(formData)` — requireRole('MANAGER'), validates, deletes

- [ ] **Task 3: Operations Screen** (AC: #1, #6)
  - [ ] Create `src/app/(app)/operations/page.tsx` — server component, requireRole('MANAGER')
  - [ ] Tab layout for future sections: Suppliers (default), Recipes (Story 4.3)

- [ ] **Task 4: Supplier List Component** (AC: #1, #2, #3, #4, #5)
  - [ ] Create `src/components/operations/supplier-list.tsx`:
    - Contact card pattern: name, phone, notes
    - Tap-to-call via `<a href="tel:+1234567890">`
    - Add form: name + phone + notes fields
    - Edit inline, delete with ConfirmationDialog
    - Toast on success

- [ ] **Task 5: Tests** (AC: all)
  - [ ] Create `src/actions/supplier.actions.test.ts`:
    - Zod validation for name and phone
    - Manager-only enforcement

## Dev Notes

### Architecture Patterns
- ActionResult<T> for all Server Actions
- Manager-only: `requireRole('MANAGER')` on all operations routes
- Tap-to-call: simple `tel:` link — no telephony API needed
- Supplier table created in Story 1.4 with placeholder data

### What This Story Does NOT Include
- Call outcome logging (Story 4.2)
- Supplier reminders on feed (Story 4.2)
- Recipe management (Story 4.3)

### Project Structure Notes
```
src/actions/
└── supplier.actions.ts               ← NEW: Supplier CRUD
└── supplier.actions.test.ts          ← NEW: Tests

src/components/operations/
└── supplier-list.tsx                 ← NEW: Supplier list with tap-to-call

src/app/(app)/operations/
└── page.tsx                          ← NEW: Operations screen
```

### References
- [Source: epics.md — Story 4.1]
- [Source: prd.md — FR56, FR57]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
