# Story 2.4: Time-Aware Feed & Checklist Auto-Selection

Status: backlog

## Story

As a **cafe user**,
I want the app to automatically highlight the right checklist for the current time of day,
so that I don't have to think about which checklist to work on.

## Acceptance Criteria (BDD)

### AC1: Time-Based Auto-Selection

**Given** it is currently within the Opening period time boundary
**When** the user opens the Action Feed
**Then** the Opening checklist card is auto-selected and displayed prominently as the default
**And** the checklist card shows the time-range label (e.g., "Opening 5am-9am")

### AC2: Manual Period Override

**Given** the user is viewing an auto-selected checklist
**When** they want a different period
**Then** they can switch with 1 tap to any other period (Opening, Mid-Day, Closing)

### AC3: Completed Checklist Collapse

**Given** a checklist has been completed for the current period
**When** the user views the Action Feed
**Then** the completed checklist collapses to a "Done" summary card showing "7/7 items. All on track." with a green border and completion timestamp

### AC4: Alert Auto-Dismiss

**Given** an alert card was resolved
**When** 24 hours have passed since resolution
**Then** the alert is automatically dismissed from the feed
**And** note: alert creation happens in Epic 3; this AC establishes the dismiss mechanism

### AC5: All Caught Up State

**Given** all checklists are complete and no alerts exist
**When** the user views the Action Feed
**Then** an "All caught up" positive empty state is displayed with a next-period hint (e.g., "Closing checklist at 3pm")

### AC6: Server Action Authorization

**Given** any Server Action in this story
**When** called by any user
**Then** the action validates `requireAuth()` and returns appropriate errors

## Tasks / Subtasks

- [ ] **Task 1: Time-Aware Period Detection** (AC: #1)
  - [ ] Create `src/lib/period-detection.ts`:
    - `getCurrentPeriod(cafeTimezone, timeBoundaries)` — returns current Period based on `getCafeNow()` and configured/default time boundaries
    - Returns null if outside all configured periods
    - Includes period label with time range (e.g., "Opening 5:00 AM – 9:00 AM")

- [ ] **Task 2: Feed Composer Enhancement** (AC: #1, #3, #4)
  - [ ] Update `src/domains/feed/composer.ts`:
    - Auto-select current period checklist card as first card
    - Completed checklists render as completion summary cards
    - Filter resolved alerts older than 24 hours
  - [ ] Update `src/domains/feed/checklist-cards.ts`:
    - Include period label and auto-selection flag in card data

- [ ] **Task 3: Completion Summary Card** (AC: #3)
  - [ ] Create/extend completion variant in `action-feed-card.tsx`:
    - Green `--color-success` border
    - Shows "7/7 items. All on track." with checkmark icon
    - Completion timestamp
    - Collapsed view (no inline items)

- [ ] **Task 4: All Caught Up State** (AC: #5)
  - [ ] Use empty-state component from Story 1.6 with "all-caught-up" variant:
    - Positive message: "All caught up!"
    - Next-period hint: "Closing checklist at 3pm"
    - Green checkmark icon

- [ ] **Task 5: Alert Dismiss Mechanism** (AC: #4)
  - [ ] Add `resolvedAt` field to alert card data model (or feed card table)
  - [ ] Feed composer filters out alerts where `resolvedAt + 24h < now()`
  - [ ] This mechanism is tested with mock alerts until Epic 3 creates real ones

- [ ] **Task 6: Tests** (AC: all)
  - [ ] Create `src/lib/period-detection.test.ts`:
    - Correct period returned for various times of day
    - Handles edge cases: exactly at boundary, outside all periods
    - Uses default boundaries when none configured
    - Returns correct time-range labels
  - [ ] Extend feed composer tests:
    - Auto-selection places current period first
    - Completed checklists become summary cards
    - Resolved alerts dismissed after 24h

## Dev Notes

### Architecture Patterns (MUST FOLLOW)

- All Server Actions return `ActionResult<T>` and call `requireAuth()` first
- Never accept `cafeId` from the client — derive from session
- Prisma imports from `@/generated/prisma/client` and enums from `@/generated/prisma/enums`
- Blue buttons use `bg-[var(--color-info)]`
- Tests co-located with source files using `.test.ts` extension

**Time-Aware Logic — Always Server-Side:**

```typescript
// NEVER determine current period on the client
// Always use getCafeNow(timezone) server-side
const period = getCurrentPeriod(cafe.timezone, cafe.timeBoundaries);
```

**Alert Auto-Dismiss:**

```typescript
// In feed composer:
const alerts = allAlerts.filter(alert => {
  if (!alert.resolvedAt) return true; // unresolved always shows
  const dismissAt = new Date(alert.resolvedAt.getTime() + 24 * 60 * 60 * 1000);
  return dismissAt > now; // keep if less than 24h since resolution
});
```

### UX Patterns

- Auto-selected checklist card appears first/prominently in the feed
- Checklist card shows time-range label (e.g., "Opening 5:00 AM – 9:00 AM")
- Completed checklists collapse to green-bordered summary card with "All on track" message
- "All caught up" empty state uses positive tone with next-period hint
- Manual period override is always available via 1-tap switch

### What This Story Does NOT Include

- Alert creation (Story 3.4, 3.9)
- Checklist completion history (Story 2.5)
- Operations summary (Story 2.5)

### Project Structure Notes

```
src/lib/
└── period-detection.ts                ← NEW: Time-aware period logic
└── period-detection.test.ts           ← NEW: Period detection tests

src/domains/feed/
└── composer.ts                        ← MODIFY: Add auto-selection, completion collapse, alert dismiss
└── checklist-cards.ts                 ← MODIFY: Add period labels, auto-selection flag

src/components/ui/
└── action-feed-card.tsx               ← MODIFY: Add completion summary variant rendering
```

### Previous Story Intelligence

- Story 2.3 established DailyChecklist and DailyChecklistItem models — this story adds time-aware auto-selection on top
- Story 2.1 established ActionFeedCard architecture — completion summary variant extends that
- Story 1.3 established time boundaries configuration — this story uses those boundaries for period detection
- Story 1.6 established empty-state component — "All caught up" reuses that pattern

### References

- [Source: epics.md — Story 2.4]
- [Source: architecture.md — Timezone Safety, getCafeNow]
- [Source: prd.md — FR16, FR18, FR19]
- [Source: ux-design-specification.md — All Caught Up State, Completion Summary]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
