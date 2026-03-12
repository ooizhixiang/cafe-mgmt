# Story 2.3: Daily Checklist Completion

Status: backlog

## Story

As a **cafe user**,
I want to tap through my assigned checklist items and have my progress tracked,
so that I complete my shift tasks with accountability.

## Acceptance Criteria (BDD)

### AC1: Inline Checklist Display

**Given** an authenticated user with assigned checklist items
**When** they view a checklist on the Action Feed
**Then** items assigned to their role (or "Both") are displayed directly on the checklist card — no expand/collapse step

### AC2: Item Completion

**Given** a user viewing a checklist item
**When** they tap the item
**Then** it is marked complete with an instant checkmark animation (<100ms visual feedback)
**And** a completion timestamp and the completing user are recorded server-side

### AC3: Item Undo

**Given** a user accidentally completes an item
**When** they tap the completed item again
**Then** the completion is undone (unchecked)

### AC4: Cross-Module Links (Active)

**Given** a checklist item has a cross-module link configured (e.g., "Check inventory" → `/inventory`)
**When** the target screen exists in the current build
**Then** tapping the link navigates to that screen and the user can return to the checklist afterward
**And** checklist progress is preserved across navigation

### AC5: Cross-Module Links (Inactive)

**Given** a checklist item has a cross-module link to a screen not yet implemented
**When** the checklist renders
**Then** the link is displayed as plain text (no broken navigation) and becomes tappable once the target screen ships

### AC6: Period Switching

**Given** all three checklist periods exist (Opening, Mid-Day, Closing)
**When** a user views checklists
**Then** they can access all three periods regardless of the current time of day via a 1-tap period switch

### AC7: Daily Reset (On-Demand)

**Given** a new day begins (at the configured reset time, default: start of Opening period)
**When** a user opens the app after the reset time
**Then** the system creates fresh daily checklist instances from templates (on-demand, not cron)
**And** previous day's completion data is preserved in history

### AC8: Partial Completion at Reset

**Given** a checklist is partially complete at the time of daily reset
**When** the new day's checklists are generated
**Then** the incomplete items from the previous day remain in history as incomplete — they are not carried over to the new day

### AC9: Duplicate Prevention

**Given** multiple users open the app simultaneously after the reset time
**When** daily checklist generation is triggered by each request
**Then** the system uses a database-level uniqueness constraint (cafeId + date + period) to prevent duplicate daily checklists
**And** the second user's request detects the already-created checklists and returns them

### AC10: Progress Persistence

**Given** the user closes the browser mid-checklist
**When** they reopen the app
**Then** all previously completed items remain checked (no data loss)

### AC11: Server Action Authorization

**Given** any Server Action in this story
**When** called by any user
**Then** the action validates `requireAuth()` and returns appropriate errors

## Tasks / Subtasks

