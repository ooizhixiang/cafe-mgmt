# Story 3.10: Weekly Aggregation & Dollar Totals

Status: backlog

## Story
As a **cafe manager**,
I want to see aggregated wastage and comp dollar totals by week,
so that I can track operational costs and spot trends.

## Acceptance Criteria (BDD)

### AC1: Weekly Totals Display
**Given** an authenticated manager
**When** they navigate to the Wastage/Comp screen and view the weekly totals section (displayed above the transaction log)
**Then** they see: total wastage dollars this week, total comp dollars this week, broken down by day

### AC2: Aligned to Comp Reset Day
**Given** the comp budget reset day is configured (e.g., Monday)
**When** weekly totals are calculated
**Then** the aggregation period aligns with the comp reset day (Monday-Sunday, not calendar week)

### AC3: Voided Entries Excluded
**Given** wastage entries have been voided
**When** weekly totals are calculated
**Then** voided entries are excluded from the totals

### AC4: Historical Comparison
**Given** multiple weeks of data exist
**When** the manager views weekly totals
**Then** they can see the current week plus up to 4 previous weeks for comparison

## Tasks / Subtasks

- [ ] **Task 1: Weekly Aggregation Server Actions** (AC: #1, #2, #3, #4)
  - [ ] Create `src/actions/reporting.actions.ts`:
    - `getWeeklyTotals()` — requireRole('MANAGER'), returns current week + 4 previous weeks of:
      - Total wastage in cents (excluding voided/deleted)
      - Total comp in cents (excluding voided/deleted)
      - Daily breakdown within each week
    - Week boundaries derived from CompBudget resetDay (or default Monday)
    - Uses `getCafeNow()` for timezone-aware date calculations

- [ ] **Task 2: Weekly Totals Component** (AC: #1, #4)
  - [ ] Create `src/components/reporting/weekly-totals.tsx`:
    - Summary section at top of Wastage/Comp screen (above transaction log)
    - Current week: "This Week: $47.20 wastage, $12.50 comp"
    - Day-by-day breakdown expandable
    - Previous weeks for comparison
    - Dollar values formatted via `formatCents()`

- [ ] **Task 3: Wastage/Comp Screen Integration** (AC: #1)
  - [ ] Update Wastage/Comp screen to include weekly totals section above transaction log
  - [ ] Manager sees full weekly totals; staff sees current week only

- [ ] **Task 4: Tests** (AC: all)
  - [ ] Create `src/actions/reporting.actions.test.ts`:
    - Week boundaries align to reset day
    - Voided entries excluded
    - Correct aggregation across days
    - 5-week window returned

## Dev Notes

### Architecture Patterns
- Aggregation queries from WastageEntry and CompEntry tables
- Week boundaries derived from CompBudget resetDay
- Voided: `deletedAt IS NULL AND voidedAt IS NULL`
- Dollar totals formatted via `formatCents()`

### What This Story Does NOT Include
- Trend indicators/arrows (future enhancement)
- Export functionality

### Project Structure Notes
```
src/actions/
└── reporting.actions.ts              ← NEW: Weekly aggregation queries
└── reporting.actions.test.ts         ← NEW: Tests

src/components/reporting/
└── weekly-totals.tsx                 ← NEW: Weekly totals display

src/app/(app)/wastage-comp/
└── page.tsx                          ← MODIFY: Add weekly totals section
```

### References
- [Source: epics.md — Story 3.10]
- [Source: prd.md — FR68, FR71]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
