# Story 2.1: Action Feed with Card Architecture

Status: backlog

## Story
As a **cafe user**,
I want to see a prioritized feed of actionable cards when I open the app,
so that I immediately know what needs my attention right now.

## Acceptance Criteria (BDD)

### AC1: Feed Priority Ordering
**Given** an authenticated user
**When** they open the app (default route)
**Then** the Action Feed displays cards sorted by strict priority: overdue > time-sensitive > alerts > informational

### AC2: Card Limit & Scroll
**Given** the feed has more than 5 cards
**When** the feed renders
**Then** a maximum of 5 cards are visible before scroll
**And** remaining cards are accessible by scrolling

### AC3: Card Type Visual Differentiation
**Given** cards of different types exist
**When** they render on the feed
**Then** each card type is visually differentiated: checklist cards show a progress bar, alert cards show a colored border (amber/red), onboarding cards show setup style (blue border), completion summary cards show green border with checkmark
**And** checklist cards display up to 4 items inline; if more exist, a "Show all X items" link expands the card or navigates to the full checklist view

### AC4: Role-Based Feed Filtering
**Given** a staff member is authenticated
**When** they view the Action Feed
**Then** only cards relevant to their role are displayed (no manager-only content)

### AC5: Navigation Indicators
**Given** pending action items exist in other modules
**When** the bottom navigation renders
**Then** navigation indicators (dots) appear on relevant tabs based on: incomplete checklists -> Action Feed tab dot, low-stock alerts -> Inventory tab dot, comp budget warning -> Wastage/Comp tab dot
**And** badge state derives from the same `FeedResponse` data -- no separate API calls

### AC6: Skeleton Loading
**Given** the feed is loading
**When** data has not yet returned
**Then** skeleton placeholders are shown (no spinners)
**And** the summary bar renders immediately with cached data from localStorage

### AC7: Offline State
**Given** the backend is unreachable
**When** the user opens or refreshes the feed
**Then** a calm offline banner appears at the top: "Offline -- showing last synced data"
**And** the feed shows the last cached state from localStorage (not a blank screen or error page)

### AC8: Pull-to-Refresh
**Given** the user pulls down on the feed
**When** the pull-to-refresh gesture completes
**Then** the feed revalidates from the server and updates with fresh data

### AC9: Feed API Response
**Given** the feed API endpoint is called
**When** the request is processed
**Then** cards and summary data are returned in a single `FeedResponse` (cards + summary bundled)
**And** the feed renders with all cards in <200ms

### AC10: Summary Bar
**Given** the app layout renders for authenticated users
**When** the summary bar component is displayed (fixed position above feed)
**Then** it shows: current checklist progress (e.g., "Opening: 3/7") and grows to include comp budget when Epic 3 ships
**And** the summary bar is built as `src/components/ui/summary-bar.tsx`

### AC11: Summary Bar Graceful Degradation
**Given** the summary bar renders before Epic 3 features exist
**When** comp budget and wastage data are unavailable
**Then** the summary bar shows only checklist progress and omits unavailable sections gracefully

## Tasks / Subtasks

