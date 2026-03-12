# Story 2.5: Checklist Completion History & Operations Summary

Status: backlog

## Story
As a **cafe manager**,
I want to see who completed which checklists and a daily operations summary,
so that I can oversee operations without being physically present.

## Acceptance Criteria (BDD)

### AC1: Checklist Completion History
**Given** an authenticated manager
**When** they navigate to the checklist history view (accessible from Settings > Checklist section)
**Then** they can see completion status for all users: who completed each item, when, and for which period
**And** data is organized by day with the most recent day first
**And** history is available for the last 30 days

### AC2: Personal Activity Log
**Given** an authenticated user (manager or staff)
**When** they tap their profile or "My Activity" on the Action Feed
**Then** they can see their own actions for the current day: checklist items completed, with timestamps

### AC3: Daily Operations Summary Card
**Given** an authenticated manager
**When** they view the daily operations summary (displayed as a summary card on the Action Feed)
**Then** they see a daily summary that grows with available data: checklists completed (count and percentage) and total checklist items done (always available from Epic 2), plus wastage logged and comp spent totals (available once Epic 3 ships)
**And** sections for data not yet available are omitted entirely (not shown as "$0" or "No data")

### AC4: Detailed Completion View
**Given** a manager checks the app while away (e.g., sick day)
**When** they view completion history
**Then** they can see exactly what happened: "Opening: Complete. 7/7 items by Jake at 6:42am"

### AC5: Server Action Authorization
**Given** any Server Action in this story
**When** called by any user
**Then** actions validate appropriate roles — managers see all data, staff sees only their own

## Tasks / Subtasks

- [ ] **Task 1: Completion History Server Actions** (AC: #1, #4, #5)
  - [ ] Add to `src/actions/checklist.actions.ts`:
    - `getChecklistHistory(formData)` — requireRole('MANAGER'), accepts optional date range, returns daily completion data for all users for cafeId, organized by date desc, limited to 30 days
    - Returns: date, period, items with completedBy user name, completedAt timestamp, completion percentage

- [ ] **Task 2: Personal Activity Server Action** (AC: #2, #5)
  - [ ] Add to `src/actions/checklist.actions.ts`:
    - `getMyActivity()` — requireAuth(), returns current day's completed items for session user, with timestamps

- [ ] **Task 3: Daily Summary Server Action** (AC: #3, #5)
  - [ ] Add to `src/domains/feed/composer.ts`:
    - Include daily operations summary card for managers
    - Summary data: checklists completed count, items done count/total
    - Designed to grow: wastage + comp totals added when Epic 3 ships

- [ ] **Task 4: Checklist History Page** (AC: #1, #4)
  - [ ] Create `src/app/(app)/settings/checklists/history/page.tsx` — server component
  - [ ] Create `src/components/settings/checklist-history.tsx` — client component:
    - Day-by-day view, most recent first
    - Each day shows: period sections with item completion details
    - "Opening: Complete. 7/7 items by Jake at 6:42am" format
    - Scroll through 30 days of history

- [ ] **Task 5: My Activity Component** (AC: #2)
  - [ ] Create `src/components/feed/my-activity.tsx`:
    - Accessible from feed (profile area or "My Activity" link)
    - Shows today's completed items with timestamps
    - Simple list view

- [ ] **Task 6: Operations Summary Card** (AC: #3)
  - [ ] Create `src/components/feed/operations-summary-card.tsx`:
    - Manager-only card on Action Feed
    - Shows: "Today: 2/3 checklists complete, 18/21 items done"
    - Grows with Epic 3: "+ $47.20 wastage, $12.50 comp"
    - Omits unavailable sections

- [ ] **Task 7: Tests** (AC: all)
  - [ ] Create tests for history queries:
    - Manager sees all users' completion data
    - Staff sees only their own
    - 30-day limit enforced
    - Summary card includes correct counts

## Dev Notes

### Architecture Patterns (MUST FOLLOW)
- ActionResult<T> for all Server Actions
- Never accept cafeId from client
- Manager sees all data; staff sees only their own (role-based data scoping)
- No new tables — reads from existing DailyChecklist + DailyChecklistItem completion records
- Prisma imports from `@/generated/prisma/client` and `@/generated/prisma/enums`
- Tests co-located as `.test.ts`

### Summary Card — Designed to Grow
The operations summary card renders available data only:
- Epic 2: Checklist completion counts
- Epic 3 (future): + wastage totals + comp spend
Unavailable sections are omitted, not shown as empty/zero.

### What This Story Does NOT Include
- Wastage/comp dollar totals in summary (Epic 3)
- Weekly aggregation (Story 3.10)

### Project Structure Notes
```
src/actions/
└── checklist.actions.ts               ← MODIFY: Add getChecklistHistory, getMyActivity

src/components/settings/
└── checklist-history.tsx              ← NEW: Completion history view

src/components/feed/
├── my-activity.tsx                    ← NEW: Personal activity component
└── operations-summary-card.tsx        ← NEW: Daily summary card

src/app/(app)/settings/checklists/history/
└── page.tsx                           ← NEW: History page
```

### Previous Story Intelligence
- Story 2.3 established DailyChecklist + DailyChecklistItem models with completion tracking
- Story 2.4 established the Action Feed and time-aware card architecture
- Feed composer pattern from Story 2.4 is extended for the operations summary card

### References
- [Source: epics.md — Story 2.5]
- [Source: prd.md — FR67, FR69, FR70]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
