# Story 3.4: Low-Stock Alerts on Action Feed

Status: backlog

## Story
As a **cafe manager**,
I want to see low-stock alerts on the Action Feed when inventory hits my configured thresholds,
so that I never run out of key ingredients.

## Acceptance Criteria (BDD)

### AC1: Threshold Configuration
**Given** a manager configuring an ingredient
**When** they set a low-stock threshold (e.g., 25%)
**Then** the threshold is saved per ingredient

### AC2: Alert Generation
**Given** an inventory count is saved or wastage deducts inventory
**When** the resulting quantity is at or below the threshold
**Then** a low-stock alert card is generated on the Action Feed
**And** the alert uses amber `--color-warning` border and shows: ingredient name, current level, threshold level

### AC3: Alert Resolution
**Given** the ingredient quantity rises above the threshold
**When** the user views the feed
**Then** the alert is resolved and will auto-dismiss after 24 hours (mechanism from Story 2.4)

### AC4: Multiple Alerts
**Given** multiple ingredients are below threshold
**When** the feed renders
**Then** each ingredient gets its own alert card, sorted by priority within the feed

### AC5: No Threshold = No Alert
**Given** an ingredient has no threshold configured
**When** its quantity changes
**Then** no alert is generated — alerts only fire for ingredients with explicit thresholds

### AC6: Supplier Action Link
**Given** a low-stock alert card is displayed for an ingredient that has an associated supplier (Epic 4)
**When** the user views the alert
**Then** the alert includes an action button: "Order from [Supplier Name]" linking to the supplier's tap-to-call card

### AC7: Fallback Action Link
**Given** a low-stock alert card is displayed but no supplier is linked or Epic 4 is not yet shipped
**When** the user views the alert
**Then** the alert includes a fallback action: "Review inventory" linking to the Inventory screen for that ingredient

## Tasks / Subtasks

- [ ] **Task 1: Database Schema — Alert Cards** (AC: #2, #3)
  - [ ] Create `FeedAlert` model: id, cafeId, type (enum: LOW_STOCK, COMP_WARNING), ingredientId (String?), title, message, severity (enum: WARNING, URGENT), resolvedAt (DateTime?), createdAt. @@index([cafeId, resolvedAt])
  - [ ] Run migration

- [ ] **Task 2: Threshold Check Logic** (AC: #2, #3, #5)
  - [ ] Create `src/lib/threshold-check.ts`:
    - `checkThresholds(cafeId, ingredientId?)` — checks ingredient quantity against threshold
    - If at/below threshold and no active alert exists → create FeedAlert
    - If above threshold and active alert exists → set resolvedAt
    - Only checks ingredients with non-null lowStockThreshold
  - [ ] Called after: inventory save (Story 3.2), wastage auto-deduct (Story 3.6)

- [ ] **Task 3: Alert Feed Card Provider** (AC: #2, #4, #6, #7)
  - [ ] Create `src/domains/feed/alert-cards.ts`:
    - `getAlertCards(cafeId)` — returns active FeedAlerts as feed cards
    - Includes action button: supplier link if available, otherwise "/inventory" link
    - Card uses alert variant with amber/red border based on severity

- [ ] **Task 4: Integration with Inventory Actions** (AC: #2)
  - [ ] Update `saveInventoryCount` to call `checkThresholds()` after saving
  - [ ] Threshold check runs asynchronously (don't block the save response)

- [ ] **Task 5: Tests** (AC: all)
  - [ ] Create `src/lib/threshold-check.test.ts`:
    - Alert created when quantity <= threshold
    - No alert when quantity > threshold
    - Alert resolved when quantity rises above threshold
    - No check for ingredients without threshold
    - Existing active alert not duplicated

## Dev Notes

### Architecture Patterns
- Alerts stored as FeedAlert rows — no separate notification system
- Feed composer's `getAlertCards()` returns these
- Threshold check is a reusable function called from multiple places
- Alert action button is conditional on supplier existence

### What This Story Does NOT Include
- Comp budget warnings (Story 3.9)
- Alert auto-dismiss UI (established in Story 2.4)

### Project Structure Notes
```
prisma/
└── schema.prisma                      ← MODIFY: Add FeedAlert model

src/lib/
└── threshold-check.ts                ← NEW: Threshold checking logic
└── threshold-check.test.ts           ← NEW: Tests

src/domains/feed/
└── alert-cards.ts                    ← NEW: Alert feed card provider

src/actions/
└── inventory.actions.ts              ← MODIFY: Call checkThresholds after save
```

### References
- [Source: epics.md — Story 3.4]
- [Source: prd.md — FR37, FR64]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References
### Completion Notes List
### File List