- [ ] **Task 1: Database Schema — Daily Checklist Tables** (AC: #7, #9, #10)
  - [ ] Create `DailyChecklist` model: id, cafeId, date (DateTime @db.Date), period (Period), checklistTemplateId, createdAt. Relations to Cafe, ChecklistTemplate, items. @@unique([cafeId, date, period]) @@index([cafeId, date])
  - [ ] Create `DailyChecklistItem` model: id, dailyChecklistId, checklistTemplateItemId, completedAt (DateTime?), completedById (String?), text (String — snapshot from template), displayOrder (Int), notes (String?), role (Role?), linkRoute (String?). Relations to DailyChecklist, User (completedBy). @@index([dailyChecklistId])
  - [ ] Add optional `linkRoute` field to ChecklistTemplateItem model (String? — e.g., "/inventory", "/wastage?tab=log")
  - [ ] Run migration

- [ ] **Task 2: Daily Checklist Generation Logic** (AC: #7, #8, #9)
  - [ ] Create `src/lib/checklist.ts`:
    - `getOrCreateDailyChecklists(cafeId, date)` — checks for existing daily checklists for the date, creates from templates if none exist
    - Uses upsert or try-catch with unique constraint for concurrent safety
    - Snapshots template item text/notes/role/linkRoute into daily items (so template changes don't affect in-progress checklists)
    - Respects cafe timezone for date determination via `getCafeNow()`

- [ ] **Task 3: Checklist Completion Server Actions** (AC: #2, #3, #10, #11)
  - [ ] Add to `src/actions/checklist.actions.ts`:
    - `getDailyChecklists(formData?)` — requireAuth(), returns daily checklists for today with items and completion status, triggers generation if needed
    - `toggleChecklistItem(formData)` — requireAuth(), toggles completion: if not completed → set completedAt + completedById; if completed → clear both. Validates item belongs to user's cafe. Returns ActionResult<void>
  - [ ] Optimistic UI via `safeMutation` for instant feedback

- [ ] **Task 4: Checklist Card Component** (AC: #1, #2, #3, #4, #5, #6)
  - [ ] Create `src/components/feed/checklist-card.tsx` — client component:
    - Extends ActionFeedCard with checklist variant
    - Shows items inline with checkboxes (max 4 visible, "Show all X items" link for more)
    - Progress bar showing completion percentage
    - Role-filtered: only shows items for current user's role
    - Cross-module links: rendered as tappable links if route exists, plain text otherwise
    - Period tabs: Opening | Mid-Day | Closing (1-tap switch)
    - Checkmark animation on completion (<100ms)

- [ ] **Task 5: Feed Integration** (AC: #1)
  - [ ] Create `src/domains/feed/checklist-cards.ts` — `getChecklistCards(cafeId, role)`:
    - Returns checklist cards for today's daily checklists
    - Includes progress data for summary bar
    - Filters items by role

- [ ] **Task 6: Tests** (AC: all)
  - [ ] Create `src/lib/checklist.test.ts`:
    - Daily checklist generation creates correct number of checklists (one per period with templates)
    - Template items are snapshotted correctly
    - Date determination uses cafe timezone
  - [ ] Create `src/actions/checklist.actions.test.ts` (extend):
    - Toggle completion sets/clears completedAt
    - Role filtering returns only relevant items

## Dev Notes

### Architecture Patterns (MUST FOLLOW)

- All Server Actions return `ActionResult<T>` and call `requireAuth()` first
- Never accept `cafeId` from the client — derive from session
- Prisma imports from `@/generated/prisma/client` and enums from `@/generated/prisma/enums`
- Blue buttons use `bg-[var(--color-info)]`
- Tests co-located with source files using `.test.ts` extension

**Daily Checklist Generation — On-Demand, Not Cron:**

```typescript
// When user requests today's checklists:
// 1. Check if DailyChecklist exists for (cafeId, today, period)
// 2. If not, create from ChecklistTemplate, snapshot items
// 3. Return existing or newly created
```

**Concurrent Safety:**

```typescript
// @@unique([cafeId, date, period]) prevents duplicates
// Use try-catch: if unique constraint fails, fetch existing
```

**Optimistic UI for completion:**

```typescript
// safeMutation: immediately show checkmark, confirm with server, rollback on error
```

### UX Patterns

- Checklist items render inline on feed cards — no expand/collapse
- Period tabs: 1-tap switch between Opening | Mid-Day | Closing
- Checkmark animation completes in <100ms for perceived instant feedback
- Cross-module links are tappable only when target route exists; otherwise plain text
- Progress bar on each checklist card shows completion percentage

### Cross-Module Link Strategy

- `linkRoute` stored on ChecklistTemplateItem (optional)
- Snapshotted to DailyChecklistItem on generation
- UI checks if route exists in current build before making it tappable
- Supports query params: `/inventory?filter=dairy`

### What This Story Does NOT Include

- Time-aware auto-selection of period (Story 2.4)
- Completed checklist collapse to summary (Story 2.4)
- "All caught up" state (Story 2.4)
- Checklist completion history for managers (Story 2.5)
- Alert auto-dismiss mechanism (Story 2.4)

### Project Structure Notes

```
prisma/
└── schema.prisma                      ← MODIFY: Add DailyChecklist, DailyChecklistItem, linkRoute on ChecklistTemplateItem

src/lib/
└── checklist.ts                       ← NEW: Daily checklist generation logic
└── checklist.test.ts                  ← NEW: Generation logic tests

src/actions/
└── checklist.actions.ts               ← MODIFY: Add getDailyChecklists, toggleChecklistItem
└── checklist.actions.test.ts          ← MODIFY: Add completion tests

src/components/feed/
└── checklist-card.tsx                 ← NEW: Checklist card for feed

src/domains/feed/
└── checklist-cards.ts                 ← NEW: Checklist feed card provider
```

### Previous Story Intelligence

- Story 2.2 established ChecklistTemplate and ChecklistTemplateItem models — this story builds on those with daily instances
- Story 2.1 established ActionFeedCard architecture — checklist-card.tsx extends that pattern
- Story 1.3 established time boundaries (Opening, Mid-Day, Closing periods) — this story uses those for period determination

### References

- [Source: epics.md — Story 2.3]
- [Source: architecture.md — safeMutation, Transactions, Domain Isolation]
- [Source: prd.md — FR24-FR29]
- [Source: ux-design-specification.md — Card Anatomy, Checklist Cards]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
