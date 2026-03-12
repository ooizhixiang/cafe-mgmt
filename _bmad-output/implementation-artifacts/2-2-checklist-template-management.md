# Story 2.2: Checklist Template Management

Status: backlog

## Story
As a **cafe manager**,
I want to create and customize checklist templates for Opening, Mid-Day, and Closing periods,
so that my staff know exactly what to do each shift.

## Acceptance Criteria (BDD)

### AC1: View Existing Templates
**Given** an authenticated manager
**When** they navigate to checklist management (via Settings or Action Feed)
**Then** they can view existing templates for Opening, Mid-Day, and Closing periods

### AC2: Add Checklist Item
**Given** a manager editing a checklist template
**When** they add a new item
**Then** the item is created with: title, optional notes/context, and role assignment (Manager, Staff, or Both)

### AC3: Edit & Reorder Items
**Given** a manager editing a checklist template
**When** they modify or reorder existing items
**Then** changes are saved and reflected in the next checklist instance

### AC4: Delete Checklist Item
**Given** a manager editing a checklist template
**When** they delete an item
**Then** the item is removed from the template after confirmation

### AC5: Item Count Warning
**Given** a checklist template has more than 10 items
**When** the manager views the template
**Then** a warning is displayed recommending a maximum of 8 items

### AC6: One Template Per Period
**Given** the checklist system
**When** templates are structured
**Then** each period (Opening, Mid-Day, Closing) has exactly one checklist template -- multiple templates per period are not supported in MVP

### AC7: Item Notes & Role Assignment
**Given** a manager adding a checklist item
**When** they configure the item
**Then** they can add contextual notes (e.g., "Count matches printed sheet on clipboard")
**And** they can assign it to Manager, Staff, or Both roles

### AC8: Server Action Authorization
**Given** any Server Action in this story
**When** called by any user
**Then** the action validates `requireRole('MANAGER')` and returns unauthorized error if not a manager

## Tasks / Subtasks

- [ ] **Task 1: Checklist Template Server Actions** (AC: #1, #2, #3, #4, #7, #8)
  - [ ] Create `src/actions/checklist.actions.ts` with:
    - `getChecklistTemplates()` -- requireAuth(), returns all templates with items for cafeId
    - `addChecklistItem(formData)` -- requireRole('MANAGER'), Zod validates text (non-empty, max 200), optional notes (max 500), role (MANAGER|STAFF|null for Both), templateId belongs to cafeId
    - `updateChecklistItem(formData)` -- requireRole('MANAGER'), validates item belongs to cafeId
    - `deleteChecklistItem(formData)` -- requireRole('MANAGER'), validates item belongs to cafeId, deletes
    - `reorderChecklistItems(formData)` -- requireRole('MANAGER'), accepts JSON array of {id, displayOrder}, validates all belong to cafeId, updates in $transaction

- [ ] **Task 2: Checklist Template Management Page** (AC: #1, #6)
  - [ ] Create `src/app/(app)/settings/checklists/page.tsx` -- server component
  - [ ] Shows three sections: Opening, Mid-Day, Closing
  - [ ] Each section shows its template items in order

- [ ] **Task 3: Checklist Item Editor Component** (AC: #2, #3, #4, #5, #7)
  - [ ] Create `src/components/settings/checklist-editor.tsx` -- client component:
    - List of items with text, notes preview, and role badge
    - Inline add form: text input + optional notes + role dropdown
    - Edit: tap item to edit text/notes/role
    - Delete: button with ConfirmationDialog
    - Reorder: up/down arrow buttons
    - Warning banner when items > 10: "We recommend 8 items or fewer per checklist"
  - [ ] 44x44px touch targets, toast on success

- [ ] **Task 4: Settings Integration** (AC: #1)
  - [ ] Add "Checklist Configuration" section to Settings page (Story 1.3 established the section order)
  - [ ] Link to `/settings/checklists` management page

- [ ] **Task 5: Tests** (AC: all)
  - [ ] Create `src/actions/checklist.actions.test.ts`:
    - Zod validation for item text and notes length
    - Role assignment values
    - Item count warning threshold

## Dev Notes

### Architecture Patterns (MUST FOLLOW)

**ActionResult<T>** for all Server Actions. **Never accept cafeId from client.**

**Prisma imports:** `@/generated/prisma/client`, `@/generated/prisma/enums`

**Zod v4, Tailwind v4 (CSS-based), shadcn/ui v4**

**Blue buttons:** `bg-[var(--color-info)] text-white hover:bg-[var(--color-info)]/90`

**Tests co-located** with `.test.ts` suffix.

**Checklist Template Structure:**
- Uses ChecklistTemplate and ChecklistTemplateItem tables created in Story 1.4
- One template per period per cafe (enforced by application logic)
- Items have displayOrder for ordering, notes for context, role for assignment

### UX Patterns (MUST FOLLOW)
- Single-column mobile layout
- 44x44px touch targets for all buttons
- ConfirmationDialog for delete operations (from Story 1.2)
- Toast on success for all operations
- Warning banner for >10 items (amber background)

### What This Story Does NOT Include
- Checklist completion (Story 2.3)
- Daily checklist instances (Story 2.3)
- Cross-module links on items (Story 2.3)
- Time-aware auto-selection (Story 2.4)

### Project Structure Notes
```
src/actions/
  checklist.actions.ts                 <- NEW: Checklist template CRUD
  checklist.actions.test.ts            <- NEW: Checklist action tests

src/components/settings/
  checklist-editor.tsx                 <- NEW: Checklist item editor

src/app/(app)/settings/checklists/
  page.tsx                             <- NEW: Checklist management page

src/app/(app)/settings/
  page.tsx                             <- MODIFY: Add Checklist Configuration section
```

### Previous Story Intelligence (Story 2.1)
- All patterns from Stories 1.1-1.6, 2.1 carry forward
- ChecklistTemplate and ChecklistTemplateItem tables exist from Story 1.4
- Settings page structure from Story 1.3

### References
- [Source: epics.md -- Story 2.2]
- [Source: architecture.md -- ActionResult, Data Architecture]
- [Source: prd.md -- FR21-FR23, FR27]
- [Source: ux-design-specification.md -- Form Patterns, Settings]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
