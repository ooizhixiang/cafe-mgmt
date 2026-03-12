# Story 3.9: Comp Budget Warnings on Feed

Status: backlog

## Story
As a **cafe manager**,
I want to see warnings on the Action Feed when the comp budget approaches or exceeds the limit,
so that I can address spending before it becomes a problem.

## Acceptance Criteria (BDD)

### AC1: 80% Warning
**Given** comp spending reaches 80% of the weekly budget
**When** the feed renders
**Then** an amber warning card appears: "Comp budget at 80% — $10 remaining this week"

### AC2: 100% Warning
**Given** comp spending reaches 100% of the weekly budget
**When** the feed renders
**Then** a red warning card appears: "Comp budget exceeded — $0 remaining this week"
**And** comp logging is still allowed (warning, not a block)

### AC3: Warning Resolution
**Given** a comp budget warning exists on the feed
**When** the budget resets on the configured day
**Then** the warning card is resolved and auto-dismisses

### AC4: Both Roles See Warning
**Given** the comp budget warning is visible
**When** both manager and staff view the feed
**Then** both roles see the warning card (comp budget visibility is for all users)

## Tasks / Subtasks

- [ ] **Task 1: Comp Warning Card Provider** (AC: #1, #2, #3)
  - [ ] Create `src/domains/feed/comp-warning-cards.ts`:
    - `getCompWarningCards(cafeId)` — calculates spend percentage
    - Returns amber card at >= 80%, red card at >= 100%
    - No card if under 80% or no budget configured
    - Uses calculated remaining from `getCompBudgetRemaining()`

- [ ] **Task 2: Feed Composer Integration** (AC: #1, #2, #4)
  - [ ] Update `src/domains/feed/composer.ts`:
    - Include `getCompWarningCards()` in Promise.allSettled
    - Warning cards visible to all roles (not manager-only)

- [ ] **Task 3: Warning Card Rendering** (AC: #1, #2)
  - [ ] Use alert variant of ActionFeedCard:
    - 80%: amber `--color-warning` border, "Comp budget at 80%"
    - 100%: red `--color-urgent` border, "Comp budget exceeded"
    - Shows remaining amount

- [ ] **Task 4: Tests** (AC: all)
  - [ ] Create `src/domains/feed/comp-warning-cards.test.ts`:
    - No warning below 80%
    - Amber warning at 80%
    - Red warning at 100%
    - No warning when no budget configured
    - Warning resolves on budget reset

## Dev Notes

### Architecture Patterns
- Threshold logic: `(totalSpentCents / budgetCents) >= 0.8` for amber, `>= 1.0` for red
- Feed composer includes via `Promise.allSettled` for error isolation
- Warning visible to ALL roles (not manager-only like other alert types)
- FR65: Comp budget threshold breaches propagate to feed

### What This Story Does NOT Include
- Blocking comp logging when over budget (comp is always allowed)
- Weekly aggregation (Story 3.10)

### Project Structure Notes
```
src/domains/feed/
└── comp-warning-cards.ts             ← NEW: Comp warning card provider
└── comp-warning-cards.test.ts        ← NEW: Tests

src/domains/feed/
└── composer.ts                       ← MODIFY: Include comp warnings
```

### References
- [Source: epics.md — Story 3.9]
- [Source: prd.md — FR52, FR65]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