- [ ] **Task 1: Feed Types & Interfaces** (AC: #1, #3, #9)
  - [ ] Create `src/types/feed.ts` with FeedResponse, FeedCard, CardVariant, CardPriority types
  - [ ] Define card variants: checklist, alert, onboarding, completion, supplier
  - [ ] Define priority levels: overdue (1), time-sensitive (2), alert (3), informational (4)

- [ ] **Task 2: Feed Composer** (AC: #1, #4, #9)
  - [ ] Create `src/domains/feed/composer.ts` -- `getFeedCards(cafeId, role)`:
    - Uses `Promise.allSettled` for per-domain error isolation
    - Aggregates cards from: onboarding (Story 1.5), checklists (Story 2.3+), alerts (Story 3.4+), comp warnings (Story 3.9+), supplier reminders (Story 4.2+)
    - Sorts by priority, then by creation time within same priority
    - Filters by role (staff sees only their cards)
    - Returns `FeedResponse` with cards + summary data
  - [ ] Create domain card providers as stubs that return empty arrays (filled by later stories)

- [ ] **Task 3: Feed API Route** (AC: #9)
  - [ ] Create `GET /api/feed/route.ts`:
    - Calls `auth()`, rejects if no session
    - Calls `getFeedCards(cafeId, role)`
    - Returns JSON FeedResponse
    - Handles errors with appropriate status codes

- [ ] **Task 4: ActionFeedCard Component** (AC: #3)
  - [ ] Create `src/components/ui/action-feed-card.tsx` -- single composition component:
    - `variant` prop: checklist | alert | onboarding | completion | supplier
    - Shared card shell: 4px colored left border, status icon, title, dollar value area
    - Variant-specific body/footer content
    - Checklist variant: progress bar + inline items (max 4, "Show all X items" link)
    - Alert variant: amber/red border
    - Onboarding variant: blue border, setup icon
    - Completion variant: green border, checkmark
  - [ ] 44x44px touch targets, WCAG AA contrast

- [ ] **Task 5: Summary Bar Component** (AC: #10, #11)
  - [ ] Create `src/components/ui/summary-bar.tsx`:
    - Fixed position above feed content
    - Shows checklist progress from FeedResponse summary data
    - Gracefully omits sections for data not yet available
    - Designed to grow with Epic 3 data (comp budget remaining)

- [ ] **Task 6: Offline Banner Component** (AC: #7)
  - [ ] Create `src/components/ui/offline-banner.tsx`:
    - Detects online/offline state via `navigator.onLine` + event listeners
    - Calm indicator: "Offline -- showing last synced data"
    - Shows when backend unreachable, hides when restored

- [ ] **Task 7: Feed Page with SWR** (AC: #2, #6, #7, #8)
  - [ ] Update `src/app/(app)/page.tsx` -- Action Feed page:
    - SWR fetcher for `/api/feed` with revalidation on focus and 30s interval
    - Pull-to-refresh via touch gesture
    - Skeleton loading state (no spinners)
    - localStorage cache for offline fallback
    - Renders card list with max 5 visible before scroll
  - [ ] Add `FEED_REFRESH_INTERVAL_MS = 30_000` to `src/lib/constants.ts`

- [ ] **Task 8: Navigation Badge Integration** (AC: #5)
  - [ ] Update bottom navigation to show indicator dots
  - [ ] Badge state derived from FeedResponse data (no separate API calls)
  - [ ] Dots: Action Feed (incomplete checklists), Inventory (low-stock), Wastage/Comp (budget warning)

- [ ] **Task 9: Tests** (AC: all)
  - [ ] Create `src/domains/feed/composer.test.ts`:
    - Cards sorted by priority correctly
    - Role-based filtering (staff doesn't see manager cards)
    - Promise.allSettled handles individual domain failures gracefully
    - Empty feed returns empty array
  - [ ] Create `src/components/ui/action-feed-card.test.ts`:
    - Renders correct border color per variant
    - Checklist variant shows progress bar

## Dev Notes

### Architecture Patterns (MUST FOLLOW)

**ActionResult<T>** for all Server Actions. **Never accept cafeId from client.**

**Prisma imports:** `@/generated/prisma/client`, `@/generated/prisma/enums`

**Zod v4, Tailwind v4 (CSS-based), shadcn/ui v4**

**Blue buttons:** `bg-[var(--color-info)] text-white hover:bg-[var(--color-info)]/90`

**Tests co-located** with `.test.ts` suffix.

**FeedResponse -- Single bundled response:**
```typescript
interface FeedResponse {
  cards: FeedCard[];
  summary: {
    checklistProgress?: { period: string; completed: number; total: number };
    compBudgetRemaining?: number; // cents, available after Epic 3
  };
  badges: {
    feed: boolean;
    inventory: boolean;
    wastageComp: boolean;
  };
}
```

**Feed Composer -- Domain isolation:**
```typescript
// src/domains/feed/composer.ts
const results = await Promise.allSettled([
  getOnboardingCards(cafeId),
  getChecklistCards(cafeId, role),
  getAlertCards(cafeId),
  getCompWarningCards(cafeId),
  getSupplierReminderCards(cafeId),
]);
// Per-domain error isolation -- one failing domain doesn't break the feed
```

**SWR Configuration:**
```typescript
const { data, error, isLoading, mutate } = useSWR<FeedResponse>(
  '/api/feed',
  fetcher,
  { refreshInterval: 30_000, revalidateOnFocus: true }
);
```

### UX Patterns (MUST FOLLOW)
- Card anatomy: 4px colored left border, status icon, title, dollar value, card-type-specific content
- Color vocabulary: green=success, amber=warning, red=urgent, blue=info, gray=muted
- Skeleton loading only -- no spinners
- Max 5 cards visible before scroll
- Summary bar fixed above feed
- Pull-to-refresh gesture
- Offline banner: calm, not alarming

### What This Story Does NOT Include
- Checklist card content (Story 2.3/2.4)
- Alert card content (Story 3.4)
- Comp warning cards (Story 3.9)
- Supplier reminder cards (Story 4.2)
- Daily operations summary card (Story 2.5)

### Project Structure Notes
```
src/types/
  feed.ts                              <- NEW: FeedResponse, FeedCard types

src/domains/feed/
  composer.ts                          <- NEW: Feed card aggregation
  composer.test.ts                     <- NEW: Feed composer tests

src/api/feed/
  route.ts                             <- NEW: GET /api/feed endpoint

src/components/ui/
  action-feed-card.tsx                 <- NEW: Unified card component
  action-feed-card.test.ts            <- NEW: Card component tests
  summary-bar.tsx                      <- NEW: Summary bar component
  offline-banner.tsx                   <- NEW: Offline state indicator

src/app/(app)/
  page.tsx                             <- MODIFY: Feed page with SWR

src/lib/
  constants.ts                         <- MODIFY: Add FEED_REFRESH_INTERVAL_MS
```

### Previous Story Intelligence (Story 1.6)
- All patterns from Stories 1.1-1.5 carry forward
- Empty state component from Story 1.6 for "All caught up" (Story 2.4)
- Onboarding cards from Story 1.5 are the first card type available

### References
- [Source: epics.md -- Story 2.1]
- [Source: architecture.md -- Feed Composition, FeedResponse, Domain Isolation, SWR]
- [Source: prd.md -- FR12-FR20]
- [Source: ux-design-specification.md -- Card Anatomy, Summary Bar, Skeleton Loading, Offline State]

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
